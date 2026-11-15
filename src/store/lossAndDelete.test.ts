import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildDefaultStages } from '../lib/processing/processingStageSeed';
import { useERPStore } from './useERPStore';

// vi.mock must stay hoisted — this mirrors manufacturingRedesign.test.ts.
vi.mock('./useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ batchNoMode: 'supplier' }),
  },
}));

const STAGES = buildDefaultStages();
const FIRST_STAGE = STAGES[0];

function seed() {
  useERPStore.setState({
    stateSchemaVersion: 4,
    accountSubtypes: [
      { id: 'st-inv', name: 'Inventory', type: 'Assets' as const, isSystem: true },
      { id: 'st-ap', name: 'Accounts Payable', type: 'Liabilities' as const, isSystem: true },
      { id: 'st-ar', name: 'Accounts Receivable', type: 'Assets' as const, isSystem: true },
      { id: 'st-sales', name: 'Sales', type: 'Revenue' as const, isSystem: true },
      { id: 'st-proc', name: 'Processing Expense', type: 'Expenses' as const, isSystem: true },
      { id: 'st-cogs', name: 'Purchases', type: 'Expenses' as const, isSystem: true },
    ],
    accounts: [
      { id: 'acct-rm', code: '1101', name: 'Raw Material Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-wip', code: '1102', name: 'Work in Progress Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-fg', code: '1103', name: 'Finished Goods Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-ap', code: '2000', name: 'Accounts Payable', subtypeId: 'st-ap', type: 'Liabilities' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-accrued', code: '2010', name: 'Accrued Expenses', subtypeId: 'st-ap', type: 'Liabilities' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-ar', code: '1200', name: 'Accounts Receivable', subtypeId: 'st-ar', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-sales', code: '4001', name: 'Sales Revenue', subtypeId: 'st-sales', type: 'Revenue' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-cogs', code: '5201', name: 'Cost of Goods Sold', subtypeId: 'st-cogs', type: 'Cost of Goods Sold' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-proc-loss', code: '5109', name: 'Processing Loss', subtypeId: 'st-proc', type: 'Expenses' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
    ],
    categories: [],
    materials: [
      { id: 'material-1', name: 'Circle 12 1/2', code: 'C12', stockPcs: 4000, atProcessorPcs: 0, processedStockPcs: 0, status: 'Active', processingPath: 'full_chain' },
    ],
    products: [],
    suppliers: [{ id: 'supplier-1', name: 'Supplier A', balancePayable: 0, status: 'Active' }],
    customers: [{ id: 'customer-1', name: 'Customer A', balanceReceivable: 0, status: 'Active' }],
    processors: [{ id: 'processor-1', name: 'Haji Arshad', balancePayable: 0, stageId: FIRST_STAGE.id, status: 'Active' }],
    purchases: [],
    sales: [],
    batches: [
      {
        id: 'batch-1', batchNo: 'TOUQEER-PO-2026-0042', purchaseId: 'purchase-1', supplierId: 'supplier-1',
        materialId: 'material-1', date: '2026-02-01', weight: 4000, weightUnit: 'KGs' as const,
        ratePerUnit: 100, weightPerPiece: 1, initialPcs: 4000, remainingPcs: 4000, amount: 400000,
        status: 'Active' as const, processingPath: 'full_chain',
      },
    ],
    inventoryMovements: [],
    processingSends: [],
    processingReceipts: [
      {
        id: 'rec-billed',
        receiveNo: 'REC-2026-9999',
        sendId: 'send-old',
        materialId: 'material-1',
        pcsReceived: 3000,
        date: '2026-02-02',
        billAmount: 15000,
        billedStatus: 'Billed' as const,
      },
    ],
    processorBills: [],
    processingStages: STAGES,
    processingLosses: [],
    manufacturingOrders: [],
    finishedGoodsLots: [],
    vouchers: [],
    journalEntries: [],
    currentUser: { name: 'Tester', email: 'tester@example.com', role: 'Admin' },
    processingCostReclassification: undefined,
  } as any);
}

const st = () => useERPStore.getState();

beforeEach(() => seed());

describe('wastage leaves the pipeline everywhere', () => {
  it('recording a loss then deleting the dispatch never resurrects the wasted pcs', () => {
    // Send 1000 to the initial processor — it must move OUT of raw stock.
    st().addProcessingSend({
      processorId: 'processor-1',
      materialId: 'material-1',
      batchId: 'batch-1',
      date: '2026-02-06',
      pcsSent: 1000,
      ratePerPiece: 5,
      stageId: FIRST_STAGE.id,
    } as any);
    expect(st().batches[0].remainingPcs).toBe(3000);
    expect(st().batches[0].atProcessorPcs).toBe(1000);
    expect(st().materials[0].atProcessorPcs).toBe(1000);

    // 150 of the at-processor pcs are marked as wastage.
    const sendId = st().processingSends[0].id;
    st().recordProcessingLoss(sendId, 150, '2026-02-07', 'Crushed in handling');
    expect(st().batches[0].atProcessorPcs).toBe(850);
    expect(st().materials[0].atProcessorPcs).toBe(850);

    // Deleting the dispatch: pcs still out at the processor (850 outstanding) are
    // written off to Processing Loss with a mirror journal entry. Discovered:
    //   4000 - 1000 dispatched - 150 wasted (by dispatch) - 850 unaccounted (mirror) = 3000 pcs.
    st().deleteProcessingSend(sendId);
    const batch = st().batches[0];
    expect(batch.remainingPcs).toBe(3000);
    expect(batch.atProcessorPcs).toBe(0);
    expect(batch.processedPcs).toBe(0);
    expect(st().materials[0].stockPcs).toBe(3000);
    expect(st().materials[0].atProcessorPcs).toBe(0);
    // Two loss records remain: the original 150-pcs wastage entry + the mirror (850 pcs).
    expect(st().processingLosses).toHaveLength(2);
    expect(st().processingLosses.some(l => l.remarks?.startsWith('Dispatch void'))).toBe(true);
    expect(st().processingLosses.some(l => l.remarks?.startsWith('Crushed'))).toBe(true);
  });

  it('pending everywhere subtracts the wastage pcs', async () => {
    const { ProcessingReportService } = await import('../lib/reporting/ProcessingReportService');
    st().addProcessingSend({
      processorId: 'processor-1',
      materialId: 'material-1',
      batchId: 'batch-1',
      date: '2026-02-06',
      pcsSent: 800,
      ratePerPiece: 5,
      stageId: FIRST_STAGE.id,
    } as any);
    const sendId = st().processingSends[0].id;
    st().recordProcessingLoss(sendId, 200, '2026-02-07', 'Burned in acid');

    const data = ProcessingReportService.getPendingPCSReportData('');
    const row = data.find((r: any) => r.dispatchNo);
    expect(row).toBeTruthy();
    // 800 sent - 200 wasted = 600 still pending; not 800.
    expect(row!.pendingPcs).toBe(600);
  }, 15000);
});

describe('undoProcessingLoss — reversing a wastage entry restores pcs exactly', () => {
  it('undoes the loss, restores pcs to at-processor, and removes the voucher', () => {
    st().addProcessingSend({
      processorId: 'processor-1',
      materialId: 'material-1',
      batchId: 'batch-1',
      date: '2026-02-06',
      pcsSent: 800,
      ratePerPiece: 5,
      stageId: FIRST_STAGE.id,
    } as any);
    expect(st().batches[0].atProcessorPcs).toBe(800);

    const sendId = st().processingSends[0].id;
    st().recordProcessingLoss(sendId, 200, '2026-02-07', 'Burned in acid');
    const lossId = st().processingLosses[0].id;
    expect(st().batches[0].atProcessorPcs).toBe(600);
    expect(st().processingLosses).toHaveLength(1);
    expect(st().vouchers.some(v => v.narration?.includes('Processing loss'))).toBe(true);

    st().undoProcessingLoss(lossId);
    expect(st().batches[0].atProcessorPcs).toBe(800);
    expect(st().materials[0].atProcessorPcs).toBe(800);
    expect(st().processingLosses).toHaveLength(0);
    // Send's lossQuantity decremented back
    expect(st().processingSends[0].lossQuantity ?? 0).toBe(0);
    // The loss voucher is removed entirely
    expect(st().vouchers.find(v => v.narration?.includes('Processing loss'))).toBeUndefined();
  });
});

describe('delete and edit guards fail loudly with the real reason', () => {
  it('deleting a billed receipt throws instead of silently doing nothing', () => {
    expect(() => st().deleteProcessingReceipt('rec-billed')).toThrow(/already billed/);
  });

  it('a dispatch whose batch was consumed by a completed manufacturing order is refused naming the order', () => {
    // The consumptions array on a stored completed MO is what blocks — this is
    // exactly what the completion writes. Emulate it directly.
    useERPStore.setState({
      manufacturingOrders: [
        {
          id: 'mo-999',
          orderNo: 'MO-9999',
          productId: 'product-seed-missing',
          date: '2026-02-06',
          plannedQty: 10,
          finishedQty: 10,
          status: 'Completed' as const,
          components: [{ materialId: 'material-1', quantityPerUnit: 1, plannedQuantity: 100 }],
          consumptions: [{ batchId: 'batch-1', materialId: 'material-1', pcs: 100, costPerPiece: 100, cost: 10000 }],
          productionCost: 0,
          createdAt: '2026-02-06T00:00:00Z',
        },
      ],
    } as any);

    st().addProcessingSend({
      processorId: 'processor-1',
      materialId: 'material-1',
      batchId: 'batch-1',
      date: '2026-02-06',
      pcsSent: 200,
      ratePerPiece: 5,
      stageId: FIRST_STAGE.id,
    } as any);
    const sendId = st().processingSends[0].id;
    expect(() => st().deleteProcessingSend(sendId)).toThrow(/completed manufacturing order/);
  });
});
