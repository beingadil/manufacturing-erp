// electron/drive.cjs
// Google Drive backup gateway — lives in the MAIN process so the refresh token
// never enters the renderer (same isolation story as ai.cjs / database.cjs).
// Uses global fetch (Node 22) — no server, no extra dependencies.
//
// Flow: the user creates their own Google Cloud OAuth client (Desktop app type)
// once, pastes the Client ID + Secret into Settings, then clicks Connect. The
// app opens the system browser to Google's consent page on a loopback
// redirect (http://127.0.0.1:<ephemeral port>) and catches the code locally —
// this is Google's documented "desktop app" flow and needs no hosted server.
//
// Files: every backup is a .merpbak bundle (manifest + SQLite in one file —
// see database.cjs) uploaded to the app folder
// `Manufacturing ERP (App folder)` which only this app can see via Drive scope.
//
// IPC surfaces (registered via registerDriveHandlers in main.cjs):
//   drive:getConfig  -> { connected, hasCredentials, email, lastBackupAt, autoEnabled }
//   drive:setCredentials -> persist clientId/clientSecret
//   drive:connect    -> run the loopback OAuth dance, store refresh token
//   drive:disconnect -> revoke + delete stored tokens
//   drive:backup     -> create .merpbak locally then upload (upsert by name)
//   drive:list       -> list backup files with metadata
//   drive:download   -> download a backup to userData/backups, returns local path
//   drive:setAuto    -> enable/disable automatic daily upload

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');

const OAUTH_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const OAUTH_REVOKE = 'https://oauth2.googleapis.com/revoke';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const APP_FOLDER_NAME = 'Manufacturing ERP (App folder)';
const KEEP_BACKUPS = 14;
const HTTP_TIMEOUT_MS = 120000;

const DEFAULTS = {
  clientId: '',
  clientSecret: '',
  refreshToken: '',
  email: '',
  lastBackupAt: '',
  autoEnabled: true,
};

let config = null;
let configPath = null;

function loadConfig() {
  if (config) return config;
  configPath = configPath || path.join(process.cwd(), 'drive-config.json');
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
    console.error('[Drive] Failed to persist config:', e.message);
    return false;
  }
}

function initDriveConfig(userDataDir) {
  configPath = path.join(userDataDir, 'drive-config.json');
  const legacy = path.join(process.cwd(), 'drive-config.json');
  try {
    if (!fs.existsSync(configPath) && fs.existsSync(legacy)) fs.renameSync(legacy, configPath);
  } catch { /* non-fatal */ }
  config = null;
  loadConfig();
  console.log('[Drive] Config loaded from', configPath, '- connected:', !!config.refreshToken);
}

// ─── Token exchange / refresh ───────────────────────────────────────────────

async function tokenRequest(params) {
  let res;
  try {
    res = await fetch(OAUTH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error('Network error contacting Google (' + e.message + '). Check your internet connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || ('Google token error ' + res.status));
  }
  return data;
}

async function getAccessToken() {
  const cfg = loadConfig();
  if (!cfg.refreshToken) throw new Error('Not connected to Google Drive. Connect first in Settings.');
  const data = await tokenRequest({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type: 'refresh_token',
  });
  return data.access_token;
}

// ─── Loopback OAuth (no server needed) ─────────────────────────────────────

function loopbackRedirect(port) {
  return `http://127.0.0.1:${port}`;
}

function waitForOAuthCode(redirectPort, expectedState) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, loopbackRedirect(redirectPort));
      if (url.pathname !== '/') {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body style="font-family:sans-serif;text-align:center;padding-top:4em">'
        + (code || error ? '<h2>' + (error ? 'Sign-in failed — you can close this tab.' : 'Signed in — you can close this tab.') + '</h2>'
          : '<h2>Waiting…</h2>')
        + '</body></html>');
      if (error || !code) {
        reject(new Error(error || 'Google sign-in was cancelled.'));
        server.close();
        return;
      }
      if (state !== expectedState) {
        reject(new Error('OAuth state mismatch — possible CSRF. Aborting.'));
        server.close();
        return;
      }
      resolve(code);
      server.close();
    });
    server.on('error', (e) => reject(new Error('Could not open local redirect listener: ' + e.message)));
    server.listen(redirectPort, '127.0.0.1');
    // Give up after 5 minutes — user may never complete the browser flow.
    setTimeout(() => {
      server.close();
      reject(new Error('Google sign-in timed out. Try again.'));
    }, 5 * 60 * 1000).unref();
  });
}

async function connect() {
  const cfg = loadConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error('Enter your Google Cloud Client ID and Secret first (Settings → Backup & Restore → Google Drive).');
  }
  const state = crypto.randomBytes(16).toString('hex');
  // Port 0 = let the OS pick a free ephemeral port; register it in the
  // Google Cloud client's "Authorized redirect URIs" as http://127.0.0.1 (any port).
  const redirectPort = await new Promise((resolve, reject) => {
    const probe = require('net').createServer();
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });

  const authUrl = new URL(OAUTH_AUTH);
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('redirect_uri', loopbackRedirect(redirectPort));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  const opened = await shell.openExternal(authUrl.toString());
  if (opened === false) throw new Error('Could not open your browser for Google sign-in.');

  const code = await waitForOAuthCode(redirectPort, state);
  const tokens = await tokenRequest({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: loopbackRedirect(redirectPort),
  });
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh token. Reconnect and make sure "Allow access" is chosen.');
  }
  saveConfig({ refreshToken: tokens.refresh_token });
  return true;
}

