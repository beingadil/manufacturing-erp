import { describe, expect, it } from 'vitest';
import { createCRUDActions } from './crudActions';

/**
 * Regression tests for the Processing module's permanent-delete actions
 * (deleteProcessingSend / deleteProcessingReceipt / deleteProcessorBill).
 *
 * The two guarantees that matter:
 *  1. Deleting a dispatch/receipt fully reverses stock AND the batch trail —
 *     including legacy no-batch dispatches and FIFO-across-multiple-batches —
 *     so the same pcs are never counted twice and nothing is silently wiped.
 *  2. Deleting a dispatch CASCADES: its receipts are removed with it and any
 *     processor bills covering them are reversed (vouchers deleted) in one
 *     atomic step. Only a receipt whose goods were already sold blocks the
 *     cascade (the remaining production could not cover the sales).
 */

function makeBatch(overrides: any = {}) {
  return {
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
    status: 'Active',
    ...overrides
  };
}

function setup(initial: any) {
  let state: any = initial;
  const set = (partial: any) => {
    state = typeof partial === 'function' ? partial(state) : { ...state, ...partial };
    return state;
  };
  const get = () => state;
  return { actions: createCRUDActions(set, get), getState: () => state };
}

describe('deleteProcessingSend', () => {
  it('restores stock and the batch trail for a legacy no-batch dispatch (batchId undefined)', () => {
    const { actions, getState } = setup({
      materials: [{ id: 'm1', stockPcs: 0, atProcessorPcs: 4000, processedStockPcs: 0 }],
      batches: [makeBatch({ remainingPcs: 0, atProcessorPcs: 4000 })],
      processingSends: [
        {
          id: 'send1', dispatchNo: 'DSP-1', materialId: 'm1', processorId: 'pr1',
          batchId: undefined, pcsSent: 4000, pcsReceived: 0, ratePerPiece: 5,
          status: 'Pending', date: '2026-01-05'
        }
      ],
      processingReceipts: [],
      sales: [], products: [], inventoryMovements: [], purchases: [],
      suppliers: [], customers: [], processors: [], accounts: [], accountSubtypes: [],
      vouchers: [], journalEntries: []
    });

    actions.deleteProcessingSend('send1');
    const s = getState();

    // Stock fully returned to raw; WIP zeroed
    expect(s.materials[0].stockPcs).toBe(4000);
    expect(s.materials[0].atProcessorPcs).toBe(0);
    // Batch trail rebuilt — pcs back in raw, none at processor
    expect(s.batches[0].remainingPcs).toBe(4000);
    expect(s.batches[0].atProcessorPcs).toBe(0);
    expect(s.batches[0].processedPcs).toBe(0);
    expect(s.processingSends).toHaveLength(0);
  });

  it('restores adjusted sends to Pending and returns only the physical pcs to stock', () => {
    // Send A: 400 pcs pending. Send B merges A (400 adjusted) + 200 physical.
    // Material: 4000 - 400 - 200 = 3400 raw, 600 WIP. Send B pcsSent = 600.
    const { actions, getState } = setup({
      materials: [{ id: 'm1', stockPcs: 3400, atProcessorPcs: 600, processedStockPcs: 0 }],
      batches: [makeBatch({ remainingPcs: 3400, atProcessorPcs: 600 })],
      processingSends: [
        {
          id: 'sendA', dispatchNo: 'DSP-1', materialId: 'm1', processorId: 'pr1',
          batchId: 'b1', pcsSent: 400, pcsReceived: 0, ratePerPiece: 5,
          status: 'Adjusted', adjustedToDispatchId: 'sendB', date: '2026-01-05',
          remarks: 'Original (Adjusted 400 PCS into DSP-2)'
        },
        {
          id: 'sendB', dispatchNo: 'DSP-2', materialId: 'm1', processorId: 'pr1',
          batchId: 'b1', pcsSent: 600, pcsReceived: 0, ratePerPiece: 5,
          status: 'Pending', date: '2026-01-06'
        }
      ],
      processingReceipts: [],
      sales: [], products: [], inventoryMovements: [], purchases: [],
      suppliers: [], customers: [], processors: [], accounts: [], accountSubtypes: [],
      vouchers: [], journalEntries: []
    });

    actions.deleteProcessingSend('sendB');
    const s = getState();

    // Physical 200 returns to stock; the 400 adjusted pcs stay in WIP (they
    // were drawn by send A, now restored to Pending).
    expect(s.materials[0].stockPcs).toBe(3600);
    expect(s.materials[0].atProcessorPcs).toBe(400);
    // Batch trail: 400 raw→WIP from restored send A
    expect(s.batches[0].remainingPcs).toBe(3600);
    expect(s.batches[0].atProcessorPcs).toBe(400);
    // Orphan restored to Pending
    const restoredA = s.processingSends.find((x: any) => x.id === 'sendA');
    expect(restoredA.status).toBe('Pending');
    expect(restoredA.adjustedToDispatchId).toBeUndefined();
    expect(s.processingSends).toHaveLength(1);
  });

  it('cascades: deleting a send removes its receipts and reverses stock', () => {
    const { actions, getState } = setup({
      materials: [{ id: 'm1', stockPcs: 0, atProcessorPcs: 400, processedStockPcs: 3600 }],
      batches: [makeBatch({ remainingPcs: 0, atProcessorPcs: 0, processedPcs: 4000 })],
      processingSends: [
        {
          id: 'send1', dispatchNo: 'DSP-1', materialId: 'm1', processorId: 'pr1',
          batchId: 'b1', pcsSent: 4000, pcsReceived: 4000, ratePerPiece: 5,
          status: 'Closed', date: '2026-01-05'
        }
      ],
      processingReceipts: [
        { id: 'rec1', receiveNo: 'REC-1', sendId: 'send1', materialId: 'm1', pcsReceived: 4000, date: '2026-01-06', billedStatus: 'Unbilled' }
      ],
      sales: [], products: [], inventoryMovements: [], purchases: [],
      suppliers: [], customers: [], processors: [], accounts: [], accountSubtypes: [],
      vouchers: [], journalEntries: []
    });

    actions.deleteProcessingSend('send1');
    const s = getState();
    // Send AND its receipt removed; stock fully returned to raw
    expect(s.processingSends).toHaveLength(0);
    expect(s.processingReceipts).toHaveLength(0);
    expect(s.materials[0].stockPcs).toBe(4000);
    expect(s.materials[0].atProcessorPcs).toBe(0);
    expect(s.materials[0].processedStockPcs).toBe(0);
    expect(s.batches[0].remainingPcs).toBe(4000);
    expect(s.batches[0].processedPcs).toBe(0);
  });

  it('cascades: a billed send removes its bill and reverses the voucher', () => {
    const { actions, getState } = setup({
      materials: [{ id: 'm1', stockPcs: 0, atProcessorPcs: 0, processedStockPcs: 3600 }],
      batches: [makeBatch({ remainingPcs: 0, atProcessorPcs: 0, processedPcs: 4000 })],
      processingSends: [
        {
          id: 'send1', dispatchNo: 'DSP-1', materialId: 'm1', processorId: 'pr1',
          batchId: 'b1', pcsSent: 4000, pcsReceived: 4000, ratePerPiece: 5,
          status: 'Closed', date: '2026-01-05'
        }
      ],
      processingReceipts: [
        { id: 'rec1', receiveNo: 'REC-1', sendId: 'send1', materialId: 'm1', pcsReceived: 4000, date: '2026-01-06', billedStatus: 'Billed', billAmount: 20000 }
      ],
      processorBills: [
        { id: 'bill1', billNo: 'PB-1', processorId: 'pr1', receiptIds: ['rec1'], totalAmount: 20000, date: '2026-01-07' }
      ],
      vouchers: [
        { id: 'v1', voucherNo: 'JV-1', sourceId: 'bill1', sourceModule: 'Processing', type: 'Journal Voucher', date: '2026-01-07', totalDebit: 20000, totalCredit: 20000 }
      ],
      journalEntries: [
        { voucherId: 'v1', accountId: 'exp1', debit: 20000, credit: 0 },
        { voucherId: 'v1', accountId: 'ap1', debit: 0, credit: 20000 }
      ],
      sales: [], products: [], inventoryMovements: [], purchases: [],
      suppliers: [], customers: [], processors: [], accounts: [], accountSubtypes: []
    });

    actions.deleteProcessingSend('send1');
    const s = getState();
    expect(s.processingSends).toHaveLength(0);
    expect(s.processingReceipts).toHaveLength(0);
    expect(s.processorBills).toHaveLength(0);
    expect(s.vouchers).toHaveLength(0);
    expect(s.journalEntries).toHaveLength(0);
    expect(s.materials[0].stockPcs).toBe(4000);
  });

  it('refuses cascade when the receipt\'s finished goods were already sold', () => {
    const { actions, getState } = setup({
      materials: [{ id: 'm1', stockPcs: 0, atProcessorPcs: 0, processedStockPcs: 400 }],
      batches: [makeBatch({ remainingPcs: 0, atProcessorPcs: 0, processedPcs: 4000 })],
      processingSends: [
        {
          id: 'send1', dispatchNo: 'DSP-1', materialId: 'm1', processorId: 'pr1',
          batchId: 'b1', pcsSent: 4000, pcsReceived: 4000, ratePerPiece: 5,
          status: 'Closed', date: '2026-01-05'
        }
      ],
      processingReceipts: [
        { id: 'rec1', receiveNo: 'REC-1', sendId: 'send1', materialId: 'm1', pcsReceived: 4000, date: '2026-01-06', billedStatus: 'Unbilled' }
      ],
      products: [{ id: 'prod1', materialId: 'm1' }],
      sales: [{ id: 'sale1', productId: 'prod1', pcsSold: 400 }],
      inventoryMovements: [], purchases: [],
      suppliers: [], customers: [], processors: [], accounts: [], accountSubtypes: [],
      vouchers: [], journalEntries: []
    });

    actions.deleteProcessingSend('send1');
    // Guarded — the sold pcs cannot be covered by remaining production
    expect(getState().processingSends).toHaveLength(1);
    expect(getState().processingReceipts).toHaveLength(1);
  });
});

