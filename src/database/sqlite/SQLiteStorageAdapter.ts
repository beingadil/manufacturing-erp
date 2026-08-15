import { dbService } from '../DatabaseService';

/**
 * SQLite Storage Adapter for Zustand Persist Middleware.
 *
 * IMPORTANT: This adapter must NEVER log through the Logger sink (useLogStore).
 * The log store persists through THIS adapter, so a Logger call from here
 * would recurse: Logger -> addLog -> persist setItem -> adapter -> Logger -> ...
 * That recursion blocked the renderer for seconds at startup (the "loading
 * screen that never ends"). All diagnostics below go straight to console,
 * which is what the Electron --enable-logging output captures anyway.
 *
 * Simple key-value persistence: reads/writes the entire Zustand state
 * as a JSON blob in the key_value_store table via the Electron IPC bridge.
 * No entity table sync — the persist blob is the single source of truth.
 *
 * Resilience: every write is mirrored to localStorage. Writes are serialized
 * per key so they always land in call order in BOTH stores, and the mirror
 * carries an `unsynced` flag whenever SQLite failed to persist a value:
 *   - the browser preview (MockSQLiteAdapter, which stores nothing) persists
 *     across reloads via the mirror;
 *   - a failed SQLite write is recovered on next boot because the unsynced
 *     mirror wins and heals SQLite — no wall-clock guessing;
 *   - a user restore/import clears the mirrors (clearStorageMirrors) so the
 *     restored SQLite rows rehydrate instead of a pre-restore mirror;
 *   - legacy envelopes (no unsynced flag) fall back to a timestamp heuristic.
 */

interface MirrorEntry {
  value: string;
  savedAt: number; // epoch ms
  /**
   * True when the SQLite write for this value FAILED (or the DB wasn't ready):
   * the mirror is the ONLY copy of that state and must win on rehydration,
   * regardless of how much time has passed since the SQLite row was written.
   * Absent on legacy envelopes (written before this flag) — those fall back to
   * the timestamp heuristic below.
   */
  unsynced?: boolean;
}

function localGet(name: string): MirrorEntry | null {
  try {
    const raw = localStorage.getItem(name);
    if (raw == null) return null;
    // New format: JSON envelope { value, savedAt }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.value === 'string' && typeof parsed.savedAt === 'number') {
        return { value: parsed.value, savedAt: parsed.savedAt, unsynced: parsed.unsynced === true };
      }
    } catch {
      // fall through to legacy handling
    }
    // Legacy format: raw value written before the envelope — treat as oldest
    return { value: raw, savedAt: 0 };
  } catch {
    return null;
  }
}

function localSet(name: string, value: string, unsynced = false) {
  try {
    const envelope: any = { value, savedAt: Date.now() };
    if (unsynced) envelope.unsynced = true;
    localStorage.setItem(name, JSON.stringify(envelope));
  } catch {
    // localStorage may be unavailable (private mode, quota) — non-fatal
  }
}

function localRemove(name: string) {
  try {
    localStorage.removeItem(name);
  } catch {
    // non-fatal
  }
}

// Every zustand persist key that flows through this adapter (plus the legacy
// pre-unification access key). When the user restores/imports a backup these
// mirrors must be invalidated so the next boot rehydrates from the restored
// SQLite rows instead of the pre-restore (newer) mirror state.
const PERSIST_KEYS = [
  'erp-storage',
  'erp-access-storage',
  'erp-settings',
  'erp-system-logs',
  'access-storage', // legacy
];

/**
 * Drop the localStorage mirror cache for all persisted stores.
 *
 * Call this AFTER the main process has replaced the SQLite file with a
 * point-in-time backup (restore/import). The mirrors still hold the newer,
 * pre-restore state, and getItem()'s "mirror newer than SQLite → heal" logic
 * would otherwise override the restored SQLite state and re-clobber it —
 * making restore appear to do nothing. Clearing forces the next boot to
 * rehydrate purely from the restored SQLite rows.
 */
export function clearStorageMirrors(): void {
  for (const key of PERSIST_KEYS) {
    localRemove(key);
  }
}

