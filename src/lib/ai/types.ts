// src/lib/ai/types.ts
// Shared types for the AI assistant subsystem (Groq gateway + command registry).

export interface AiPublicConfig {
  enabled: boolean;
  voiceEnabled: boolean;
  hasKey: boolean;
  model: string;
  transcribeModel: string;
}

export interface IpcResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** A chat message in the OpenAI-compatible shape Groq expects. */
export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

/** Raw first choice returned by a Groq chat completion. */
export interface ChatChoice {
  message: AiChatMessage;
  finish_reason: string | null;
}

/** The Groq/OpenAI tool (function) definition a command registry produces. */
export interface AiToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** One parsed command produced by intent parsing (validated against zod). */
export interface ParsedCommand {
  /** Registry command id, e.g. 'query_stock'. */
  id: string;
  /** Validated arguments (shape defined by the command's zod schema). */
  args: Record<string, unknown>;
  /** Human-readable one-liner for the confirmation panel. */
  summary: string;
  /** True = the command only reads state and may run without confirmation. */
  readOnly: boolean;
}

/** Outcome of executing one command against the store/engine. */
export interface CommandResult {
  ok: boolean;
  /** Business-worded result (used for the visual readback). */
  message: string;
  /** Optional structured payload (e.g. stock rows). */
  data?: unknown;
}
