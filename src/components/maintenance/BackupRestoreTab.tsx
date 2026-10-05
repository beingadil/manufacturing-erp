import { CheckCircle2, Database, FileDown, FileUp, Loader2, Monitor } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { clearStorageMirrors } from '../../database/sqlite/SQLiteStorageAdapter';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';

// ─── Backup & Restore ───────────────────────────────────────────────────────
// Two actions only, and both produce/consume a single portable .merpbak file:
//
//   Backup to file  → writes a validated .merpbak bundle (manifest + database)
//                      anywhere you choose: USB, network share, Documents.
//                      Restore that same file on any other PC.
//   Restore from file → reads such a bundle, verifies its manifest and SHA-256,
//                      keeps a safety copy of the current data, then swaps the
//                      database and reloads.
//
// Everything runs against the native SQLite database in the main process via
// window.electronDB. Outside the desktop app the buttons are disabled with a
// clear explanation rather than silently doing nothing.

interface BackupManifest {
  format?: string;
  appVersion?: string;
  createdAt?: string;
  dbSize?: number;
  stores?: string[];
  tableRowCounts?: Record<string, number>;
}

const electronDB = () => (window as any).electronDB;

const formatSize = (bytes: number) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (iso: string) => {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

export function BackupRestoreTab() {
  const isDesktop = typeof window !== 'undefined' && !!electronDB();
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);
  const [lastManifest, setLastManifest] = useState<BackupManifest | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const handleBackup = async () => {
    const db = electronDB();
    if (!db?.exportBackup) return;
    setBusy('backup');
    try {
      const result = await db.exportBackup();
      if (result.canceled) return;
      if (result.success) {
        setLastManifest((result.manifest as BackupManifest) || null);
        toast.success('Backup saved', { description: result.path });
      } else {
        toast.error('Backup failed', { description: result.error || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Backup failed', { description: e.message });
    }
    setBusy(null);
  };

  const executeRestore = async () => {
    const db = electronDB();
    if (!db?.importBackup) return;
    setBusy('restore');
    try {
      const result = await db.importBackup();
      if (result.canceled) { setBusy(null); return; }
      if (result.success) {
        const m = result.manifest as BackupManifest | undefined;
        setLastManifest(m || null);
        // The restored rows are authoritative. Drop the localStorage mirrors so
        // a pre-restore in-flight write can't overwrite them on the next read,
        // then reload so every store rehydrates from the restored database.
        clearStorageMirrors();
        const info = m
          ? `Restored v${m.appVersion ?? '?'} · ${m.stores?.length ?? 0} store(s) · ${formatDate(m.createdAt ?? '')}`
          : 'Restored from a legacy SQLite backup file.';
        toast.success('Restore complete. Reloading…', { description: info });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error('Restore failed', { description: result.error || 'Unknown error' });
        setBusy(null);
      }
    } catch (e: any) {
      toast.error('Restore failed', { description: e.message });
      setBusy(null);
    }
  };

  if (!isDesktop) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border/50 bg-muted/40">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Backup &amp; Restore
          </h3>
        </div>
        <div className="p-8 text-center">
          <Monitor className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="font-semibold text-foreground">Desktop app required</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Backup and restore use the database in the installed desktop app, so they are
            unavailable in a plain browser.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border/50 bg-muted/40">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Backup &amp; Restore
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Save a copy of all your data to a file you choose — a USB stick, a network
            folder, or Documents. Restore that same file on any other computer.
          </p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={handleBackup}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {busy === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              {busy === 'backup' ? 'Saving backup…' : 'Backup to file'}
            </button>
            <button
              onClick={() => setConfirmRestore(true)}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border border-warning/40 text-warning rounded-xl hover:bg-warning/10 transition-colors disabled:opacity-50"
            >
              {busy === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {busy === 'restore' ? 'Restoring…' : 'Restore from file'}
            </button>
          </div>
        </div>
      </div>

      {lastManifest && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Last backup
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-card border border-border/50">
              <p className="text-muted-foreground">App Version</p>
              <p className="font-mono font-bold text-foreground mt-1">v{lastManifest.appVersion ?? '?'}</p>
            </div>
            <div className="p-3 rounded-lg bg-card border border-border/50">
              <p className="text-muted-foreground">Created</p>
              <p className="font-medium text-foreground mt-1">{formatDate(lastManifest.createdAt ?? '')}</p>
            </div>
            <div className="p-3 rounded-lg bg-card border border-border/50">
              <p className="text-muted-foreground">Size</p>
              <p className="font-medium text-foreground mt-1">{formatSize(lastManifest.dbSize ?? 0)}</p>
            </div>
            {lastManifest.tableRowCounts && (
              <div className="p-3 rounded-lg bg-card border border-border/50 col-span-2 sm:col-span-3">
                <p className="text-muted-foreground">Records</p>
                <p className="font-mono text-[11px] text-foreground mt-1.5 leading-relaxed">
                  {Object.entries(lastManifest.tableRowCounts)
                    .filter(([, c]) => c > 0)
                    .map(([t, c]) => `${t}: ${c}`)
                    .join(' · ') || 'No records'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore from a backup file?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces everything currently in the app with the contents of the file
              you pick. A safety copy of your current data is kept first, and the app
              restarts when the restore finishes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setConfirmRestore(false);
                void executeRestore();
              }}
            >
              Choose file and restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