function parseSqliteTimestamp(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0;
  // SQLite timestamps: 'YYYY-MM-DD HH:MM:SS' or fractional 'YYYY-MM-DD HH:MM:SS.SSS' (UTC).
  const t = Date.parse(updatedAt.replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : 0;
}

// Only used for legacy mirror envelopes written before the `unsynced` flag
// existed. Covers second-granularity rows + IPC latency for those one-off
// migrations; the flag path needs no tolerance at all.
const STALE_TOLERANCE_MS = 2000;

// Millisecond precision (strftime %f) instead of CURRENT_TIMESTAMP (second
// precision) so the SQLite-vs-mirror comparison is exact — no more "the row
// looks up to 1s older than it actually is" ambiguity.
const UPSERT_SQL = `INSERT INTO key_value_store (key, value, updated_at)
  VALUES (?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
  ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at`;

async function writeToSqlite(db: any, name: string, value: string): Promise<void> {
  await db.execute(UPSERT_SQL, [name, value]);
}

// Serialize writes per key so concurrent persist setItem calls always land in
// call order in BOTH stores. Without this, two rapid updates could apply to
// SQLite out of order, leaving the row stale while the mirror holds the newer
// value — and the timestamp heuristic would then trust the stale row.
const writeQueues = new Map<string, Promise<void>>();

function enqueueWrite(name: string, task: () => Promise<void>): Promise<void> {
  const prev = writeQueues.get(name) ?? Promise.resolve();
  // Task errors are handled inside the tasks themselves; swallow here so one
  // failed write never blocks the queue.
  const next = prev.then(task).catch(() => {});
  writeQueues.set(name, next);
  void next.then(() => {
    if (writeQueues.get(name) === next) writeQueues.delete(name);
  });
  return next;
}

export const SQLiteStorageAdapter = {
  getItem: async (name: string): Promise<string | null> => {
    const mirror = localGet(name);

    try {
      if (dbService.isReady()) {
        const db = dbService.getAdapter();
        const result = await db.queryOne<{ value: string; updated_at?: string | null }>(
          'SELECT value, updated_at FROM key_value_store WHERE key = ?',
          [name]
        );
        if (result && result.value != null) {
          const sqliteSavedAt = parseSqliteTimestamp(result.updated_at);

          // An UNSYNCED mirror means a SQLite write for this value failed (or
          // the DB wasn't ready) — the mirror is the only copy of that state,
          // so it wins and heals SQLite. No timestamp guessing: a failed write
          // can be only milliseconds older than the row.
          if (mirror && mirror.unsynced) {
            console.warn('[SQLiteStorageAdapter]', `${name}: mirror is unsynced (SQLite write failed), healing SQLite`);
            try {
              await writeToSqlite(db, name, mirror.value);
              localSet(name, mirror.value, false); // now in sync
            } catch (healError: any) {
              console.error('[SQLiteStorageAdapter]', `Failed to heal ${name}: ${healError.message}`);
            }
            return mirror.value;
          }

          // Legacy envelopes (no unsynced flag, written by older versions) fall
          // back to the timestamp heuristic: prefer SQLite unless the mirror is
          // meaningfully newer.
          if (!mirror || sqliteSavedAt >= mirror.savedAt - STALE_TOLERANCE_MS) {
            return result.value;
          }
          console.warn('[SQLiteStorageAdapter]', `${name}: mirror is newer than SQLite, healing SQLite`);
          try {
            await writeToSqlite(db, name, mirror.value);
            localSet(name, mirror.value, false);
          } catch (healError: any) {
            console.error('[SQLiteStorageAdapter]', `Failed to heal ${name}: ${healError.message}`);
          }
          return mirror.value;
        }

        // SQLite has NO row for this key but the mirror does — the DB was lost
        // or recreated while localStorage survived. The mirror is the only
        // surviving copy: persist it so it survives a future wipe of storage.
        if (mirror) {
          try {
            await writeToSqlite(db, name, mirror.value);
            localSet(name, mirror.value, false);
          } catch (healError: any) {
            console.error('[SQLiteStorageAdapter]', `Failed to persist ${name} from mirror: ${healError.message}`);
          }
          return mirror.value;
        }
      }
    } catch (error: any) {
      console.error('[SQLiteStorageAdapter]', `Failed to read ${name} from SQLite: ${error.message}`);
    }

    // SQLite unavailable (preview / not ready) → mirror fallback
    if (mirror) {
      return mirror.value;
    }

    if (!dbService.isReady()) {
      console.warn('[SQLiteStorageAdapter]', `DB not ready, no mirror for ${name}`);
    }
    return null;
  },

  setItem: async (name: string, value: string): Promise<void> => {
    await enqueueWrite(name, async () => {
      // Phase 1: mark the mirror unsynced — SQLite does not have this value yet.
      localSet(name, value, true);

      try {
        if (!dbService.isReady()) {
          // No Logger here — logging through the sink would recurse through the
          // log store's own persist (see header comment). The mirror (unsynced)
          // is the only copy and will be healed into SQLite once the DB is up.
          console.warn('[SQLiteStorageAdapter]', `DB not ready, kept localStorage mirror for ${name}`);
          return;
        }
        const db = dbService.getAdapter();
        await writeToSqlite(db, name, value);
        // Phase 2: persisted successfully → mirror is now in sync.
        localSet(name, value, false);
      } catch (error: any) {
        // SQLite write failed → the mirror stays unsynced and authoritative.
        console.error('[SQLiteStorageAdapter]', `Failed to save ${name}: ${error.message}`);
      }
    });
  },

  removeItem: async (name: string): Promise<void> => {
    await enqueueWrite(name, async () => {
      localRemove(name);
      try {
        if (!dbService.isReady()) return;
        const db = dbService.getAdapter();
        await db.execute('DELETE FROM key_value_store WHERE key = ?', [name]);
      } catch (error: any) {
        console.error('[SQLiteStorageAdapter]', `Failed to delete ${name}: ${error.message}`);
      }
    });
  },
};
