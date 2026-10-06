import { beforeEach, describe, expect, it } from 'vitest';
import { useERPStore } from './useERPStore';

/**
 * The sale side of product assembly: selling a Jug must actually take a Circle,
 * a No. 4 and a Handle off raw stock, and must refuse to take any of them when
 * one is short.
 *
 * These are stock-movement tests, not maths tests — the arithmetic is covered
 * by ProductAssemblyService.test.ts. What matters here is that the pcs leave
 * the batch trail, that the counters follow, and that a shortage changes
 * NOTHING.
 */

const st = () => useERPStore.getState();

function seed() {
  useERPStore.setState({
    accountSubtypes: [
      { id: 'st-inv', name: 'Inventory', type: 'Assets' as const, isSystem: true },
      { id: 'st-ar', name: 'Accounts Receivable', type: 'Assets' as const, isSystem: true },
      { id: 'st-sales', name: 'Sales', type: 'Revenue' as const, isSystem: true },
      { id: 'st-cogs', name: 'Purchases', type: 'Expenses' as const, isSystem: true },
    ],
    accounts: [
      { id: 'acct-rm', code: '1101', name: 'Raw Material Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-ar', code: '1200', name: 'Accounts Receivable', subtypeId: 'st-ar', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-sales', code: '4001', name: 'Sales Revenue', subtypeId: 'st-sales', type: 'Revenue' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-cogs', code: '5201', name: 'Cost of Goods Sold', subtypeId: 'st-cogs', type: 'Cost of Goods Sold' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
    ],
    materials: [], products: [], customers: [], suppliers: [], processors: [],
    purchases: [], sales: [], batches: [], inventoryMovements: [],
    vouchers: [], journalEntries: [], processingSends: [], processingReceipts: [],
    processorBills: [],
  } as any);

  st().addCustomer({ name: 'Shop' });

  // Circle: 100 PCS @ 80. No.4: 50 PCS @ 20. Handle: 30 PCS @ 50.
  useERPStore.setState({
    materials: [
      { id: 'mat-circle', name: 'Circle 12½ Inch', code: '4 No', categoryId: 'c', unit: 'PCS', status: 'Active', usageType: 'component', stockPcs: 100, processedStockPcs: 0 },
      { id: 'mat-no4', name: 'No. 4 No', code: 'No. 4', categoryId: 'c', unit: 'PCS', status: 'Active', usageType: 'component', stockPcs: 50, processedStockPcs: 0 },
      { id: 'mat-handle', name: 'Handle', code: 'H-1', categoryId: 'c', unit: 'PCS', status: 'Active', usageType: 'component', stockPcs: 30, processedStockPcs: 0 },
    ],
    products: [
      {
        id: 'p-jug', name: 'Jug', sellingPrice: 500, usageType: 'assembled',
        components: [
          { materialId: 'mat-circle', quantity: 1 },
          { materialId: 'mat-no4', quantity: 1 },
          { materialId: 'mat-handle', quantity: 1 },
        ],
      },
      { id: 'p-sheet', name: 'Sheet', sellingPrice: 200, usageType: 'simple', materialId: 'mat-circle' },
    ],
    batches: [
      { id: 'b-circle', batchNo: 'B1', purchaseId: 'p1', supplierId: 's', materialId: 'mat-circle', date: '2026-01-01', weight: 100, weightUnit: 'KGs', ratePerUnit: 80, weightPerPiece: 1, initialPcs: 100, remainingPcs: 100, amount: 8000, status: 'Active' },
      { id: 'b-no4', batchNo: 'B2', purchaseId: 'p1', supplierId: 's', materialId: 'mat-no4', date: '2026-01-01', weight: 50, weightUnit: 'KGs', ratePerUnit: 20, weightPerPiece: 1, initialPcs: 50, remainingPcs: 50, amount: 1000, status: 'Active' },
      { id: 'b-handle', batchNo: 'B3', purchaseId: 'p1', supplierId: 's', materialId: 'mat-handle', date: '2026-01-01', weight: 30, weightUnit: 'KGs', ratePerUnit: 50, weightPerPiece: 1, initialPcs: 30, remainingPcs: 30, amount: 1500, status: 'Active' },
    ],
  } as any);

  return {
    customerId: st().customers[0].id,
    remaining: (materialId: string) =>
      st().batches.find(b => b.id === `b-${materialId.replace('mat-', '')}`)!.remainingPcs,
  };
}

const sale = (customerId: string, productId: string, pcsSold: number) =>
  st().addSale({
    date: '2026-01-05', customerId, productId, pcsSold,
    pricePerPiece: 500, remarks: '',
  } as any);

describe('assembled product sale', () => {
  let env: ReturnType<typeof seed>;
  beforeEach(() => { env = seed(); });

  it('takes every component off stock', () => {
    sale(env.customerId, 'p-jug', 10);

    expect(env.remaining('mat-circle')).toBe(90);
    expect(env.remaining('mat-no4')).toBe(40);
    expect(env.remaining('mat-handle')).toBe(20);
    expect(st().sales).toHaveLength(1);
  });

  it('keeps the material counters in step with the batch trail', () => {
    sale(env.customerId, 'p-jug', 10);
    const circle = st().materials.find(m => m.id === 'mat-circle')!;
    expect(circle.stockPcs).toBe(90);
    expect(circle.processedStockPcs).toBe(0); // parts never become finished goods
  });

  it('writes one inventory movement per component', () => {
    sale(env.customerId, 'p-jug', 4);
    const movements = st().inventoryMovements.filter(m => m.module === 'Sale');
    expect(movements).toHaveLength(3);
    expect(movements.map(m => m.materialId).sort()).toEqual([
      'mat-circle', 'mat-handle', 'mat-no4',
    ]);
    expect(movements.every(m => m.quantity === 4 && m.transactionType === 'OUT')).toBe(true);
  });

  it('posts a balanced voucher: revenue, and the parts as the cost leg', () => {
    sale(env.customerId, 'p-jug', 1);

    const voucher = st().vouchers.find(v => v.sourceModule === 'Sales')!;
    expect(voucher).toBeTruthy();
    const entries = st().journalEntries.filter(e => e.voucherId === voucher.id);
    const debit = entries.reduce((s, e) => s + (e.debit || 0), 0);
    const credit = entries.reduce((s, e) => s + (e.credit || 0), 0);
    expect(debit).toBeCloseTo(credit, 6);

    // 500 revenue + 150 of parts at purchase cost (80 + 20 + 50).
    expect(voucher.totalDebit).toBe(650);
    const cogs = entries.find(e => e.accountId === 'acct-cogs')!;
    expect(cogs.debit).toBe(150);
    // The parts leave RAW inventory — they never passed through Finished Goods.
    expect(entries.find(e => e.accountId === 'acct-rm')!.credit).toBe(150);
    expect(entries.some(e => e.accountId === 'acct-rm' && e.debit === 500)).toBe(false);
  });

  it('refuses the whole sale when one component is short, changing nothing', () => {
    const before = st().batches.map(b => b.remainingPcs);
    expect(() => sale(env.customerId, 'p-jug', 40)).toThrow(/Not enough stock/i);

    expect(st().batches.map(b => b.remainingPcs)).toEqual(before);
    expect(st().sales).toHaveLength(0);
    expect(st().inventoryMovements).toHaveLength(0);
    expect(st().vouchers).toHaveLength(0);
  });

  it('names the short material in the refusal', () => {
    // 35 jugs needs 35 handles but only 30 are on hand.
    expect(() => sale(env.customerId, 'p-jug', 35)).toThrow(/Handle/);
  });
});

describe('editing and deleting an assembled sale', () => {
  let env: ReturnType<typeof seed>;
  beforeEach(() => { env = seed(); });

  /** Sell 10 jugs, then hand back the sale so each test starts from that state. */
  const withSale = () => {
    sale(env.customerId, 'p-jug', 10);
    return st().sales[0].id;
  };

  it('growing the quantity takes the extra parts off stock', () => {
    const id = withSale();
    st().updateSale(id, { pcsSold: 15 } as any);

    expect(env.remaining('mat-circle')).toBe(85);
    expect(env.remaining('mat-no4')).toBe(35);
    expect(env.remaining('mat-handle')).toBe(15);
    expect(st().materials.find(m => m.id === 'mat-circle')!.stockPcs).toBe(85);
  });

  it('shrinking the quantity hands the unused parts back', () => {
    const id = withSale();
    st().updateSale(id, { pcsSold: 4 } as any);

    expect(env.remaining('mat-circle')).toBe(96);
    expect(env.remaining('mat-no4')).toBe(46);
    expect(env.remaining('mat-handle')).toBe(26);
  });

  it('leaves no duplicated movements after an edit', () => {
    const id = withSale();
    st().updateSale(id, { pcsSold: 6 } as any);

    const movements = st().inventoryMovements.filter(m => m.module === 'Sale');
    expect(movements).toHaveLength(3);
    expect(movements.every(m => m.quantity === 6)).toBe(true);
  });

  it('re-prices the cost leg so the voucher still balances', () => {
    const id = withSale();
    st().updateSale(id, { pcsSold: 20, pricePerPiece: 600 } as any);

    const voucher = st().vouchers.find(v => v.sourceId === id)!;
    const entries = st().journalEntries.filter(e => e.voucherId === voucher.id);
    const debit = entries.reduce((s, e) => s + (e.debit || 0), 0);
    const credit = entries.reduce((s, e) => s + (e.credit || 0), 0);

    expect(debit).toBeCloseTo(credit, 6);
    // 20 jugs × 600 revenue, plus 20 × 150 of parts.
    expect(voucher.totalDebit).toBe(12000 + 3000);
    expect(entries.find(e => e.accountId === 'acct-cogs')!.debit).toBe(3000);
    expect(entries.find(e => e.accountId === 'acct-rm')!.credit).toBe(3000);
  });

  it('refuses an edit that would take more parts than exist, changing nothing', () => {
    const id = withSale();
    const before = st().batches.map(b => b.remainingPcs);

    expect(() => st().updateSale(id, { pcsSold: 31 } as any)).toThrow(/Not enough stock/i);

    expect(st().batches.map(b => b.remainingPcs)).toEqual(before);
    expect(st().sales.find(s => s.id === id)!.pcsSold).toBe(10);
  });

  it('deleting the sale returns every part to stock', () => {
    const id = withSale();
    st().deleteSale(id);

    expect(env.remaining('mat-circle')).toBe(100);
    expect(env.remaining('mat-no4')).toBe(50);
    expect(env.remaining('mat-handle')).toBe(30);
    expect(st().materials.find(m => m.id === 'mat-circle')!.stockPcs).toBe(100);
  });

  it('reactivates the batch the sale emptied instead of inventing one', () => {
    const id = withSale();
    expect(st().batches.find(b => b.id === 'b-handle')!.remainingPcs).toBe(20);

    st().deleteSale(id);

    const handle = st().batches.find(b => b.id === 'b-handle')!;
    expect(handle.remainingPcs).toBe(30);
    expect(handle.status).toBe('Active');
    expect(st().batches.filter(b => b.materialId === 'mat-handle')).toHaveLength(1);
  });

  it('reversing an edit and then deleting lands back on the original stock', () => {
    const id = withSale();
    st().updateSale(id, { pcsSold: 3 } as any);
    st().deleteSale(id);

    expect(env.remaining('mat-circle')).toBe(100);
    expect(env.remaining('mat-no4')).toBe(50);
    expect(env.remaining('mat-handle')).toBe(30);
  });

  it('deleting removes the voucher and its entries', () => {
    const id = withSale();
    const voucherId = st().vouchers.find(v => v.sourceId === id)!.id;

    st().deleteSale(id);

    expect(st().vouchers.find(v => v.id === voucherId)).toBeUndefined();
    expect(st().journalEntries.filter(e => e.voucherId === voucherId)).toHaveLength(0);
    expect(st().sales).toHaveLength(0);
  });
});

describe('single-material product sale is unchanged', () => {
  let env: ReturnType<typeof seed>;
  beforeEach(() => { env = seed(); });

  it('still sells from the linked material\'s finished stock', () => {
    useERPStore.setState({
      materials: st().materials.map(m =>
        m.id === 'mat-circle' ? { ...m, stockPcs: 0, processedStockPcs: 5 } : m),
      batches: st().batches.map(b =>
        b.materialId === 'mat-circle'
          ? { ...b, remainingPcs: 0, processedPcs: 5 }
          : b),
    } as any);

    sale(env.customerId, 'p-sheet', 2);

    // Finished stock came down; RAW stock was untouched, because a simple
    // product consumes no parts.
    expect(st().materials.find(m => m.id === 'mat-circle')!.processedStockPcs).toBe(3);
    expect(env.remaining('mat-no4')).toBe(50);
    expect(env.remaining('mat-handle')).toBe(30);
  });
});
describe('assembled product shape is enforced in the store', () => {
  // The Product form blocks an empty parts list, but addProduct/updateModuleItem
  // are also reached by imports and restores. Without the store check, an
  // assembled product with no parts would be billed as "Made on sale" while
  // deducting nothing from stock.
  beforeEach(() => { seed(); });

  it('refuses to create an assembled product with no parts', () => {
    const before = st().products.length;
    expect(() => st().addProduct({
      name: 'Ghost Jug', sellingPrice: 500, usageType: 'assembled', components: [],
    } as any)).toThrow(/at least one material/i);
    expect(st().products.length).toBe(before);
  });

  it('refuses to create an assembled product whose part has no quantity', () => {
    expect(() => st().addProduct({
      name: 'Ghost Jug', sellingPrice: 500, usageType: 'assembled',
      components: [{ materialId: 'mat-circle', quantity: 0 }],
    } as any)).toThrow(/greater than zero/i);
  });

  it('refuses an edit that would empty the parts list', () => {
    expect(() => st().updateModuleItem('products', 'p-jug', {
      usageType: 'assembled', components: [],
    } as any)).toThrow(/at least one material/i);
    // The product is untouched: it still has its three parts.
    expect(st().products.find(p => p.id === 'p-jug')!.components).toHaveLength(3);
  });

  it('allows an edit that leaves the parts list untouched', () => {
    st().updateModuleItem('products', 'p-jug', { sellingPrice: 550 } as any);
    expect(st().products.find(p => p.id === 'p-jug')!.sellingPrice).toBe(550);
    expect(st().products.find(p => p.id === 'p-jug')!.components).toHaveLength(3);
  });

  it('still allows a simple product with no parts at all', () => {
    expect(() => st().addProduct({
      name: 'Plain Sheet', sellingPrice: 200, usageType: 'simple', materialId: 'mat-circle',
    } as any)).not.toThrow();
  });
});
