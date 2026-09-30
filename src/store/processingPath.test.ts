import { beforeEach, describe, expect, it } from 'vitest';
import { batchTotalPcs, InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { buildDefaultStages } from '../lib/processing/processingStageSeed';
import { PurchaseService } from '../services/PurchaseService';
import type { ProcessingStage } from '../types/erp';
import { useERPStore } from './useERPStore';

/**
 * Processing-path suite: full_chain (default), single_stage (one processor →
 * final product), ready_made (purchase → sellable finished stock, no dispatch).
 *
 * Laws hold on every path: only purchase creates pcs, every action is a
 * transfer, totals never change during processing.
 */

const STAGES: ProcessingStage[] = buildDefaultStages();

function seed() {
  useERPStore.setState({
    accountSubtypes: [
      { id: 'st-cash', name: 'Cash', type: 'Assets' as const, isSystem: true },
      { id: 'st-inv', name: 'Inventory', type: 'Assets' as const, isSystem: true },
      { id: 'st-ap', name: 'Accounts Payable', type: 'Liabilities' as const, isSystem: true },
      { id: 'st-ar', name: 'Accounts Receivable', type: 'Assets' as const, isSystem: true },
      { id: 'st-sales', name: 'Sales', type: 'Revenue' as const, isSystem: true },
      { id: 'st-proc', name: 'Processing Expense', type: 'Expenses' as const, isSystem: true },
    ],
    accounts: [
      { id: 'acct-cash', code: '1001', name: 'Cash in Hand', subtypeId: 'st-cash', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-rm', code: '1101', name: 'Raw Material Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-fg', code: '1103', name: 'Finished Goods Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-ap', code: '2000', name: 'Accounts Payable', subtypeId: 'st-ap', type: 'Liabilities' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-ar', code: '1200', name: 'Accounts Receivable', subtypeId: 'st-ar', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-sales', code: '4001', name: 'Sales Revenue', subtypeId: 'st-sales', type: 'Revenue' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-proc-exp', code: '5101', name: 'Processing Expense', subtypeId: 'st-proc', type: 'Expenses' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-cogs', code: '5201', name: 'Cost of Goods Sold', subtypeId: 'st-proc', type: 'Cost of Goods Sold' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
    ],
    suppliers: [], customers: [], processors: [], purchases: [], sales: [], batches: [],
    inventoryMovements: [], vouchers: [], journalEntries: [], materials: [], products: [],
    processingSends: [], processingReceipts: [], processorBills: [],
    processingStages: STAGES,
  } as any);

  const st = useERPStore.getState();
  st.addSupplier({ name: 'Supplier A' });
  st.addCustomer({ name: 'Customer A' });
  const initialProcessorId = st.addProcessor({ name: 'Initial Processor', stageId: STAGES[0].id });
  const machineProcessorId = st.addProcessor({ name: 'Machine Man', stageId: STAGES[1].id });
  const state = useERPStore.getState() as any;
  // Named handles — the store PREPENDS, so positional indices swap silently.
  state.initialProcessorId = initialProcessorId;
  state.machineProcessorId = machineProcessorId;
  return state;
}

describe('full_chain (default / legacy behaviour unchanged)', () => {
  let s: ReturnType<typeof seed>;
  beforeEach(() => { s = seed(); });

  it('routes stage-1 send from raw and only final stage produces finished', () => {
    const materialId = s.addRawMaterial({ name: 'Coil', categoryId: 'c1' });
    s.addPurchase({ supplierId: s.suppliers[0].id, materialId, date: '2026-09-01', weight: 100, weightUnit: 'KGs', ratePerUnit: 300, weightPerPiece: 0.5 } as any); // 200 pcs
    // State is re-read after every action — zustand snapshots go stale on set().
    let st = useERPStore.getState();
    const mat = st.materials.find(m => m.id === materialId)!;
    expect(mat.processingPath ?? 'full_chain').toBe('full_chain');

    st.addProcessingSend({ processorId: s.initialProcessorId, materialId, stageId: STAGES[0].id, date: '2026-09-02', pcsSent: 150, ratePerPiece: 10 } as any);
    st = useERPStore.getState();
    expect(st.materials.find(m => m.id === materialId)!.stockPcs).toBe(50);

    st.addProcessingReceipt({ sendId: st.processingSends[0].id, processorId: s.initialProcessorId, materialId, date: '2026-09-03', pcsReceived: 150 } as any);
    st = useERPStore.getState();
    // Full chain: Initial (stage 1) is NOT final → availability, not finished.
    expect(st.materials.find(m => m.id === materialId)!.processedStockPcs).toBe(0);
    expect(batchTotalPcs(st.batches.find(b => b.materialId === materialId)!)).toBe(200);
  });
});

describe('single_stage — one processor becomes the final product', () => {
  let s: ReturnType<typeof seed>;
  beforeEach(() => { s = seed(); });

  it('purchase lands in RAW; send consumes RAW at the fixed stage mid-chain; receipt produces FINISHED', () => {
    const materialId = s.addRawMaterial({ name: 'Ring', categoryId: 'c1', processingPath: 'single_stage', fixedStageId: STAGES[1].id });
    s.addPurchase({ supplierId: s.suppliers[0].id, materialId, date: '2026-09-01', weight: 50, weightUnit: 'KGs', ratePerUnit: 200, weightPerPiece: 0.25 } as any); // 200 pcs
    let st = useERPStore.getState();
    expect(st.materials.find(m => m.id === materialId)!.stockPcs).toBe(200); // raw pool
    expect(st.materials.find(m => m.id === materialId)!.processedStockPcs).toBe(0);

    // Send to the FIXED stage (Machine, sequence 2 — mid-chain) — must be legal
    // and consume RAW despite not being stage 1.
    st.addProcessingSend({ processorId: s.machineProcessorId, materialId, stageId: STAGES[1].id, date: '2026-09-02', pcsSent: 120, ratePerPiece: 8 } as any);
    st = useERPStore.getState();
    expect(st.materials.find(m => m.id === materialId)!.stockPcs).toBe(80);
    expect(st.materials.find(m => m.id === materialId)!.atProcessorPcs).toBe(120);

    // Receipt at the fixed stage: the pcs ARE the final product.
    st.addProcessingReceipt({ sendId: st.processingSends[0].id, processorId: s.machineProcessorId, materialId, date: '2026-09-03', pcsReceived: 120 } as any);
    st = useERPStore.getState();
    const mat = st.materials.find(m => m.id === materialId)!;
    expect(mat.processedStockPcs).toBe(120); // finished, sellable
    expect(mat.atProcessorPcs).toBe(0);
    const batch = st.batches.find(b => b.materialId === materialId)!;
    expect(batch.processedPcs).toBe(120);
    expect(batchTotalPcs(batch)).toBe(200); // LAW 3
  });

  it('rejects sending a single_stage material to any other stage', () => {
    const materialId = s.addRawMaterial({ name: 'Ring', categoryId: 'c1', processingPath: 'single_stage', fixedStageId: STAGES[1].id });
    s.addPurchase({ supplierId: s.suppliers[0].id, materialId, date: '2026-09-01', weight: 50, weightUnit: 'KGs', ratePerUnit: 200, weightPerPiece: 0.25 } as any);
    const st = useERPStore.getState();
    expect(() =>
      st.addProcessingSend({ processorId: s.initialProcessorId, materialId, stageId: STAGES[0].id, date: '2026-09-02', pcsSent: 10, ratePerPiece: 8 } as any)
    ).toThrow(/only processes at/);
  });

  it('rejects over-sending beyond raw stock', () => {
    const materialId = s.addRawMaterial({ name: 'Ring', categoryId: 'c1', processingPath: 'single_stage', fixedStageId: STAGES[1].id });
    s.addPurchase({ supplierId: s.suppliers[0].id, materialId, date: '2026-09-01', weight: 25, weightUnit: 'KGs', ratePerUnit: 200, weightPerPiece: 0.25 } as any); // 100 pcs
    const st = useERPStore.getState();
    expect(() =>
      st.addProcessingSend({ processorId: s.machineProcessorId, materialId, stageId: STAGES[1].id, date: '2026-09-02', pcsSent: 101, ratePerPiece: 8 } as any)
    ).toThrow(/available/);
  });
});

describe('ready_made — purchase lands in finished stock, never dispatched', () => {
  let s: ReturnType<typeof seed>;
  beforeEach(() => { s = seed(); });

  it('direct-pcs purchase lands in the FINISHED pool and debits Finished Goods', () => {
    const materialId = s.addRawMaterial({ name: 'Lid 6in', categoryId: 'c1', processingPath: 'ready_made' });
    s.addPurchase({ supplierId: s.suppliers[0].id, materialId, date: '2026-09-01', weight: 0, weightUnit: 'KGs', ratePerUnit: 12, weightPerPiece: 0, directPcs: 500 } as any);
    const st = useERPStore.getState();
    const mat = st.materials.find(m => m.id === materialId)!;
    expect(mat.stockPcs).toBe(0);               // never raw
    expect(mat.processedStockPcs).toBe(500);    // sellable immediately
    const purchase = st.purchases[0];
    expect(purchase.calculatedPcs).toBe(500);
    expect(purchase.amount).toBe(6000);         // 500 × Rs 12
    const batch = st.batches.find(b => b.materialId === materialId)!;
    expect(batch.processingPath).toBe('ready_made');
    // Accounting: debit Finished Goods (not Raw Material), credit AP.
    const voucher = st.vouchers.find(v => v.sourceId === purchase.id)!;
    const debit = st.journalEntries.find(e => e.voucherId === voucher.id && e.debit > 0)!;
    const fgAccount = st.accounts.find(a => a.name === 'Finished Goods Inventory')!;
    expect(debit.accountId).toBe(fgAccount.id);
  });

  it('ready-made pcs are sellable through the normal sale flow (FIFO COGS)', () => {
    const materialId = s.addRawMaterial({ name: 'Handle', categoryId: 'c1', processingPath: 'ready_made' });
    s.addProduct({ name: 'Handle 6in', materialId, sellingPrice: 25 });
    s.addPurchase({ supplierId: s.suppliers[0].id, materialId, date: '2026-09-01', weight: 0, weightUnit: 'KGs', ratePerUnit: 12, weightPerPiece: 0, directPcs: 300 } as any);
    const st = useERPStore.getState();
    st.addSale({ customerId: s.customers[0].id, productId: st.products[0].id, date: '2026-09-05', pcsSold: 100, pricePerPiece: 25 } as any);
    const after = useERPStore.getState();
    expect(after.materials.find(m => m.id === materialId)!.processedStockPcs).toBe(200);
    // COGS at batch cost: 100 × Rs 12 = Rs 1,200 — asserted on the COGS account directly.
    const voucher = after.vouchers.find(v => v.sourceModule === 'Sales')!;
    const cogsAccount = after.accounts.find(a => a.name === 'Cost of Goods Sold')!;
    const cogsEntry = after.journalEntries.find(e => e.voucherId === voucher.id && e.accountId === cogsAccount.id)!;
    expect(cogsEntry.debit).toBe(1200);
  });

  it('rejects dispatching a ready-made material (guard)', () => {
    const materialId = s.addRawMaterial({ name: 'Lid 6in', categoryId: 'c1', processingPath: 'ready_made' });
    s.addPurchase({ supplierId: s.suppliers[0].id, materialId, date: '2026-09-01', weight: 0, weightUnit: 'KGs', ratePerUnit: 12, weightPerPiece: 0, directPcs: 100 } as any);
    const st = useERPStore.getState();
    const general = st.addProcessor({ name: 'Any Worker' });
    expect(() =>
      st.addProcessingSend({ processorId: general, materialId, stageId: STAGES[0].id, date: '2026-09-02', pcsSent: 50, ratePerPiece: 5 } as any)
    ).toThrow(/ready-made/);
  });

  it('deleting a ready-made purchase returns pcs from the FINISHED pool', () => {
    const materialId = s.addRawMaterial({ name: 'Lid 6in', categoryId: 'c1', processingPath: 'ready_made' });
    s.addPurchase({ supplierId: s.suppliers[0].id, materialId, date: '2026-09-01', weight: 0, weightUnit: 'KGs', ratePerUnit: 12, weightPerPiece: 0, directPcs: 200 } as any);
    let st = useERPStore.getState();
    expect(st.materials.find(m => m.id === materialId)!.processedStockPcs).toBe(200);
    st.deletePurchase(st.purchases[0].id);
    st = useERPStore.getState();
    expect(st.materials.find(m => m.id === materialId)!.processedStockPcs).toBe(0);
    expect(st.materials.find(m => m.id === materialId)!.stockPcs).toBe(0);
  });
});

describe('custom_stages — user-selected subset of stages, chain order enforced', () => {
  let s: ReturnType<typeof seed>;
  beforeEach(() => { s = seed(); });
  // Chain: 0=Initial 1=Machine 2=Acid 3=Polish 4=Spot(final). Select 1=Machine and 3=Polish.
  const SELECTED = [STAGES[1].id, STAGES[3].id];

  it('purchase lands raw; send consumes RAW at FIRST selected stage mid-chain', () => {
    const materialId = s.addRawMaterial({ name: 'Clip', categoryId: 'c1', processingPath: 'custom_stages', allowedStageIds: SELECTED });
    s.addPurchase({ supplierId: s.suppliers[0].id, materialId, date: '2026-09-01', weight: 100, weightUnit: 'KGs', ratePerUnit: 300, weightPerPiece: 0.5 } as any); // 200 pcs
    let st = useERPStore.getState();
    expect(st.materials.find(m => m.id === materialId)!.stockPcs).toBe(200);

    // First selected stage is Machine (sequence 2, NOT stage 1) — raw draw legal.
    st.addProcessingSend({ processorId: s.machineProcessorId, materialId, stageId: STAGES[1].id, date: '2026-09-02', pcsSent: 150, ratePerPiece: 8 } as any);
    st = useERPStore.getState();
    expect(st.materials.find(m => m.id === materialId)!.stockPcs).toBe(50);
    expect(st.materials.find(m => m.id === materialId)!.atProcessorPcs).toBe(150);
  });

  it('receipt at LAST selected stage produces FINISHED; intermediate receipt does not', () => {
    const materialId = s.addRawMaterial({ name: 'Clip', categoryId: 'c1', processingPath: 'custom_stages', allowedStageIds: SELECTED });
    s.addPurchase({ supplierId: s.suppliers[0].id, materialId, date: '2026-09-01', weight: 100, weightUnit: 'KGs', ratePerUnit: 300, weightPerPiece: 0.5 } as any);
    let st = useERPStore.getState();
    st.addProcessingSend({ processorId: s.machineProcessorId, materialId, stageId: STAGES[1].id, date: '2026-09-02', pcsSent: 150, ratePerPiece: 8 } as any);
    st = useERPStore.getState();
    st.addProcessingReceipt({ sendId: st.processingSends[0].id, processorId: s.machineProcessorId, materialId, date: '2026-09-03', pcsReceived: 150 } as any);
    st = useERPStore.getState();
    // Machine is NOT the last selected stage (Polish is) → availability, not finished.
    expect(st.materials.find(m => m.id === materialId)!.processedStockPcs).toBe(0);
    expect(st.materials.find(m => m.id === materialId)!.stockPcs).toBe(50);

    // Second leg: Machine output → Polish (last selected) — legal, produces finished.
    st.addProcessingSend({ processorId: st.addProcessor({ name: 'Polish Man', stageId: STAGES[3].id }), materialId, stageId: STAGES[3].id, date: '2026-09-04', pcsSent: 150, ratePerPiece: 6 } as any);
    st = useERPStore.getState();
    st.addProcessingReceipt({ sendId: st.processingSends[0].id, processorId: st.processors[st.processors.length - 1].id, materialId, date: '2026-09-05', pcsReceived: 150 } as any);
    st = useERPStore.getState();
    expect(st.materials.find(m => m.id === materialId)!.processedStockPcs).toBe(150);
    expect(batchTotalPcs(st.batches.find(b => b.materialId === materialId)!)).toBe(200); // LAW 3
  });

  it('rejects sending to an UNSELECTED stage even if it is stage 1', () => {
    const materialId = s.addRawMaterial({ name: 'Clip', categoryId: 'c1', processingPath: 'custom_stages', allowedStageIds: SELECTED });
    s.addPurchase({ supplierId: s.suppliers[0].id, materialId, date: '2026-09-01', weight: 100, weightUnit: 'KGs', ratePerUnit: 300, weightPerPiece: 0.5 } as any);
    const st = useERPStore.getState();
    expect(() =>
      st.addProcessingSend({ processorId: s.initialProcessorId, materialId, stageId: STAGES[0].id, date: '2026-09-02', pcsSent: 10, ratePerPiece: 8 } as any)
    ).toThrow(/only processes at/);
  });

  it('rejects skipping: Machine output cannot jump past Polish to an unselected stage', () => {
    const materialId = s.addRawMaterial({ name: 'Clip', categoryId: 'c1', processingPath: 'custom_stages', allowedStageIds: SELECTED });
    s.addPurchase({ supplierId: s.suppliers[0].id, materialId, date: '2026-09-01', weight: 100, weightUnit: 'KGs', ratePerUnit: 300, weightPerPiece: 0.5 } as any);
    let st = useERPStore.getState();
    st.addProcessingSend({ processorId: s.machineProcessorId, materialId, stageId: STAGES[1].id, date: '2026-09-02', pcsSent: 100, ratePerPiece: 8 } as any);
    st = useERPStore.getState();
    st.addProcessingReceipt({ sendId: st.processingSends[0].id, processorId: s.machineProcessorId, materialId, date: '2026-09-03', pcsReceived: 100 } as any);
    st = useERPStore.getState();
    // Spot (final system stage) is unselected — must be rejected.
    const spotProcessor = st.addProcessor({ name: 'Spot Man', stageId: STAGES[4].id });
    expect(() =>
      st.addProcessingSend({ processorId: spotProcessor, materialId, stageId: STAGES[4].id, date: '2026-09-04', pcsSent: 100, ratePerPiece: 5 } as any)
    ).toThrow(/only processes at/);
  });

  it('engine helpers: raw at first selected, finished at last selected', () => {
    const stages = STAGES;
    const mat = { processingPath: 'custom_stages' as const, allowedStageIds: SELECTED };
    expect(InventoryCalculationService.sendConsumesRaw(stages[1].id, stages, mat)).toBe(true);   // first selected
    expect(InventoryCalculationService.sendConsumesRaw(stages[0].id, stages, mat)).toBe(false);  // unselected
    expect(InventoryCalculationService.receiptProducesFinished(stages[3].id, stages, mat)).toBe(true);  // last selected
    expect(InventoryCalculationService.receiptProducesFinished(stages[4].id, stages, mat)).toBe(false); // unselected final stage
  });

  it('purchase through the real service path validates weight math normally', () => {
    const materialId = s.addRawMaterial({ name: 'Clip', categoryId: 'c1', processingPath: 'custom_stages', allowedStageIds: SELECTED });
    PurchaseService.create({
      supplierId: s.suppliers[0].id, materialId, date: '2026-09-01',
      weight: 50, weightUnit: 'KGs', ratePerUnit: 300, weightPerPiece: 0.5,
    } as any);
    const st = useERPStore.getState();
    expect(st.purchases).toHaveLength(1);
    expect(st.materials.find(m => m.id === materialId)!.stockPcs).toBe(100);
  });
});

describe('path helpers (engine level)', () => {
  it('sendConsumesRaw: single_stage only at fixed stage; ready_made never', () => {
    const stages = STAGES;
    expect(InventoryCalculationService.sendConsumesRaw(stages[1].id, stages, { processingPath: 'single_stage', fixedStageId: stages[1].id })).toBe(true);
    expect(InventoryCalculationService.sendConsumesRaw(stages[0].id, stages, { processingPath: 'single_stage', fixedStageId: stages[1].id })).toBe(false);
    expect(InventoryCalculationService.sendConsumesRaw(stages[0].id, stages, { processingPath: 'ready_made' })).toBe(false);
    expect(InventoryCalculationService.sendConsumesRaw(stages[0].id, stages, undefined)).toBe(true);
  });

  it('receiptProducesFinished: single_stage finishes at its fixed stage', () => {
    const stages = STAGES;
    expect(InventoryCalculationService.receiptProducesFinished(stages[1].id, stages, { processingPath: 'single_stage', fixedStageId: stages[1].id })).toBe(true);
    expect(InventoryCalculationService.receiptProducesFinished(stages[0].id, stages, { processingPath: 'single_stage', fixedStageId: stages[1].id })).toBe(false);
    expect(InventoryCalculationService.receiptProducesFinished(stages[4].id, stages, undefined)).toBe(true); // final stage
  });
});

/**
 * The cases above call `addPurchase` directly, which skips PurchaseService and
 * its validator — the layer the purchase form actually goes through. These run
 * the real path so no validation rule can reject a purchase the engine allows.
 */
describe('purchases through the real service path (validation included)', () => {
  let s: ReturnType<typeof seed>;
  beforeEach(() => { s = seed(); });

  it('accepts a ready-made purchase quantified in pieces', () => {
    const materialId = s.addRawMaterial({ name: 'Lid 6in', categoryId: 'c1', processingPath: 'ready_made' });
    PurchaseService.create({
      supplierId: s.suppliers[0].id, materialId, date: '2026-09-01',
      weight: 0, weightUnit: 'KGs', ratePerUnit: 12, weightPerPiece: 0, directPcs: 250,
    } as any);
    const st = useERPStore.getState();
    expect(st.purchases).toHaveLength(1);
    expect(st.purchases[0].amount).toBe(3000); // 250 × Rs 12
    expect(st.materials.find(m => m.id === materialId)!.processedStockPcs).toBe(250);
  });

  it('still rejects a ready-made purchase with no pieces recorded', () => {
    const materialId = s.addRawMaterial({ name: 'Lid 6in', categoryId: 'c1', processingPath: 'ready_made' });
    expect(() => PurchaseService.create({
      supplierId: s.suppliers[0].id, materialId, date: '2026-09-01',
      weight: 0, weightUnit: 'KGs', ratePerUnit: 12, weightPerPiece: 0,
    } as any)).toThrow();
    expect(useERPStore.getState().purchases).toHaveLength(0);
  });

  it('still demands weight math for every other path', () => {
    const materialId = s.addRawMaterial({ name: 'Coil', categoryId: 'c1' });
    expect(() => PurchaseService.create({
      supplierId: s.suppliers[0].id, materialId, date: '2026-09-01',
      weight: 0, weightUnit: 'KGs', ratePerUnit: 300, weightPerPiece: 0.5, directPcs: 200,
    } as any)).toThrow();
    expect(useERPStore.getState().purchases).toHaveLength(0);
  });
});
