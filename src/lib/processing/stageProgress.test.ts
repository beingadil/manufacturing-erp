import { describe, expect, it } from 'vitest';
import { buildDefaultStages } from './processingStageSeed';
import { visibleStagesForMaterial } from './stageProgress';

const STAGES = buildDefaultStages();

describe('visibleStagesForMaterial', () => {
  it('returns the full chain for full_chain materials', () => {
    const result = visibleStagesForMaterial(STAGES, { processingPath: 'full_chain' });
    expect(result.map(s => s.name)).toEqual([
      'Initial Processor', 'Machine', 'Acid', 'Polish', 'Spot Machine',
    ]);
  });

  it('returns only the configured stages for custom_stages materials, in chain order', () => {
    const ids = [STAGES.find(s => s.name === 'Machine')!.id, STAGES.find(s => s.name === 'Spot Machine')!.id];
    const result = visibleStagesForMaterial(STAGES, { processingPath: 'custom_stages', allowedStageIds: ids });
    expect(result.map(s => s.name)).toEqual(['Machine', 'Spot Machine']);
  });

  it('returns only the fixed stage for single_stage materials', () => {
    const acid = STAGES.find(s => s.name === 'Acid')!;
    const result = visibleStagesForMaterial(STAGES, { processingPath: 'single_stage', fixedStageId: acid.id });
    expect(result.map(s => s.name)).toEqual(['Acid']);
  });

  it('returns nothing for ready_made materials — they are never dispatched', () => {
    const result = visibleStagesForMaterial(STAGES, { processingPath: 'ready_made' });
    expect(result).toEqual([]);
  });

  it('falls back to the full chain when a custom_stages material has no selection', () => {
    const result = visibleStagesForMaterial(STAGES, { processingPath: 'custom_stages', allowedStageIds: [] });
    expect(result.map(s => s.name)).toEqual([
      'Initial Processor', 'Machine', 'Acid', 'Polish', 'Spot Machine',
    ]);
  });

  it('falls back to the full chain when the path is unknown (legacy records)', () => {
    const result = visibleStagesForMaterial(STAGES, {} as any);
    expect(result).toHaveLength(STAGES.length);
  });

  it('returns every stage when no material is provided', () => {
    const result = visibleStagesForMaterial(STAGES, null);
    expect(result).toHaveLength(STAGES.length);
  });
});