describe('deleteProcessingReceipt', () => {
  const sendWithTwoReceipts = () => ({
    materials: [{ id: 'm1', stockPcs: 0, atProcessorPcs: 0, processedStockPcs: 1000 }],
    batches: [makeBatch({ initialPcs: 1000, remainingPcs: 0, atProcessorPcs: 0, processedPcs: 1000 })],
    processingSends: [
      {
        id: 'send1', dispatchNo: 'DSP-1', materialId: 'm1', processorId: 'pr1',
        batchId: 'b1', pcsSent: 1000, pcsReceived: 1000, ratePerPiece: 5,
        status: 'Closed', date: '2026-01-05'
      }
    ],
    processingReceipts: [
      { id: 'recA', receiveNo: 'REC-1', sendId: 'send1', materialId: 'm1', pcsReceived: 400, date: '2026-01-06', billedStatus: 'Unbilled' },
      { id: 'recB', receiveNo: 'REC-2', sendId: 'send1', materialId: 'm1', pcsReceived: 600, date: '2026-01-07', billedStatus: 'Unbilled' }
    ],
    sales: [], products: [], inventoryMovements: [], purchases: [],
    suppliers: [], customers: [], processors: [], accounts: [], accountSubtypes: [],
    vouchers: [], journalEntries: []
  });

  it('removes only the deleted receipt share from the send and rebuilds the trail', () => {
    const { actions, getState } = setup(sendWithTwoReceipts());
    actions.deleteProcessingReceipt('recA');
    const s = getState();

    // Send keeps the OTHER receipt's 600 pcs — not zeroed
    expect(s.processingSends[0].pcsReceived).toBe(600);
    expect(s.processingSends[0].status).toBe('Partial');
    // Material: finished 1000 → 600, WIP back to 400
    expect(s.materials[0].processedStockPcs).toBe(600);
    expect(s.materials[0].atProcessorPcs).toBe(400);
    // Batch trail rebuilt from remaining receipts
    expect(s.batches[0].atProcessorPcs).toBe(400);
    expect(s.batches[0].processedPcs).toBe(600);
    expect(s.processingReceipts).toHaveLength(1);
  });

  it('refuses to delete a billed receipt', () => {
    const initial = sendWithTwoReceipts();
    initial.processingReceipts[0].billedStatus = 'Billed';
    const { actions, getState } = setup(initial);
    actions.deleteProcessingReceipt('recA');
    expect(getState().processingReceipts).toHaveLength(2);
    expect(getState().materials[0].processedStockPcs).toBe(1000);
  });

  it('refuses to delete a receipt whose finished goods were already sold', () => {
    const initial = sendWithTwoReceipts();
    initial.products = [{ id: 'prod1', materialId: 'm1' }];
    initial.sales = [{ id: 'sale1', productId: 'prod1', pcsSold: 700, date: '2026-01-10' }];
    const { actions, getState } = setup(initial);
    // Remaining production after deleting recA = 600 < sold 700 → blocked
    actions.deleteProcessingReceipt('recA');
    expect(getState().processingReceipts).toHaveLength(2);
  });
});

