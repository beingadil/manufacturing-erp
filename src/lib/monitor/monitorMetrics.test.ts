import { describe, expect, it } from 'vitest';
import {
  deltaFraction,
  purchaseTotal,
  saleTotal,
  seriesForRange,
  sumInRange,
} from './monitorMetrics';
import { buildRange, customRange } from './monitorRange';

const NOW = new Date(2026, 10, 10); // 10 Nov 2026

const sales: Array<{ date: string; totalAmount: number }> = [
  { date: '2026-11-10', totalAmount: 1000 },
  { date: '2026-11-10', totalAmount: 500 },
  { date: '2026-11-05', totalAmount: 200 },
  { date: '2026-10-20', totalAmount: 999 },
];

const purchases: Array<{ date: string; weight: number; ratePerUnit: number }> = [
  { date: '2026-11-10', weight: 10, ratePerUnit: 5 }, // 50
  { date: '2026-11-03', weight: 100, ratePerUnit: 2 }, // 200
  { date: '2026-09-01', weight: 500, ratePerUnit: 1 }, // 500 (outside)
];

describe('monitorMetrics', () => {
  it('saleTotal and purchaseTotal compute raw figures', () => {
    expect(sales.map(saleTotal)).toEqual([1000, 500, 200, 999]);
    expect(purchaseTotal(purchases[0])).toBe(50);
  });

  it('sumInRange sums only rows inside the window', () => {
    expect(sumInRange(sales, saleTotal, '2026-11-01', '2026-11-10')).toBe(1700);
    expect(sumInRange(sales, saleTotal, '2026-11-10', '2026-11-10')).toBe(1500);
    expect(sumInRange(purchases, purchaseTotal, '2026-11-01', '2026-11-10')).toBe(250);
    expect(sumInRange(undefined as typeof sales | undefined, saleTotal, '2026-11-01', '2026-11-10')).toBe(0);
  });

  it('deltaFraction handles normal and zero-prior cases', () => {
    expect(deltaFraction(150, 100)).toBeCloseTo(0.5);
    expect(deltaFraction(100, 100)).toBe(0);
    expect(deltaFraction(50, 100)).toBe(-0.5);
    expect(deltaFraction(10, 0)).toBeNull();
  });

  it('seriesForRange buckets sales and purchases per day for a 7d range', () => {
    const r = buildRange('7d', NOW);
    const series = seriesForRange(sales, purchases, r);
    expect(series).toHaveLength(7);
    const nov10 = series.find(p => p.key === '2026-11-10');
    expect(nov10?.revenue).toBe(1500);
    expect(nov10?.purchase).toBe(50);
    // Nov 3 is before the 7d window (Nov 4–10), so it is not bucketed.
    expect(series.find(p => p.key === '2026-11-03')).toBeUndefined();
  });

  it('seriesForRange buckets by month for a long custom range', () => {
    const r = customRange('2026-08-01', '2026-11-10')!;
    expect(r.granularity).toBe('month');
    const series = seriesForRange(sales, purchases, r);
    const nov = series.find(p => p.key === '2026-11');
    expect(nov?.revenue).toBe(1700);
    expect(nov?.purchase).toBe(250);
    const sep = series.find(p => p.key === '2026-09');
    expect(sep?.purchase).toBe(500);
    expect(sep?.revenue).toBe(0);
  });
});
