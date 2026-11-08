import type {
  Batch,
  FinishedGoodsLot,
  ManufacturingComponentConsumption,
  ManufacturingOrder,
  ManufacturingOrderComponent,
  Product,
  SaleLotAllocation,
} from '../../types/erp';
import { AppError } from '../errorHandler';
import { InventoryCalculationService } from './InventoryCalculationService';
import { perUnitRequirement, roundQty } from './ProductAssemblyService';

/**
 * Manufacturing v4 — the single source of truth for:
 *
 *   BOM snapshot → component draw → finished-goods lot → FIFO sale allocation
 *
 * Everything here is a pure function over plain data (no store, no database),
 * because the live handlers and the boot replay MUST run the same arithmetic.
 * If they ever diverge, a restart would silently resurrect components that a
 * completed manufacturing order already consumed.
 */

export const MANUFACTURING_SCHEMA_VERSION = 4;

/** v4 behaviour is opt-in through the persisted schema version. Legacy test
 *  fixtures and un-migrated data keep the pre-v4 paths untouched. */
export function isManufacturingEnabled(state: { stateSchemaVersion?: number } | null | undefined): boolean {
  return ((state?.stateSchemaVersion ?? 0) >= MANUFACTURING_SCHEMA_VERSION);
}

/**
 * The recipe a manufacturing order should snapshot. A product with an explicit
 * component list uses it; a legacy 1:1 material product is treated as a
 * one-line BOM of 1 × its material. This is what makes "every product — even a
 * 1:1 material product — must be manufactured into FG before sale" true
 * without forcing users to rewrite old product records.
 */
export function productBom(product: Product | undefined): { materialId: string; quantityPerUnit: number }[] {
  if (!product) throw new AppError('Choose a valid product before creating a manufacturing order.');
  const perUnit = perUnitRequirement(product);
  if (perUnit.size === 0 && product.materialId) perUnit.set(product.materialId, 1);
  if (perUnit.size === 0) {
    throw new AppError(`"${product.name}" has no bill of materials. Add at least one component before manufacturing it.`);
  }
  for (const [materialId, qty] of perUnit) {
    if (!(qty > 0)) {
      throw new AppError(`"${product.name}" has an invalid component quantity (${qty}).`);
    }
    void materialId;
  }
  return [...perUnit.entries()].map(([materialId, quantityPerUnit]) => ({ materialId, quantityPerUnit }));
}

/** Freeze the BOM against a planned quantity. Saved once, never recomputed. */
export function snapshotBom(product: Product | undefined, plannedQty: number): ManufacturingOrderComponent[] {
  if (!(plannedQty > 0)) throw new AppError('Planned quantity must be greater than zero.');
  return productBom(product).map(line => ({
    materialId: line.materialId,
    quantityPerUnit: line.quantityPerUnit,
    plannedQuantity: roundQty(line.quantityPerUnit * plannedQty),
  }));
}

export interface ComponentRequirement {
  materialId: string;
  pcs: number;
}

export interface ComponentDraw {
  materialId: string;
  batchId: string;
  pcs: number;
  costPerPiece: number;
  cost: number;
  bucket: 'raw' | 'finished';
}

export interface ComponentConsumptionResult {
  batches: Batch[];
  draws: ComponentDraw[];
  totalCost: number;
  shortage: { materialId: string; required: number; available: number } | null;
}

export interface BuildableLine {
  materialId: string;
  /** Component pcs consumed per ONE finished product. */
  quantityPerUnit: number;
  /** pcs of this material available across active batches (remaining + processed). */
  available: number;
  /** How many finished products this line's stock alone can cover. */
  lineBuildable: number;
}

export interface BuildableResult {
  /** min over all BOM lines of floor(available / quantityPerUnit). 0 when any part is missing. */
  buildable: number;
  /** Line entries in BOM order; used by the UI to show exactly what's short. */
  lines: BuildableLine[];
}

/**
 * How many finished units of `product` the stock can cover right now —
 * the live "Ready to make" number. Pure (no store, no mutation).
 *
 * Mirrors the draw logic of consumeComponentsForManufacturing: pcs available =
 * max(0, remainingPcs) + max(0, processedPcs) across Active batches of the material,
 * raw counts toward FG as well (the draw takes raw pcs first, so they are
 * available stock for assembly).
 */
