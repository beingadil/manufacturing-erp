import { describe, expect, it } from 'vitest';
import { fixReheadedPurchases } from './reheadedPurchaseFix';

function setup(overrides: any = {}) {
  return {
    materials: [
      { id: 'm-old', name: 'Handle (1-2)', stockPcs: 0, atProcessorPcs: 0, processedStockPcs: 845, processingPath: 'ready_made' },
      { id: 'm-new', name: 'Handle (4)', stockPcs: 0, atProcessorPcs: 0, processedStockPcs: 0, processingPath: 'ready_made' },
      { id: 'c-old', name: 'Circle 7 1/2 (0.9)', stockPcs: 13689, atProcessorPcs: 0, processedStockPcs: 0, processingPath: 'full_chain' },
      { id: 'c-new', name: 'Circle 7 1/2 (0.6)', stockPcs: 0, atProcessorPcs: 0, processedStockPcs: 0, processingPath: 'full_chain' },
    ],
    purchases: [
      { id: 'p1', purchaseNo: 'PO-1', materialId: 'm-new', supplierId: 's1', calculatedPcs: 845, date: '2026-09-01' },
      { id: 'p2', purchaseNo: 'PO-2', materialId: 'c-new', supplierId: 's1', calculatedPcs: 745, date: '2026-09-02' },
      // The rest of Circle 7 1/2 (0.9) sits in batches from earlier purchases
      // — the counter is a roll-up of those, so they must be present.
      { id: 'p3', purchaseNo: 'PO-3', materialId: 'c-old', supplierId: 's1', calculatedPcs: 12944, date: '2026-08-01' },
    ],
    batches: [
      { id: 'b1', batchNo: 'B1', purchaseId: 'p1', supplierId: 's1', materialId: 'm-old', date: '2026-09-01', weight: 0, weightUnit: 'PCS', ratePerUnit: 100, weightPerPiece: 0, initialPcs: 845, remainingPcs: 0, processedPcs: 845, amount: 84500, status: 'Active', processingPath: 'ready_made' },
      { id: 'b2', batchNo: 'B2', purchaseId: 'p2', supplierId: 's1', materialId: 'c-old', date: '2026-09-02', weight: 1000, weightUnit: 'KG', ratePerUnit: 68, weightPerPiece: 1.34, initialPcs: 745, remainingPcs: 745, amount: 68000, status: 'Active', processingPath: 'full_chain' },
      { id: 'b3', batchNo: 'B3', purchaseId: 'p3', supplierId: 's1', materialId: 'c-old', date: '2026-08-01', weight: 20000, weightUnit: 'KG', ratePerUnit: 34, weightPerPiece: 1.34, initialPcs: 12944, remainingPcs: 12944, amount: 680000, status: 'Active', processingPath: 'full_chain' },
    ],
    processingSends: [],
    processingReceipts: [],
    processorBills: [],
    sales: [],
    products: [],
    inventoryMovements: [
      { id: 'im1', materialId: 'm-old', batchId: 'b1', referenceNo: 'PO-1', module: 'Purchase', transactionType: 'IN', quantity: 845, runningBalance: 845, date: '2026-09-01' },
      { id: 'im2', materialId: 'c-old', batchId: 'b2', referenceNo: 'PO-2', module: 'Purchase', transactionType: 'IN', quantity: 745, runningBalance: 745, date: '2026-09-02' },
    ],
    ...overrides,
  };
}

