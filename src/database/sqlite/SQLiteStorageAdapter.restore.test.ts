// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

// This vitest 4 + jsdom 29 setup does not expose window.localStorage (window
// exists, sessionStorage exists, localStorage is undefined). The adapter's
// mirror logic is exactly what these tests exercise, so provide a minimal,
// faithful Storage implementation instead of fighting the environment.
class MemoryStorage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(String(key)) ? this.store.get(String(key))! : null; }
  key(index: number) { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string) { this.store.delete(String(key)); }
  setItem(key: string, value: string) { this.store.set(String(key), String(value)); }
}

// In-memory key_value_store behind a mock electronDB (same shape as
// CategoryService.persistence.test.ts) — but with controlled updated_at
// timestamps so we can simulate the restore scenario exactly.
const kvTable = new Map<string, { value: string; updated_at: string }>();

// Simulates a mid-session SQLite write failure (disk full / DB closed): when
// true, every UPSERT throws, exactly like a closed main-process DB would.
let sqliteBroken = false;

function makeMockElectronDB(opts?: { delayFirstUpsertMs?: number }) {
  let upsertCount = 0;
  return {
    initialize: vi.fn().mockResolvedValue({ success: true }),
    query: vi.fn().mockResolvedValue({ success: true, data: [] }),
    queryOne: vi.fn(async (req: any) => {
      const sql: string = req.sql || "";
      if (sql.includes("key_value_store") && sql.includes("WHERE key")) {
        const row = kvTable.get(req.params?.[0]);
        return { success: true, data: row ? { ...row } : null };
      }
      return { success: true, data: null };
    }),
    execute: vi.fn(async (req: any) => {
      const sql: string = req.sql || "";
      const params: any[] = req.params || [];
      if (sql.includes("key_value_store")) {
        if (sql.includes("INSERT") || sql.includes("ON CONFLICT")) {
          if (sqliteBroken) throw new Error("database is closed (simulated write failure)");
          if (opts?.delayFirstUpsertMs && upsertCount === 0) {
            upsertCount += 1;
            await new Promise((r) => setTimeout(r, opts.delayFirstUpsertMs));
          } else {
            upsertCount += 1;
          }
          const [key, value] = params;
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

const BACKUP_TIME = "2026-08-15 11:21:02"; // SQLite CURRENT_TIMESTAMP (UTC, second precision)
const BACKUP_MS = Date.parse("2026-08-15T11:21:02Z");
const DELETE_MS = Date.parse("2026-08-15T11:21:06Z"); // > 2s later → beats STALE_TOLERANCE_MS (2000ms)

describe("SQLiteStorageAdapter restore-mirror interplay", () => {
  beforeEach(() => {
    (globalThis as any).localStorage = new MemoryStorage();
    (window as any).localStorage = (globalThis as any).localStorage;
    localStorage.clear();
    kvTable.clear();
    sqliteBroken = false;
    (window as any).electronDB = makeMockElectronDB();
    vi.resetModules();
  });

  it("mirror newer than a restored SQLite row wins without invalidation (documents the bug)", async () => {
    const { dbService } = await import("../DatabaseService");
    await dbService.initialize();
    const { SQLiteStorageAdapter } = await import("./SQLiteStorageAdapter");

    // Restore: SQLite row is back to the backup point-in-time (older).
    kvTable.set("erp-storage", { value: "state-with-category", updated_at: BACKUP_TIME });
    // Mirror still holds the pre-restore deleted state, meaningfully newer.
    localStorage.setItem("erp-storage", JSON.stringify({ value: "state-after-delete", savedAt: DELETE_MS }));

    const got = await SQLiteStorageAdapter.getItem("erp-storage");
    expect(got).toBe("state-after-delete");
  });

  it("clearStorageMirrors() makes the restored SQLite row authoritative", async () => {
    const { dbService } = await import("../DatabaseService");
    await dbService.initialize();
    const { SQLiteStorageAdapter, clearStorageMirrors } = await import("./SQLiteStorageAdapter");

    kvTable.set("erp-storage", { value: "state-with-category", updated_at: BACKUP_TIME });
    localStorage.setItem("erp-storage", JSON.stringify({ value: "state-after-delete", savedAt: DELETE_MS }));

    clearStorageMirrors();

    const got = await SQLiteStorageAdapter.getItem("erp-storage");
    expect(got).toBe("state-with-category");
    // The mirror is gone, so nothing can heal the deleted state back into SQLite.
    expect(localStorage.getItem("erp-storage")).toBeNull();
  });

  it("an unsynced mirror wins and heals SQLite even when only milliseconds older", async () => {
    const { dbService } = await import("../DatabaseService");
    await dbService.initialize();
    const { SQLiteStorageAdapter } = await import("./SQLiteStorageAdapter");

    // SQLite row was written at BACKUP_TIME; the failed write's mirror is
    // OLDER by 100ms yet unsynced (SQLite never got it) → it must still win.
    kvTable.set("erp-storage", { value: "sqlite-old", updated_at: BACKUP_TIME });
    localStorage.setItem("erp-storage", JSON.stringify({ value: "mirror-newer", savedAt: BACKUP_MS - 100, unsynced: true }));

    const got = await SQLiteStorageAdapter.getItem("erp-storage");
    expect(got).toBe("mirror-newer");
    // SQLite healed with the mirror value.
    expect(kvTable.get("erp-storage")!.value).toBe("mirror-newer");
  });

  it("a synced mirror never overrides a slightly newer SQLite row", async () => {
    const { dbService } = await import("../DatabaseService");
    await dbService.initialize();
    const { SQLiteStorageAdapter } = await import("./SQLiteStorageAdapter");

    // Normal boot: mirror is in sync (write succeeded) and only a hair newer
    // than the SQLite row → SQLite must stay authoritative, no heal.
    kvTable.set("erp-storage", { value: "sqlite-current", updated_at: BACKUP_TIME });
    localStorage.setItem("erp-storage", JSON.stringify({ value: "mirror-same", savedAt: BACKUP_MS + 100, unsynced: false }));

    const got = await SQLiteStorageAdapter.getItem("erp-storage");
    expect(got).toBe("sqlite-current");
    expect(kvTable.get("erp-storage")!.value).toBe("sqlite-current"); // no heal
  });

  it("serializes concurrent writes so the last call wins in SQLite", async () => {
    // The first SQLite write is artificially slow; without per-key write
    // serialization the second write could land first and be lost.
    (window as any).electronDB = makeMockElectronDB({ delayFirstUpsertMs: 30 });
    const { dbService } = await import("../DatabaseService");
    await dbService.initialize();
    const { SQLiteStorageAdapter } = await import("./SQLiteStorageAdapter");

    const p1 = SQLiteStorageAdapter.setItem("erp-storage", "write-A");
    const p2 = SQLiteStorageAdapter.setItem("erp-storage", "write-B");
    await Promise.all([p1, p2]);

    expect(kvTable.get("erp-storage")!.value).toBe("write-B");
    const mirror = JSON.parse(localStorage.getItem("erp-storage")!);
    expect(mirror.value).toBe("write-B");
    // Phase 2 succeeded → the mirror is in sync (flag absent).
    expect(mirror.unsynced).toBeFalsy();
  });

  it("recovers a mid-session SQLite write failure from the unsynced mirror on restart", async () => {
    // ---- Session 1: DB healthy ----
    (window as any).electronDB = makeMockElectronDB();
    const { dbService } = await import("../DatabaseService");
    await dbService.initialize();
    const { SQLiteStorageAdapter } = await import("./SQLiteStorageAdapter");

    await SQLiteStorageAdapter.setItem("erp-storage", "state-one-cat");
    expect(kvTable.get("erp-storage")!.value).toBe("state-one-cat");
    expect(JSON.parse(localStorage.getItem("erp-storage")!).unsynced).toBeFalsy(); // in sync

    // ---- Mid-session failure: the DB breaks, the next write fails ----
    sqliteBroken = true;
    await SQLiteStorageAdapter.setItem("erp-storage", "state-two-cats");
    // SQLite still holds the OLD state; the mirror holds the NEW state, unsynced.
    expect(kvTable.get("erp-storage")!.value).toBe("state-one-cat");
    const brokenMirror = JSON.parse(localStorage.getItem("erp-storage")!);
    expect(brokenMirror.value).toBe("state-two-cats");
    expect(brokenMirror.unsynced).toBe(true);

    // ---- Session 2: app restart, DB healthy again but stale ----
    sqliteBroken = false;
    vi.resetModules();
    (window as any).electronDB = makeMockElectronDB();
    const { dbService: freshDb } = await import("../DatabaseService");
    await freshDb.initialize();
    const { SQLiteStorageAdapter: freshAdapter } = await import("./SQLiteStorageAdapter");

    const got = await freshAdapter.getItem("erp-storage");
    expect(got).toBe("state-two-cats"); // the failed write survived via the mirror
    expect(kvTable.get("erp-storage")!.value).toBe("state-two-cats"); // healed into SQLite
    expect(JSON.parse(localStorage.getItem("erp-storage")!).unsynced).toBeFalsy(); // now in sync
  });

  it("clears every persist key, not just erp-storage", async () => {
    const { dbService } = await import("../DatabaseService");
    await dbService.initialize();
    const { clearStorageMirrors } = await import("./SQLiteStorageAdapter");

    const keys = ["erp-storage", "erp-access-storage", "erp-settings", "erp-system-logs", "access-storage"];
    for (const key of keys) {
      localStorage.setItem(key, JSON.stringify({ value: "x", savedAt: Date.now() }));
    }
    clearStorageMirrors();
    for (const key of keys) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });
});
