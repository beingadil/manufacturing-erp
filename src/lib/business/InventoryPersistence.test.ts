/**
 * Purchase → stock → restart persistence suite.
 *
 * Proves that every purchase lands under its own material, in the correct
 * bucket, and that this stays true after an application restart (blob
 * serialize → migrateERPState → rehydrate), even with heavy entry volume and
 * even when one material's history is corrupt.
 *
 * Buckets per batch (disjoint by construction):
 *   raw       = remainingPcs
 *   pipeline  = atProcessorPcs + stageAvailableBySource
 *   finished  = processedPcs
 *
 * Ready-made materials (lids/handles/kalsi hardware) are FINISHED at purchase
 * time by definition — live creation, restart replay and sales FIFO all treat
 * them that way.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { InventoryCalculationService } from "./InventoryCalculationService";
import { buildDefaultStages } from "../processing/processingStageSeed";
import { migrateERPState } from "../../store/erpMigration";
import { useERPStore } from "../../store/useERPStore";

function resetState() {
  useERPStore.setState({
    categories: [{ id: "cat-1", name: "Test Category", description: "", status: "Active" }],
    materials: [
      {
        id: "mat-circle", name: "Circle 12.5 Inch", code: "4", categoryId: "cat-1",
        status: "Active", stockPcs: 0, processedStockPcs: 0, atProcessorPcs: 0,
        processingPath: "full_chain",
      },
      {
        id: "mat-handle", name: "Handle", code: "H-1", categoryId: "cat-1",
        status: "Active", stockPcs: 0, processedStockPcs: 0, atProcessorPcs: 0,
        processingPath: "ready_made",
      },
    ],
    processors: [],
    suppliers: [{ id: "s1", name: "Test Supplier", balancePayable: 0 }],
    customers: [],
    products: [],
    purchases: [],
    processingSends: [],
    processingReceipts: [],
    processorBills: [],
    sales: [],
    batches: [],
    inventoryMovements: [],
    accountSubtypes: [],
    accounts: [],
    vouchers: [],
    journalEntries: [],
    processingStages: buildDefaultStages(),
  } as any);
}

/** Serialize only the DATA slices — the rehydration input a restart sees. */
function pickData(s: any) {
  const keys = [
    "categories", "materials", "processors", "suppliers", "customers", "purchases",
    "processingSends", "processingReceipts", "processorBills", "sales",
    "accountSubtypes", "accounts", "vouchers", "journalEntries",
    "batches", "inventoryMovements", "processingStages", "products",
  ];
  const out: any = {};
  for (const k of keys) out[k] = s[k];
  return out;
}

const restart = (s: any) =>
  migrateERPState(JSON.parse(JSON.stringify(pickData(s))));

