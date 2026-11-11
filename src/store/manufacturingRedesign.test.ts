import { create } from 'zustand';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  previewProcessingCostReclassification,
} from '../lib/accounting/processingCostReclassification';
import { ManufacturingReportService } from '../lib/reporting/ManufacturingReportService';
import { restoreComponentsFromManufacturing } from '../lib/business/ManufacturingService';
import { buildDefaultStages } from '../lib/processing/processingStageSeed';
import type { ProcessingReceipt } from '../types/erp';
import { migrateERPState } from './erpMigration';
import { useAccessStore } from './useAccessStore';
import { useERPStore } from './useERPStore';
import { databaseMiddlewareImpl } from './databaseMiddleware';

// DocumentNumberingService.buildBatchNo consults the Settings store. Mock it so
// the migration test can never trip over the SQLite-backed singleton.
vi.mock('./useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ batchNoMode: 'supplier' }),
  },
}));

/**
 * Manufacturing v4 contract tests. The legacy suite stays green by opting
 * through `stateSchemaVersion`, so these exercise the NEW paths explicitly:
 * BOM snapshot → component draw → FG lot → FIFO sale → reclassification.
 */

const STAGES = buildDefaultStages();

const baseAccounts = () => [
  { id: 'acct-rm', code: '1101', name: 'Raw Material Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-wip', code: '1102', name: 'Work in Progress Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-fg', code: '1103', name: 'Finished Goods Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-ap', code: '2000', name: 'Accounts Payable', subtypeId: 'st-ap', type: 'Liabilities' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-accrued', code: '2010', name: 'Accrued Expenses', subtypeId: 'st-ap', type: 'Liabilities' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-ar', code: '1200', name: 'Accounts Receivable', subtypeId: 'st-ar', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-sales', code: '4001', name: 'Sales Revenue', subtypeId: 'st-sales', type: 'Revenue' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-proc-exp', code: '5101', name: 'Processing Expense', subtypeId: 'st-proc', type: 'Expenses' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-proc-loss', code: '5109', name: 'Processing Loss', subtypeId: 'st-proc', type: 'Expenses' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-cogs', code: '5201', name: 'Cost of Goods Sold', subtypeId: 'st-cogs', type: 'Cost of Goods Sold' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
];

const baseSubtypes = () => [
  { id: 'st-inv', name: 'Inventory', type: 'Assets' as const, isSystem: true },
  { id: 'st-ap', name: 'Accounts Payable', type: 'Liabilities' as const, isSystem: true },
  { id: 'st-ar', name: 'Accounts Receivable', type: 'Assets' as const, isSystem: true },
  { id: 'st-sales', name: 'Sales', type: 'Revenue' as const, isSystem: true },
  { id: 'st-proc', name: 'Processing Expense', type: 'Expenses' as const, isSystem: true },
  { id: 'st-cogs', name: 'Purchases', type: 'Expenses' as const, isSystem: true },
];

/** Batch of 100 pcs @ PKR 100 = PKR 10,000 (raw, on hand). */
const rawBatch = () => ({
  id: 'batch-1',
  batchNo: 'AHMED-PO-2026-0001',
  purchaseId: 'purchase-1',
  supplierId: 'supplier-1',
  materialId: 'material-1',
  date: '2026-01-01',
  weight: 100,
  weightUnit: 'KGs' as const,
  ratePerUnit: 100,
  weightPerPiece: 1,
  initialPcs: 100,
  remainingPcs: 100,
  amount: 10000,
  status: 'Active' as const,
});

const rawBatch2 = () => ({
  ...rawBatch(),
  id: 'batch-2',
  batchNo: 'AHMED-PO-2026-0002',
  materialId: 'material-2',
  date: '2026-01-05',
  initialPcs: 50,
  remainingPcs: 50,
  amount: 5000, // 100/pc, same cost
});

function seedV4() {
  useERPStore.setState({
    stateSchemaVersion: 4,
    accountSubtypes: baseSubtypes(),
    accounts: baseAccounts(),
    categories: [],
    materials: [
      { id: 'material-1', name: 'Steel Coil', code: 'M-1', stockPcs: 100, atProcessorPcs: 0, processedStockPcs: 0, status: 'Active', processingPath: 'ready_made' },
      { id: 'material-2', name: 'Brass Sheet', code: 'M-2', stockPcs: 50, atProcessorPcs: 0, processedStockPcs: 0, status: 'Active', processingPath: 'ready_made' },
    ],
    products: [
      {
        id: 'product-1',
        name: 'Steel Jug',
        materialId: 'material-1',
        price: 500,
        sellingPrice: 500,
        status: 'Active',
        stockModel: 'manufactured',
        bomVersion: 1,
        components: [{ materialId: 'material-1', quantity: 2 }],
      },
      {
        id: 'product-2',
        name: 'Brass Plate',
        materialId: 'material-2',
        price: 700,
        sellingPrice: 700,
        status: 'Active',
        stockModel: 'manufactured',
        bomVersion: 1,
        components: [{ materialId: 'material-2', quantity: 1 }],
      },
    ],
    suppliers: [{ id: 'supplier-1', name: 'Supplier A', balancePayable: 0, status: 'Active' }],
    customers: [{ id: 'customer-1', name: 'Customer A', balanceReceivable: 0, status: 'Active' }],
    processors: [{ id: 'processor-1', name: 'Imran Processor', balancePayable: 0, stageId: STAGES[0].id, status: 'Active' }],
    purchases: [],
    sales: [],
    batches: [rawBatch(), rawBatch2()],
    inventoryMovements: [],
    processingSends: [],
    processingReceipts: [],
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

function st() {
  return useERPStore.getState();
}

function voucherBalance(vouchers: { id: string; voucherNo: string }[], entries: { voucherId: string; debit: number; credit: number }[]) {
  const out: Array<{ voucherNo: string; debit: number; credit: number }> = [];
  for (const voucher of vouchers) {
    const lines = entries.filter(e => e.voucherId === voucher.id);
    const debit = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const credit = lines.reduce((sum, l) => sum + (l.credit || 0), 0);
    out.push({ voucherNo: voucher.voucherNo, debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 });
  }
  return out;
}

beforeEach(() => {
  seedV4();
});

describe('Manufacturing v4 — manufacturing orders', () => {
  it('snapshots the BOM and consumes NOTHING until completion', () => {
    const orderId = st().addManufacturingOrder({
      productId: 'product-1',
      date: '2026-02-01',
      plannedQty: 10,
      productionCost: 500,
    } as any);

    const order = st().manufacturingOrders.find(o => o.id === orderId)!;
    expect(order.status).toBe('Planned');
    expect(order.components).toEqual([
      { materialId: 'material-1', quantityPerUnit: 2, plannedQuantity: 20 },
    ]);
    expect(order.productionCost).toBe(500);
    // BOM snapshot is frozen — planned quantity drives the draw, not live stock
    expect(st().batches.find(b => b.id === 'batch-1')!.remainingPcs).toBe(100);
  });

  it('rejects a planned quantity above zero as a whole number', () => {
    expect(() =>
      st().addManufacturingOrder({ productId: 'product-1', date: '2026-02-01', plannedQty: 0 } as any),
    ).toThrow(/planned quantity/i);
  });

  it('starts an order (status In Progress) and locks it against edits', () => {
    const orderId = st().addManufacturingOrder({ productId: 'product-1', date: '2026-02-01', plannedQty: 10 } as any);
    st().startManufacturingOrder(orderId);
    expect(st().manufacturingOrders.find(o => o.id === orderId)!.status).toBe('In Progress');
    expect(() => st().updateManufacturingOrder(orderId, { plannedQty: 5 } as any)).toThrow(/planned manufacturing order/i);
    // Still no stock movement at start — components are reserved, not drawn
    expect(st().batches.find(b => b.id === 'batch-1')!.remainingPcs).toBe(100);
  });

  it('completes an order: consumes components, posts FG/COGS accrual, creates a lot', () => {
    const orderId = st().addManufacturingOrder({
      productId: 'product-1', date: '2026-02-01', plannedQty: 10, productionCost: 500,
    } as any);
    st().completeManufacturingOrder(orderId, { date: '2026-02-10' });

    const order = st().manufacturingOrders.find(o => o.id === orderId)!;
    expect(order.status).toBe('Completed');
    expect(order.finishedQty).toBe(10);
    expect(order.materialCost).toBe(2000); // 20 pcs × PKR 100
    expect(order.productionCost).toBe(500);
    expect(order.totalCost).toBe(2500);
    expect(order.costPerPiece).toBe(250);

    // Components consumed FIFO from raw stock
    expect(st().batches.find(b => b.id === 'batch-1')!.remainingPcs).toBe(80);
    // Everything in the ledger balances
    for (const row of voucherBalance(st().vouchers, st().journalEntries)) {
      expect(row.debit).toBe(row.credit);
    }
    const lot = st().finishedGoodsLots.find(l => l.manufacturingOrderId === orderId)!;
    expect(lot.pcsProduced).toBe(10);
    expect(lot.pcsRemaining).toBe(10);
    expect(lot.costPerPiece).toBe(250);
    // FG cost entered from Raw Material Inventory; conversion cost accrued
    const completionVoucher = st().vouchers.find(v => v.sourceId === orderId)!;
    const entries = st().journalEntries.filter(e => e.voucherId === completionVoucher.id);
    expect(entries.reduce((s, e) => s + e.debit, 0)).toBe(2500);
  });

  it('absorbs a shortfall into the surviving unit cost', () => {
    const orderId = st().addManufacturingOrder({
      productId: 'product-1', date: '2026-02-01', plannedQty: 10, productionCost: 200,
    } as any);
    st().completeManufacturingOrder(orderId, { finishedQty: 8, date: '2026-02-10' });

    const order = st().manufacturingOrders.find(o => o.id === orderId)!;
    expect(order.finishedQty).toBe(8);
    expect(order.materialCost).toBe(2000); // full planned draw — same cost, fewer good units
    expect(order.totalCost).toBe(2200);
    expect(order.costPerPiece).toBe(275);
    const lot = st().finishedGoodsLots.find(l => l.manufacturingOrderId === orderId)!;
    expect(lot.costPerPiece).toBe(275);
    expect(lot.pcsProduced).toBe(8);
  });

  it('draw → restore round-trips every batch exactly (bucket-aware, byte-for-byte)', () => {
    const snapshot: Array<Record<string, unknown>> = JSON.parse(JSON.stringify(st().batches));

    const orderId = st().addManufacturingOrder({
      productId: 'product-1', date: '2026-02-01', plannedQty: 10, productionCost: 500,
    } as any);
    st().completeManufacturingOrder(orderId, { date: '2026-02-10' });

    // No drift from the untouched second batch.
    expect(st().batches.find(b => b.id === 'batch-2')).toEqual(expect.objectContaining(snapshot[1]));

    const order = st().manufacturingOrders.find(o => o.id === orderId)!;
    const consumptions = order.consumptions!;
    const restored = restoreComponentsFromManufacturing(st().batches, consumptions);

    expect(restored).toEqual(JSON.parse(JSON.stringify(snapshot)));
  });

  it('refuses to finish more than planned and leaves stock untouched', () => {
    const orderId = st().addManufacturingOrder({
      productId: 'product-1', date: '2026-02-01', plannedQty: 10,
    } as any);
    expect(() => st().completeManufacturingOrder(orderId, { finishedQty: 11 } as any)).toThrow(/cannot exceed/i);
    expect(st().batches.find(b => b.id === 'batch-1')!.remainingPcs).toBe(100);
    expect(st().manufacturingOrders.find(o => o.id === orderId)!.status).toBe('Planned');
  });

  it('refuses to complete when components are short, consuming nothing', () => {
    useERPStore.setState({
      batches: [{ ...rawBatch(), remainingPcs: 5, initialPcs: 5, amount: 500 }],
    } as any);
    const orderId = st().addManufacturingOrder({
      productId: 'product-1', date: '2026-02-01', plannedQty: 10,
    } as any);
    expect(() => st().completeManufacturingOrder(orderId, { date: '2026-02-10' })).toThrow(/not enough/i);
    expect(st().batches.find(b => b.id === 'batch-1')!.remainingPcs).toBe(5);
    expect(st().manufacturingOrders.find(o => o.id === orderId)!.status).toBe('Planned');
  });

  it('completes exactly once — a second completion is rejected, costs immutable', () => {
    const orderId = st().addManufacturingOrder({
      productId: 'product-1', date: '2026-02-01', plannedQty: 10,
    } as any);
    st().completeManufacturingOrder(orderId, { date: '2026-02-10' });
    expect(() => st().completeManufacturingOrder(orderId, { date: '2026-02-11' })).toThrow(/already completed/i);
    expect(() => st().deleteManufacturingOrder(orderId)).toThrow(/completed manufacturing order/i);
    expect(() => st().cancelManufacturingOrder(orderId)).toThrow(/completed manufacturing order/i);
  });

  it('deletes a planned order and cancels an in-progress one', () => {
    const plannedId = st().addManufacturingOrder({ productId: 'product-1', date: '2026-02-01', plannedQty: 5 } as any);
    st().deleteManufacturingOrder(plannedId);
    expect(st().manufacturingOrders.find(o => o.id === plannedId)).toBeUndefined();

    const startedId = st().addManufacturingOrder({ productId: 'product-1', date: '2026-02-01', plannedQty: 5 } as any);
    st().startManufacturingOrder(startedId);
    st().cancelManufacturingOrder(startedId);
    expect(st().manufacturingOrders.find(o => o.id === startedId)!.status).toBe('Cancelled');
    expect(() => st().completeManufacturingOrder(startedId, {} as any)).toThrow(/cancelled/i);
  });
});

describe('Manufacturing v4 — FG lots and sales', () => {
  function makeReadyGoods() {
    const orderId = st().addManufacturingOrder({
      productId: 'product-1', date: '2026-02-01', plannedQty: 10, productionCost: 500,
    } as any);
    st().completeManufacturingOrder(orderId, { date: '2026-02-10' });
    return orderId;
  }

  it('sells FG by FIFO lots, posting COGS against Finished Goods (never raw material)', () => {
    makeReadyGoods();
    st().addSale({
      customerId: 'customer-1',
      productId: 'product-1',
      date: '2026-03-01',
      pcsSold: 4,
      pricePerPiece: 500,
    } as any);

    const sale = st().sales.find(s => s.productId === 'product-1')!;
    const saleId = sale.id;
    expect(sale.stockModelAtSale).toBe('manufactured');
    expect(sale.totalAmount).toBe(2000);
    expect(sale.cogsAmount).toBe(1000); // 4 × 250
    expect(sale.lotAllocations).toHaveLength(1);
    expect(st().finishedGoodsLots[0].pcsRemaining).toBe(6);
    // Raw material batch untouched by the FG sale
    expect(st().batches.find(b => b.id === 'batch-1')!.remainingPcs).toBe(80);

    for (const row of voucherBalance(st().vouchers, st().journalEntries)) {
      expect(row.debit).toBe(row.credit);
    }
    const saleVoucher = st().vouchers.find(v => v.sourceModule === 'Sales' && v.sourceId === saleId)!;
    const entries = st().journalEntries.filter(e => e.voucherId === saleVoucher.id);
    expect(entries.some(e => e.accountId === 'acct-cogs' && e.debit === 1000)).toBe(true);
    expect(entries.some(e => e.accountId === 'acct-fg' && e.credit === 1000)).toBe(true);
  });

  it('rejects a sale larger than finished-goods stock', () => {
    makeReadyGoods();
    expect(() =>
      st().addSale({ customerId: 'customer-1', productId: 'product-1', date: '2026-03-01', pcsSold: 11, pricePerPiece: 500 } as any),
    ).toThrow(/not enough finished stock/i);
  });

  it('deleting a manufactured sale hands its lots back (no cost invented)', () => {
    makeReadyGoods();
    st().addSale({
      customerId: 'customer-1', productId: 'product-1', date: '2026-03-01', pcsSold: 4, pricePerPiece: 500,
    } as any);
    const saleId = st().sales.find(s => s.productId === 'product-1')!.id;
    st().deleteSale(saleId);

    expect(st().sales.find(s => s.id === saleId)).toBeUndefined();
    expect(st().finishedGoodsLots[0].pcsRemaining).toBe(10);
    expect(st().finishedGoodsLots[0].status).toBe('Active');
    // Sale vouchers and entries are removed with the sale
    expect(st().vouchers.some(v => v.sourceModule === 'Sales' && v.sourceId === saleId)).toBe(false);
    expect(st().journalEntries.some(e => e.narration?.includes('Sale of 4'))).toBe(false);
  });

  it('editing a manufactured sale re-draws lots without double counting', () => {
    makeReadyGoods();
    st().addSale({
      customerId: 'customer-1', productId: 'product-1', date: '2026-03-01', pcsSold: 4, pricePerPiece: 500,
    } as any);
    const saleId = st().sales.find(s => s.productId === 'product-1')!.id;
    st().updateSale(saleId, { pcsSold: 7, date: '2026-03-02' } as any);

    const sale = st().sales.find(s => s.id === saleId)!;
    expect(sale.pcsSold).toBe(7);
    expect(sale.cogsAmount).toBe(1750); // 7 × 250
    expect(st().finishedGoodsLots[0].pcsRemaining).toBe(3);
  });

  it('multi-line sale gets one invoice, one voucher per line, correct per-lot COGS', () => {
    const jugId = st().addManufacturingOrder({ productId: 'product-1', date: '2026-02-01', plannedQty: 10, productionCost: 500 } as any);
    st().completeManufacturingOrder(jugId, { date: '2026-02-10' });
    const plateId = st().addManufacturingOrder({ productId: 'product-2', date: '2026-02-02', plannedQty: 5 } as any);
    st().completeManufacturingOrder(plateId, { date: '2026-02-11' });

    st().addSaleGroup({
      customerId: 'customer-1',
      date: '2026-03-01',
      lines: [
        { productId: 'product-1', pcsSold: 2, pricePerPiece: 500 },
        { productId: 'product-2', pcsSold: 3, pricePerPiece: 700 },
      ],
    });

    const sales = st().sales;
    expect(sales).toHaveLength(2);
    expect(new Set(sales.map(s => s.invoiceNo)).size).toBe(1); // shared invoice number

    const jug = sales.find(s => s.productId === 'product-1')!;
    const plate = sales.find(s => s.productId === 'product-2')!;
    expect(jug.cogsAmount).toBe(500); // 2 × 250
    expect(plate.cogsAmount).toBe(300); // 3 × 100 (5000 / 50 pcs)
    expect(st().finishedGoodsLots.find(l => l.productId === 'product-1')!.pcsRemaining).toBe(8);
    expect(st().finishedGoodsLots.find(l => l.productId === 'product-2')!.pcsRemaining).toBe(2);
    for (const row of voucherBalance(st().vouchers, st().journalEntries)) {
      expect(row.debit).toBe(row.credit);
    }
  });

  it('one short line fails the whole multi-line sale — no partial save', () => {
    const jugId = st().addManufacturingOrder({ productId: 'product-1', date: '2026-02-01', plannedQty: 2 } as any);
    st().completeManufacturingOrder(jugId, { date: '2026-02-10' });

    expect(() =>
      st().addSaleGroup({
        customerId: 'customer-1',
        date: '2026-03-01',
        lines: [
          { productId: 'product-1', pcsSold: 1, pricePerPiece: 500 },
          { productId: 'product-2', pcsSold: 1, pricePerPiece: 700 }, // no plate stock at all
        ],
      }),
    ).toThrow(/not enough finished stock/i);
    expect(st().sales).toHaveLength(0);
    expect(st().finishedGoodsLots.find(l => l.productId === 'product-1')!.pcsRemaining).toBe(2);
  });
});

describe('Manufacturing v4 — processing receipt accrual and bills', () => {
  it('capitalises processing cost at receipt, once, including partial receipts', () => {
    // Seed the batch as in-process at the processor: raw fully dispatched
    // would empty it, so seed a dedicated batch directly here.
    useERPStore.setState({
      batches: [{
        ...rawBatch(),
        remainingPcs: 0,
        atProcessorPcs: 10,
        initialPcs: 10,
        amount: 1000,
      }],
      processingSends: [{
        id: 'send-1',
        dispatchNo: 'DSP-2026-0001',
        processorId: 'processor-1',
        materialId: 'material-1',
        batchId: 'batch-1',
        date: '2026-02-01',
        pcsSent: 10,
        pcsReceived: 0,
        ratePerPiece: 5,
        status: 'Pending',
        stageId: STAGES[0].id,
      }],
    } as any);

    st().addProcessingReceipt({
      sendId: 'send-1',
      processorId: 'processor-1',
      materialId: 'material-1',
      date: '2026-02-05',
      pcsReceived: 4,
      stageId: STAGES[0].id,
      rateMethod: 'per_piece',
    } as any);

    const receipt = st().processingReceipts[0];
    expect(receipt.billAmount).toBe(20);
    expect(receipt.accruedProcessingCost).toBe(20);
    expect(receipt.accruedVoucherId).toBeTruthy();

    const accrual = st().vouchers.find(v => v.id === receipt.accruedVoucherId)!;
    const entries = st().journalEntries.filter(e => e.voucherId === accrual.id);
    expect(entries.find(e => e.accountId === 'acct-rm')!.debit).toBe(20);
    expect(entries.find(e => e.accountId === 'acct-accrued')!.credit).toBe(20);

    // Batch carries the processing cost, even mid-chain — ledger and trail agree
    const batch = st().batches.find(b => b.id === 'batch-1')!;
    expect(batch.processingCost).toBe(20);
    expect(batch.stageAvailableBySource?.[STAGES[0].id]).toBe(4);
    expect(batch.processedPcs || 0).toBe(0);
  });

  it('bill clears the accrual; only the difference hits Processing Expense (over-bill and under-bill)', () => {
    useERPStore.setState({
      batches: [{ ...rawBatch(), remainingPcs: 0, atProcessorPcs: 10, initialPcs: 10, amount: 1000 }],
      processingSends: [{
        id: 'send-1',
        dispatchNo: 'DSP-2026-0002',
        processorId: 'processor-1',
        materialId: 'material-1',
        batchId: 'batch-1',
        date: '2026-02-01',
        pcsSent: 10,
        pcsReceived: 0,
        ratePerPiece: 5,
        status: 'Pending',
        stageId: STAGES[0].id,
      }],
    } as any);
    st().addProcessingReceipt({
      sendId: 'send-1',
      processorId: 'processor-1',
      materialId: 'material-1',
      date: '2026-02-05',
      pcsReceived: 10,
      stageId: STAGES[0].id,
      rateMethod: 'per_piece',
    } as any);
    const receipt = st().processingReceipts[0];
    expect(receipt.accruedProcessingCost).toBe(50);

    // Over-bill: final bill 70, accrual 50 → 20 difference to Processing Expense
    st().addProcessorBill({
      processorId: 'processor-1',
      date: '2026-02-10',
      receiptIds: [receipt.id],
      stageId: STAGES[0].id,
      lineAmounts: { [receipt.id]: 70 },
    } as any);

    const bill = st().processorBills[0];
    expect(bill.totalAmount).toBe(70);
    const overVoucher = st().vouchers.find(v => v.sourceModule === 'Processing' && v.sourceId === bill.id)!;
    const overEntries = st().journalEntries.filter(e => e.voucherId === overVoucher.id);
    expect(overEntries.find(e => e.accountId === 'acct-accrued')!.debit).toBe(50);
    expect(overEntries.find(e => e.accountId === 'acct-proc-exp')!.debit).toBe(20);
    expect(overEntries.find(e => e.accountId === 'acct-ap')!.credit).toBe(70);
  });

  it('under-bill credits Processing Expense (accrual cleared in full, nothing stranded)', () => {
    useERPStore.setState({
      batches: [{ ...rawBatch(), remainingPcs: 0, atProcessorPcs: 10, initialPcs: 10, amount: 1000 }],
      processingSends: [{
        id: 'send-1',
        dispatchNo: 'DSP-2026-0003',
        processorId: 'processor-1',
        materialId: 'material-1',
        batchId: 'batch-1',
        date: '2026-02-01',
        pcsSent: 10,
        pcsReceived: 0,
        ratePerPiece: 5,
        status: 'Pending',
        stageId: STAGES[0].id,
      }],
    } as any);
    st().addProcessingReceipt({
      sendId: 'send-1',
      processorId: 'processor-1',
      materialId: 'material-1',
      date: '2026-02-05',
      pcsReceived: 10,
      stageId: STAGES[0].id,
      rateMethod: 'per_piece',
    } as any);
    const receipt = st().processingReceipts[0];

    st().addProcessorBill({
      processorId: 'processor-1',
      date: '2026-02-10',
      receiptIds: [receipt.id],
      stageId: STAGES[0].id,
      lineAmounts: { [receipt.id]: 30 },
    } as any);

    const bill = st().processorBills[0];
    const underVoucher = st().vouchers.find(v => v.sourceModule === 'Processing' && v.sourceId === bill.id)!;
    const entries = st().journalEntries.filter(e => e.voucherId === underVoucher.id);
    expect(entries.find(e => e.accountId === 'acct-accrued')!.debit).toBe(50); // full accrual cleared
    expect(entries.find(e => e.accountId === 'acct-proc-exp')!.credit).toBe(20); // difference credited
    expect(entries.find(e => e.accountId === 'acct-ap')!.credit).toBe(30); // AP only owes the bill
    for (const row of voucherBalance([underVoucher], st().journalEntries)) {
      expect(row.debit).toBe(row.credit);
    }
  });

  it('records a processing loss as Processing Loss expense vs Raw Material at batch cost', () => {
    useERPStore.setState({
      batches: [{ ...rawBatch(), remainingPcs: 0, atProcessorPcs: 10, initialPcs: 10, amount: 1000 }],
      processingSends: [{
        id: 'send-1',
        dispatchNo: 'DSP-2026-0004',
        processorId: 'processor-1',
        materialId: 'material-1',
        batchId: 'batch-1',
        date: '2026-02-01',
        pcsSent: 10,
        pcsReceived: 0,
        ratePerPiece: 5,
        status: 'Pending',
        stageId: STAGES[0].id,
      }],
    } as any);

    st().recordProcessingLoss('send-1', 4, '2026-02-06', 'Wasted in acid');

    const loss = st().processingLosses[0]!;
    expect(loss.pcsLost).toBe(4);
    expect(loss.cost).toBe(400); // batch cost 100/pc
    expect(loss.voucherId).toBeTruthy();
    const voucher = st().vouchers.find(v => v.id === loss.voucherId)!;
    const entries = st().journalEntries.filter(e => e.voucherId === voucher.id);
    expect(entries.find(e => e.accountId === 'acct-proc-loss')!.debit).toBe(400);
    expect(entries.find(e => e.accountId === 'acct-rm')!.credit).toBe(400);
  });
});

describe('Manufacturing — one-time processing-cost reclassification', () => {
  function legacyFixture() {
    // A batch: 100 pcs, amount 10,000, processing cost 1,000 (PKR 110/pc),
    // half of it still on hand — 50 pcs (25 raw + 25 processed).
    useERPStore.setState({
      batches: [{
        ...rawBatch(),
        remainingPcs: 25,
        atProcessorPcs: 0,
        processedPcs: 25,
        processingCost: 1000,
        legacyProcessingCost: 1000,
      }],
      processingSends: [{
        id: 'legacy-send',
        dispatchNo: 'DSP-2025-0001',
        processorId: 'processor-1',
        materialId: 'material-1',
        batchId: 'batch-1',
        date: '2025-06-01',
        pcsSent: 100,
        pcsReceived: 100,
        ratePerPiece: 10,
        status: 'Closed',
        stageId: STAGES[0].id,
      }],
      processingReceipts: [{
        id: 'legacy-receipt',
        receiveNo: 'REC-2025-0001',
        sendId: 'legacy-send',
        processorId: 'processor-1',
        materialId: 'material-1',
        date: '2025-06-05',
        pcsReceived: 100,
        billAmount: 1000,
        billedStatus: 'Billed',
        stageId: STAGES[0].id,
        rateMethod: 'per_piece',
      }],
      processorBills: [{
        id: 'legacy-bill',
        billNo: 'BILL-2025-0001',
        processorId: 'processor-1',
        date: '2025-06-10',
        receiptIds: ['legacy-receipt'],
        totalAmount: 1000,
        stageId: STAGES[0].id,
      }],
    } as any);
  }

  it('preview capitalises ONLY the on-hand share of legacy processing charges', () => {
    legacyFixture();
    const preview = previewProcessingCostReclassification(st());
    expect(preview.amount).toBe(500); // 1000 × 50/100
    expect(preview.batchCount).toBe(1);
    expect(preview.lines).toHaveLength(1);
    expect(preview.lines[0].onHandLegacyCost).toBe(500);
    expect(preview.lines[0].expensedLegacyCost).toBe(1000);
  });

  it('reclassifyProcessingCosts posts a balanced one-time journal and blocks a second run', () => {
    legacyFixture();
    const result = st().reclassifyProcessingCosts();
    expect(result.amount).toBe(500);
    expect(st().processingCostReclassification?.voucherNo).toBe(result.voucherNo);
    expect(st().processingCostReclassification?.batchCount).toBe(1);

    const voucher = st().vouchers.find(v => v.id === result.voucherId)!;
    const entries = st().journalEntries.filter(e => e.voucherId === voucher.id);
    expect(entries.find(e => e.accountId === 'acct-rm')!.debit).toBe(500);
    expect(entries.find(e => e.accountId === 'acct-proc-exp')!.credit).toBe(500);

    // Second run: engine refuses, ledger untouched
    expect(() => st().reclassifyProcessingCosts()).toThrow(/no historical processing cost/i);
  });

  it('never capitalises more than was expensed for that material', () => {
    legacyFixture();
    // Refund-like correction: the posted bill only carries 300 of expense,
    // though the batch physically holds 1000 of legacy charges.
    useERPStore.setState({
      processorBills: [{
        id: 'legacy-bill',
        billNo: 'BILL-2025-0001',
        processorId: 'processor-1',
        date: '2025-06-10',
        receiptIds: ['legacy-receipt'],
        totalAmount: 300,
        lineAmounts: { 'legacy-receipt': 300 },
        stageId: STAGES[0].id,
      }],
    } as any);
    const preview = previewProcessingCostReclassification(st());
    expect(preview.amount).toBe(300); // capped by what was actually expensed
  });

  it('v4-accrued receipts are never mistaken for legacy expense during reclassification', () => {
    legacyFixture();
    // A NEW receipt capitalised by v4 → has accruedVoucherId → excluded
    const receipts = st().processingReceipts;
    useERPStore.setState({
      processingReceipts: [
        ...receipts,
        {
          id: 'v4-receipt',
          receiveNo: 'REC-2026-0002',
          sendId: 'legacy-send',
          processorId: 'processor-1',
          materialId: 'material-1',
          date: '2026-02-01',
          pcsReceived: 0,
          billAmount: 999,
          accruedProcessingCost: 999,
          accruedVoucherId: 'some-voucher',
          billedStatus: 'Billed',
        } as ProcessingReceipt,
      ],
    } as any);
    const preview = previewProcessingCostReclassification(st());
    expect(preview.amount).toBe(500); // unchanged
  });
});

describe('Manufacturing v4 - per-line cost rollup and sale profit snapshot', () => {
  const makeJug = () => {
    const orderId = st().addManufacturingOrder({ productId: 'product-1', date: '2026-02-01', plannedQty: 10, productionCost: 500 } as any);
    st().completeManufacturingOrder(orderId, { date: '2026-02-10' });
    return orderId;
  };

  it('completion stamps the per-line roll-up: consumedQuantity, bucket on every draw, componentCosts', () => {
    makeJug();
    const order = st().manufacturingOrders.find(o => o.productId === 'product-1')!;
    expect(order.components[0].consumedQuantity).toBe(20);
    for (const draw of order.consumptions || []) expect(draw.bucket).toBe('raw');
    expect(order.componentCosts).toEqual([
      { materialId: 'material-1', pcs: 20, cost: 2000, costPerPiece: 100 },
    ]);
  });

  it('snapshots gross profit and margin on create, update and multi-line, and deletes cleanly', () => {
    makeJug();
    st().addSale({ customerId: 'customer-1', productId: 'product-1', date: '2026-03-01', pcsSold: 4, pricePerPiece: 500 } as any);
    const sale = st().sales.find(s => s.productId === 'product-1')!;
    expect(sale.grossProfit).toBe(1000); // 2000 - cogs 1000
    expect(sale.marginPercent).toBeCloseTo(50, 6);

    st().updateSale(sale.id, { pcsSold: 2, date: '2026-03-02' } as any);
    const edited = st().sales.find(s => s.id === sale.id)!;
    expect(edited.totalAmount).toBe(1000);
    expect(edited.grossProfit).toBe(500); // 1000 - cogs 500
    expect(edited.marginPercent).toBeCloseTo(50, 6);

    st().deleteSale(sale.id);
    expect(st().sales).toHaveLength(0);
  });

  it('multi-line sale snapshots grossProfit on every line', () => {
    makeJug();
    const plateId = st().addManufacturingOrder({ productId: 'product-2', date: '2026-02-02', plannedQty: 5 } as any);
    st().completeManufacturingOrder(plateId, { date: '2026-02-11' });

    st().addSaleGroup({
      customerId: 'customer-1',
      date: '2026-03-01',
      lines: [
        { productId: 'product-1', pcsSold: 2, pricePerPiece: 500 },
        { productId: 'product-2', pcsSold: 3, pricePerPiece: 700 },
      ],
    });
    const jug = st().sales.find(s => s.productId === 'product-1')!;
    const plate = st().sales.find(s => s.productId === 'product-2')!;
    expect(jug.grossProfit).toBe(500);
    expect(plate.grossProfit).toBe(1800); // 2100 - 300
    expect(jug.marginPercent).toBeCloseTo(50, 5);
    expect(plate.marginPercent).toBeCloseTo((1800 / 2100) * 100, 5);
  });
});

describe('Manufacturing - reports see the immutable trail', () => {
  function produceAndSell() {
    const orderId = st().addManufacturingOrder({
      productId: 'product-1', date: '2026-02-01', plannedQty: 10, productionCost: 500,
    } as any);
    st().completeManufacturingOrder(orderId, { date: '2026-02-10' });
    st().addSale({
      customerId: 'customer-1', productId: 'product-1', date: '2026-03-01', pcsSold: 4, pricePerPiece: 500,
    } as any);
  }

  it('FG stock report values remaining lots at produced cost', () => {
    produceAndSell();
    const rows = ManufacturingReportService.getFinishedGoodsStockData('');
    const jug = rows.find(r => r.id === 'product-1')!;
    expect(jug.currentStock).toBe(6);
    expect(jug.avgCost).toBe(250);
    expect(jug.stockValue).toBe(1500);
    expect(jug.lotCount).toBe(1);
    expect(jug.orderCount).toBe(1);
  });

  it('consumption report lists every batch draw of each completed MO', () => {
    produceAndSell();
    const rows = ManufacturingReportService.getComponentConsumptionData({ start: '2026-02-01', end: '2026-02-28' }, '');
    expect(rows).toHaveLength(1);
    expect(rows[0].materialName).toBe('Steel Coil');
    expect(rows[0].pcs).toBe(20);
    expect(rows[0].cost).toBe(2000);
    expect(rows[0].orderNo).toMatch(/^MO-/);
  });

  it('cost breakdown report shows material + production + absorbed shortfall', () => {
    const orderId = st().addManufacturingOrder({
      productId: 'product-1', date: '2026-02-01', plannedQty: 10, productionCost: 200,
    } as any);
    st().completeManufacturingOrder(orderId, { finishedQty: 8, date: '2026-02-10' });
    const rows = ManufacturingReportService.getProductCostBreakdownData({ start: '2026-02-01', end: '2026-02-28' }, '');
    expect(rows).toHaveLength(1);
    expect(rows[0].shortfall).toBe(2);
    expect(rows[0].materialCost).toBe(2000);
    expect(rows[0].productionCost).toBe(200);
    expect(rows[0].totalCost).toBe(2200);
    expect(rows[0].costPerPiece).toBe(275);
  });

  it('profitability report uses the exact FIFO lot COGS posted on each sale', () => {
    produceAndSell();
    const rows = ManufacturingReportService.getProductProfitabilityData({ start: '2026-03-01', end: '2026-03-31' }, '');
    const jug = rows.find(r => r.productId === 'product-1')!;
    expect(jug.saleCount).toBe(1);
    expect(jug.pcsSold).toBe(4);
    expect(jug.revenue).toBe(2000);
    expect(jug.cogs).toBe(1000);
    expect(jug.profit).toBe(1000);
    expect(jug.margin).toBeCloseTo(0.5, 6);
  });
});

describe('Manufacturing — migration stamps and once-only middleware', () => {
  it('stamps stateSchemaVersion 4, manufactures every product, freezes legacy cost shares', () => {
    const legacyState: any = {
      accounts: [],
      accountSubtypes: [],
      customers: [],
      suppliers: [],
      processors: [],
      products: [{ id: 'p1', name: 'Jug', materialId: 'm1' }],
      sales: [],
      vouchers: [],
      journalEntries: [],
      materials: [{ id: 'm1', stockPcs: 100, atProcessorPcs: 0, processedStockPcs: 0 }],
      batches: [{
        id: 'b1',
        batchNo: 'TAILOR-1',
        purchaseId: 'pu1',
        supplierId: 's1',
        materialId: 'm1',
        date: '2026-01-01',
        weight: 100,
        weightUnit: 'KGs',
        ratePerUnit: 100,
        weightPerPiece: 1,
        initialPcs: 100,
        remainingPcs: 90,
        amount: 10000,
        status: 'Active',
        processingCost: 1000,
      }],
      processingSends: [{
        id: 'send-1',
        dispatchNo: 'DSP-2026-0001',
        processorId: 'pr1',
        materialId: 'm1',
        batchId: 'b1',
        pcsSent: 100,
        pcsReceived: 100,
        status: 'Closed',
        date: '2026-01-05',
        ratePerPiece: 10,
        stageId: 'stage-1',
      }],
      processingReceipts: [
        {
          id: 'rec-legacy',
          sendId: 'send-1',
          materialId: 'm1',
          pcsReceived: 60,
          billAmount: 600, // legacy charge — expensed at bill time
          billedStatus: 'Billed',
          date: '2026-01-05T09:00:00.000Z',
          stageId: 'stage-1',
        },
        {
          id: 'rec-v4',
          sendId: 'send-1',
          materialId: 'm1',
          pcsReceived: 40,
          billAmount: 400, // v4 charge — capitalised at receipt
          accruedProcessingCost: 400,
          accruedVoucherId: 'accrual-voucher',
          billedStatus: 'Billed',
          date: '2026-01-05T10:00:00.000Z',
          stageId: 'stage-1',
        },
      ],
      processingStages: buildDefaultStages(),
    };

    const result = migrateERPState(legacyState);
    expect(result.stateSchemaVersion).toBe(4);
    expect(result.products[0].stockModel).toBe('manufactured');
    expect(result.products[0].bomVersion).toBe(1);
    // 600 + 400 accumulated across the two receipts = 1000 carried by the
    // rebuilt trail − 400 capitalised by v4 = 600 frozen as legacy
    expect(result.batches.find((b: any) => b.id === 'b1')?.legacyProcessingCost).toBe(600);
    // Migration seeds the accounts the new postings require
    expect((result.accounts as any[]).some(a => a.name === 'Accrued Expenses')).toBe(true);
    expect((result.accounts as any[]).some(a => a.name === 'Processing Loss')).toBe(true);
  });

  it('re-running the migration keeps the legacy stamp instead of re-deriving it', () => {
    const legacyState: any = {
      accounts: [],
      accountSubtypes: [],
      customers: [],
      suppliers: [],
      processors: [],
      products: [{ id: 'p1', name: 'Jug', materialId: 'm1' }],
      sales: [],
      vouchers: [],
      journalEntries: [],
      materials: [{ id: 'm1', stockPcs: 100, atProcessorPcs: 0, processedStockPcs: 0 }],
      batches: [{
        id: 'b1',
        batchNo: 'TAILOR-1',
        purchaseId: 'pu1',
        supplierId: 's1',
        materialId: 'm1',
        date: '2026-01-01',
        weight: 100,
        weightUnit: 'KGs',
        ratePerUnit: 100,
        weightPerPiece: 1,
        initialPcs: 100,
        remainingPcs: 100,
        amount: 10000,
        status: 'Active',
        processingCost: 1000,
      }],
      processingSends: [{
        id: 'legacy-send',
        dispatchNo: 'DSP-2025-0001',
        processorId: 'pr1',
        materialId: 'm1',
        batchId: 'b1',
        pcsSent: 100,
        pcsReceived: 100,
        status: 'Closed',
        date: '2025-06-01',
        ratePerPiece: 10,
        stageId: 'stage-1',
      }],
      processingReceipts: [{
        id: 'legacy-receipt',
        sendId: 'legacy-send',
        materialId: 'm1',
        pcsReceived: 100,
        billAmount: 1000, // legacy charge, expensed at bill time, never accrued
        billedStatus: 'Billed',
        date: '2025-06-05',
        stageId: 'stage-1',
      }],
      processingStages: buildDefaultStages(),
    };
    const once = migrateERPState(legacyState);
    expect(once.batches.find((b: any) => b.id === 'b1')?.legacyProcessingCost).toBe(1000);
    const twice = migrateERPState(once as any);
    expect(twice.batches.find((b: any) => b.id === 'b1')?.legacyProcessingCost).toBe(1000);
  });

  it('database middleware invokes the updater exactly once', () => {
    let calls = 0;
    const useTestStore = create<{ count: number; inc: () => void }>()(
      databaseMiddlewareImpl((set) => ({
        count: 0,
        inc: () => set((s) => {
          calls += 1;
          return { count: s.count + 1 };
        }),
      }))
    );
    useTestStore.getState().inc();
    expect(calls).toBe(1);
    expect(useTestStore.getState().count).toBe(1);
  });
});

describe('Manufacturing — role seeding', () => {
  beforeEach(() => {
    useAccessStore.setState({
      users: [],
      roles: [],
      permissions: [],
      rolePermissions: [],
      auditLogs: [],
      loginHistory: [],
      dataPolicies: [],
      passwords: [],
    } as any);
  });

  it('fresh seed grants all three default roles the full Manufacturing module', () => {
    useAccessStore.getState().seedDefaults();
    const state = useAccessStore.getState();
    const manufacturing = state.permissions.filter(p => p.module === 'Manufacturing');
    expect(manufacturing.length).toBe(4);
    for (const roleName of ['Admin', 'Accountant', 'Staff']) {
      const role = state.roles.find(r => r.name === roleName)!;
      const granted = manufacturing.filter(p =>
        state.rolePermissions.some(rp => rp.role_id === role.id && rp.permission_id === p.id),
      );
      expect(granted).toHaveLength(4);
    }
  });

  it('existing install gains only the missing Manufacturing permissions, keeping existing grants', () => {
    const adminRole = { id: 'role-admin', name: 'Admin', is_system: true, type: 'Default' as const, created_at: '2026-01-01T00:00:00Z' };
    const accountantRole = { id: 'role-accountant', name: 'Accountant', is_system: true, type: 'Default' as const, created_at: '2026-01-01T00:00:00Z' };
    const staffRole = { id: 'role-staff', name: 'Staff', is_system: true, type: 'Default' as const, created_at: '2026-01-01T00:00:00Z' };
    const existingView = { id: 'perm-view', module: 'Manufacturing', action: 'View' };
    useAccessStore.setState({
      roles: [adminRole, accountantRole, staffRole],
      permissions: [existingView],
      rolePermissions: [{ id: 'rp-admin-view', role_id: adminRole.id, permission_id: existingView.id }],
    } as any);

    useAccessStore.getState().seedDefaults();
    const state = useAccessStore.getState();
    for (const role of [adminRole, accountantRole, staffRole]) {
      const granted = state.rolePermissions.filter(
        rp => rp.role_id === role.id && state.permissions.find(p => p.id === rp.permission_id)?.module === 'Manufacturing',
      );
      expect(granted.length).toBe(4); // View + Create + Edit + Delete
    }
  });
});
