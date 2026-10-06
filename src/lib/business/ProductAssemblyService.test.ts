import { describe, expect, it } from 'vitest';
import {
  breakdownForSale,
  isAssembled,
  perUnitRequirement,
  roundQty,
  runningLowAfterSale,
  shortfallMessage,
  validateComponents,
  type MaterialAvailability,
} from './ProductAssemblyService';
import type { Product } from '../../types/erp';

/**
 * The engine behind the sale screen: "selling N of this product takes how much
 * of which material?"
 *
 * These pin the worked example from the shop — a Jug made from Circle 12½ Inch,
 * No. 4 No and a Handle — plus the cases that would otherwise quietly deduct
 * the wrong amount from stock.
 */

const CIRCLE = 'mat-circle';
const NO4 = 'mat-no4';
const HANDLE = 'mat-handle';

function assembled(components: Product['components']): Product {
  return { id: 'p-jug', name: 'Jug', sellingPrice: 0, usageType: 'assembled', components };
}

/** A jug = one circle + one no.4 + one handle. */
const JUG: Product = assembled([
  { materialId: CIRCLE, quantity: 1 },
  { materialId: NO4, quantity: 1 },
  { materialId: HANDLE, quantity: 1 },
]);

const names = (ids: Record<string, string>) => (id: string) => ids[id] ?? 'Unknown material';

describe('roundQty', () => {
  it('trims float noise without losing real precision', () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
    expect(roundQty(2.0000001)).toBe(2);
    expect(roundQty(1.2345678)).toBe(1.234568);
  });
});

describe('isAssembled', () => {
  it('is true only when a product actually lists components', () => {
    expect(isAssembled(JUG)).toBe(true);
    expect(isAssembled(assembled([]))).toBe(false);
    expect(isAssembled(assembled(undefined))).toBe(false);
  });

  it('is false for a plain single-material product', () => {
    expect(isAssembled({ id: 'p', name: 'Sheet', sellingPrice: 0, usageType: 'simple', materialId: 'm' })).toBe(false);
    // Pre-existing products have no usageType at all and must behave as before.
    expect(isAssembled({ id: 'p', name: 'Sheet', sellingPrice: 0, materialId: 'm' })).toBe(false);
  });
});

describe('perUnitRequirement', () => {
  it('reads the component list as one unit needs', () => {
    expect(perUnitRequirement(JUG)).toEqual(
      new Map([[CIRCLE, 1], [NO4, 1], [HANDLE, 1]]),
    );
  });

  it('sums a material listed twice rather than losing one of the lines', () => {
    const p = assembled([
      { materialId: CIRCLE, quantity: 2 },
      { materialId: CIRCLE, quantity: 3 },
    ]);
    expect(perUnitRequirement(p).get(CIRCLE)).toBe(5);
  });

  it('is empty for a product with no components', () => {
    expect(perUnitRequirement({ components: undefined }).size).toBe(0);
  });
});

describe('breakdownForSale', () => {
  const stock: MaterialAvailability[] = [
    { materialId: CIRCLE, availablePcs: 100, unitCost: 80 },
    { materialId: NO4, availablePcs: 100, unitCost: 20 },
    { materialId: HANDLE, availablePcs: 100, unitCost: 50 },
  ];

  it('multiplies the per-unit list by the quantity sold', () => {
    const b = breakdownForSale(JUG, 10, stock);
    expect(b.lines.map(l => [l.materialId, l.requiredQty])).toEqual([
      [CIRCLE, 10], [NO4, 10], [HANDLE, 10],
    ]);
    expect(b.canFulfil).toBe(true);
  });

  it('values what leaves stock at each material\'s own purchase cost', () => {
    const b = breakdownForSale(JUG, 1, stock);
    expect(b.totalCost).toBe(150); // 80 + 20 + 50
    expect(b.lines.find(l => l.materialId === CIRCLE)!.valueOut).toBe(80);
  });

  it('honours a multi-piece part (2 handles per jug)', () => {
    const p = assembled([{ materialId: CIRCLE, quantity: 1 }, { materialId: HANDLE, quantity: 2 }]);
    const b = breakdownForSale(p, 5, stock);
    expect(b.lines.find(l => l.materialId === HANDLE)!.requiredQty).toBe(10);
  });

  it('flags exactly the material that is short, worst first', () => {
    const b = breakdownForSale(JUG, 10, [
      { materialId: CIRCLE, availablePcs: 4, unitCost: 80 },  // short 6
      { materialId: NO4, availablePcs: 100, unitCost: 20 },
      { materialId: HANDLE, availablePcs: 8, unitCost: 50 },  // short 2
    ]);
    expect(b.canFulfil).toBe(false);
    expect(b.shortfalls.map(s => s.materialId)).toEqual([CIRCLE, HANDLE]);
    expect(b.shortfalls[0].shortageQty).toBe(6);
  });

  it('treats a material with no stock record at all as zero, not as unlimited', () => {
    const b = breakdownForSale(JUG, 1, []);
    expect(b.canFulfil).toBe(false);
    expect(b.shortfalls).toHaveLength(3);
    expect(b.totalCost).toBe(0);
  });

  it('produces no lines for a single-material product, so the normal path is untouched', () => {
    const b = breakdownForSale(
      { id: 'p', name: 'Sheet', sellingPrice: 0, usageType: 'simple', materialId: 'm' },
      5, stock,
    );
    expect(b.lines).toEqual([]);
    expect(b.canFulfil).toBe(true);
    expect(b.totalCost).toBe(0);
  });
});