describe('fixReheadedPurchases', () => {
  it('moves ready-made lots onto the chosen head and keeps them in the finished pool', () => {
    const { state, report } = fixReheadedPurchases(setup());

    expect(report.batchesRehead).toBe(2);
    const mOld = state.materials.find((m: any) => m.id === 'm-old');
    const mNew = state.materials.find((m: any) => m.id === 'm-new');
    expect(state.batches.find((b: any) => b.id === 'b1').materialId).toBe('m-new');
    expect(mOld.processedStockPcs).toBe(0);
    expect(mNew.processedStockPcs).toBe(845);
    // Ready-made never shows in raw
    expect(mNew.stockPcs).toBe(0);
  });

  it('moves Circle lots onto the chosen head and reflects them in raw stock', () => {
    const { state, report } = fixReheadedPurchases(setup());

    const cOld = state.materials.find((m: any) => m.id === 'c-old');
    const cNew = state.materials.find((m: any) => m.id === 'c-new');
    expect(cNew.stockPcs).toBe(745);
    expect(cOld.stockPcs).toBe(12944);
    expect(state.batches.find((b: any) => b.id === 'b2').materialId).toBe('c-new');
    expect(report.batchesRehead).toBe(2);
  });

  it('re-attributes the purchase movements to the chosen head', () => {
    const { state } = fixReheadedPurchases(setup());
    const im1 = state.inventoryMovements.find((im: any) => im.referenceNo === 'PO-1');
    const im2 = state.inventoryMovements.find((im: any) => im.referenceNo === 'PO-2');
    expect(im1.materialId).toBe('m-new');
    expect(im2.materialId).toBe('c-new');
  });

  it('skips batches that reached the processor pipeline — never silently migrated', () => {
    const before = setup({
      processingSends: [
        { id: 'send1', dispatchNo: 'DSP-1', materialId: 'c-old', batchId: 'b2', pcsSent: 745, pcsReceived: 0, status: 'Pending', date: '2026-09-03' },
      ],
    });
    const { state: after, report } = fixReheadedPurchases(before);

    expect(report.pipelineSkipped).toBe(1);
    expect(report.batchesRehead).toBe(1); // the ready-made lot still moves
    expect(after.batches.find((b: any) => b.id === 'b2').materialId).toBe('c-old');
    expect(after.materials.find((m: any) => m.id === 'c-old').stockPcs).toBe(13689);
  });

  it('is idempotent — the second run moves nothing', () => {
    const first = fixReheadedPurchases(setup());
    const second = fixReheadedPurchases(first.state);
    expect(second.report.batchesRehead).toBe(0);
    expect(second.report.pipelineSkipped).toBe(0);
    expect(second.report.missingMaterial).toBe(0);
    expect(second.state.materials).toEqual(first.state.materials);
    expect(second.state.batches).toEqual(first.state.batches);
  });

  it('reports mismatched purchases whose target material was deleted', () => {
    const state = setup({
      materials: [
        { id: 'm-old', name: 'Handle (1-2)', stockPcs: 0, atProcessorPcs: 0, processedStockPcs: 845, processingPath: 'ready_made' },
      ],
    });
    const { report } = fixReheadedPurchases(state);
    expect(report.missingMaterial).toBe(2);
  });
});

