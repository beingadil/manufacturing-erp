// src/lib/ai/aiClient.ts
// Renderer-side bridge to the main-process Groq gateway. Gracefully reports
// unavailability outside Electron so callers never branch on environment.

import type { AiChatMessage, AiPublicConfig, AiToolDef, ChatChoice, IpcResult } from './types';

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

  async chat(messages: AiChatMessage[], tools?: AiToolDef[]): Promise<IpcResult<ChatChoice>> {
    if (!window.electronAI) return unavailable('chat');
    return window.electronAI.chat({ messages, tools });
  },

  async transcribe(audio: ArrayBuffer, mimeType: string): Promise<IpcResult<{ text: string }>> {
    if (!window.electronAI) return unavailable('transcribe');
    return window.electronAI.transcribe({ audio, mimeType });
  },
};
