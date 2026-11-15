import { describe, expect, it } from 'vitest';
import { batchAvailableAtSource, batchTotalPcs } from '../lib/business/InventoryCalculationService';
import { buildDefaultStages } from '../lib/processing/processingStageSeed';
import { MaterialService } from '../services/MaterialService';
import type { ProcessingStage } from '../types/erp';
import { migrateERPState } from './erpMigration';
import { useERPStore } from './useERPStore';

/**
 * 1.3.6-era bug: a custom_stages material whose tick order happened to put
 * MACHINE last (…Acid, Polish, Spot, Machine) had Machine receipts classed
 * as FINISHED even though the pcs had never been through Acid/Polish/Spot.
 * The user then re-expanded the material back to every processor — and the
 * misattributed stock stayed "finished" forever.
 *
 * The startup migration replays each material's trail under the current
 * config on every load, so previous-version data re-queues itself as
 * work-in-process (waiting at Machine, ready for Acid) with no user action.
 * These tests drive the exact timeline against the real engine.
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
  return { initialProcessorId, machineProcessorId };
}

/**
 * Drive the user's timeline up to the moment the misattributed stock exists:
 * material limited to Initial + Machine (both selected, Machine chain-final),
 * pcs worked through Machine — which legitimately lands in "finished" under
 * that limited config. Returns the material id.
 */
function limitedTimelineToFinished() {
  const s = useERPStore.getState();
  const { initialProcessorId, machineProcessorId } = seed();
  const materialId = s.addRawMaterial({
    name: 'Circle 16 1/4',
    categoryId: 'c1',
    processingPath: 'custom_stages',
    allowedStageIds: [STAGES[0].id, STAGES[1].id], // tick order: Initial, Machine
  });
  const st = useERPStore.getState();
  st.addPurchase({ supplierId: st.suppliers[0].id, materialId, date: '2026-09-01', weight: 100, weightUnit: 'KGs', ratePerUnit: 300, weightPerPiece: 0.5 } as any); // 200 pcs
  st.addProcessingSend({ processorId: initialProcessorId, materialId, stageId: STAGES[0].id, date: '2026-09-02', pcsSent: 150, ratePerPiece: 5 } as any);
  let cur = useERPStore.getState();
  cur.addProcessingReceipt({ sendId: cur.processingSends[0].id, processorId: initialProcessorId, materialId, date: '2026-09-03', pcsReceived: 150 } as any);
  cur = useERPStore.getState();
  cur.addProcessingSend({ processorId: machineProcessorId, materialId, stageId: STAGES[1].id, date: '2026-09-04', pcsSent: 150, ratePerPiece: 8 } as any);
  cur = useERPStore.getState();
  cur.addProcessingReceipt({ sendId: cur.processingSends[0].id, processorId: machineProcessorId, materialId, date: '2026-09-05', pcsReceived: 150 } as any);
  cur = useERPStore.getState();
  const mat = cur.materials.find(m => m.id === materialId)!;
  expect(mat.processedStockPcs).toBe(150); // finished under the limited config
  return materialId;
}

/** The state the user persisted before upgrading — plain data, as on disk.
 *  The real 2026-11-15 backup shows the affected circle batches carry NO path
 *  snapshot (`processingPath: undefined`) — they were bought under the default
 *  full chain when the bug wrote the misattributed finished pcs. Mirror that. */
function persistedSnapshot() {
  const snapshot = JSON.parse(JSON.stringify(useERPStore.getState()));
  for (const b of snapshot.batches) {
    delete b.processingPath;
    delete b.fixedStageId;
    delete b.allowedStageIds;
  }
  return snapshot;
}

describe('phantom finished stock — startup migration re-queue', () => {
  it('re-queues Machine-finished pcs as waiting after the material is re-expanded to the full chain', () => {
    const materialId = limitedTimelineToFinished();

    // User expands the material back to every processor (full chain).
    MaterialService.update(materialId, {
      processingPath: 'full_chain',
      fixedStageId: undefined,
      allowedStageIds: undefined,
    });

    const migrated = migrateERPState(persistedSnapshot());
    const batch = migrated.batches.find((b: any) => b.materialId === materialId)!;

    expect(batch.processedPcs).toBe(0);                                  // nothing is finished — Spot never saw these pcs
    expect(batchAvailableAtSource(batch, stageByName('Machine').id)).toBe(150); // they wait for Acid
    expect(batch.remainingPcs).toBe(50);                                 // raw untouched
    expect(batchTotalPcs(batch)).toBe(200);                              // LAW 3 — nothing invented, nothing lost
    const mat = migrated.materials.find((m: any) => m.id === materialId)!;
    expect(mat.processedStockPcs).toBe(0);
  });

  it('legacy sales of the phantom-finished pcs stay consumed — they never reappear as stock', () => {
    const materialId = limitedTimelineToFinished();

    // A legacy (pre-manufacturing-v4) sale of 100 of the 150 "finished" pcs.
    // The old live sale handler deducted them from processedPcs — mirror that
    // in the persisted fixture.
    const cur = useERPStore.getState();
    cur.addProduct({ name: 'Circle Product', materialId, sellingPrice: 25 });
    const productId = useERPStore.getState().products[0].id;
    const snapshot = persistedSnapshot();
    const batch = snapshot.batches.find((b: any) => b.materialId === materialId)!;
    batch.processedPcs = 50; // 150 finished − 100 sold, as the old handler left it
    snapshot.sales.unshift({
      id: 'legacy-sale-1',
      productId,
      customerId: snapshot.customers[0].id,
      date: '2026-09-06',
      pcsSold: 100,
      pricePerPiece: 25,
      // stockModelAtSale deliberately absent → legacy material-backed sale
    });

    // User expands the material back to the full chain, then the app starts → migration.
    MaterialService.update(materialId, {
      processingPath: 'full_chain',
      fixedStageId: undefined,
      allowedStageIds: undefined,
    });
    snapshot.materials = JSON.parse(JSON.stringify(useERPStore.getState().materials));

    const migrated = migrateERPState(snapshot);
    const after = migrated.batches.find((b: any) => b.materialId === materialId)!;

    expect(after.processedPcs).toBe(0);
    expect(batchAvailableAtSource(after, stageByName('Machine').id)).toBe(50); // 150 re-derived − 100 sold
    expect(after.remainingPcs).toBe(50);
    expect(batchTotalPcs(after)).toBe(100); // 200 bought − 100 sold — LAW 3 holds
  });
});