describe('fixReheadedPurchases — supplier sync & movement repair', () => {
  const prod1 = (over: any = {}): any => ({
    id: 'p1', purchaseNo: 'PO-1', materialId: 'm-new', supplierId: 's-obaid',
    calculatedPcs: 500, date: '2026-09-01', weight: 0, weightUnit: 'PCS',
    ...over,
  });

  const stateWith = (over: any = {}): any => ({
    materials: [
      { id: 'm-old', name: 'Kalsii (1-2)', stockPcs: 0, atProcessorPcs: 0, processedStockPcs: 2900, processingPath: 'ready_made' },
      { id: 'm-new', name: 'Kalsii (3-4)', stockPcs: 0, atProcessorPcs: 0, processedStockPcs: 500, processingPath: 'ready_made' },
    ],
    purchases: [prod1()],
    batches: [
      { id: 'b1', batchNo: 'BATCH-1', purchaseId: 'p1', supplierId: 's-saleem', materialId: 'm-old', date: '2026-09-01', weight: 0, weightUnit: 'PCS', ratePerUnit: 20, weightPerPiece: 0, initialPcs: 500, remainingPcs: 0, processedPcs: 500, amount: 10000, status: 'Active', processingPath: 'ready_made' },
    ],
    processingSends: [],
    processingReceipts: [],
    processorBills: [],
    sales: [],
    products: [],
    inventoryMovements: [
      { id: 'im1', materialId: 'm-old', batchId: 'b1', referenceNo: 'PO-1', module: 'Purchase', transactionType: 'IN', quantity: 20, runningBalance: 34, date: '2026-09-01' },
    ],
    ...over,
  });

  it('syncs the batch supplier to the purchase\'s current supplier', () => {
    const { state, report } = fixReheadedPurchases(stateWith());

    const b = state.batches.find((x: any) => x.id === 'b1');
    expect(b.supplierId).toBe('s-obaid');
    expect(b.materialId).toBe('m-new');
    expect(report.supplierSynced).toBe(1);
    expect(report.batchesRehead).toBe(1);
  });

  it('repairs purchase movement quantities to the purchase\'s calculated pieces', () => {
    const { state, report } = fixReheadedPurchases(stateWith());

    const im = state.inventoryMovements[0];
    expect(im.quantity).toBe(500);
    expect(report.movementsRepaired).toBe(1);
  });

  it('replays the running balance of every material it touched', () => {
    const { state, report } = fixReheadedPurchases(stateWith({
      inventoryMovements: [
        { id: 'im1', materialId: 'm-old', batchId: 'b1', referenceNo: 'PO-1', module: 'Purchase', transactionType: 'IN', quantity: 20, runningBalance: 34, date: '2026-09-01' },
        { id: 'im2', materialId: 'm-old', batchId: 'b1', referenceNo: 'PO-2', module: 'Dispatch', transactionType: 'OUT', quantity: 100, runningBalance: 14, date: '2026-09-02' },
      ],
    }));

    const moved = state.inventoryMovements.filter((im: any) => im.materialId === 'm-new');
    expect(moved).toHaveLength(2);
    const sorted = [...moved].sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
    expect(sorted[0].runningBalance).toBe(500);
    expect(sorted[1].runningBalance).toBe(400);
    expect(report.balancesReplayed).toBe(1);
  });

  it('leaves untouched materials\' ledgers alone', () => {
    // No material re-head (head matches), no supplier gap, no qty gap
    const clean = stateWith({
      purchases: [{ ...prod1(), materialId: 'm-old' }],
      batches: [
        { id: 'b1', batchNo: 'BATCH-1', purchaseId: 'p1', supplierId: 's-obaid', materialId: 'm-old', date: '2026-09-01', weight: 0, weightUnit: 'PCS', ratePerUnit: 20, weightPerPiece: 0, initialPcs: 500, remainingPcs: 0, processedPcs: 500, amount: 10000, status: 'Active', processingPath: 'ready_made' },
      ],
      inventoryMovements: [
        { id: 'im1', materialId: 'm-old', batchId: 'b1', referenceNo: 'PO-1', module: 'Purchase', transactionType: 'IN', quantity: 500, runningBalance: 34, date: '2026-09-01' },
      ],
    });

    const { state, report } = fixReheadedPurchases(clean);
    expect(state.inventoryMovements[0].runningBalance).toBe(34); // untouched
    expect(report.balancesReplayed).toBe(0);
    expect(report.movementsRepaired).toBe(0);
    expect(report.supplierSynced).toBe(0);
    expect(report.batchesRehead).toBe(0);
  });

  it('applies all repairs in one idempotent pass', () => {
    const first = fixReheadedPurchases(stateWith());
    const second = fixReheadedPurchases(first.state);
    expect(second.report.batchesRehead).toBe(0);
    expect(second.report.supplierSynced).toBe(0);
    expect(second.report.movementsRepaired).toBe(0);
    expect(second.report.balancesReplayed).toBe(0);
  });
});
