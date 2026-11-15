// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// Same jsdom shim approach as SQLiteStorageAdapter.restore.test.ts
class MemoryStorage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(String(key)) ? this.store.get(String(key))! : null; }
  key(index: number) { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string) { this.store.delete(String(key)); }
  setItem(key: string, value: string) { this.store.set(String(key), String(value)); }
}

const kvTable = new Map<string, { value: string }>();

function makeMockElectronDB() {
  return {
    initialize: vi.fn().mockResolvedValue({ success: true }),
    query: vi.fn().mockResolvedValue({ success: true, data: [] }),
    queryOne: vi.fn(async (req: any) => {
      const row = kvTable.get(req.params?.[0]);
      return { success: true, data: row ? { ...row } : null };
    }),
    execute: vi.fn(async (req: any) => {
      const sql: string = req.sql || "";
      const params: any[] = req.params || [];
      if (sql.includes("INSERT") || sql.includes("ON CONFLICT")) {
        kvTable.set(params[0], { value: params[1] });
      } else if (sql.includes("DELETE")) {
        kvTable.delete(params[0]);
      }
      return { success: true, data: { changes: 1, lastInsertRowid: 1 } };
    }),
    transaction: vi.fn().mockResolvedValue({ success: true, data: [] }),
    close: vi.fn().mockResolvedValue({ success: true }),
  };
}

describe("SQLiteStorageAdapter write suspension", () => {
  beforeEach(() => {
    (globalThis as any).localStorage = new MemoryStorage();
    (window as any).localStorage = (globalThis as any).localStorage;
    localStorage.clear();
    kvTable.clear();
    (window as any).electronDB = makeMockElectronDB();
    vi.resetModules();
  });

  it("suspended setItem writes neither to SQLite nor to the localStorage mirror", async () => {
    const { dbService } = await import("../DatabaseService");
    await dbService.initialize();
    const adapter = await import("./SQLiteStorageAdapter");

    adapter.suspendStorageWrites();
    await adapter.SQLiteStorageAdapter.setItem("erp-storage", "stale-state");

    expect(kvTable.has("erp-storage")).toBe(false);
    expect(localStorage.getItem("erp-storage")).toBeNull();

    adapter.resumeStorageWrites();
    await adapter.SQLiteStorageAdapter.setItem("erp-storage", "fresh-state");
    expect(kvTable.get("erp-storage")!.value).toBe("fresh-state");
  });

  it("suspended removeItem deletes neither the SQLite row nor the mirror", async () => {
    const { dbService } = await import("../DatabaseService");
    await dbService.initialize();
    const adapter = await import("./SQLiteStorageAdapter");

    await adapter.SQLiteStorageAdapter.setItem("erp-settings", "real-settings");
    expect(kvTable.has("erp-settings")).toBe(true);

    adapter.suspendStorageWrites();
    await adapter.SQLiteStorageAdapter.removeItem("erp-settings");
    expect(kvTable.has("erp-settings")).toBe(true);
    expect(localStorage.getItem("erp-settings")).not.toBeNull();

    adapter.resumeStorageWrites();
    await adapter.SQLiteStorageAdapter.removeItem("erp-settings");
    expect(kvTable.has("erp-settings")).toBe(false);
    expect(localStorage.getItem("erp-settings")).toBeNull();
  });

  it("clearStorageMirrors() suspends writes so pre-restore state cannot be persisted back", async () => {
    const { dbService } = await import("../DatabaseService");
    await dbService.initialize();
    const adapter = await import("./SQLiteStorageAdapter");

    await adapter.SQLiteStorageAdapter.setItem("erp-storage", "pre-restore-state");
    adapter.clearStorageMirrors();
    // Simulate a stray in-memory setState firing before the reload lands.
    await adapter.SQLiteStorageAdapter.setItem("erp-storage", "stale-in-memory-state");

    expect(kvTable.get("erp-storage")!.value).toBe("pre-restore-state");
    expect(localStorage.getItem("erp-storage")).toBeNull();
  });

  it("getItem is NOT suspended — restores remain readable during the blocked window", async () => {
    const { dbService } = await import("../DatabaseService");
    await dbService.initialize();
    const adapter = await import("./SQLiteStorageAdapter");

    kvTable.set("erp-storage", { value: "restored-state" });
    adapter.suspendStorageWrites();
    const got = await adapter.SQLiteStorageAdapter.getItem("erp-storage");
    expect(got).toBe("restored-state");
  });
});
