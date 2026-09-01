import { beforeEach, describe, expect, it } from 'vitest';
import { AccountingEngine } from '../lib/accounting/AccountingEngine';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { FinancialReportService } from '../lib/reporting/FinancialReportService';
import { buildDefaultStages } from '../lib/processing/processingStageSeed';
import type { ProcessingStage } from '../types/erp';
import { migrateERPState } from './erpMigration';
import { useERPStore } from './useERPStore';

/**
 * Multi-stage processing test suite (spec §26 — test plan A–M).
 *
 * The ONE economic asset (a batch) moves through the chain
 *   Purchase → Initial Processor → Machine → Acid → Polish → Spot Machine → Finished → Sale
 * and must NEVER be counted twice at any stage. Total inventory value stays
 * PKR 300,000 until a sale actually removes finished goods.
 *
 * Stage semantics: only the configured FINAL stage (Spot Machine) produces Finished
 * Goods; Intermediate stages (Initial Processor, Machine, Acid) are WIP→WIP
 * passthroughs that relocate the same pcs without touching the finished bucket.
 *
 * Stage billing: Machine/Acid/Polish bill per KG (32 KG × Rs 32 = Rs 1,024),
 * Initial Processor bills per piece (legacy behaviour).
 */

const STAGES: ProcessingStage[] = buildDefaultStages();
const stageByName = (name: string) => STAGES.find(s => s.name === name)!;

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
      { id: 'acct-wip', code: '1102', name: 'Work in Progress Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-fg', code: '1103', name: 'Finished Goods Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-ap', code: '2000', name: 'Accounts Payable', subtypeId: 'st-ap', type: 'Liabilities' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-ar', code: '1200', name: 'Accounts Receivable', subtypeId: 'st-ar', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-sales', code: '4001', name: 'Sales Revenue', subtypeId: 'st-sales', type: 'Revenue' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-proc-exp', code: '5101', name: 'Processing Expense', subtypeId: 'st-proc', type: 'Expenses' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-cogs', code: '5201', name: 'Cost of Goods Sold', subtypeId: 'st-proc', type: 'Cost of Goods Sold' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
    ],
    suppliers: [],
    customers: [],
    processors: [],
    purchases: [],
    sales: [],
    batches: [],
    inventoryMovements: [],
    vouchers: [],
    journalEntries: [],
    materials: [],
    products: [],
    processingSends: [],
    processingReceipts: [],
    processorBills: [],
    processingStages: STAGES,
  } as any);

  const st = useERPStore.getState();
  st.addSupplier({ name: 'Supplier A' });
  st.addCustomer({ name: 'Customer A' });
  st.addProcessor({ name: 'Machine Man' });
  st.addProcessor({ name: 'Acid Man' });
  st.addProcessor({ name: 'Polisher' });
  st.addProcessor({ name: 'Initial Processor' });
    st.addProcessor({ name: 'Spot Machine Man' });
  st.addRawMaterial({ name: 'Steel Coil', categoryId: 'c1' });
  st.addProduct({ name: 'Jug', materialId: useERPStore.getState().materials[0].id, price: 3000 });
}

/** Purchase 1000 KG @ 300/KG = PKR 300,000 → 2000 pcs (0.5 KG/pcs). */
function purchase() {
  const s = useERPStore.getState();
  s.addPurchase({
    supplierId: s.suppliers[0].id,
    materialId: s.materials[0].id,
    date: '2026-08-01',
    weight: 1000,
    weightUnit: 'KGs',
    ratePerUnit: 300,
    weightPerPiece: 0.5,
  } as any);
}

function st() {
  return useERPStore.getState();
}

function material() {
  return st().materials[0];
}

function inventoryValue(): number {
  const v = InventoryCalculationService.getMaterialStageValues(material().id, st().batches);
  return v.raw.value + v.atProcessor.value + v.finished.value;
}

function processorByName(name: string): string {
  return st().processors.find(p => p.name === name)!.id;
}