describe('shortfallMessage', () => {
  const stock: MaterialAvailability[] = [
    { materialId: CIRCLE, availablePcs: 0, unitCost: 80 },
    { materialId: NO4, availablePcs: 5, unitCost: 20 },
  ];

  it('says nothing when the sale can go ahead', () => {
    const b = breakdownForSale(assembled([{ materialId: NO4, quantity: 1 }]), 3, stock);
    expect(shortfallMessage(b, names({}))).toBeNull();
  });

  it('names the material, not its id', () => {
    const b = breakdownForSale(assembled([{ materialId: CIRCLE, quantity: 2 }]), 1, stock);
    const msg = shortfallMessage(b, names({ [CIRCLE]: 'Circle 12½ Inch', [NO4]: 'No. 4 No' }))!;
    expect(msg).toContain('Circle 12½ Inch');
    expect(msg).toContain('need 2');
    expect(msg).toContain('have 0');
    expect(msg).not.toContain(CIRCLE); // never leak the raw id
  });
});

describe('validateComponents', () => {
  it('accepts a normal list', () => {
    expect(() => validateComponents([{ materialId: CIRCLE, quantity: 1 }])).not.toThrow();
  });

  it('refuses an empty list', () => {
    expect(() => validateComponents([])).toThrow(/at least one material/i);
  });

  it('refuses a line with no material', () => {
    expect(() => validateComponents([{ materialId: '', quantity: 1 }])).toThrow(/reference a material/i);
  });

  it('refuses the same material twice', () => {
    expect(() => validateComponents([
      { materialId: CIRCLE, quantity: 1 },
      { materialId: CIRCLE, quantity: 2 },
    ])).toThrow(/listed twice/i);
  });

  it('refuses a zero or negative quantity', () => {
    expect(() => validateComponents([{ materialId: CIRCLE, quantity: 0 }])).toThrow(/greater than zero/i);
    expect(() => validateComponents([{ materialId: CIRCLE, quantity: -1 }])).toThrow(/greater than zero/i);
  });
});
describe('runningLowAfterSale', () => {
  // The warning that appears BEFORE saving: "this sale is fine, but afterwards
  // you will be nearly out of these parts."
  const stock = (entries: Record<string, number>): MaterialAvailability[] =>
    Object.entries(entries).map(([materialId, availablePcs]) => ({
      materialId, availablePcs, unitCost: 10,
    }));

  it('stays quiet when every part is comfortably left over', () => {
    const b = breakdownForSale(JUG, 1, stock({ [CIRCLE]: 100, [NO4]: 100, [HANDLE]: 100 }));
    expect(runningLowAfterSale(b, 20)).toEqual([]);
  });

  it('flags a part that lands exactly on the low-stock line', () => {
    const b = breakdownForSale(
      assembled([{ materialId: CIRCLE, quantity: 1 }]), 5, stock({ [CIRCLE]: 25 }),
    );
    expect(runningLowAfterSale(b, 20)).toEqual([
      { materialId: CIRCLE, requiredQty: 5, availablePcs: 25, remainingAfter: 20, threshold: 20 },
    ]);
  });

  it('flags a part that lands below the line', () => {
    const b = breakdownForSale(
      assembled([{ materialId: HANDLE, quantity: 1 }]), 8, stock({ [HANDLE]: 10 }),
    );
    expect(runningLowAfterSale(b, 20)[0].remainingAfter).toBe(2);
  });

  it('lists the part closest to empty first, and skips the parts with plenty left', () => {
    // Selling 1 jug leaves: circle 20 (on the line), no.4 99 (fine), handle 14.
    const b = breakdownForSale(JUG, 1, stock({ [CIRCLE]: 21, [NO4]: 100, [HANDLE]: 15 }));
    expect(runningLowAfterSale(b, 20).map(l => l.materialId)).toEqual([HANDLE, CIRCLE]);
  });

  it('never softens a genuine shortfall into a warning', () => {
    // Circle cannot cover it at all — that is shortfallMessage()'s job, and the
    // sale is blocked, so a "running low" line here would be actively wrong.
    const b = breakdownForSale(JUG, 1, stock({ [CIRCLE]: 0, [NO4]: 100, [HANDLE]: 100 }));
    expect(b.canFulfil).toBe(false);
    expect(runningLowAfterSale(b, 20)).toEqual([]);
  });

  it('ignores a threshold of zero or less, rather than warning about everything', () => {
    const b = breakdownForSale(JUG, 1, stock({ [CIRCLE]: 1, [NO4]: 1, [HANDLE]: 1 }));
    expect(runningLowAfterSale(b, 0)).toEqual([]);
    expect(runningLowAfterSale(b, -5)).toEqual([]);
  });

  it('warns when the sale leaves stock at exactly zero', () => {
    const b = breakdownForSale(assembled([{ materialId: CIRCLE, quantity: 10 }]), 1, stock({ [CIRCLE]: 10 }));
    expect(runningLowAfterSale(b, 20)[0].remainingAfter).toBe(0);
  });

  it('says nothing for a single-material product', () => {
    const b = breakdownForSale(
      { id: 'p', name: 'Sheet', sellingPrice: 0, usageType: 'simple', materialId: CIRCLE }, 5, stock({ [CIRCLE]: 1 }),
    );
    expect(runningLowAfterSale(b, 20)).toEqual([]);
  });
});