export function buildableQty(
  product: Product | undefined,
  batches: Batch[],
): BuildableResult {
  const lines = productBom(product);
  const input: BuildableLine[] = lines.map(line => {
    const available = (batches || [])
      .filter(b => b.materialId === line.materialId && b.status === 'Active')
      .reduce((sum, b) => sum + Math.max(0, b.remainingPcs || 0) + Math.max(0, b.processedPcs || 0), 0);
    return {
      materialId: line.materialId,
      quantityPerUnit: line.quantityPerUnit,
      available,
      lineBuildable: line.quantityPerUnit > 0 ? Math.floor(available / line.quantityPerUnit) : 0,
    };
  });
  const buildable = input.length === 0 ? 0 : Math.min(...input.map(l => l.lineBuildable));
  return { buildable: Math.max(0, buildable), lines: input };
}

function availableForManufacturing(batch: Batch): number {
  return Math.max(0, batch.remainingPcs || 0) + Math.max(0, batch.processedPcs || 0);
}

function fifoBatches(batches: Batch[], materialId: string): Batch[] {
  return batches
    .filter(b => b.materialId === materialId && b.status === 'Active')
    .sort((a, b) => {
      const byDate = (a.date || '').localeCompare(b.date || '');
      return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
    });
}

function isBatchEmpty(batch: Batch): boolean {
  return (batch.remainingPcs || 0) <= 1e-9
    && (batch.processedPcs || 0) <= 1e-9
    && (batch.atProcessorPcs || 0) <= 1e-9
    && Object.values(batch.stageAvailableBySource || {}).every(v => (v || 0) <= 1e-9);
}

/**
 * Draw components for an MO completion. Raw pcs are taken before processed pcs
 * inside each batch (the same order the assembled-sale path uses), oldest batch
 * first. Nothing is mutated unless EVERY line can be covered in full.
 */
export function consumeComponentsForManufacturing(
  batches: Batch[],
  requirements: ComponentRequirement[],
): ComponentConsumptionResult {
  const next = batches.map(b => ({ ...b }));

  // Validate the whole plan first — a partial draw would leave stock silently
  // out of step if a later line is short.
  for (const req of requirements) {
    const required = roundQty(req.pcs);
    if (required <= 0) continue;
    const available = next
      .filter(b => b.materialId === req.materialId && b.status === 'Active')
      .reduce((sum, b) => sum + availableForManufacturing(b), 0);
    if (available + 1e-9 < required) {
      return {
        batches,
        draws: [],
        totalCost: 0,
        shortage: { materialId: req.materialId, required, available: roundQty(available) },
      };
    }
  }

  const draws: ComponentDraw[] = [];
  for (const req of requirements) {
    let remaining = roundQty(req.pcs);
    if (remaining <= 0) continue;
    for (const batch of fifoBatches(next, req.materialId)) {
      if (remaining <= 1e-9) break;
      const unitCost = InventoryCalculationService.getBatchCostPerPiece(batch);
      const rawTake = Math.min(Math.max(0, batch.remainingPcs || 0), remaining);
      if (rawTake > 0) {
        batch.remainingPcs = roundQty((batch.remainingPcs || 0) - rawTake);
        remaining = roundQty(remaining - rawTake);
        draws.push({
          materialId: req.materialId,
          batchId: batch.id,
          pcs: rawTake,
          costPerPiece: unitCost,
          cost: roundQty(rawTake * unitCost),
          bucket: 'raw',
        });
      }
      if (remaining <= 1e-9) break;
      const finishedTake = Math.min(Math.max(0, batch.processedPcs || 0), remaining);
      if (finishedTake > 0) {
        batch.processedPcs = roundQty((batch.processedPcs || 0) - finishedTake);
        remaining = roundQty(remaining - finishedTake);
        draws.push({
          materialId: req.materialId,
          batchId: batch.id,
          pcs: finishedTake,
          costPerPiece: unitCost,
          cost: roundQty(finishedTake * unitCost),
          bucket: 'finished',
        });
      }
      if (isBatchEmpty(batch)) batch.status = 'Depleted';
    }
  }

  return {
    batches: next,
    draws,
    totalCost: roundQty(draws.reduce((sum, d) => sum + d.cost, 0)),
    shortage: null,
  };
}

/**
 * Replay recorded MO draws exactly. Delegates to the inventory engine so the
 * live completion path, the boot replay and every edit replay share ONE
 * implementation. (Kept exported here so callers that think in manufacturing
 * terms do not need to reach into the inventory service.)
 */
