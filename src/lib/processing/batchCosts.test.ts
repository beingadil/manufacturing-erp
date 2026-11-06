import { describe, expect, it } from 'vitest';
import type { ProcessingReceipt, ProcessingSend } from '../../types/erp';
import { stageCostBreakdown } from './batchCosts';
import { buildDefaultStages } from './processingStageSeed';

const STAGES = buildDefaultStages();
const SENDS: ProcessingSend[] = [
  { id: 's1', dispatchNo: 'DSP-1', processorId: 'p', materialId: 'm', batchId: 'b1', stageId: STAGES[0].id, pcsSent: 800, pcsReceived: 800, lossQuantity: 0, status: 'Closed', date: '2026-01-01', ratePerPiece: 10 },
  { id: 's2', dispatchNo: 'DSP-2', processorId: 'p', materialId: 'm', batchId: 'b1', stageId: STAGES[1].id, pcsSent: 800, pcsReceived: 795, lossQuantity: 5, status: 'Closed', date: '2026-01-02', ratePerPiece: 20 },
  { id: 's3', dispatchNo: 'DSP-3', processorId: 'p', materialId: 'm', batchId: 'b2', stageId: STAGES[0].id, pcsSent: 300, pcsReceived: 300, lossQuantity: 0, status: 'Closed', date: '2026-01-03', ratePerPiece: 10 },
];
const RECEIPTS: ProcessingReceipt[] = [
  { id: 'r1', receiveNo: 'REC-1', sendId: 's1', processorId: 'p', materialId: 'm', date: '2026-01-02', pcsReceived: 800, stageId: STAGES[0].id, billAmount: 8000, billedStatus: 'Unbilled' },
  { id: 'r2', receiveNo: 'REC-2', sendId: 's2', processorId: 'p', materialId: 'm', date: '2026-01-03', pcsReceived: 795, stageId: STAGES[1].id, billAmount: 15900, billedStatus: 'Unbilled' },
  { id: 'r3', receiveNo: 'REC-3', sendId: 's3', processorId: 'p', materialId: 'm', date: '2026-01-04', pcsReceived: 300, stageId: STAGES[0].id, billAmount: 3000, billedStatus: 'Unbilled' },
];

describe('stageCostBreakdown', () => {
  it('material totals cover every stage with activity, sorted by sequence', () => {
    const { rows, totals } = stageCostBreakdown(SENDS, RECEIPTS, STAGES);
    expect(rows.map(r => r.name)).toEqual(rows.map(r => r.name).sort());
    expect(rows.map(r => r.sequence)).toEqual([...rows.map(r => r.sequence)].sort((a, b) => a - b));
    expect(totals.dispatches).toBe(3);
    expect(totals.sent).toBe(1900);
    expect(totals.received).toBe(1895);
    expect(totals.loss).toBe(5);
    expect(totals.pending).toBe(0);
    expect(totals.billed).toBe(26900);
  });

  it('scopes to one purchase when batchId is passed', () => {
    const { rows, totals } = stageCostBreakdown(SENDS, RECEIPTS, STAGES, 'b1');
    expect(rows.map(r => r.sequence)).toEqual([1, 2]);
    expect(totals.dispatches).toBe(2);
    expect(totals.sent).toBe(1600);
    expect(totals.billed).toBe(23900);
  });

  it('surfaces stage-less legacy rows as an Unstaged line instead of dropping them', () => {
    const sends: ProcessingSend[] = [
      { id: 'u1', dispatchNo: 'DSP-U', processorId: 'p', materialId: 'm', batchId: 'b9', pcsSent: 120, pcsReceived: 118, status: 'Closed', date: '2026-01-05', ratePerPiece: 15 } as any,
    ];
    const receipts: ProcessingReceipt[] = [
      { id: 'u1r', receiveNo: 'REC-U', sendId: 'u1', processorId: 'p', materialId: 'm', date: '2026-01-06', pcsReceived: 118, billAmount: 1770, billedStatus: 'Unbilled' } as any,
    ];
    const { rows, totals } = stageCostBreakdown(sends, receipts, STAGES, 'b9');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toContain('Unstaged');
    expect(totals.dispatches).toBe(1);
    expect(totals.received).toBe(118);
    expect(totals.billed).toBe(1770);
  });

  it('rolls a loss into pending-zero and drops fully-idle stages', () => {
    const { rows, totals } = stageCostBreakdown(SENDS, RECEIPTS, STAGES);
    const stage2 = rows.find(r => r.sequence === 2)!;
    expect(stage2.loss).toBe(5);
    expect(stage2.pending).toBe(0);
    expect(rows.every(r => r.dispatches > 0 || r.billed > 0)).toBe(true);
  });
});
