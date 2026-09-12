// src/lib/ai/assistantPrompt.ts
// Message assembly for the Groq chat call: system prompt + live entity
// context. Kept separate from the orchestrator so prompt wording can evolve
// without touching execution logic.

import type { AiChatMessage } from './types';
import { buildEntityContext, SYSTEM_PROMPT } from './contextBuilder';

export function buildSystemMessages(userUtterance: string): AiChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: 'Current business data:\n' + buildEntityContext() },
    { role: 'user', content: userUtterance },
  ];
}
