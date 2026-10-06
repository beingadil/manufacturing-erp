import type { Batch, Product, ProductComponent, RawMaterial } from '../../types/erp';

/**
 * Product assembly — the single place that answers:
 *
 *     "Selling N of this product takes how much of which material?"
 *
 * This is the whole engine behind the sale screen. It is deliberately NOT a
 * module of its own and NOT reachable from anywhere else: the Product form
 * writes the component list, the Sale screen reads the breakdown it produces,
 * and nothing between them can disagree.
 *
 * Like InventoryCalculationService this is pure functions over plain data — no
 * store, no database, no Electron — so it is testable on its own and can never
 * read a stale copy of anything.
 */

/** Floating point tolerance. Quantities come from real measurements, so exact
 *  equality is wrong; 1e-9 is far below any real quantity. */
const EPSILON = 1e-9;

/** Round so display and arithmetic agree. These are counts and weights, not
 *  currency, so 6 dp is plenty. */
export function roundQty(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

/** Stock and cost for one material, supplied by the caller. */
export interface MaterialAvailability {
  materialId: string;
  /** Pieces on hand that this sale may draw down. */
  availablePcs: number;
  /** Purchase cost per piece, used to value the stock leaving. */
  unitCost: number;
}

/** One line of a "what will this sale consume" calculation. */
export interface ComponentLine {
  materialId: string;
  /** How many of this material ONE product takes. */
  perUnitQty: number;
  /** perUnitQty × quantity sold. */
  requiredQty: number;
  availablePcs: number;
  /** requiredQty − availablePcs. Positive means short. */
  shortageQty: number;
  unitCost: number;
  /** requiredQty × unitCost — the stock value leaving the business. */
  valueOut: number;
}

/** The full answer for one sale. */
export interface AssemblyBreakdown {
  productId: string;
  pcsSold: number;
  lines: ComponentLine[];
  /** Lines that are short, worst first. */
  shortfalls: ComponentLine[];
  /** True only when EVERY material has enough stock. */
  canFulfil: boolean;
  /** Purchase value of the stock this sale consumes — its cost of goods. */
  totalCost: number;
}

/** A product is only "made from several materials" if it actually lists some. */
export function isAssembled(product: Pick<Product, 'usageType' | 'components'>): boolean {
  return product.usageType === 'assembled' && (product.components?.length ?? 0) > 0;
}

/**
 * Collapse the component list into "how much of each material does ONE unit
 * take". Repeated materials are summed rather than rejected — a user who adds
 * the same material twice means one line of double quantity, not an error.
 */
export function perUnitRequirement(
  product: Pick<Product, 'components'>,
): Map<string, number> {
  const perUnit = new Map<string, number>();
  for (const c of product.components ?? []) {
    if (!c?.materialId) continue;
    const previous = perUnit.get(c.materialId) ?? 0;
    perUnit.set(c.materialId, roundQty(previous + (c.quantity || 0)));
  }
  return perUnit;
}

/**
 * What selling `pcsSold` of this product consumes, and whether stock covers it.
 *
 * A product with no components is a normal single-material product and yields
 * NO lines — the caller sells it from its own finished stock exactly as before,
 * so this function must not invent a component for it.
 */
export function breakdownForSale(
  product: Pick<Product, 'id' | 'usageType' | 'components'>,
  pcsSold: number,
  availability: MaterialAvailability[],
): AssemblyBreakdown {
  const perUnit = perUnitRequirement(product);
  const availableByMaterial = new Map(
    availability.map(a => [a.materialId, a] as const),
  );

  const lines: ComponentLine[] = [...perUnit.entries()].map(([materialId, perUnitQty]) => {
    const entry = availableByMaterial.get(materialId);
    const availablePcs = entry?.availablePcs ?? 0;
    const unitCost = entry?.unitCost ?? 0;
    const requiredQty = roundQty(perUnitQty * pcsSold);
    return {
      materialId,
      perUnitQty,
      requiredQty,
      availablePcs,
      shortageQty: roundQty(Math.max(0, requiredQty - availablePcs)),
      unitCost,
      valueOut: roundQty(requiredQty * unitCost),
    };
  });

  const shortfalls = lines
    .filter(l => l.shortageQty > EPSILON)
    .sort((a, b) => b.shortageQty - a.shortageQty);

  return {
    productId: product.id,
    pcsSold,
    lines,
    shortfalls,
    canFulfil: shortfalls.length === 0,
    totalCost: roundQty(lines.reduce((sum, l) => sum + l.valueOut, 0)),
  };
}

/**
 * A one-line explanation of what is missing, for the sale screen.
 * Returns null when the sale can go ahead — a sale must never be blocked by a
 * message it does not need.
 */
export function shortfallMessage(
  breakdown: AssemblyBreakdown,
  nameOf: (materialId: string) => string,
): string | null {
  if (breakdown.canFulfil) return null;
  const parts = breakdown.shortfalls.map(
    l =>
      `${nameOf(l.materialId)}: need ${l.requiredQty}, ` +
      `have ${l.availablePcs}, short ${l.shortageQty}`,
  );
  return `Not enough stock — ${parts.join('; ')}`;
}

/** A part this sale CAN pay for, but which will be left nearly empty. */
export interface RunningLowLine {
  materialId: string;
  requiredQty: number;
  availablePcs: number;
  /** What will be left on hand once this invoice is saved. */
  remainingAfter: number;
  /** The shop's low-stock line, echoed so the UI can explain itself. */
  threshold: number;
}

/**
 * Parts that will drop to or below the shop's low-stock line after this sale.
 *
 * This is a heads-up, NOT a refusal: these parts cover the quantity required,
 * so the sale is perfectly valid — it just leaves the shop close to running
 * out. Anything already short is excluded, because that case is reported by
 * shortfallMessage() instead and must not be softened into a warning.
 */
export function runningLowAfterSale(
  breakdown: AssemblyBreakdown,
  threshold: number,
): RunningLowLine[] {
  if (!(threshold > 0)) return [];

  const low = breakdown.lines
    .filter(l => l.shortageQty <= 0)
    .map(l => ({
      materialId: l.materialId,
      requiredQty: l.requiredQty,
      availablePcs: l.availablePcs,
      remainingAfter: roundQty(l.availablePcs - l.requiredQty),
      threshold,
    }))
    .filter(l => l.remainingAfter <= l.threshold);

  // Closest to empty first — that is the part worth buying today.
  return low.sort((a, b) => a.remainingAfter - b.remainingAfter);
}

/** Floating point tolerance, kept identical to the consumption check. */
const TOLERANCE = 1e-9;

/**
 * Order batches the way a FIFO draw would: oldest first, with a stable id tie
 * break so the same trail always replays the same way.
 */
function fifoOrder(batches: Batch[]): Batch[] {
  return [...batches].sort((a, b) => {
    const at = a.date ?? '';
    const bt = b.date ?? '';
    if (at !== bt) return at < bt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

/** Pieces of one material a caller may draw down. Mirrors the sale path. */
function availableOn(batch: Batch): number {
  return Math.max(0, batch.remainingPcs || 0);
}

/**
 * Take `qty` pieces of `materialId` off raw stock, oldest batch first.
 *
 * Returns the rewritten batches plus the shortfall, and touches NOTHING when
 * the material cannot cover `qty` in full — a partially applied component
 * deduction is exactly the silent stock drift this engine exists to prevent.
 * The caller decides whether a non-zero `shortage` is an error.
 */
export function consumeComponentStock(
  batches: Batch[],
  materialId: string,
  qty: number,
): { batches: Batch[]; consumed: number; shortage: number } {
  const target = roundQty(qty);
  if (target <= TOLERANCE) return { batches, consumed: 0, shortage: 0 };

  const available = batches
    .filter(b => b.materialId === materialId && b.status === 'Active')
    .reduce((sum, b) => sum + availableOn(b), 0);
  if (available + TOLERANCE < target) {
    return { batches, consumed: 0, shortage: roundQty(target - available) };
  }

  const next = batches.map(b => ({ ...b }));
  let consumed = 0;
  for (const b of fifoOrder(next)) {
    if (consumed >= target - TOLERANCE) break;
    if (b.materialId !== materialId || b.status !== 'Active') continue;
    const availableHere = availableOn(b);
    if (availableHere <= TOLERANCE) continue;
    const take = Math.min(availableHere, target - consumed);
    b.remainingPcs = roundQty(b.remainingPcs - take);
    if (b.remainingPcs <= TOLERANCE) b.status = 'Depleted';
    consumed = roundQty(consumed + take);
  }
  return { batches: next, consumed, shortage: 0 };
}

/**
 * Put `qty` pieces of `materialId` back onto raw stock.
 *
 * The reversal of a FIFO draw, in reverse sense: a batch the sale emptied is
 * refilled first (that is where the stock physically was), then the oldest
 * still-active batch absorbs anything left over. Without the Depleted-first
 * rule a deleted sale would resurrect stock in the wrong place and the weighted
 * average cost of the material would drift away from its real purchase history.
 */
export function restoreComponentStock(
  batches: Batch[],
  materialId: string,
  qty: number,
): Batch[] {
  const target = roundQty(qty);
  if (target <= TOLERANCE) return batches;

  const mine = fifoOrder(batches.filter(b => b.materialId === materialId));
  const next = batches.map(b => ({ ...b }));
  const byId = new Map(next.map(b => [b.id, b] as const));

  let remaining = target;
  for (const b of [...mine.filter(x => x.status === 'Depleted'), ...mine.filter(x => x.status !== 'Depleted')]) {
    if (remaining <= TOLERANCE) break;
    const live = byId.get(b.id);
    if (!live) continue;
    const room = live.initialPcs != null
      ? Math.max(0, live.initialPcs - availableOn(live))
      : Number.POSITIVE_INFINITY;
    if (room <= TOLERANCE) continue;
    const put = Math.min(room, remaining);
    live.remainingPcs = roundQty((live.remainingPcs || 0) + put);
    if (live.status === 'Depleted') live.status = 'Active';
    remaining = roundQty(remaining - put);
  }
  return next;
}

/**
 * Reject a component list that could never produce a sellable product.
 *
 * A component with no quantity, a non-positive quantity, or a broken material
 * reference would all produce a sale that silently deducts the wrong amount, so
 * they are refused at the point of saving instead.
 */
export function validateComponents(components: ProductComponent[]): void {
  if (components.length === 0) {
    throw new Error('Pick at least one material this product is made from');
  }
  const seen = new Set<string>();
  for (const c of components) {
    if (!c.materialId) {
      throw new Error('Every component must reference a material');
    }
    if (seen.has(c.materialId)) {
      throw new Error('The same material is listed twice — merge the quantities instead.');
    }
    seen.add(c.materialId);
    if (!(c.quantity > 0)) {
      throw new Error('Every component needs a quantity greater than zero');
    }
  }
}

/**
 * The `No.` a material already answers to, ignoring case and surrounding
 * spaces — "4 No", " 4 no " and "4 NO" are the same designation on the shop
 * floor, so they must not be allowed to sit on two different materials.
 *
 * A blank `No.` is never a conflict: most materials predate the field and have
 * none, and "no number" may legitimately apply to any number of them.
 *
 * @param excludeId the material being edited, so saving without changing the
 *   `No.` is not mistaken for a duplicate of itself.
 * @returns the name of the material already holding this `No.`, else null.
 */
export function findMaterialCodeConflict(
  materials: readonly Pick<RawMaterial, 'id' | 'name' | 'code'>[],
  code: string | undefined,
  excludeId?: string,
): string | null {
  const wanted = (code ?? '').trim().toLowerCase();
  if (!wanted) return null;
  const clash = materials.find(
    m => m.id !== excludeId && (m.code ?? '').trim().toLowerCase() === wanted,
  );
  return clash ? clash.name : null;
}