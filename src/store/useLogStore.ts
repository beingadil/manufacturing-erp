import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SQLiteStorageAdapter } from '../database/sqlite/SQLiteStorageAdapter';
import { LogLevel, LogEntry, registerLogSink } from '../lib/logger';

interface LogState {
  logs: LogEntry[];
  addLog: (level: LogLevel, source: string, message: string, details?: string) => void;
}

export const useLogStore = create<LogState>()(
  persist(
    (set) => ({
      logs: [],
      addLog: (level, source, message, details) => {
        const newLog: LogEntry = {
          id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
          timestamp: new Date().toISOString(),
          level,
          source,
          message,
          details
        };
        set((state) => ({
          // Keep last 5000 logs to prevent memory bloat
          logs: [newLog, ...state.logs].slice(0, 5000)
        }));
      },
    }),
    {
      name: 'erp-system-logs',
      // skipHydration:true prevents Zustand from calling getItem() during store
      // creation (before the DB is ready). main.tsx bootstrap rehydrates the
      // store explicitly via SQLiteStorageAdapter after database init.
      skipHydration: true,
      storage: createJSONStorage(() => SQLiteStorageAdapter)
    }
  )
);

// Route every Logger call through this store so entries persist via the
// unified SQLiteStorageAdapter. Registered at module load (leaf logger.ts
// falls back to console before this runs — the DB layer can't import us).
registerLogSink((level, source, message, details) => {
  useLogStore.getState().addLog(level, source, message, details);
});
