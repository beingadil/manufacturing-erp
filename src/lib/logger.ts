// src/lib/logger.ts
// Leaf module — deliberately imports NOTHING so it can never create a circular
// import. The DB/storage layer (SQLiteStorageAdapter, DatabaseService, etc.)
// imports Logger from here; useLogStore registers itself as the sink so every
// entry is persisted through the unified SQLiteStorageAdapter.

export type LogLevel = 'info' | 'warning' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  details?: string;
}

type LogSink = (level: LogLevel, source: string, message: string, details?: string) => void;

// Default sink: console fallback until useLogStore registers itself.
let sink: LogSink = (level, source, message, details) => {
  const fn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.log;
  fn(`[${source}] ${message}`, details ?? '');
};

export function registerLogSink(fn: LogSink) {
  sink = fn;
}

export const Logger = {
  info: (source: string, message: string, details?: string) => sink('info', source, message, details),
  warn: (source: string, message: string, details?: string) => sink('warning', source, message, details),
  error: (source: string, message: string, details?: string) => sink('error', source, message, details),
};
