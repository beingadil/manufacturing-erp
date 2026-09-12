// src/lib/ai/aiClient.ts
// Renderer-side bridge to the main-process Groq gateway. Gracefully reports
// unavailability outside Electron so callers never branch on environment.

import type { AiChatMessage, AiPublicConfig, AiToolDef, ChatChoice, IpcResult } from './types';

/** Models in priority order, tuned to what a free Developer-plan Groq key can
 * actually reach. The first entry is the default; on a model-not-found error
 * the caller walks the rest and persists the first one that works.
 *
 * Source of truth: this list was validated against the live Groq API (HTTP 200
 * + a real completion) for the current default key. Re-validate whenever the
 * default key changes or Groq deprecates a model.
 */
export const FALLBACK_MODELS = [
  'openai/gpt-oss-20b',   // default — fastest + cheapest on Developer plan
  'openai/gpt-oss-120b',  // bigger, same open-weights line, same plan tier
  'qwen/qwen3.8-27b',     // different model family, still reachable
];

interface ElectronAIBridge {
  getConfig: () => Promise<IpcResult<AiPublicConfig>>;
  setConfig: (patch: {
    enabled?: boolean;
    voiceEnabled?: boolean;
    apiKey?: string;
    model?: string;
    transcribeModel?: string;
  }) => Promise<IpcResult<AiPublicConfig>>;
  chat: (payload: { messages: AiChatMessage[]; tools?: AiToolDef[]; temperature?: number }) => Promise<IpcResult<ChatChoice>>;
  transcribe: (payload: { audio: ArrayBuffer; mimeType: string }) => Promise<IpcResult<{ text: string }>>;
}

declare global {
  interface Window {
    electronAI?: ElectronAIBridge;
  }
}

function unavailable<T>(what: string): IpcResult<T> {
  return { success: false, error: 'AI gateway unavailable (' + what + ': not running in Electron).' };
}

export const aiClient = {
  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.electronAI;
  },

  async getConfig(): Promise<IpcResult<AiPublicConfig>> {
    if (!window.electronAI) return unavailable('getConfig');
    return window.electronAI.getConfig();
  },

  async setConfig(patch: Parameters<ElectronAIBridge['setConfig']>[0]): Promise<IpcResult<AiPublicConfig>> {
    if (!window.electronAI) return unavailable('setConfig');
    return window.electronAI.setConfig(patch);
  },

  /**
   * Chat with automatic model fallback.
   *
   * If the configured model is not reachable (Groq returns "does not exist or
   * you do not have access to it"), this walks FALLBACK_MODELS and, on the
   * first success, persists the winning model so subsequent calls keep using
   * it. Other errors (bad key, network, rate limit) are returned as-is — they
   * are not model-selection problems and retrying a different model would not
   * help.
   */
  async chat(messages: AiChatMessage[], tools?: AiToolDef[]): Promise<IpcResult<ChatChoice>> {
    if (!window.electronAI) return unavailable('chat');

    const configured = await this.getConfig();
    const modelList = configured.success && configured.data ? [configured.data.model, ...FALLBACK_MODELS.filter(m => m !== configured.data.model)] : FALLBACK_MODELS;

    let lastError = '';
    for (const model of modelList) {
      const res = await window.electronAI.chat({ messages, tools });
      if (res.success && res.data) {
        // Persist the working model exactly once, so the user's next command
        // does not re-walk the fallback list. Only touch model here — leave
        // the key, enable flags, and transcribe model untouched.
        if (model !== configured.data?.model) {
          await this.setConfig({ model }).then(r => { /* best-effort; keep using it regardless */ }).catch(() => {/* non-fatal */});
        }
        return res;
      }
      const err = res.error || '';
      if (!err.includes('does not exist or you do not have access to it')) {
        // Not a model-selection problem — return the real error.
        return res;
      }
      lastError = err;
    }

    // All models in the list failed with the same model-not-found reason.
    return { success: false, error: lastError || 'No reachable Groq model found. Try a different API key or update the model in Settings.' };
  },

  async transcribe(audio: ArrayBuffer, mimeType: string): Promise<IpcResult<{ text: string }>> {
    if (!window.electronAI) return unavailable('transcribe');
    return window.electronAI.transcribe({ audio, mimeType });
  },
};
