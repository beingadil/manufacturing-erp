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
 * Resilience: every write is mirrored to localStorage. SQLite is the single
 * source of truth; the mirror is a fallback, never an authority. Writes are
 * serialized per key so they always land in call order, and the mirror carries
 * an `unsynced` flag whenever SQLite failed to persist a value:
 *   - the browser preview (MockSQLiteAdapter, which stores nothing) persists
 *     across reloads via the mirror;
 *   - a failed SQLite write is recovered on next boot because an UNSYNCED
 *     mirror is the only surviving copy, so it wins and is written back —
 *     this is recovery, not a competing source of truth;
 *   - a SYNCED mirror never overrides SQLite. The old "mirror is newer than
 *     SQLite, so heal" heuristic let a pre-restore mirror silently overwrite a
 *     freshly restored database on the next read, which is why restore used to
 *     appear to do nothing. A restore/import still clears the mirrors
 *     (clearStorageMirrors) so an in-flight unsynced mirror cannot survive it.
 */

interface MirrorEntry {
  value: string;
  savedAt: number; // epoch ms
  /**
   * True when the SQLite write for this value FAILED (or the DB wasn't ready):
   * the mirror is the ONLY copy of that state and must win on rehydration,
   * regardless of how much time has passed since the SQLite row was written.
   * Absent (or false) on envelopes written before the flag existed — those are
   * plain synced mirrors and carry no authority over SQLite.
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
 * point-in-time backup (restore/import). A synced mirror can no longer
 * override SQLite, but an UNSYNCED mirror still can — and a restore is an
 * explicit user instruction, so it must win over any pre-restore local copy.
 * Clearing forces the next boot to rehydrate purely from the restored rows.
 */
export function clearStorageMirrors(): void {
  for (const key of PERSIST_KEYS) {
    localRemove(key);
  }
}

// Millisecond precision (strftime %f) instead of CURRENT_TIMESTAMP (second
// precision) so timestamps stay useful for diagnostics.
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
// value — and since SQLite is authoritative, that stale row would be served.
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
        const result = await db.queryOne<{ value: string }>(
          'SELECT value FROM key_value_store WHERE key = ?',
          [name]
        );
        if (result && result.value != null) {
          // SQLite wins. The single exception is an UNSYNCED mirror: that flag
          // means the SQLite write for this value genuinely failed (or the DB
          // wasn't ready yet), so the mirror holds the only surviving copy and
          // must be written back — that is recovery, not a second authority.
          //
          // A synced mirror never overrides SQLite regardless of its timestamp.
          // The previous "mirror is newer, so heal SQLite" heuristic did, and a
          // pre-restore mirror is always newer than a freshly restored row — so
          // the restore was silently undone on the very next read.
          if (mirror && mirror.unsynced) {
            console.warn('[SQLiteStorageAdapter]', `${name}: mirror is unsynced (SQLite write failed), writing it back`);
            try {
              await writeToSqlite(db, name, mirror.value);
              localSet(name, mirror.value, false); // now in sync
            } catch (recoverError: any) {
              console.error('[SQLiteStorageAdapter]', `Failed to recover ${name} from mirror: ${recoverError.message}`);
            }
            return mirror.value;
          }
          return result.value;
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