export function applyManufacturingConsumptions(
  batches: Batch[],
  materialId: string,
  orders: ManufacturingOrder[],
): Batch[] {
  return InventoryCalculationService.applyManufacturingConsumptions(batches, materialId, orders);
}

export interface LotConsumptionResult {
  lots: FinishedGoodsLot[];
  allocations: SaleLotAllocation[];
  cogs: number;
  shortage: { productId: string; required: number; available: number } | null;
}

/** FIFO across a product's active finished-goods lots. Nothing moves on short. */
export function consumeLotsFIFO(
  lots: FinishedGoodsLot[],
  productId: string,
  pcs: number,
): LotConsumptionResult {
  const required = roundQty(pcs);
  if (!(required > 0)) return { lots, allocations: [], cogs: 0, shortage: null };

  const candidates = lots
    .filter(l => l.productId === productId && l.status === 'Active' && (l.pcsRemaining || 0) > 0)
    .sort((a, b) => {
      const byDate = (a.date || '').localeCompare(b.date || '');
      return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
    });
  const available = candidates.reduce((sum, l) => sum + (l.pcsRemaining || 0), 0);
  if (available + 1e-9 < required) {
    return { lots, allocations: [], cogs: 0, shortage: { productId, required, available: roundQty(available) } };
  }

  let remaining = required;
  const takeByLot = new Map<string, number>();
  for (const lot of candidates) {
    if (remaining <= 1e-9) break;
    const take = Math.min(lot.pcsRemaining || 0, remaining);
    if (take <= 0) continue;
    takeByLot.set(lot.id, take);
    remaining = roundQty(remaining - take);
  }

  const allocations: SaleLotAllocation[] = [];
  const next = lots.map(lot => {
    const take = takeByLot.get(lot.id) || 0;
    if (take <= 0) return lot;
    const pcsRemaining = roundQty((lot.pcsRemaining || 0) - take);
    allocations.push({
      lotId: lot.id,
      lotNo: lot.lotNo,
      pcs: take,
      costPerPiece: lot.costPerPiece,
      cost: roundQty(take * lot.costPerPiece),
    });
    return {
      ...lot,
      pcsRemaining,
      status: pcsRemaining <= 1e-9 ? ('Depleted' as const) : lot.status,
    };
  });

  return {
    lots: next,
    allocations,
    cogs: roundQty(allocations.reduce((sum, a) => sum + a.cost, 0)),
    shortage: null,
  };
}

/** Hand a deleted/edited sale's lots back. Never invents a lot. */
export function restoreLotAllocations(
  lots: FinishedGoodsLot[],
  allocations: SaleLotAllocation[] | undefined,
): FinishedGoodsLot[] {
  if (!allocations || allocations.length === 0) return lots;
  const byLot = new Map(allocations.map(a => [a.lotId, a] as const));
  return lots.map(lot => {
    const allocation = byLot.get(lot.id);
    if (!allocation) return lot;
    const pcsRemaining = roundQty((lot.pcsRemaining || 0) + allocation.pcs);
    return {
      ...lot,
      pcsRemaining,
      status: pcsRemaining > 0 ? ('Active' as const) : lot.status,
    };
  });
}

/** pcs currently sellable from a product's lots. */
export function lotStockForProduct(lots: FinishedGoodsLot[], productId: string): number {
  return roundQty(
    lots
      .filter(l => l.productId === productId && l.status === 'Active')
      .reduce((sum, l) => sum + (l.pcsRemaining || 0), 0),
  );
}

/** Weighted average cost of the lots still on hand for one product. */
export function lotAverageCost(lots: FinishedGoodsLot[], productId: string): number {
  const active = lots.filter(l => l.productId === productId && l.status === 'Active' && (l.pcsRemaining || 0) > 0);
  const pcs = active.reduce((sum, l) => sum + (l.pcsRemaining || 0), 0);
  if (pcs <= 0) return 0;
  return active.reduce((sum, l) => sum + l.pcsRemaining * l.costPerPiece, 0) / pcs;
}

/** The cost of an MO: every component draw plus the optional conversion cost. */
export function manufacturingOrderCost(
  consumptions: ManufacturingComponentConsumption[],
  productionCost: number | undefined,
): { materialCost: number; productionCost: number; totalCost: number } {
  const materialCost = roundQty(consumptions.reduce((sum, c) => sum + c.cost, 0));
  const extra = Math.max(0, roundQty(productionCost || 0));
  return { materialCost, productionCost: extra, totalCost: roundQty(materialCost + extra) };
}