async function disconnect() {
  const cfg = loadConfig();
  if (cfg.refreshToken) {
    try {
      await fetch(OAUTH_REVOKE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: cfg.refreshToken }),
        signal: AbortSignal.timeout(15000),
      });
    } catch { /* best-effort revoke */ }
  }
  saveConfig({ refreshToken: '', email: '', lastBackupAt: '' });
  return true;
}

// ─── Drive REST helpers ─────────────────────────────────────────────────────

async function driveFetch(url, options = {}) {
  const token = await getAccessToken();
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error('Network error contacting Google Drive (' + e.message + '). Check your internet connection.');
  }
  if (res.status === 401) {
    // Access token expired or revoked — force reconnect.
    saveConfig({ refreshToken: '', email: '' });
    throw new Error('Google Drive session expired. Reconnect your account in Settings.');
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || ''; } catch { /* noop */ }
    const map = {
      403: 'Google Drive rejected the request (quota or permission).',
      404: 'Google Drive file or folder not found — it may have been deleted.',
    };
    throw new Error(map[res.status] || ('Google Drive error ' + res.status + ': ' + (detail || res.statusText)));
  }
  return res;
}

// The appdata folder (scope drive.appdata) — files live in a hidden app
// folder only this app can read. No manual folder management needed.
async function ensureAppFolder() {
  const q = encodeURIComponent(`name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await driveFetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)&pageSize=5`);
  const data = await res.json();
  if (data.files && data.files.length > 0) return data.files[0].id;
  const createRes = await driveFetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const created = await createRes.json();
  return created.id;
}

async function listDriveBackups() {
  const folderId = await ensureAppFolder();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await driveFetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name,size,modifiedTime)&pageSize=100`);
  const data = await res.json();
  return (data.files || [])
    .filter(f => f.name.endsWith('.merpbak'))
    .map(f => ({ id: f.id, name: f.name, size: Number(f.size || 0), modifiedAt: f.modifiedTime }))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

async function uploadBackup(localPath) {
  const cfg = loadConfig();
  const folderId = await ensureAppFolder();
  const name = path.basename(localPath);
  const bytes = fs.readFileSync(localPath);

  // Upsert by name: same-day re-backup replaces instead of duplicating.
  const q = encodeURIComponent(`name='${name}' and '${folderId}' in parents and trashed=false`);
  const existing = await (await driveFetch(`${DRIVE_API}/files?q=${q}&fields=files(id)&pageSize=1`)).json();
  const existingId = existing.files && existing.files[0] && existing.files[0].id;

  const boundary = 'merpbak' + crypto.randomBytes(8).toString('hex');
  const metadata = { name, parents: [folderId] };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const url = `${DRIVE_UPLOAD}/files${existingId ? '/' + existingId : ''}?uploadType=multipart&fields=id,name,size`;
  const res = await driveFetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const uploaded = await res.json();

  // Retention: keep only the newest KEEP_BACKUPS .merpbak files.
  try {
    const all = await listDriveBackups();
    for (const old of all.slice(KEEP_BACKUPS)) {
      await driveFetch(`${DRIVE_API}/files/${old.id}`, { method: 'DELETE' });
    }
  } catch (e) {
    console.warn('[Drive] Retention pruning failed (non-fatal):', e.message);
  }

  saveConfig({ lastBackupAt: new Date().toISOString() });
  return { id: uploaded.id, name: uploaded.name, size: Number(uploaded.size || bytes.length) };
}

async function downloadBackup(fileId, backupDir) {
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const meta = await (await driveFetch(`${DRIVE_API}/files/${fileId}?fields=name`)).json();
  const safeName = path.basename(meta.name || `drive-${fileId}.merpbak`);
  const targetPath = path.join(backupDir, safeName);
  const res = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(targetPath, buf);
  return { path: targetPath, size: buf.length };
}

// ─── Public config (never leaks clientId secret or refresh token) ──────────

function publicConfig(c) {
  return {
    connected: !!c.refreshToken,
    hasCredentials: !!c.clientId && !!c.clientSecret,
    email: c.email || '',
    lastBackupAt: c.lastBackupAt || '',
    autoEnabled: c.autoEnabled !== false,
  };
}

// ─── IPC registration ───────────────────────────────────────────────────────

function registerDriveHandlers(ipcMain) {
  ipcMain.handle('drive:getConfig', () => ({ success: true, data: publicConfig(loadConfig()) }));

  ipcMain.handle('drive:setCredentials', (_e, patch) => {
    const safe = {};
    if (typeof (patch || {}).clientId === 'string') safe.clientId = patch.clientId.trim();
    if (typeof (patch || {}).clientSecret === 'string') safe.clientSecret = patch.clientSecret.trim();
    const ok = saveConfig(safe);
    if (!ok) return { success: false, error: 'Could not write Drive config to disk.' };
    return { success: true, data: publicConfig(loadConfig()) };
  });

  ipcMain.handle('drive:connect', async () => {
    try {
      await connect();
      return { success: true, data: publicConfig(loadConfig()) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('drive:disconnect', async () => {
    try {
      await disconnect();
      return { success: true, data: publicConfig(loadConfig()) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('drive:backup', async (_e, localPath) => {
    try {
      const result = await uploadBackup(localPath);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('drive:list', async () => {
    try {
      const files = await listDriveBackups();
      return { success: true, data: files };
    } catch (error) {
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('drive:download', async (_e, fileId) => {
    try {
      const backupDir = path.join(require('electron').app.getPath('userData'), 'backups');
      const result = await downloadBackup(fileId, backupDir);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('drive:setAuto', (_e, enabled) => {
    saveConfig({ autoEnabled: !!enabled });
    return { success: true, data: publicConfig(loadConfig()) };
  });
}

module.exports = { initDriveConfig, registerDriveHandlers, publicConfig, uploadBackup, listDriveBackups, loadConfig };
