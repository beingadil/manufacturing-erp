import { v4 as uuidv4 } from 'uuid';
import type { ProcessingStage } from '../../types/erp';

/**
 * Default manufacturing chain (spec Â§1): the SAME physical material moves
 * through Initial Processor â Machine â Acid â Polish â Finished Product.
 *
 * The final stage is data-driven (`isFinalStage`) â never hardcoded â so
 * future stages (Cutting, Grinding, Heat Treatment, Packaging, â¦) can be
 * added through the stage master without code restructuring.
 *
 * Billing: Initial Processor keeps the legacy per-piece billing; Machine /
 * Acid / Polish / Spot Machine bill per KG (e.g. 32 KG Ã Rs 32/KG = Rs 1,024), which is what
 * the real workflow needs.
 */
export const DEFAULT_PROCESSING_STAGES: Omit<ProcessingStage, 'id'>[] = [
  {
    name: 'Initial Processor',
    sequence: 1,
    description: 'First-stage processing â raw material is worked by the initial processor.',
    active: true,
    inputUnit: 'PCS',
    billingUnit: 'Per PCS',
    billingEnabled: true,
    rateMethod: 'per_piece',
    isFinalStage: false,
  },
  {
    name: 'Machine',
    sequence: 2,
    description: 'Machine processing â billed per KG processed.',
    active: true,
    inputUnit: 'PCS',
    billingUnit: 'Per KG',
    billingEnabled: true,
    rateMethod: 'per_kg',
    isFinalStage: false,
  },
  {
    name: 'Acid',
    sequence: 3,
    description: 'Acid treatment â billed per KG processed.',
    active: true,
    inputUnit: 'PCS',
    billingUnit: 'Per KG',
    billingEnabled: true,
    rateMethod: 'per_kg',
    isFinalStage: false,
  },
  {
    name: 'Polish',
    sequence: 4,
    description: 'Polishing â the final stage. Completing it produces saleable Finished Goods.',
    active: true,
    inputUnit: 'PCS',
    billingUnit: 'Per KG',
    billingEnabled: true,
    rateMethod: 'per_kg',
    isFinalStage: false,
  },
  {
    name: 'Spot Machine',
    sequence: 5,
    description: 'Spot machine processing  the final stage. Completing it produces saleable Finished Goods.',
    active: true,
    inputUnit: 'PCS',
    billingUnit: 'Per KG',
    billingEnabled: true,
    rateMethod: 'per_kg',
    isFinalStage: true,
  },
];

/**
 * Seed the processing stage master. Idempotent: no-ops when stages already
 * exist (or when the store has no way to add them yet). Returns the created
 * stage ids in chain order.
 */
export function seedDefaultProcessingStages(
  getState: () => { processingStages?: ProcessingStage[] },
  actions: { addProcessingStage?: (data: Omit<ProcessingStage, 'id'>) => string }
): { created: number; skipped: boolean } {
  const state = getState();
  if (!actions.addProcessingStage) return { created: 0, skipped: true };
  const existing = state.processingStages || [];
  if (existing.length > 0) return { created: 0, skipped: true };

  let created = 0;
  DEFAULT_PROCESSING_STAGES.forEach((stage, i) => {
    const id = actions.addProcessingStage!({ ...stage });
    created += 1;
    // Link nextStageId once all ids exist â do it via a second pass below.
    if (i > 0) return;
    void id;
  });

  // Wire nextStageId (chain order) after all stages exist.
  const stages = getState().processingStages || [];
  const ordered = [...stages].sort((a, b) => a.sequence - b.sequence);
  ordered.forEach((s, i) => {
    const next = ordered[i + 1];
    if (next && s.nextStageId !== next.id) {
      // Store-level update hook if available; otherwise leave unlinked (derived).
      (actions as any).updateProcessingStage?.(s.id, { nextStageId: next.id });
    }
  });

  return { created, skipped: false };
}

/** Build a fresh set of stage records with generated ids (used in tests). */
export function buildDefaultStages(): ProcessingStage[] {
  const stages: ProcessingStage[] = DEFAULT_PROCESSING_STAGES.map((s) => ({
    ...s,
    id: uuidv4(),
  }));
  stages.sort((a, b) => a.sequence - b.sequence);
  stages.forEach((s, i) => {
    s.nextStageId = stages[i + 1]?.id;
  });
  return stages;
}