// src/lib/ai/assistantService.ts
// Orchestrates the assistant pipeline:
//   transcript -> Groq tool-calling -> per-call zod validation -> ParsedCommand[]
// -> (UI confirmation for non-read-only) -> sequential execution -> readback.
//
// Phase 3 (multi-action chains) falls out naturally: the model returns one
// tool call per spoken operation; every call becomes a step; steps execute in
// order through the same engine, each step seeing the store state the previous
// step produced.

import { aiClient } from './aiClient';
import { buildSystemMessages } from './assistantPrompt';
import { AI_TOOLS, findCommand, validateArgs } from './commandRegistry';
import type { CommandResult, ParsedCommand } from './types';

export interface PlanStep extends ParsedCommand {
  /** UI bookkeeping for the checklist. */
  index: number;
}

export interface AssistantPlan {
  steps: PlanStep[];
  /** Model's plain reply when it made no tool calls (help/clarification). */
  plainReply: string | null;
}

export interface StepOutcome {
  index: number;
  summary: string;
  ok: boolean;
  message: string;
}

/**
 * Parse a transcript into a plan of validated commands.
 * Throws only for infrastructure failures (gateway unavailable, Groq error).
 */
export async function parseTranscript(transcript: string): Promise<AssistantPlan> {
  const messages = buildSystemMessages(transcript);
  const res = await aiClient.chat(messages, AI_TOOLS);
  if (!res.success || !res.data) {
    throw new Error(res.error || 'AI request failed.');
  }

  const choice = res.data;
  const toolCalls = choice.message.tool_calls || [];

  if (toolCalls.length === 0) {
    return { steps: [], plainReply: choice.message.content || 'I did not catch a command in that.' };
  }

  const steps: PlanStep[] = [];
  for (const call of toolCalls) {
    const cmd = findCommand(call.function.name);
    if (!cmd) continue; // unknown tool from the model — skip silently

    let rawArgs: unknown;
    try {
      rawArgs = JSON.parse(call.function.arguments || '{}');
    } catch {
      continue; // malformed JSON from the model — skip
    }

    const validated = validateArgs(cmd, rawArgs);
    if (!validated.ok) continue; // hallucinated args die here

    const args = validated.args;
    steps.push({
      id: cmd.id,
      args,
      summary: cmd.describe(args),
      readOnly: cmd.readOnly,
      index: steps.length,
    });
  }

  return { steps, plainReply: steps.length === 0 ? (choice.message.content || null) : null };
}

/** Execute one step through the registry (the engine guards fire here). */
export function executeStep(step: PlanStep): CommandResult {
  const cmd = findCommand(step.id);
  if (!cmd) return { ok: false, message: 'Unknown command: ' + step.id };
  return cmd.execute(step.args);
}

/** Sequentially execute a confirmed plan; every step sees prior steps' state. */
export function executePlan(steps: PlanStep[]): StepOutcome[] {
  const outcomes: StepOutcome[] = [];
  for (const step of steps) {
    let result: CommandResult;
    try {
      result = executeStep(step);
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
    outcomes.push({ index: step.index, summary: step.summary, ok: result.ok, message: result.message });
  }
  return outcomes;
}

/** Compact readback the UI shows after a plan runs. */
export function summarizeOutcomes(outcomes: StepOutcome[]): string {
  if (outcomes.length === 0) return 'Nothing to do.';
  const done = outcomes.filter(o => o.ok).length;
  if (done === outcomes.length) {
    return done === 1 ? outcomes[0].message : 'Done: ' + done + ' of ' + outcomes.length + ' steps completed. ' + outcomes.map(o => o.message).join(' ');
  }
  const failed = outcomes.filter(o => !o.ok);
  return 'Completed ' + done + ' of ' + outcomes.length + '. Failed: ' + failed.map(f => f.message).join(' ');
}
