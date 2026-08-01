import { dbService } from '../DatabaseService';
import { Logger } from '../../lib/logger';

/**
 * SQLite Storage Adapter for Zustand Persist Middleware.
 *
 * Simple key-value persistence: reads/writes the entire Zustand state
 * as a JSON blob in the key_value_store table via the Electron IPC bridge.
 * No entity table sync — the persist blob is the single source of truth.
 *
 * Resilience: every write is ALSO mirrored to localStorage (with a timestamp)
 * and every read compares the SQLite row's updated_at against the mirror's
 * savedAt, preferring whichever is NEWER. This:
 *   - keeps the browser preview (MockSQLiteAdapter, which stores nothing)
 *     persisting across reloads via the mirror;
 *   - recovers data on desktop when a SQLite write failed but the mirror
 *     still holds the newer state;
 *   - never lets a stale SQLite row shadow a newer mirror (or vice versa).
 */

interface MirrorEntry {
  value: string;
  savedAt: number; // epoch ms
}

function localGet(name: string): MirrorEntry | null {
  try {
    const raw = localStorage.getItem(name);
    if (raw == null) return null;
    // New format: JSON envelope { value, savedAt }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.value === 'string' && typeof parsed.savedAt === 'number') {
        return { value: parsed.value, savedAt: parsed.savedAt };
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

function localSet(name: string, value: string) {
  try {
    localStorage.setItem(name, JSON.stringify({ value, savedAt: Date.now() }));
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

function parseSqliteTimestamp(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0;
  // SQLite CURRENT_TIMESTAMP → 'YYYY-MM-DD HH:MM:SS' (UTC). Normalize to ISO.
  const t = Date.parse(updatedAt.replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : 0;
}

// Tolerate SQLite's second-granularity truncation + IPC latency when comparing.
const STALE_TOLERANCE_MS = 2000;

const UPSERT_SQL = `INSERT INTO key_value_store (key, value, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at`;

async function writeToSqlite(db: any, name: string, value: string): Promise<void> {
  await db.execute(UPSERT_SQL, [name, value]);
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
          // Prefer SQLite unless the mirror is meaningfully newer (recovered write)
          if (!mirror || sqliteSavedAt >= mirror.savedAt - STALE_TOLERANCE_MS) {
            return result.value;
          }
          // Mirror is newer than SQLite → a previous SQLite write failed.
          // Return the mirror AND heal SQLite so both stores converge.
          Logger.warn('SQLiteStorageAdapter', `${name}: mirror is newer than SQLite, healing SQLite`);
          try {
            await writeToSqlite(db, name, mirror.value);
          } catch (healError: any) {
            Logger.error('SQLiteStorageAdapter', `Failed to heal ${name}: ${healError.message}`);
          }
          return mirror.value;
        }
      }
    } catch (error: any) {
      Logger.error('SQLiteStorageAdapter', `Failed to read ${name} from SQLite: ${error.message}`);
    }

    // SQLite has no value (preview / empty DB / not ready) → mirror fallback
    if (mirror) {
      return mirror.value;
    }

    if (!dbService.isReady()) {
      Logger.warn('SQLiteStorageAdapter', `DB not ready, no mirror for ${name}`);
    }
    return null;
  },

  setItem: async (name: string, value: string): Promise<void> => {
    // Mirror to localStorage first — always available, survives SQLite hiccups
    localSet(name, value);

    try {
      if (!dbService.isReady()) {
        Logger.warn('SQLiteStorageAdapter', `DB not ready, kept localStorage mirror for ${name}`);
        return;
      }
      const db = dbService.getAdapter();
      await writeToSqlite(db, name, value);
    } catch (error: any) {
      Logger.error('SQLiteStorageAdapter', `Failed to save ${name}: ${error.message}`);
    }
  },

  removeItem: async (name: string): Promise<void> => {
    localRemove(name);
    try {
      if (!dbService.isReady()) return;
      const db = dbService.getAdapter();
      await db.execute('DELETE FROM key_value_store WHERE key = ?', [name]);
    } catch (error: any) {
      Logger.error('SQLiteStorageAdapter', `Failed to delete ${name}: ${error.message}`);
    }
  },
};
