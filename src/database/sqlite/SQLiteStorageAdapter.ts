import { dbService } from '../DatabaseService';
import { Logger } from '../../store/useLogStore';

/**
 * SQLite Storage Adapter for Zustand Persist Middleware.
 *
 * Simple key-value persistence: reads/writes the entire Zustand state
 * as a JSON blob in the key_value_store table via the Electron IPC bridge.
 * No entity table sync — the persist blob is the single source of truth.
 */
export const SQLiteStorageAdapter = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      if (!dbService.isReady()) {
        Logger.warn('SQLiteStorageAdapter', `DB not ready, skipping read for ${name}`);
        return null;
      }
      const db = dbService.getAdapter();
      const result = await db.queryOne<{ value: string }>(
        'SELECT value FROM key_value_store WHERE key = ?',
        [name]
      );
      return result ? result.value : null;
    } catch (error: any) {
      Logger.error('SQLiteStorageAdapter', `Failed to read ${name}: ${error.message}`);
      return null;
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      if (!dbService.isReady()) {
        Logger.warn('SQLiteStorageAdapter', `DB not ready, skipping save for ${name}`);
        return;
      }
      const db = dbService.getAdapter();
      await db.execute(
        `INSERT INTO key_value_store (key, value, updated_at) 
         VALUES (?, ?, CURRENT_TIMESTAMP) 
         ON CONFLICT(key) DO UPDATE SET 
         value = excluded.value, 
         updated_at = excluded.updated_at`,
        [name, value]
      );
    } catch (error: any) {
      Logger.error('SQLiteStorageAdapter', `Failed to save ${name}: ${error.message}`);
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      if (!dbService.isReady()) return;
      const db = dbService.getAdapter();
      await db.execute('DELETE FROM key_value_store WHERE key = ?', [name]);
    } catch (error: any) {
      Logger.error('SQLiteStorageAdapter', `Failed to delete ${name}: ${error.message}`);
    }
  },
};