/** Send `pcs` to `stageName` via the given worker and return the new send id (may be undefined if rejected). */
function sendToStage(stageName: string, workerName: string, pcs: number, rate: number, date: string): string | undefined {
  const s = st();
  s.addProcessingSend({
    processorId: processorByName(workerName),
    materialId: s.materials[0].id,
    batchId: s.batches[0].id,
    date,
    pcsSent: pcs,
    ratePerPiece: rate,
    stageId: stageByName(stageName).id,
  } as any);
  return st().processingSends[0]?.id;
}

/** Receive `pcs` from `stageName` for a send. */
function receiveFromStage(sendId: string, stageName: string, workerName: string, pcs: number, date: string) {
  const s = st();
  s.addProcessingReceipt({
    sendId,
    processorId: processorByName(workerName),
    materialId: s.materials[0].id,
    date,
    pcsReceived: pcs,
    stageId: stageByName(stageName).id,
  } as any);
}

describe('multi-stage processing engine', () => {
  beforeEach(() => {
    seed();
  });

  // ── TEST A — Purchase ─────────────────────────────────────────────────────
  it('A: purchase of PKR 300,000 enters inventory exactly once', () => {
    purchase();
    const stages = InventoryCalculationService.getMaterialStageValues(material().id, st().batches);
    expect(material().stockPcs).toBe(2000); // 1000 KG / 0.5 KG per pcs
    expect(stages.raw.value).toBe(300000);
    expect(stages.atProcessor.value).toBe(0);
    expect(stages.finished.value).toBe(0);
    expect(inventoryValue()).toBe(300000);
  });

  // ── TEST B — Send ALL to Initial Processor ────────────────────────────────
  it('TEST B: sending all raw to the Initial Processor relocates value (raw=0, WIP=300,000, total stays 300,000)', () => {
    purchase();
    sendToStage('Initial Processor', 'Initial Processor', 2000, 5, '2026-08-02');

    const stages = InventoryCalculationService.getMaterialStageValues(material().id, st().batches);
    expect(material().stockPcs).toBe(0);
    expect(material().atProcessorPcs).toBe(2000);
    expect(stages.raw.value).toBe(0);
    expect(stages.atProcessor.value).toBe(300000);
    expect(inventoryValue()).toBe(300000); // NOT 600,000
  });

  // ── TEST C — Machine Man billing (32 KG × Rs 32 = Rs 1,024) ───────────────
  it('TEST C: Machine stage bills 32 KG @ Rs 32/KG = Rs 1,024 with no inventory change', () => {
    purchase();
    // Move all 2000 pcs through Initial Processor (raw → WIP), then 64 pcs (32 KG) to Machine
    const initSend = sendToStage('Initial Processor', 'Initial Processor', 2000, 5, '2026-08-02');
    receiveFromStage(initSend, 'Initial Processor', 'Initial Processor', 2000, '2026-08-03');

    const machineSend = sendToStage('Machine', 'Machine Man', 64, 32, '2026-08-04');
    receiveFromStage(machineSend, 'Machine', 'Machine Man', 64, '2026-08-05');

    const after = st();
    const machineReceipt = after.processingReceipts[0];
    expect(machineReceipt.billAmount).toBe(1024); // 64 pcs × 0.5 KG × 32
    expect(machineReceipt.rateMethod).toBe('per_kg');

    after.addProcessorBill({
      processorId: processorByName('Machine Man'),
      date: '2026-08-06',
      receiptIds: [machineReceipt.id],
      stageId: stageByName('Machine').id,
      rateMethod: 'per_kg',
      billingUnit: 'Per KG',
    } as any);

    const billed = st();
    expect(billed.processorBills[0].totalAmount).toBe(1024);
    expect(billed.processors.find(p => p.name === 'Machine Man')!.balancePayable).toBe(1024);
    expect(inventoryValue()).toBe(300000); // billing never changes inventory
  });

  // ── TEST D — Acid stage ───────────────────────────────────────────────────
  it('TEST D: acid-man bills the same eligible quantity with no duplicate inventory', () => {
    purchase();
    const initSend = sendToStage('Initial Processor', 'Initial Processor', 2000, 5, '2026-08-02');
    receiveFromStage(initSend, 'Initial Processor', 'Initial Processor', 2000, '2026-08-03');

    const machineSend = sendToStage('Machine', 'Machine Man', 64, 32, '2026-08-04');
    receiveFromStage(machineSend, 'Machine', 'Machine Man', 64, '2026-08-05');

    const acidSend = sendToStage('Acid', 'Acid Man', 64, 40, '2026-08-06');
    receiveFromStage(acidSend, 'Acid', 'Acid Man', 64, '2026-08-07');

    const after = st();
    const acidReceipt = after.processingReceipts[0];
    expect(acidReceipt.rateMethod).toBe('per_kg');
    expect(acidReceipt.billAmount).toBe(64 * 0.5 * 40); // 1,280

    after.addProcessorBill({
      processorId: processorByName('Acid Man'),
      date: '2026-08-08',
      receiptIds: [acidReceipt.id],
      stageId: stageByName('Acid').id,
      rateMethod: 'per_kg',
      billingUnit: 'Per KG',
    } as any);

    expect(st().processors.find(p => p.name === 'Acid Man')!.balancePayable).toBe(1280);
    expect(inventoryValue()).toBe(300000); // still no double-count
  });

  // ── TEST E — Spot Machine (final) completes → Finished Goods ────────────────────
  it('TEST E: completing the final stage produces finished goods exactly once', () => {
    purchase();
    const initSend = sendToStage('Initial Processor', 'Initial Processor', 2000, 5, '2026-08-02');
    receiveFromStage(initSend, 'Initial Processor', 'Initial Processor', 2000, '2026-08-03');

    const spotSend = sendToStage('Spot Machine', 'Spot Machine Man', 64, 50, '2026-08-10');
    receiveFromStage(spotSend, 'Spot Machine', 'Spot Machine Man', 64, '2026-08-11');

    const stages = InventoryCalculationService.getMaterialStageValues(material().id, st().batches);
    expect(material().processedStockPcs).toBe(64);
    expect(material().atProcessorPcs).toBe(2000 - 64);
    expect(stages.finished.value).toBe(64 * 150); // 9,600
    expect(stages.atProcessor.value).toBe((2000 - 64) * 150); // 290,400
    expect(inventoryValue()).toBe(300000); // still exactly 300,000
  });

  // ── TEST F — Partial receipt ──────────────────────────────────────────────
  it('TEST F: partial receipt (100 sent, 96 received) leaves 4 pending — no automatic loss', () => {
    purchase();
    sendToStage('Initial Processor', 'Initial Processor', 100, 5, '2026-08-02');
    const sendId = st().processingSends[0].id;
    receiveFromStage(sendId, 'Initial Processor', 'Initial Processor', 96, '2026-08-03');

    const send = st().processingSends[0];
    expect(send.pcsReceived).toBe(96);
    expect(send.status).toBe('Partial');
    expect(send.lossQuantity || 0).toBe(0); // no automatic loss
    // Initial Processor is non-final → WIP→WIP: nothing reaches finished yet.
    expect(material().processedStockPcs).toBe(0);
    expect(material().atProcessorPcs).toBe(100); // the 100 sent still held in WIP
    expect(material().stockPcs).toBe(1900);
  });

  // ── TEST G — Over-receipt rejected ────────────────────────────────────────
  it('TEST G: over-receipt (101 on a 100 dispatch) is rejected by the store', () => {
    purchase();
    sendToStage('Initial Processor', 'Initial Processor', 100, 5, '2026-08-02');
    const sendId = st().processingSends[0].id;
    receiveFromStage(sendId, 'Initial Processor', 'Initial Processor', 101, '2026-08-03');

    expect(st().processingReceipts.length).toBe(0); // rejected
    expect(material().processedStockPcs).toBe(0);
  });

  // ── TEST H — Over-send rejected ───────────────────────────────────────────
  it('TEST H: over-send (51 > 50 available) is rejected by the store', () => {
    const s = st();
    s.addPurchase({ supplierId: s.suppliers[0].id, materialId: s.materials[0].id, date: '2026-08-01', weight: 25, weightUnit: 'KGs', ratePerUnit: 300, weightPerPiece: 0.5 } as any); // 50 pcs
    sendToStage('Initial Processor', 'Initial Processor', 51, 5, '2026-08-02');

    expect(st().processingSends.length).toBe(0); // rejected
    expect(material().stockPcs).toBe(50);
  });

  // ── TEST I — Duplicate receipt rejected ───────────────────────────────────
  it('TEST I: receiving the same pcs twice is rejected by the store', () => {
    purchase();
    sendToStage('Initial Processor', 'Initial Processor', 100, 5, '2026-08-02');
    const sendId = st().processingSends[0].id;
    receiveFromStage(sendId, 'Initial Processor', 'Initial Processor', 100, '2026-08-03');
    // Second receipt of the same 100 pcs → pending is now 0 → rejected
    receiveFromStage(sendId, 'Initial Processor', 'Initial Processor', 100, '2026-08-04');

    expect(st().processingReceipts.length).toBe(1);
    expect(material().atProcessorPcs).toBe(100); // non-final: still held in WIP
    expect(material().processedStockPcs).toBe(0);
  });

  // ── TEST J — Duplicate bill rejected ──────────────────────────────────────
  it('TEST J: billing the same receipt twice is rejected by the store', () => {
    purchase();
    sendToStage('Initial Processor', 'Initial Processor', 100, 5, '2026-08-02');
    const sendId = st().processingSends[0].id;
    receiveFromStage(sendId, 'Initial Processor', 'Initial Processor', 100, '2026-08-03');

    const receiptId = st().processingReceipts[0].id;
    st().addProcessorBill({ processorId: processorByName('Initial Processor'), date: '2026-08-04', receiptIds: [receiptId] } as any);
    // Second bill on the same receipt → rejected
    st().addProcessorBill({ processorId: processorByName('Initial Processor'), date: '2026-08-05', receiptIds: [receiptId] } as any);

    expect(st().processorBills.length).toBe(1);
    expect(st().processors.find(p => p.name === 'Initial Processor')!.balancePayable).toBe(500); // 100 pcs × 5
  });

  // ── TEST K — Restart persistence (migration replay is idempotent) ─────────
  it('TEST K: restart persists batches, stages, bills, vouchers — replay is idempotent', () => {
    purchase();
    const initSend = sendToStage('Initial Processor', 'Initial Processor', 2000, 5, '2026-08-02');
    receiveFromStage(initSend, 'Initial Processor', 'Initial Processor', 2000, '2026-08-03');

    const before = st();
    const snapshot = JSON.parse(JSON.stringify({
      batches: before.batches,
      processingStages: before.processingStages,
      processorBills: before.processorBills,
      vouchers: before.vouchers,
      journalEntries: before.journalEntries,
      processingSends: before.processingSends,
      processingReceipts: before.processingReceipts,
    }));

    // Simulate a restart: run the startup migration over the persisted state.
    // Initial Processor is a NON-final stage, so the batch stays in WIP after
    // the receipt (WIP→WIP) — only the final stage would produce finished.
    const migrated = migrateERPState(snapshot as any);
    expect(migrated.processingStages.length).toBe(5);
    expect(migrated.batches[0].atProcessorPcs).toBe(2000);
    expect(migrated.batches[0].processedPcs).toBe(0);
    expect(migrated.vouchers.length).toBe(before.vouchers.length);
    // Idempotent: running twice yields the same trail
    const migrated2 = migrateERPState(migrated as any);
    expect(migrated2.batches[0].atProcessorPcs).toBe(2000);
    expect(migrated2.batches[0].processedPcs).toBe(0);
    expect(migrated2.processingStages.length).toBe(5);
  });

  // ── TEST L — Accounting reconciliation ────────────────────────────────────
  it('TEST L: Trial Balance balances and processor ledger agrees with bills', () => {
    purchase();
    const initSend = sendToStage('Initial Processor', 'Initial Processor', 64, 5, '2026-08-02');
    receiveFromStage(initSend, 'Initial Processor', 'Initial Processor', 64, '2026-08-03');

    const machineSend = sendToStage('Machine', 'Machine Man', 64, 32, '2026-08-04');
    receiveFromStage(machineSend, 'Machine', 'Machine Man', 64, '2026-08-05');

    const machineReceipt = st().processingReceipts[0];
    st().addProcessorBill({
      processorId: processorByName('Machine Man'),
      date: '2026-08-06',
      receiptIds: [machineReceipt.id],
      stageId: stageByName('Machine').id,
    } as any);

    const after = st();
    const tb = AccountingEngine.getTrialBalance(after.accounts, after.accountSubtypes, after.journalEntries, after.vouchers);
    expect(tb.balanced).toBe(true);
    expect(after.processors.find(p => p.name === 'Machine Man')!.balancePayable).toBe(1024);
    const procExp = after.accounts.find(a => a.name === 'Processing Expense')!;
    const bal = AccountingEngine.getAccountBalances(after.accounts, after.journalEntries, after.vouchers).get(procExp.id) || 0;
    expect(bal).toBe(1024);
  });

  // ── TEST M — No double-counting through the entire chain ──────────────────
  it('TEST M: the same PKR 300,000 is never counted as separate inventory at every stage', () => {
    purchase();
    // Move 100 pcs through the ENTIRE chain; 1900 pcs stay raw on hand.
    const initSend = sendToStage('Initial Processor', 'Initial Processor', 100, 5, '2026-08-02');
    receiveFromStage(initSend, 'Initial Processor', 'Initial Processor', 100, '2026-08-03');

    const machineSend = sendToStage('Machine', 'Machine Man', 100, 32, '2026-08-04');
    receiveFromStage(machineSend, 'Machine', 'Machine Man', 100, '2026-08-05');

    const acidSend = sendToStage('Acid', 'Acid Man', 100, 40, '2026-08-06');
    receiveFromStage(acidSend, 'Acid', 'Acid Man', 100, '2026-08-07');

    const polishSend = sendToStage('Polish', 'Polisher', 100, 50, '2026-08-08');
    receiveFromStage(polishSend, 'Polish', 'Polisher', 100, '2026-08-09');

    const spotSend = sendToStage('Spot Machine', 'Spot Machine Man', 100, 60, '2026-08-10');
    receiveFromStage(spotSend, 'Spot Machine', 'Spot Machine Man', 100, '2026-08-11');

    // 100 pcs finished, 1900 raw on hand, 0 WIP — total value still 300,000
    expect(material().processedStockPcs).toBe(100);
    expect(material().stockPcs).toBe(1900);
    expect(material().atProcessorPcs).toBe(0);
    expect(inventoryValue()).toBe(300000); // NEVER 300,000 × 5
  });

  // ── TEST N — Intermediate dispatch WITHOUT a batch (Auto path) ────────────
  it('TEST N: no-batch intermediate dispatch FIFO-attributes stageAvailablePcs so pcs are never re-sendable', () => {
    purchase();
    const initSend = sendToStage('Initial Processor', 'Initial Processor', 2000, 5, '2026-08-02');
    receiveFromStage(initSend, 'Initial Processor', 'Initial Processor', 2000, '2026-08-03');
    const s = st();
    const batch = s.batches[0];
    expect(batch.stageAvailablePcs).toBe(2000); // available at Initial → Machine

    // Send 500 to Machine WITHOUT choosing a batch (Auto / Any Batch path).
    s.addProcessingSend({
      processorId: processorByName('Machine Man'),
      materialId: s.materials[0].id,
      date: '2026-08-04',
      pcsSent: 500,
      ratePerPiece: 32,
      stageId: stageByName('Machine').id,
    } as any);

    const after = st();
    // The dispatch was attributed to the batch (FIFO) — availability dropped.
    expect(after.batches[0].stageAvailablePcs).toBe(1500);
    // Multi-position truth: 1500 pcs still wait at Initial, so the batch is
    // NOT relabeled to Machine — a partial dispatch must not mislabel the pcs
    // still available at the source stage (they remain sendable to Machine).
    expect(after.batches[0].currentStageId).toBe(stageByName('Initial Processor').id);
    // The dispatch is linked to the batch so its receipt attributes correctly.
    expect(after.processingSends[0].batchId).toBe(batch.id);
    // Total inventory value is untouched (WIP → WIP).
    expect(inventoryValue()).toBe(300000);

    // The remaining 1500 pcs are still sendable to Machine (no lock-out)…
    st().addProcessingSend({
      processorId: processorByName('Machine Man'),
      materialId: st().materials[0].id,
      date: '2026-08-05',
      pcsSent: 1500,
      ratePerPiece: 32,
      stageId: stageByName('Machine').id,
    } as any);
    const drained = st();
    expect(drained.batches[0].stageAvailablePcs).toBe(0);
    // …and once fully drained the batch advances to the dispatched stage.
    expect(drained.batches[0].currentStageId).toBe(stageByName('Machine').id);
    expect(drained.processingSends).toHaveLength(3); // init + 500 + 1500
  });

  it('TEST N2: over-send beyond stage availability is rejected even without a batch', () => {
    purchase();
    const initSend = sendToStage('Initial Processor', 'Initial Processor', 2000, 5, '2026-08-02');
    receiveFromStage(initSend, 'Initial Processor', 'Initial Processor', 2000, '2026-08-03');
    const before = st().processingSends.length;
    st().addProcessingSend({
      processorId: processorByName('Machine Man'),
      materialId: st().materials[0].id,
      date: '2026-08-04',
      pcsSent: 2500, // more than the 2000 available
      ratePerPiece: 32,
      stageId: stageByName('Machine').id,
    } as any);
    expect(st().processingSends.length).toBe(before); // rejected
    expect(st().batches[0].stageAvailablePcs).toBe(2000);
  });

  // ── TEST O — Bill line-level rate override (finalize at bill time) ───────
  it('TEST O: a bill can override the per-receipt amount; total and voucher follow', () => {
    purchase();
    const initSend = sendToStage('Initial Processor', 'Initial Processor', 64, 5, '2026-08-02');
    receiveFromStage(initSend, 'Initial Processor', 'Initial Processor', 64, '2026-08-03');
    const machineSend = sendToStage('Machine', 'Machine Man', 64, 32, '2026-08-04');
    receiveFromStage(machineSend, 'Machine', 'Machine Man', 64, '2026-08-05');

    const receipt = st().processingReceipts[0];
    expect(receipt.billAmount).toBe(1024); // default at dispatch rate

    // Bill with an explicit line override — the negotiated rate was higher.
    st().addProcessorBill({
      processorId: processorByName('Machine Man'),
      date: '2026-08-06',
      receiptIds: [receipt.id],
      stageId: stageByName('Machine').id,
      rateMethod: 'per_kg',
      billingUnit: 'Per KG',
      lineAmounts: { [receipt.id]: 1500 },
    } as any);

    const after = st();
    expect(after.processorBills[0].totalAmount).toBe(1500);
    expect(after.processorBills[0].lineAmounts?.[receipt.id]).toBe(1500);
    // The voucher follows the overridden total (DR Processing Expense / CR AP).
    const voucher = after.vouchers.find(v => v.sourceId === after.processorBills[0].id && v.sourceModule === 'Processing');
    expect(voucher?.totalDebit).toBe(1500);
    expect(voucher?.totalCredit).toBe(1500);
    expect(after.processors.find(p => p.name === 'Machine Man')!.balancePayable).toBe(1500);
    expect(inventoryValue()).toBe(300000); // billing never changes inventory
  });

  // ── TEST P — Replay consistency: migration keeps currentStageId at the last
  //             dispatched stage (matching the live engine), never advancing it
  //             on a non-final receipt. ─────────────────────────────────────
  it('TEST P: restart replay keeps currentStageId at the dispatched stage, consistent with the live engine', () => {
    purchase();
    const initSend = sendToStage('Initial Processor', 'Initial Processor', 2000, 5, '2026-08-02');
    receiveFromStage(initSend, 'Initial Processor', 'Initial Processor', 2000, '2026-08-03');

    const liveBatch = st().batches[0];
    // Live engine: batch stays at Initial after the receipt; 2000 available for Machine.
    expect(liveBatch.currentStageId).toBe(stageByName('Initial Processor').id);
    expect(liveBatch.stageAvailablePcs).toBe(2000);

    const before = st();
    const snapshot = JSON.parse(JSON.stringify({
      batches: before.batches,
      processingStages: before.processingStages,
      processingSends: before.processingSends,
      processingReceipts: before.processingReceipts,
      sales: before.sales,
      products: before.products,
    }));
    const migrated = migrateERPState(snapshot as any);
    const replayedBatch = migrated.batches.find((b: any) => b.id === liveBatch.id);
    // Migration replay agrees with the live engine — no stage advancement.
    expect(replayedBatch.currentStageId).toBe(stageByName('Initial Processor').id);
    expect(replayedBatch.stageAvailablePcs).toBe(2000);
    expect(replayedBatch.atProcessorPcs).toBe(2000);
    expect(replayedBatch.processedPcs).toBe(0);
  });

  // ── TEST Q — Balance Sheet reflects physical stock location (report-layer) ─
  it('TEST Q: Balance Sheet Inventory splits into Raw / WIP / Finished from the batch trail, total stays equal to ledger', () => {
    purchase(); // 2000 pcs raw, PKR 300,000 all in Raw Material Inventory ledger
    // Move 800 pcs through the FULL chain to Finished Goods (final = Spot Machine).
    const s1 = sendToStage('Initial Processor', 'Initial Processor', 800, 5, '2026-08-02');
    receiveFromStage(s1, 'Initial Processor', 'Initial Processor', 800, '2026-08-03');
    const s2 = sendToStage('Machine', 'Machine Man', 800, 32, '2026-08-04');
    receiveFromStage(s2, 'Machine', 'Machine Man', 800, '2026-08-05');
    const s3 = sendToStage('Acid', 'Acid Man', 800, 40, '2026-08-06');
    receiveFromStage(s3, 'Acid', 'Acid Man', 800, '2026-08-07');
    const s4 = sendToStage('Polish', 'Polisher', 800, 50, '2026-08-08');
    receiveFromStage(s4, 'Polish', 'Polisher', 800, '2026-08-09');
    const s5 = sendToStage('Spot Machine', 'Spot Machine Man', 800, 60, '2026-08-10');
    receiveFromStage(s5, 'Spot Machine', 'Spot Machine Man', 800, '2026-08-11');

    const bs = FinancialReportService.getBalanceSheetData();
    const invGroup = bs.assetGroups.find(g => g.label === 'Inventory')!;
    const getRow = (kw: string) => invGroup.rows.find(r => r.name.toLowerCase().includes(kw))?.balance || 0;

    // 1200 pcs raw @ 150 = 180,000; 0 WIP; 800 finished @ 150 = 120,000.
    expect(getRow('raw material')).toBeCloseTo(180000, 0);
    expect(getRow('work in progress')).toBeCloseTo(0, 0);
    expect(getRow('finished goods')).toBeCloseTo(120000, 0);

    // Group total equals the ledger's posted inventory balance (300,000) — the
    // statement stays balanced and the ledger remains the accounting truth.
    expect(invGroup.total).toBeCloseTo(300000, 0);
    expect(bs.balanced).toBe(true);
    expect(inventoryValue()).toBe(300000); // physical stock never double-counted
  });

  // ── TEST R — The partial raw dispatch lock ("1100 sent 1000") ──────────────
  it('TEST R: leftover raw pcs stay sendable to stage 1 after a partial raw dispatch, and close/bill of the first job does not lock them', () => {
    purchase(); // 2000 pcs (standing in for 1100)
    // Dispatch 1000 of 2000 raw to the Initial Processor, then receive + bill
    // the whole job — the real-world flow that used to lock the leftover.
    const send1 = sendToStage('Initial Processor', 'Initial Processor', 1000, 5, '2026-08-02');
    receiveFromStage(send1, 'Initial Processor', 'Initial Processor', 1000, '2026-08-03');
    const receipt = st().processingReceipts[0];
    st().addProcessorBill({ processorId: receipt.processorId, date: '2026-08-12', receiptIds: [receipt.id] } as any);

    const b = st().batches[0];
    // Batch holds 1000 raw and 1000 WIP simultaneously (multi-position): the
    // dispatch FIFO consumed 1000 from remainingPcs (the raw bucket), the
    // receipt made those 1000 available for the NEXT stage.
    // simultaneously (multi-position). atProcessorPcs is the WIP marker; the
    // receipt made those 1000 available for the NEXT stage.
    expect(b.atProcessorPcs).toBe(1000);
    expect(b.stageAvailablePcs).toBe(1000);
    expect(b.remainingPcs).toBe(1000); // the raw bucket
    // …and the raw remainder is still derivable.
    expect(InventoryCalculationService.batchRawAvailable(b)).toBe(1000);

    // The leftover 1000 raw pcs CAN be sent to the Initial Processor again —
    // no lock from the first completed, billed job.
    st().addProcessingSend({
      processorId: processorByName('Initial Processor'),
      materialId: st().materials[0].id,
      batchId: b.id,
      date: '2026-08-13',
      pcsSent: 1000,
      ratePerPiece: 5,
      stageId: stageByName('Initial Processor').id,
    } as any);
    const after = st();
    expect(after.processingSends).toHaveLength(2);
    expect(InventoryCalculationService.batchRawAvailable(after.batches[0])).toBe(0);
    // With nothing raw left, the batch advances to the dispatched stage.
    expect(after.batches[0].currentStageId).toBe(stageByName('Initial Processor').id);
    expect(after.batches[0].atProcessorPcs).toBe(2000);
    // Raw stage value left the books, WIP carries it — total untouched.
    expect(inventoryValue()).toBe(300000);
  });

  // ── TEST S — Worker-stage guard ────────────────────────────────────────────
  it('TEST S: a stage-assigned worker cannot be dispatched to a different stage (Acid man rejects a Machine dispatch)', () => {
    purchase();
    // Assign the Acid Man to the Acid stage.
    const acidWorker = st().processors.find(p => p.name === 'Acid Man')!;
    st().updateProcessor(acidWorker.id, { stageId: stageByName('Acid').id } as any);

    // Move raw → Initial → received back, so pcs are available at the Initial
    // stage for an intermediate (Machine/Acid) dispatch.
    const init = sendToStage('Initial Processor', 'Initial Processor', 200, 5, '2026-08-02');
    receiveFromStage(init, 'Initial Processor', 'Initial Processor', 200, '2026-08-03');

    const before = st().processingSends.length;
    // Wrong stage: the Acid worker cannot take a MACHINE dispatch.
    st().addProcessingSend({
      processorId: acidWorker.id,
      materialId: st().materials[0].id,
      date: '2026-08-04',
      pcsSent: 200,
      ratePerPiece: 40,
      stageId: stageByName('Machine').id,
    } as any);
    expect(st().processingSends.length).toBe(before); // rejected by the store
    expect(st().batches[0].stageAvailablePcs).toBe(200); // untouched

    // General worker (no stage assignment) CAN take the Machine dispatch.
    st().addProcessingSend({
      processorId: processorByName('Machine Man'),
      materialId: st().materials[0].id,
      date: '2026-08-04',
      pcsSent: 100,
      ratePerPiece: 32,
      stageId: stageByName('Machine').id,
    } as any);
    expect(st().processingSends.length).toBe(before + 1);
    expect(st().batches[0].stageAvailablePcs).toBe(100);
  });
});