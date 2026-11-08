import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildableQty } from '../lib/business/ManufacturingService';
import { buildDefaultStages } from '../lib/processing/processingStageSeed';
import { useERPStore } from './useERPStore';

// Keep the settings-backed singleton out of this suite.
vi.mock('./useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ batchNoMode: 'supplier' }),
  },
}));

/**
 * Products-page "Ready to make" + one-tap Produce contract.
 * The 3v: Steel Jug needs 2 × Steel Coil per unit; Brass Plate needs 1 × Brass Sheet.
 * material-1 (Steel Coil) has 100 pcs raw on hand → 50 jugs; material-2 has 50 → 50 plates.
 */

const baseAccounts = () => [
  { id: 'acct-rm', code: '1101', name: 'Raw Material Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-fg', code: '1103', name: 'Finished Goods Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-ap', code: '2000', name: 'Accounts Payable', subtypeId: 'st-ap', type: 'Liabilities' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-accrued', code: '2010', name: 'Accrued Expenses', subtypeId: 'st-ap', type: 'Liabilities' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-ar', code: '1200', name: 'Accounts Receivable', subtypeId: 'st-ar', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-sales', code: '4001', name: 'Sales Revenue', subtypeId: 'st-sales', type: 'Revenue' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
  { id: 'acct-cogs', code: '5201', name: 'Cost of Goods Sold', subtypeId: 'st-cogs', type: 'Cost of Goods Sold' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
];

const baseSubtypes = () => [
  { id: 'st-inv', name: 'Inventory', type: 'Assets' as const, isSystem: true },
  { id: 'st-ap', name: 'Accounts Payable', type: 'Liabilities' as const, isSystem: true },
  { id: 'st-ar', name: 'Accounts Receivable', type: 'Assets' as const, isSystem: true },
  { id: 'st-sales', name: 'Sales', type: 'Revenue' as const, isSystem: true },
  { id: 'st-cogs', name: 'Purchases', type: 'Expenses' as const, isSystem: true },
];

const batch1 = () => ({
  id: 'batch-1', batchNo: 'AHMED-PO-2026-0001', purchaseId: 'purchase-1', supplierId: 'supplier-1',
  materialId: 'material-1', date: '2026-01-01', weight: 100, weightUnit: 'KGs' as const,
  ratePerUnit: 100, weightPerPiece: 1, initialPcs: 100, remainingPcs: 100, amount: 10000, status: 'Active' as const,
});
const batch2 = () => ({
  ...batch1(), id: 'batch-2', batchNo: 'AHMED-PO-2026-0002', materialId: 'material-2',
  date: '2026-01-05', initialPcs: 50, remainingPcs: 50, amount: 5000,
});
const batch3 = () => ({
  ...batch1(), id: 'batch-3', batchNo: 'AHMED-PO-2026-0003', materialId: 'material-3',
  date: '2026-01-10', initialPcs: 80, remainingPcs: 80, amount: 8000,
});

function seed() {
  useERPStore.setState({
    stateSchemaVersion: 4,
    accountSubtypes: baseSubtypes(),
    accounts: baseAccounts(),
    categories: [],
    materials: [
      { id: 'material-1', name: 'Steel Coil', code: 'M-1', stockPcs: 100, atProcessorPcs: 0, processedStockPcs: 0, status: 'Active', processingPath: 'ready_made' },
      { id: 'material-2', name: 'Brass Sheet', code: 'M-2', stockPcs: 50, atProcessorPcs: 0, processedStockPcs: 0, status: 'Active', processingPath: 'ready_made' },
      { id: 'material-3', name: 'Galvanized Sheet', code: 'M-3', stockPcs: 80, atProcessorPcs: 0, processedStockPcs: 0, status: 'Active', processingPath: 'ready_made' },
    ],
    products: [
      { id: 'product-1', name: 'Steel Jug', materialId: 'material-1', price: 500, sellingPrice: 500, status: 'Active', stockModel: 'manufactured', bomVersion: 1, components: [{ materialId: 'material-1', quantity: 2 }] },
      { id: 'product-2', name: 'Brass Plate', materialId: 'material-2', price: 700, sellingPrice: 700, status: 'Active', stockModel: 'manufactured', bomVersion: 1, components: [{ materialId: 'material-2', quantity: 1 }] },
      { id: 'product-3', name: 'Galvanized Tray', materialId: 'material-3', price: 300, sellingPrice: 300, status: 'Active', stockModel: 'manufactured', bomVersion: 1 },
    ],
    suppliers: [{ id: 'supplier-1', name: 'Supplier A', balancePayable: 0, status: 'Active' }],
    customers: [{ id: 'customer-1', name: 'Customer A', balanceReceivable: 0, status: 'Active' }],
    processingStages: buildDefaultStages(),
    processingSends: [], processingReceipts: [], processorBills: [], processingLosses: [],
    manufacturingOrders: [], finishedGoodsLots: [], batches: [batch1(), batch2(), batch3()],
    inventoryMovements: [], purchases: [], sales: [], vouchers: [], journalEntries: [],
    currentUser: { name: 'Tester', email: 'tester@example.com', role: 'Admin' },
    processingCostReclassification: undefined,
  } as any);
}

const st = () => useERPStore.getState();

beforeEach(() => seed());

describe('buildableQty — live "Ready to make"', () => {
  it('takes the min over BOM lines, flooring fractional coverage (2 pcs per unit)', () => {
    const p = st().products.find(p => p.id === 'product-1')!;
    expect(buildableQty(p as any, st().batches).buildable).toBe(50);
  });

  it('counts a lower component stock as the bottleneck across products', () => {
    const p = st().products.find(p => p.id === 'product-1')!;
    const lines = buildableQty(p as any, st().batches).lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ materialId: 'material-1', quantityPerUnit: 2, available: 100, lineBuildable: 50 });
  });

  it('simple product (no BOM lines) is 1:1 with its material', () => {
    const p = st().products.find(p => p.id === 'product-3')!;
    expect(buildableQty(p as any, st().batches).buildable).toBe(80);
  });

  it('returns 0 and the line detail when a part is missing', () => {
    const p = st().products.find(p => p.id === 'product-1')!;
    const noBatches = buildableQty(p as any, []);
    expect(noBatches.buildable).toBe(0);
    expect(noBatches.lines[0].available).toBe(0);
  });
});