describe("purchase persistence — counters, replay, per-material isolation", () => {
  beforeEach(() => {
    resetState();
  });

  it("a weight purchase lands in raw stock and survives a restart replay", () => {
    const st = () => useERPStore.getState();
    st().addPurchase({
      supplierId: "s1", materialId: "mat-circle", date: "2026-11-04",
      weight: 1000, weightUnit: "KGs", ratePerUnit: 5, weightPerPiece: 0.5,
    } as any);

    const live = st();
    expect(live.purchases).toHaveLength(1);
    expect(live.purchases[0].calculatedPcs).toBe(2000);
    expect(live.batches.find(b => b.materialId === "mat-circle")!.remainingPcs).toBe(2000);
    expect(live.materials.find(m => m.id === "mat-circle")!.stockPcs).toBe(2000);

    const migrated = restart(live);
    const circle = migrated.materials.find((m: any) => m.id === "mat-circle");
    expect(circle.stockPcs).toBe(2000);
    expect(circle.processedStockPcs).toBe(0);
    expect(migrated.batches.find((b: any) => b.materialId === "mat-circle")!.remainingPcs).toBe(2000);
  });

  it("a ready-made purchase (Handle/Kalsi) lands in finished stock, live and after restart", () => {
    const st = () => useERPStore.getState();
    st().addPurchase({
      supplierId: "s1", materialId: "mat-handle", date: "2026-11-04",
      weight: 0, weightUnit: "KGs", ratePerUnit: 50, weightPerPiece: 0, directPcs: 120,
    } as any);

    const live = st();
    const batch = live.batches.find(b => b.materialId === "mat-handle")!;
    expect(batch.remainingPcs).toBe(0);
    expect(batch.processedPcs).toBe(120);
    expect(live.purchases[0].calculatedPcs).toBe(120);
    expect(live.purchases[0].amount).toBe(6000);
    const mat = live.materials.find(m => m.id === "mat-handle")!;
    expect(mat.stockPcs).toBe(0);
    expect(mat.processedStockPcs).toBe(120);
    expect(live.inventoryMovements.some(m => m.module === "Purchase" && m.transactionType === "IN" && m.quantity === 120)).toBe(true);

    const migrated = restart(live);
    const handleBatch = migrated.batches.find((b: any) => b.materialId === "mat-handle");
    expect(handleBatch.remainingPcs).toBe(0);
    expect(handleBatch.processedPcs).toBe(120);
    const handle = migrated.materials.find((m: any) => m.id === "mat-handle");
    expect(handle.stockPcs).toBe(0);
    expect(handle.processedStockPcs).toBe(120);
    // The stage-value derivation used by the detail page agrees.
    const values = InventoryCalculationService.getMaterialStageValues("mat-handle", migrated.batches);
    expect(values.raw.pcs).toBe(0);
    expect(values.finished.pcs).toBe(120);
  });

  it("a sale of ready-made goods depletes the batch at replay (FIFO from purchase)", () => {
    const st = () => useERPStore.getState();
    st().addPurchase({
      supplierId: "s1", materialId: "mat-handle", date: "2026-11-04",
      weight: 0, weightUnit: "KGs", ratePerUnit: 50, weightPerPiece: 0, directPcs: 120,
    } as any);
    useERPStore.setState({
      products: [{ id: "p-handle", name: "Handle Box", categoryId: "cat-1", materialId: "mat-handle", sku: "HB-1", sellingPrice: 80 }],
      customers: [{ id: "c1", name: "Test Customer", balanceReceivable: 0 }],
    } as any);
    useERPStore.setState({
      sales: [{
        id: "sale-1", invoiceNo: "SINV-TEST-1", customerId: "c1", productId: "p-handle",
        date: "2026-11-05", pcsSold: 30, pricePerPiece: 80, totalAmount: 2400,
      }],
    } as any);

    const migrated = restart(useERPStore.getState());
    const handleBatch = migrated.batches.find((b: any) => b.materialId === "mat-handle");
    expect(handleBatch.processedPcs).toBe(90);
  });

  it("keeps every material in its own buckets across restarts with heavy in/out traffic", () => {
    const st = () => useERPStore.getState();
    // 25 weight purchases (Circle) and 25 ready-made purchases (Handle),
    // different rates and dates per entry.
    for (let i = 0; i < 25; i++) {
      st().addPurchase({
        supplierId: "s1", materialId: "mat-circle", date: `2026-10-${String((i % 27) + 1).padStart(2, "0")}`,
        weight: 400 + (i * 7) % 300, weightUnit: "KGs", ratePerUnit: 4 + (i % 3), weightPerPiece: 0.5,
      } as any);
    }
    for (let i = 0; i < 25; i++) {
      st().addPurchase({
        supplierId: "s1", materialId: "mat-handle", date: `2026-10-${String((i % 27) + 1).padStart(2, "0")}`,
        weight: 0, weightUnit: "KGs", ratePerUnit: 50, weightPerPiece: 0, directPcs: 10 + (i % 9),
      } as any);
    }

    const live = st();
    const circlePurchases = live.purchases.filter(p => p.materialId === "mat-circle");
    const handlePurchases = live.purchases.filter(p => p.materialId === "mat-handle");
    const expectedCirclePcs = circlePurchases.reduce((s, p) => s + p.calculatedPcs, 0);
    const expectedHandlePcs = handlePurchases.reduce((s, p) => s + p.calculatedPcs, 0);
    expect(circlePurchases).toHaveLength(25);
    expect(handlePurchases).toHaveLength(25);
    expect(live.batches.filter(b => b.materialId === "mat-circle")).toHaveLength(25);
    expect(live.batches.filter(b => b.materialId === "mat-handle")).toHaveLength(25);
    expect(live.inventoryMovements).toHaveLength(50);

    // Two consecutive restarts — replay must be idempotent.
    for (let restarted = 0; restarted < 2; restarted++) {
      const migrated = restart(useERPStore.getState());
      expect(migrated.batches).toHaveLength(50);
      expect(migrated.inventoryMovements).toHaveLength(50);
      const circle = migrated.materials.find((m: any) => m.id === "mat-circle");
      const handle = migrated.materials.find((m: any) => m.id === "mat-handle");
      expect(circle.stockPcs).toBe(expectedCirclePcs);
      expect(circle.processedStockPcs).toBe(0);
      expect(handle.stockPcs).toBe(0);
      expect(handle.processedStockPcs).toBe(expectedHandlePcs);
      const circleValues = InventoryCalculationService.getMaterialStageValues("mat-circle", migrated.batches);
      const handleValues = InventoryCalculationService.getMaterialStageValues("mat-handle", migrated.batches);
      expect(circleValues.raw.pcs).toBe(expectedCirclePcs);
      expect(handleValues.raw.pcs).toBe(0);
      expect(handleValues.finished.pcs).toBe(expectedHandlePcs);
      // Persist the rehydrated state and restart AGAIN from it.
      useERPStore.setState(migrated as any);
    }
  });

  it("a corrupt batch record never aborts rehydration — other entries still derive", () => {
    const st = () => useERPStore.getState();
    st().addPurchase({
      supplierId: "s1", materialId: "mat-circle", date: "2026-11-04",
      weight: 100, weightUnit: "KGs", ratePerUnit: 5, weightPerPiece: 0.5,
    } as any);
    st().addPurchase({
      supplierId: "s1", materialId: "mat-handle", date: "2026-11-04",
      weight: 0, weightUnit: "KGs", ratePerUnit: 50, weightPerPiece: 0, directPcs: 42,
    } as any);

    const data = pickData(useERPStore.getState());
    // Corrupt ONE record: the replay sorts batches by date — a missing date
    // throws inside that material's replay. It must be contained there.
    const batches = data.batches.map((b: any) =>
      b.materialId === "mat-circle" ? { ...b, date: undefined } : b
    );

    const migrated = migrateERPState({ ...data, batches } as any);
    // No throw; everything else is intact and the handle material still derives.
    expect(migrated.materials.some((m: any) => m.id === "mat-circle")).toBe(true);
    expect(migrated.batches.some((b: any) => b.materialId === "mat-circle")).toBe(true);
    const handle = migrated.materials.find((m: any) => m.id === "mat-handle");
    expect(handle.processedStockPcs).toBe(42);
    expect(migrated.inventoryMovements).toHaveLength(2);
  });
});
