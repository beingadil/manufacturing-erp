// electron/ai.cjs
// Groq AI gateway - lives in the MAIN process so the API key never enters the
// renderer (same isolation story as database.cjs). Uses global fetch (Node 22).
//
// IPC surfaces (registered via registerAiHandlers in main.cjs):
//   ai:getConfig    -> { enabled, hasKey, model, transcribeModel, voiceEnabled }
//   ai:setConfig    -> persists key + prefs to userData/ai-config.json (0600)
//   ai:chat         -> tool-calling chat completion against Groq
//   ai:transcribe   -> audio blob (ArrayBuffer) -> Groq Whisper transcription

const fs = require('fs');
const path = require('path');

const GROQ_BASE = 'https://api.groq.com/openai/v1';

const DEFAULTS = {
  enabled: false,
  voiceEnabled: true,
  model: 'llama-3.3-70b-versatile',
  transcribeModel: 'whisper-large-v3',
  // Stored ONLY on disk in the main process, never in the SQLite blob the
  // renderer reads. getConfig returns hasKey, never the key itself.
  apiKey: '',
};

let config = null;
let configPath = null;

function loadConfig() {
  if (config) return config;
  configPath = configPath || path.join(process.cwd(), 'ai-config.json');
  try {
    config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
  } catch {
    config = { ...DEFAULTS };
  }
  return config;
}

function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  try {
    fs.writeFileSync(configPath, JSON.stringify(next, null, 2), { mode: 0o600 });
    config = next;
    return true;
  } catch (e) {
    console.error('[AI] Failed to persist config:', e.message);
    return false;
  }
}

function initAiConfig(userDataDir) {
  configPath = path.join(userDataDir, 'ai-config.json');
  const legacy = path.join(process.cwd(), 'ai-config.json');
  try {
    if (!fs.existsSync(configPath) && fs.existsSync(legacy)) fs.renameSync(legacy, configPath);
  } catch { /* non-fatal */ }
  config = null;
  loadConfig();
  console.log('[AI] Config loaded from', configPath, '- enabled:', config.enabled, '- hasKey:', !!config.apiKey);
}

async function groqFetch(pathname, options) {
  const cfg = loadConfig();
  if (!cfg.apiKey) throw new Error('No Groq API key configured. Add it in Settings, AI Assistant tab.');
  let res;
  try {
    res = await fetch(GROQ_BASE + pathname, {
      ...options,
      headers: { Authorization: 'Bearer ' + cfg.apiKey, ...(options.headers || {}) },
    });
  } catch (e) {
    throw new Error('Network error contacting Groq (' + e.message + '). Check your internet connection.');
  }
  if (!res.ok) {
    let detail = '';
    try { const b = await res.json(); detail = (b && b.error && b.error.message) || ''; } catch { /* noop */ }
    const map = {
      401: 'Invalid Groq API key.',
      403: 'Groq rejected the request (permissions or model access).',
      413: 'Audio too large for transcription (25 MB limit).',
      422: 'Groq could not process the request (model or tool format).',
      429: 'Groq rate limit reached - try again in a moment.',
    };
    throw new Error(map[res.status] || ('Groq error ' + res.status + ': ' + (detail || res.statusText)));
  }
  return res;
}

async function chat(payload) {
  const cfg = loadConfig();
  const body = { model: cfg.model, messages: payload.messages, temperature: payload.temperature === undefined ? 0 : payload.temperature };
  if (payload.tools && payload.tools.length > 0) {
    body.tools = payload.tools;
    body.tool_choice = 'auto';
    body.parallel_tool_calls = false;
  }
  const res = await groqFetch('/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const choice = data && data.choices && data.choices[0];
  if (!choice) throw new Error('Groq returned no completion choices.');
  return choice;
}

async function transcribe(audioBuffer, mimeType) {
  const cfg = loadConfig();
  const ext = (mimeType || '').includes('wav') ? 'wav' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/webm' }), 'audio.' + ext);
  form.append('model', cfg.transcribeModel);
  form.append('response_format', 'json');
  const res = await groqFetch('/audio/transcriptions', { method: 'POST', body: form });
  const data = await res.json();
  if (typeof (data && data.text) !== 'string') throw new Error('Transcription returned no text.');
  return data.text;
}

function publicConfig(c) {
  return { enabled: c.enabled, voiceEnabled: c.voiceEnabled, hasKey: !!c.apiKey, model: c.model, transcribeModel: c.transcribeModel };
}

function registerAiHandlers(ipcMain) {
  ipcMain.handle('ai:getConfig', () => ({ success: true, data: publicConfig(loadConfig()) }));

  ipcMain.handle('ai:setConfig', (_e, patch) => {
    const allowed = ['enabled', 'voiceEnabled', 'apiKey', 'model', 'transcribeModel'];
    const safe = {};
    for (const k of allowed) if (k in (patch || {})) safe[k] = patch[k];
    if (typeof safe.apiKey === 'string') safe.apiKey = safe.apiKey.trim();
    const ok = saveConfig(safe);
    if (!ok) return { success: false, error: 'Could not write AI config to disk.' };
    return { success: true, data: publicConfig(loadConfig()) };
  });

  ipcMain.handle('ai:chat', async (_e, payload) => {
    try {
      const cfg = loadConfig();
      if (!cfg.enabled) return { success: false, error: 'AI Assistant is disabled in Settings.' };
      const choice = await chat(payload || {});
      return { success: true, data: choice };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:transcribe', async (_e, payload) => {
    try {
      const cfg = loadConfig();
      if (!cfg.enabled || !cfg.voiceEnabled) return { success: false, error: 'Voice assistant is disabled in Settings.' };
      const buf = Buffer.from(new Uint8Array(payload.audio));
      const text = await transcribe(buf, payload.mimeType);
      return { success: true, data: { text } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { initAiConfig, registerAiHandlers };