describe('produceForProduct — one tap from the Products page', () => {
  it('creates + completes an MO atomically and returns the lot numbers', () => {
    const r = st().produceForProduct({ productId: 'product-1', date: '2026-02-10' });
    expect(r.finishedQty).toBe(50);
    expect(r.orderNo).toMatch(/^MO-/);
    expect(r.lotNo).toMatch(/^LOT-/);

    const order = st().manufacturingOrders.find(o => o.id === r.orderId)!;
    expect(order.status).toBe('Completed');
    expect(order.finishedQty).toBe(50);
    expect(order.components).toHaveLength(1);
    expect(order.components[0].plannedQuantity).toBe(100);

    const lot = st().finishedGoodsLots.find(l => l.id === r.lotId)!;
    expect(lot.productId).toBe('product-1');
    expect(lot.pcsProduced).toBe(50);
    expect(lot.pcsRemaining).toBe(50);

    // Components consumed FIFO
    const batch = st().batches.find(b => b.id === 'batch-1')!;
    expect(batch.remainingPcs).toBe(0);
    expect(batch.status).toBe('Active');

    // Voucher posted Dr FG / Cr Raw, balanced
    expect(st().vouchers.length).toBe(1);
    const totalDebits = st().journalEntries.reduce((s, j) => s + j.debit, 0);
    const totalCredits = st().journalEntries.reduce((s, j) => s + j.credit, 0);
    expect(Math.abs(totalDebits - totalCredits)).toBeLessThan(0.01);
  });

  it('respects an explicit (smaller) finishedQty — assembly loss absorbs into unit cost', () => {
    // 100 pcs of material-1 @ 100/pc = 10,000 raw cost. Produce 40 (loss of 10) →
    // 80 pcs consumed for 40 jugs = 200/pc.
    const r = st().produceForProduct({ productId: 'product-1', finishedQty: 40, date: '2026-02-10' });
    const lot = st().finishedGoodsLots.find(l => l.id === r.lotId)!;
    expect(lot.pcsProduced).toBe(40);
    expect(lot.costPerPiece).toBe(200);
    expect(st().batches.find(b => b.id === 'batch-1')!.remainingPcs).toBe(20);
  });

  it('refuses to produce more than the parts allow — nothing consumed, no order, no lot', () => {
    expect(() => st().produceForProduct({ productId: 'product-1', finishedQty: 51, date: '2026-02-10' }))
      .toThrow(/cannot produce/i);
    expect(st().manufacturingOrders).toHaveLength(0);
    expect(st().finishedGoodsLots).toHaveLength(0);
    expect(st().batches.find(b => b.id === 'batch-1')!.remainingPcs).toBe(100);
  });

  it('refuses when nothing can be built', () => {
    const r = st().produceForProduct({ productId: 'product-1', finishedQty: 50, date: '2026-02-10' });
    expect(r.finishedQty).toBe(50);
    expect(() => st().produceForProduct({ productId: 'product-1', date: '2026-02-11' }))
      .toThrow(/nothing can be produced/i);
  });

  it('produces a simple product through the implicit 1-line BOM path', () => {
    const r = st().produceForProduct({ productId: 'product-3', date: '2026-02-10' });
    expect(r.finishedQty).toBe(80);
    const lot = st().finishedGoodsLots.find(l => l.id === r.lotId)!;
    expect(lot.pcsProduced).toBe(80);
    expect(st().batches.find(b => b.id === 'batch-3')!.remainingPcs).toBe(0);
  });
});