describe('deleteProcessorBill', () => {
  it('restores receipts to Unbilled, removes the voucher, and does NOT mutate the balance in-state (it is derived from the ledger via recomputePartyBalances)', () => {
    const voucherId = 'v1';
    const { actions, getState } = setup({
      materials: [{ id: 'm1', stockPcs: 0, atProcessorPcs: 0, processedStockPcs: 1000 }],
      batches: [],
      processingSends: [],
      processingReceipts: [
        { id: 'rec1', receiveNo: 'REC-1', sendId: 'send1', materialId: 'm1', pcsReceived: 1000, date: '2026-01-06', billedStatus: 'Billed' }
      ],
      processorBills: [
        { id: 'bill1', billNo: 'BILL-1', processorId: 'pr1', date: '2026-01-08', receiptIds: ['rec1'], totalAmount: 5000 }
      ],
      processors: [{ id: 'pr1', name: 'Proc A', balancePayable: 5000 }],
      vouchers: [
        {
          id: voucherId, voucherNo: 'JV-1', date: '2026-01-08', type: 'Journal Voucher',
          sourceModule: 'Processing', sourceId: 'bill1', narration: 'Processing Bill',
          totalDebit: 5000, totalCredit: 5000, status: 'Posted', createdAt: ''
        }
      ],
      journalEntries: [
        { id: 'je1', voucherId, accountId: 'a1', debit: 5000, credit: 0 },
        { id: 'je2', voucherId, accountId: 'a2', debit: 0, credit: 5000 }
      ],
      sales: [], products: [], inventoryMovements: [], purchases: [],
      suppliers: [], customers: [], accounts: [], accountSubtypes: []
    });

    actions.deleteProcessorBill('bill1');
    const s = getState();

    expect(s.processorBills).toHaveLength(0);
    expect(s.processingReceipts[0].billedStatus).toBe('Unbilled');
    // Balance is NOT touched in-state: AccountingEngine.recomputePartyBalances()
    // derives it from the linked account's COMPLETE ledger after every mutation
    // (spec §14), so the record here is left untouched by the delete.
    expect(s.processors[0].balancePayable).toBe(5000);
    expect(s.vouchers).toHaveLength(0);
    expect(s.journalEntries).toHaveLength(0);
  });
});
