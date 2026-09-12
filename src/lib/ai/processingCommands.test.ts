// src/lib/ai/processingCommands.test.ts
// Proves the processing AI commands drive the REAL engine: legal source-bucket
// consumption, partial receipts, conservation, loss shrinkage, duplicate-bill
// blocking — and that every rejection is loud, with nothing mutated.

import { beforeEach, describe, expect, it } from 'vitest';
import { buildDefaultStages } from '../processing/processingStageSeed';
import { batchAvailableTotal, batchRawAvailableOf } from '../business/InventoryCalculationService';
import { useERPStore } from '../../store/useERPStore';
import type { ProcessingStage } from '../../types/erp';
import { findCommand } from './commandRegistry';

const STAGES: ProcessingStage[] = buildDefaultStages();
const initialStage = STAGES[0];
const machineStage = STAGES[1];
const finalStage = STAGES[STAGES.length - 1];
expect(finalStage.isFinalStage).toBe(true);

function seed() {
  useERPStore.setState({
    processingStages: STAGES,
    materials: [
      { id: 'mat-1', name: 'Brass Sheet', categoryId: 'cat-1', status: 'Active', stockPcs: 1000, processedStockPcs: 0, atProcessorPcs: 0 },
    ],
    products: [],
    customers: [],
    suppliers: [],
    processors: [
      { id: 'proc-1', name: 'Ali', status: 'Active', balancePayable: 0, stageId: initialStage.id },
      { id: 'proc-2', name: 'Bilal', status: 'Active', balancePayable: 0, stageId: machineStage.id },
    ],
    purchases: [],
    sales: [],
    batches: [
      {
        id: 'batch-1', batchNo: 'B-0001', purchaseId: 'pur-1', supplierId: 'sup-1',
        materialId: 'mat-1', date: '2026-01-01', weight: 100, weightUnit: 'KGs' as const,
        ratePerUnit: 400, weightPerPiece: 0.1, initialPcs: 1000, remainingPcs: 1000,
        amount: 40000, status: 'Active' as const,
      },
    ],
    processingSends: [],
    processingReceipts: [],
    processorBills: [],
    inventoryMovements: [],
  });
}

