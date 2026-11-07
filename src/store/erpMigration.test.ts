import { describe, expect, it, vi } from 'vitest';
import { migrateERPState } from './erpMigration';

// DocumentNumberingService.buildBatchNo consults the Settings store for
// batchNoMode. Mock the store (the real one lives in SQLite-backed zustand)
// with a mutable state so each test controls the scheme.
const settingsState: { batchNoMode: 'supplier' | 'classic' } = { batchNoMode: 'supplier' };
vi.mock('./useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => settingsState,
  },
}));

/**
 * Regression tests for step 4 of migrateERPState: unconditional reconstruction
 * of per-batch stages (raw → WIP → finished) from the send/receipt/sale history.
 *
 * The old implementation gated the backfill on field presence — if a batch
 * carried atProcessorPcs/processedPcs (even stale 0s stamped by an earlier
 * run), the backfill was skipped forever, leaving the batch trail showing the
 * same pcs as both raw AND finished (the double-count symptom: purchase
 * 300,000 appearing as 600,000 of inventory).
 */
describe('migrateERPState batch-stage reconstruction', () => {
  it('reconstructs finished pcs for a no-batch dispatch + receipt even when stale stage fields are present', () => {
    // Mirrors real preview/app data: send was created with batchId:null (legacy
    // 'Any Batch / General Stock' path) so the batch trail never moved, but the
    // batch already carries stage fields (0/0) that the old gate treated as
    // "already migrated". Material counters say: raw 0, WIP 0, finished 4000.
    const state: any = {
      accounts: [],
      accountSubtypes: [],
      customers: [],
      suppliers: [],
      processors: [],
      products: [],
      sales: [],
      vouchers: [],
      journalEntries: [],
      materials: [
        { id: 'm1', stockPcs: 0, atProcessorPcs: 0, processedStockPcs: 4000 }
      ],
      batches: [
        {
          id: 'b1',
          batchNo: 'BATCH-1',
          purchaseId: 'p1',
          supplierId: 's1',
          materialId: 'm1',
          date: '2026-08-10',
          weight: 1000,
          weightUnit: 'KGs',
          ratePerUnit: 300,
          weightPerPiece: 0.25,
          initialPcs: 4000,
          remainingPcs: 4000, // stale — never reduced by the old engine
          amount: 300000,
          status: 'Active',
          atProcessorPcs: 0, // stale 0 — the old gate saw these and skipped
          processedPcs: 0
        }
      ],
      processingSends: [
        {
          id: 'send1',
          materialId: 'm1',
          processorId: 'pr1',
          batchId: null, // legacy no-batch dispatch
          pcsSent: 4000,
          pcsReceived: 4000,
          status: 'Closed',
          date: '2026-08-10',
          ratePerPiece: 5
        }
      ],
      processingReceipts: [
        {
          id: 'rec1',
          sendId: 'send1',
          materialId: 'm1',
          pcsReceived: 4000,
          date: '2026-08-11'
        }
      ]
    };

    const result = migrateERPState(state);

    const batch = result.batches.find((b: any) => b.id === 'b1');
    // The SAME 4,000 pcs moved raw → WIP → finished. Nothing is counted twice.
    expect(batch.remainingPcs).toBe(0);
    expect(batch.atProcessorPcs).toBe(0);
    expect(batch.processedPcs).toBe(4000);
  });

  it('leaves the batch trail untouched when no processing history exists', () => {
    const state: any = {
      accounts: [],
      accountSubtypes: [],
      customers: [],
      suppliers: [],
      processors: [],
      products: [],
      sales: [],
      vouchers: [],
      journalEntries: [],
      materials: [{ id: 'm1', stockPcs: 4000, atProcessorPcs: 0, processedStockPcs: 0 }],
      batches: [
        {
          id: 'b1',
          batchNo: 'BATCH-1',
          purchaseId: 'p1',
          supplierId: 's1',
          materialId: 'm1',
          date: '2026-08-10',
          weight: 1000,
          weightUnit: 'KGs',
          ratePerUnit: 300,
          weightPerPiece: 0.25,
          initialPcs: 4000,
          remainingPcs: 4000,
          amount: 300000,
          status: 'Active'
        }
      ],
      processingSends: [],
      processingReceipts: []
    };

    const result = migrateERPState(state);
    const batch = result.batches.find((b: any) => b.id === 'b1');
    expect(batch.remainingPcs).toBe(4000);
    expect(batch.atProcessorPcs).toBe(0);
    expect(batch.processedPcs).toBe(0);
  });

  it('consumes finished pcs FIFO when sales exist after receipts', () => {
    const state: any = {
      accounts: [],
      accountSubtypes: [],
      customers: [],
      suppliers: [],
      processors: [],
      products: [{ id: 'prod1', materialId: 'm1' }],
      vouchers: [],
      journalEntries: [],
      materials: [
        { id: 'm1', stockPcs: 0, atProcessorPcs: 0, processedStockPcs: 2500 }
      ],
      batches: [
        {
          id: 'b1',
          batchNo: 'BATCH-1',
          purchaseId: 'p1',
          supplierId: 's1',
          materialId: 'm1',
          date: '2026-01-01',
          weight: 1000,
          weightUnit: 'KGs',
          ratePerUnit: 100,
          weightPerPiece: 0.25,
          initialPcs: 4000,
          remainingPcs: 4000,
          amount: 400000,
          status: 'Active'
        }
      ],
      processingSends: [
        {
          id: 'send1',
          materialId: 'm1',
          processorId: 'pr1',
          batchId: 'b1',
          pcsSent: 4000,
          pcsReceived: 4000,
          status: 'Closed',
          date: '2026-01-05',
          ratePerPiece: 5
        }
      ],
      processingReceipts: [
        { id: 'rec1', sendId: 'send1', materialId: 'm1', pcsReceived: 4000, date: '2026-01-06' }
      ],
      sales: [
        { id: 'sale1', productId: 'prod1', pcsSold: 1500, date: '2026-01-10' }
      ]
    };

    const result = migrateERPState(state);
    const batch = result.batches.find((b: any) => b.id === 'b1');
    expect(batch.remainingPcs).toBe(0);
    expect(batch.atProcessorPcs).toBe(0);
    expect(batch.processedPcs).toBe(2500); // 4000 produced − 1500 sold
  });
});

