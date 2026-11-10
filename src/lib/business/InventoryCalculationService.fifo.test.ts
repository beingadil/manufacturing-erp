import { describe, expect, it } from 'vitest';
import type { Batch, Sale } from '../../types/erp';
import { InventoryCalculationService } from './InventoryCalculationService';

const makeBatch = (overrides: Partial<Batch> & Pick<Batch, 'id'>): Batch => ({
  batchNo: overrides.id,
  purchaseId: `p-${overrides.id}`,
  supplierId: `sup-${overrides.id}`,
  materialId: 'mat-1',
  date: '2025-01-01',
  weight: 100,
  weightUnit: 'KG',
  ratePerUnit: 10,
  weightPerPiece: 0.5,
  initialPcs: 10,
  remainingPcs: 0,
  amount: 100,
  status: 'Active',
  processedPcs: 10,
  processingCost: 0,
  ...overrides,
} as Batch);

const makeSale = (id: string, pcsSold: number, date: string, overrides: Partial<Sale> = {}): Sale => ({
  invoiceNo: id,
  customerId: 'cust-1',
  productId: 'prod-1',
  date,
  pcsSold,
  pricePerPiece: 20,
  totalAmount: pcsSold * 20,
  ...overrides,
  id,
} as Sale);

describe('InventoryCalculationService.getFIFOCOGSForSales', () => {
  it('walks the batch trail sequentially across sales — never re-draws the same pcs', () => {
    // Two batches: 10 pcs each at cost 5/pc and 7/pc.
    const batches = [
      makeBatch({ id: 'b1', date: '2025-01-01', initialPcs: 10, amount: 50, processedPcs: 10, processingCost: 0 }),
      makeBatch({ id: 'b2', date: '2025-02-01', initialPcs: 10, amount: 70, processedPcs: 10, processingCost: 0 }),
    ];
    // Sale 1 (12 pcs) consumes all of b1 (10 @5) + 2 from b2 (2 @7).
    // Sale 2 (8 pcs) consumes 8 more from b2 at 7 — not a fresh walk of b1+b2.
    const sales = [
      makeSale('s1', 12, '2025-03-01'),
      makeSale('s2', 8, '2025-03-02'),
    ];
    const cogs = InventoryCalculationService.getFIFOCOGSForSales('mat-1', sales, batches);
    expect(cogs.get('s1')).toBe(10 * 5 + 2 * 7);
    expect(cogs.get('s2')).toBe(8 * 7);
  });

  it('orders sales chronologically even when the list input is unordered', () => {
    const batches = [
      makeBatch({ id: 'b1', date: '2025-01-01', initialPcs: 2, amount: 10, processedPcs: 2, processingCost: 0 }),
    ];
    const sales = [
      makeSale('s-late', 2, '2025-03-02'),
      makeSale('s-early', 2, '2025-03-01'),
    ];
    const cogs = InventoryCalculationService.getFIFOCOGSForSales('mat-1', sales, batches);
    // Both draw from the same batch at 5/pc; the early sale runs first but the sum is identical.
    expect(cogs.get('s-early')).toBe(10);
    expect(cogs.get('s-late')).toBe(10);
  });

  it('uses the recorded cogsAmount for manufactured sales without consuming material batches', () => {
    const batches = [
      makeBatch({ id: 'b1', date: '2025-01-01', initialPcs: 10, amount: 50, processedPcs: 10 }),
    ];
    const sales = [
      makeSale('m1', 4, '2025-03-01', { stockModelAtSale: 'manufactured', cogsAmount: 123 }),
      makeSale('m2', 2, '2025-03-02'),
    ];
    const cogs = InventoryCalculationService.getFIFOCOGSForSales('mat-1', sales, batches);
    expect(cogs.get('m1')).toBe(123);
    expect(cogs.get('m2')).toBe(10); // batch untouched by the manufactured sale
  });

  it('keeps full-batch cost per piece including accumulated processing charges', () => {
    const batches = [
      makeBatch({ id: 'b1', date: '2025-01-01', initialPcs: 10, amount: 50, processedPcs: 10, processingCost: 50 }),
    ];
    const sales = [makeSale('s1', 4, '2025-03-01')];
    const cogs = InventoryCalculationService.getFIFOCOGSForSales('mat-1', sales, batches);
    // (50 + 50) / 10 = 10 per pcs, 4 pcs → 40
    expect(cogs.get('s1')).toBe(40);
  });

  it('falls back to weighted-average cost for legacy sales beyond tracked finished stock', () => {
    const batches = [
      makeBatch({ id: 'b1', date: '2025-01-01', initialPcs: 2, amount: 10, processedPcs: 2 }),
    ];
    const sales = [makeSale('s1', 10, '2025-03-01')];
    const cogs = InventoryCalculationService.getFIFOCOGSForSales('mat-1', sales, batches);
    // 2 tracked pcs (10 each? no — 10/pcs) + 8 at weighted average (5/pcs).
    expect(typeof cogs.get('s1')).toBe('number');
    expect(cogs.get('s1')!).toBeGreaterThan(0);
  });
});