function addAccounts() {
  useERPStore.setState({
    accountSubtypes: [
      { id: 'st-ap', name: 'Accounts Payable', type: 'Liabilities' as const, isSystem: true },
      { id: 'st-proc', name: 'Processing Expense', type: 'Expenses' as const, isSystem: true },
    ],
    accounts: [
      { id: 'acct-ap', code: '2000', name: 'Accounts Payable', subtypeId: 'st-ap', type: 'Liabilities' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-proc-exp', code: '5101', name: 'Processing Expense', subtypeId: 'st-proc', type: 'Expenses' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
    ],
  });
}

describe('send_to_processor', () => {
  beforeEach(seed);

  it('dispatches raw pcs to a stage-1 processor through the engine', () => {
    const cmd = findCommand('send_to_processor')!;
    const res = cmd.execute({ material_name: 'brass', processor_name: 'ali', pcs: 400 });
    expect(res.ok).toBe(true);

    const s = useERPStore.getState();
    expect(s.processingSends).toHaveLength(1);
    expect(s.processingSends[0].status).toBe('Pending');
    expect(s.materials[0].stockPcs).toBe(600); // 1000 - 400
    expect(s.materials[0].atProcessorPcs).toBe(400);
    expect(batchRawAvailableOf(s.batches[0])).toBe(600);
  });

  it('refuses over-send loudly and mutates nothing', () => {
    const cmd = findCommand('send_to_processor')!;
    const res = cmd.execute({ material_name: 'brass', processor_name: 'ali', pcs: 1001 });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Only 1,000 pcs');
    expect(useERPStore.getState().processingSends).toHaveLength(0);
    expect(batchRawAvailableOf(useERPStore.getState().batches[0])).toBe(1000);
  });

  it('refuses ambiguous processors', () => {
    useERPStore.setState({
      processors: [
        { id: 'p1', name: 'Ali Senior', status: 'Active', balancePayable: 0 },
        { id: 'p2', name: 'Ali Junior', status: 'Active', balancePayable: 0 },
      ],
    });
    const cmd = findCommand('send_to_processor')!;
    const res = cmd.execute({ material_name: 'brass', processor_name: 'ali', pcs: 10 });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Multiple processors');
  });
});

describe('receive_from_processor', () => {
  beforeEach(seed);

  it('receives partially, keeps the dispatch open, buckets stay disjoint', () => {
    // Arrange: send 400 to Ali (Initial).
    const send = findCommand('send_to_processor')!;
    expect(send.execute({ material_name: 'brass', processor_name: 'ali', pcs: 400 }).ok).toBe(true);

    const recv = findCommand('receive_from_processor')!;
    const res = recv.execute({ processor_name: 'ali', pcs: 250 });
    expect(res.ok).toBe(true);

    const s = useERPStore.getState();
    expect(s.processingSends[0].status).toBe('Partial');
    expect(s.processingSends[0].pcsReceived).toBe(250);
    // Waiting-from-Initial = 250; still at processor = 150.
    expect(batchAvailableTotal(s.batches[0])).toBe(250);
    expect(s.batches[0].atProcessorPcs).toBe(150);
  });

  it('supports "all" on the single open dispatch', () => {
    const send = findCommand('send_to_processor')!;
    expect(send.execute({ material_name: 'brass', processor_name: 'ali', pcs: 400 }).ok).toBe(true);

    const recv = findCommand('receive_from_processor')!;
    const res = recv.execute({ processor_name: 'ali', pcs: 999, all: true });
    expect(res.ok).toBe(true);
    expect(useERPStore.getState().processingSends[0].status).toBe('Closed');
  });

  it('refuses over-receipt loudly', () => {
    const send = findCommand('send_to_processor')!;
    expect(send.execute({ material_name: 'brass', processor_name: 'ali', pcs: 400 }).ok).toBe(true);

    const recv = findCommand('receive_from_processor')!;
    const res = recv.execute({ processor_name: 'ali', pcs: 401 });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Only 400 pcs are pending');
  });

  it('refuses when nothing is open', () => {
    const recv = findCommand('receive_from_processor')!;
    const res = recv.execute({ processor_name: 'ali', pcs: 10 });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('No open dispatch');
  });
});

describe('record_loss', () => {
  beforeEach(seed);

  it('shrinks pending pcs and conserves the trail (explicit loss only)', () => {
    const send = findCommand('send_to_processor')!;
    expect(send.execute({ material_name: 'brass', processor_name: 'ali', pcs: 400 }).ok).toBe(true);

    const loss = findCommand('record_loss')!;
    const res = loss.execute({ processor_name: 'ali', pcs: 10, remarks: 'scrapped' });
    expect(res.ok).toBe(true);

    const s = useERPStore.getState();
    expect(s.processingSends[0].lossQuantity).toBe(10);
    // Total trail shrank by exactly the loss: 1000 -> 990.
    const b = s.batches[0];
    const total = b.remainingPcs + (b.atProcessorPcs || 0) + batchAvailableTotal(b) + (b.processedPcs || 0);
    expect(total).toBe(990);
    const lossMovement = s.inventoryMovements.find(m => m.module === 'Loss');
    expect(lossMovement?.quantity).toBe(10);
  });

  it('refuses loss beyond pending', () => {
    const send = findCommand('send_to_processor')!;
    expect(send.execute({ material_name: 'brass', processor_name: 'ali', pcs: 100 }).ok).toBe(true);

    const loss = findCommand('record_loss')!;
    const res = loss.execute({ processor_name: 'ali', pcs: 101 });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Only 100 pcs are pending');
  });
});

describe('generate_bill', () => {
  beforeEach(() => {
    seed();
    addAccounts();
  });

  it('bills all unbilled receipts of a processor and posts the voucher', () => {
    const send = findCommand('send_to_processor')!;
    expect(send.execute({ material_name: 'brass', processor_name: 'ali', pcs: 400 }).ok).toBe(true);
    const recv = findCommand('receive_from_processor')!;
    expect(recv.execute({ processor_name: 'ali', pcs: 400, all: true }).ok).toBe(true);

    const bill = findCommand('generate_bill')!;
    const res = bill.execute({ processor_name: 'ali' });
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Bill generated');

    const s = useERPStore.getState();
    expect(s.processorBills).toHaveLength(1);
    expect(s.processingReceipts.every(r => r.billedStatus === 'Billed')).toBe(true);
    // Auto-voucher: DR Processing Expense / CR AP.
    expect(s.vouchers.length).toBeGreaterThan(0);
    const billVoucher = s.vouchers.find(v => v.sourceModule === 'Processing');
    expect(billVoucher).toBeTruthy();
  });

  it('refuses double billing (the engine guard surfaces through the AI layer)', () => {
    const send = findCommand('send_to_processor')!;
    expect(send.execute({ material_name: 'brass', processor_name: 'ali', pcs: 400 }).ok).toBe(true);
    const recv = findCommand('receive_from_processor')!;
    expect(recv.execute({ processor_name: 'ali', pcs: 400, all: true }).ok).toBe(true);
    const bill = findCommand('generate_bill')!;
    expect(bill.execute({ processor_name: 'ali' }).ok).toBe(true);

    const res = bill.execute({ processor_name: 'ali' });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('No unbilled receipts');
  });
});