describe('migrateERPState batch-number scheme (step 5c)', () => {
  const makeState = (batchNo: string) => ({
    suppliers: [{ id: 's1', name: 'Ahmed Steel Traders' }],
    purchases: [
      { id: 'p1', supplierId: 's1', materialId: 'm1', purchaseNo: 'PO-2026-0003', date: '2026-01-01', weight: 1000, weightUnit: 'KGs', ratePerUnit: 100, weightPerPiece: 0.25, amount: 100000, status: 'Active' },
    ],
    batches: [
      { id: 'b1', purchaseId: 'p1', supplierId: 's1', materialId: 'm1', batchNo, initialPcs: 4000, remainingPcs: 4000 },
    ],
  });

  it('renames a legacy BATCH-{purchaseNo} number to the supplier scheme', () => {
    settingsState.batchNoMode = 'supplier';
    const result = migrateERPState(makeState('BATCH-PO-2026-0003'));
    const batch = result.batches.find((b: any) => b.id === 'b1');
    expect(batch.batchNo).toBe('AHMED-PO-2026-0003');
  });

  it('is idempotent — a renamed batch is never renamed again', () => {
    settingsState.batchNoMode = 'supplier';
    const once = migrateERPState(makeState('BATCH-PO-2026-0003'));
    const twice = migrateERPState(once);
    const batch = twice.batches.find((b: any) => b.id === 'b1');
    expect(batch.batchNo).toBe('AHMED-PO-2026-0003');
  });

  it('leaves custom or already-renamed batch numbers untouched', () => {
    settingsState.batchNoMode = 'supplier';
    const result = migrateERPState(makeState('MY-RENAMED-BATCH'));
    const batch = result.batches.find((b: any) => b.id === 'b1');
    expect(batch.batchNo).toBe('MY-RENAMED-BATCH');
  });

  it('keeps the BATCH- scheme when batchNoMode is classic', () => {
    settingsState.batchNoMode = 'classic';
    const result = migrateERPState(makeState('BATCH-PO-2026-0003'));
    const batch = result.batches.find((b: any) => b.id === 'b1');
    expect(batch.batchNo).toBe('BATCH-PO-2026-0003');
    settingsState.batchNoMode = 'supplier';
  });
});

describe('migrateERPState parts are ready-made (step 5b-ii)', () => {
  // A part is bought ready-made and never dispatched. A category's
  // defaultProcessingPath used to overwrite that choice after the usage card
  // was clicked, leaving parts stored as `full_chain`; purchase entry then
  // showed them as a full chain asking for KG and a weight per piece.
  const makeState = () => ({
    materials: [
      {
        id: 'm-part',
        usageType: 'component',
        processingPath: 'full_chain',
        fixedStageId: 'stage-1',
        allowedStageIds: ['stage-1'],
        stockPcs: 0,
      },
      { id: 'm-own', usageType: 'sellable', processingPath: 'full_chain', stockPcs: 0 },
    ],
    batches: [],
  });

  it('repairs a part that a category default put back on the chain', () => {
    const result = migrateERPState(makeState() as any);
    const part = result.materials.find((m: any) => m.id === 'm-part');
    expect(part.processingPath).toBe('ready_made');
    expect(part.fixedStageId).toBeUndefined();
    expect(part.allowedStageIds).toBeUndefined();
  });

  it('leaves a sellable material on its configured path', () => {
    const result = migrateERPState(makeState() as any);
    expect(result.materials.find((m: any) => m.id === 'm-own').processingPath).toBe('full_chain');
  });
});
