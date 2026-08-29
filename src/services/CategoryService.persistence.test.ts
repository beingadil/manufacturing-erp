import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * End-to-end persistence test for the Category edit path.
 *
 * Proves the full production chain the InlineEditInput fix depends on:
 *
 *   CategoryService.update(id, data)
 *     → useERPStore.updateCategory() → set()
 *     → zustand persist middleware (name: 'erp-storage', skipHydration)
 *     → SQLiteStorageAdapter.setItem()
 *     → key_value_store UPSERT via BetterSQLite3Adapter → window.electronDB
 *
 * Then simulates an app restart the same way main.tsx bootstrap() does:
 * read the blob back with SQLiteStorageAdapter.getItem(), JSON.parse it,
 * and useERPStore.setState(parsed.state || parsed).
 *
 * The real SQLite is replaced with an in-memory key_value_store table behind
 * a mock window.electronDB so no native module is needed under vitest/jsdom.
 */

// In-memory stand-in for the SQLite key_value_store table.
const kvTable = new Map<string, { value: string; updated_at: string }>();

function makeMockElectronDB() {
  return {
    initialize: vi.fn().mockResolvedValue({ success: true }),
    query: vi.fn().mockResolvedValue({ success: true, data: [] }),
    queryOne: vi.fn(async (req: any) => {
      const sql: string = req.sql || "";
      if (sql.includes("key_value_store") && sql.includes("WHERE key")) {
        const key = req.params?.[0];
        const row = kvTable.get(key);
        return { success: true, data: row ? { ...row } : null };
      }
      return { success: true, data: null };
    }),
    execute: vi.fn(async (req: any) => {
      const sql: string = req.sql || "";
      const params: any[] = req.params || [];
      if (sql.includes("key_value_store")) {
        if (sql.includes("INSERT") || sql.includes("ON CONFLICT")) {
          const [key, value] = params;
          // SQLite CURRENT_TIMESTAMP format: 'YYYY-MM-DD HH:MM:SS' (UTC),
          // so SQLiteStorageAdapter's parseSqliteTimestamp resolves it and
          // prefers the SQLite row over the localStorage mirror.
          kvTable.set(key, {
            value,
            updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
          });
        } else if (sql.includes("DELETE")) {
          kvTable.delete(params[0]);
        }
      }
      return { success: true, data: { changes: 1, lastInsertRowid: 1 } };
    }),
    transaction: vi.fn().mockResolvedValue({ success: true, data: [] }),
    close: vi.fn().mockResolvedValue({ success: true }),
  };
}

describe("CategoryService persistence (end-to-end)", () => {
  beforeAll(() => {
    // Must be set BEFORE importing DatabaseService — its constructor picks
    // BetterSQLite3Adapter only when window.electronDB exists at construction.
    (window as any).electronDB = makeMockElectronDB();
  });

  afterEach(() => {
    kvTable.clear();
  });

  it("persists a category edit through SQLite and survives a simulated restart", async () => {
    // ---- Session 1: create + edit (fresh module registry = fresh process) ----
    vi.resetModules();
    const { dbService } = await import("../database/DatabaseService");
    await dbService.initialize();

    const { useERPStore } = await import("../store/useERPStore");
    const { CategoryService } = await import("./CategoryService");

    const id = CategoryService.create({
      name: "Steel",
      description: "raw sheet steel",
      status: "Active",
      type: "material",
    });

    // The UI fix this guards: inline edit → CategoryService.update
    CategoryService.update(id, { name: "Steel Edited" });

    // Live store reflects the edit immediately.
    expect(useERPStore.getState().categories.find((c) => c.id === id)?.name).toBe("Steel Edited");

    // Wait for the async persist write to land in the mock SQLite table with
    // the EDITED value (the first create write is superseded by the update).
    await vi.waitFor(() => {
      const blob = kvTable.get("erp-storage");
      expect(blob).toBeDefined();
      const parsed = JSON.parse(blob!.value);
      const state = parsed.state || parsed;
      expect(state.categories.some((c: any) => c.id === id && c.name === "Steel Edited")).toBe(true);
    });

    // ---- Session 2: simulated restart, rehydrated exactly like main.tsx ----
    vi.resetModules();
    const { dbService: freshDb } = await import("../database/DatabaseService");
    await freshDb.initialize();

    const { SQLiteStorageAdapter } = await import("../database/sqlite/SQLiteStorageAdapter");
    const { useERPStore: freshStore } = await import("../store/useERPStore");

    // Fresh store boots with empty state (skipHydration: true — nothing auto-reads).
    expect(freshStore.getState().categories).toEqual([]);

    // main.tsx bootstrap() rehydration sequence:
    const erpValue = await SQLiteStorageAdapter.getItem("erp-storage");
    expect(erpValue).toBeTruthy();
    const parsed = JSON.parse(erpValue!);
    const persistedState = parsed.state || parsed;
    freshStore.setState(persistedState);

    // The edited value survived the restart.
    const restored = freshStore.getState().categories.find((c: any) => c.id === id);
    expect(restored?.name).toBe("Steel Edited");
    expect(restored?.description).toBe("raw sheet steel");
    expect(restored?.status).toBe("Active");
  });
});
