import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LogLevel = 'info' | 'warning' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  details?: string;
}

interface LogState {
  logs: LogEntry[];
  addLog: (level: LogLevel, source: string, message: string, details?: string) => void;
}

export const useLogStore = create<LogState>()(
  persist(
    (set, get) => ({
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
    }
  )
);

export const Logger = {
  info: (source: string, message: string, details?: string) => useLogStore.getState().addLog('info', source, message, details),
  warn: (source: string, message: string, details?: string) => useLogStore.getState().addLog('warning', source, message, details),
  error: (source: string, message: string, details?: string) => useLogStore.getState().addLog('error', source, message, details),
};
