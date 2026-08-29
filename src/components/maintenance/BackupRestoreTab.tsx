import {AlertTriangle, CheckCircle2, Database, 
  DownloadCloud, FileDown, FileUp,
  HardDrive, Info, Loader2, Monitor,Trash2, 
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { clearStorageMirrors } from '../../database/sqlite/SQLiteStorageAdapter';

// ─── Single canonical backup/restore component ──────────────────────────────
// Used by BOTH Settings → Backup & Restore AND System Maintenance → Backup &
// Restore, so there is exactly one implementation to maintain.
//
//   Create Backup  → internal timestamped SQLite snapshot (userData/backups)
//   Export         → portable .merpbak bundle via save dialog (manifest + DB)
//   Import         → restore a .merpbak / legacy .sqlite via open dialog
//   Snapshots      → list internal snapshots with Restore + Delete
//
// Everything talks to the native SQLite database through window.electronDB.
// Outside the desktop app (plain browser dev) the actions are disabled with a
// clear explanation instead of silently doing nothing.

interface Snapshot {
  filename: string;
  path: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
}

interface BackupManifest {
  format?: string;
  appVersion?: string;
  createdAt?: string;
  dbSize?: number;
  stores?: string[];
  tableRowCounts?: Record<string, number>;
}

const electronDB = () => (window as any).electronDB;

export function BackupRestoreTab() {
  const isDesktop = typeof window !== 'undefined' && !!electronDB();
  const [backups, setBackups] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastManifest, setLastManifest] = useState<BackupManifest | null>(null);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const db = electronDB();
      if (db?.listBackups) {
        const res = await db.listBackups();
        if (res.success) setBackups((res.data || []) as Snapshot[]);
      }
    } catch { /* not in electron */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isDesktop) loadBackups();
    else setLoading(false);
  }, [isDesktop, loadBackups]);

  const handleCreateBackup = async () => {
    const db = electronDB();
    if (!db?.backup) return;
    setBusy('create');
    try {
      const res = await db.backup();
      if (res.success) {
        toast.success('Backup Created', {
          description: res.size
            ? `Snapshot saved (${formatSize(res.size)}).`
            : 'Snapshot saved successfully.',
        });
        await loadBackups();
      } else {
        toast.error('Backup Failed', { description: res.error || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Backup Failed', { description: e.message });
    }
    setBusy(null);
  };

  const handleRestore = async (snapshot: Snapshot) => {
    const db = electronDB();
    if (!db?.restore) return;
    if (!confirm(
      'WARNING: Restoring will replace ALL current data with this snapshot. ' +
      'This cannot be undone.\n\nA safety backup of your current database will be created first.\n\nAre you sure?'
    )) return;
    setBusy(snapshot.filename);
    try {
      if (db.backup) await db.backup(); // safety backup of current state
      const res = await db.restore(snapshot.path);
      if (res.success) {
        // The main process replaced SQLite with the snapshot. The localStorage
        // mirrors still hold the newer pre-restore state and would override it
        // on rehydration — clear them so the restored SQLite rows win.
        clearStorageMirrors();
        alert('Database restored successfully. The application will now reload.');
        window.location.reload();
      } else {
        toast.error('Restore Failed', { description: res.error || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Restore Failed', { description: e.message });
    }
    setBusy(null);
  };

  const handleDeleteBackup = async (snapshot: Snapshot) => {
    const db = electronDB();
    if (!db?.deleteBackup) return;
    if (!confirm(`Delete snapshot "${snapshot.filename}"?\n\nThis permanently removes this backup file.`)) return;
    setBusy(snapshot.filename);
    try {
      const res = await db.deleteBackup(snapshot.filename);
      if (res.success) {
        toast.success('Snapshot Deleted', { description: snapshot.filename });
        await loadBackups();
      } else {
        toast.error('Delete Failed', { description: res.error || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Delete Failed', { description: e.message });
    }
    setBusy(null);
  };

  const handleExportBackup = async () => {
    const db = electronDB();
    if (!db?.exportBackup) return;
    setBusy('export');
    try {
      const result = await db.exportBackup();
      if (result.canceled) return;
      if (result.success) {
        setLastManifest((result.manifest as BackupManifest) || null);
        toast.success('Unified Backup Exported', {
          description: `Saved to ${result.path}`,
        });
      } else {
        toast.error('Export Failed', { description: result.error || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Export Failed', { description: e.message });
    }
    setBusy(null);
  };

  const handleImportBackup = async () => {
    const db = electronDB();
    if (!db?.importBackup) return;
    if (!confirm(
      'WARNING: Importing will REPLACE ALL current data with the backup file.\n\n' +
      'A safety backup of your current database will be created first.\n\nAre you sure?'
    )) return;
    setBusy('import');
    try {
      const result = await db.importBackup();
      if (result.canceled) return;
      if (result.success) {
        const m = result.manifest as BackupManifest | undefined;
        setLastManifest(m || null);
        // Same as restore: drop stale mirrors so rehydration reads the imported DB.
        clearStorageMirrors();
        alert(
          'Database imported successfully. The application will now reload.\n\n' +
          (m
            ? `Manifest: v${m.appVersion ?? '?'} · ${m.stores?.length ?? 0} store(s) · ${formatDate(m.createdAt ?? '')}`
            : 'Legacy SQLite backup restored.')
        );
        window.location.reload();
      } else {
        toast.error('Import Failed', { description: result.error || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Import Failed', { description: e.message });
    }
    setBusy(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  // ── Non-desktop notice (plain browser / dev server) ───────────────────────
  if (!isDesktop) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border/50 bg-muted/40">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Backup & Restore
          </h3>
        </div>
        <div className="p-8 text-center">
          <Monitor className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="font-semibold text-foreground">Desktop app required</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Backup & Restore runs against the native SQLite database inside the
            desktop application. You're viewing the web preview, where this
            feature is intentionally disabled.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Action Buttons ── */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border/50 bg-muted/40">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            SQLite Database Backups
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create timestamped snapshots of the full database, export a portable
            <code className="mx-1 px-1.5 py-0.5 bg-background border border-border/50 rounded text-[11px] font-mono">.merpbak</code>
            bundle for another machine, or restore from any snapshot.
            A snapshot is also taken automatically every day and before every update.
          </p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <button
              onClick={handleCreateBackup}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
              {busy === 'create' ? 'Backing up...' : 'Create Backup'}
            </button>
            <button
              onClick={handleExportBackup}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-secondary text-secondary-foreground rounded-xl hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {busy === 'export' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              {busy === 'export' ? 'Exporting...' : 'Export Backup (.merpbak)'}
            </button>
            <button
              onClick={handleImportBackup}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border border-warning/40 text-warning rounded-xl hover:bg-warning/10 transition-colors disabled:opacity-50"
            >
              {busy === 'import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {busy === 'import' ? 'Importing...' : 'Import Backup'}
            </button>
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/50">
              <HardDrive className="h-4 w-4 shrink-0" />
              <span>Auto-backup daily + before updates</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Import/Export integrity note ── */}
      <div className="p-4 rounded-xl bg-warning/10 border border-warning/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm text-warning">How restore works</p>
            <p className="text-xs text-muted-foreground mt-1">
              Restoring or importing replaces the entire database with the chosen file.
              A safety backup of your current data is always created first, and the
              app reloads when the restore finishes. Importing a{' '}
              <code className="font-mono">.merpbak</code> verifies the version manifest
              and SHA-256 integrity before touching your data.
            </p>
          </div>
        </div>
      </div>

      {/* ── Last export/import manifest ── */}
      {lastManifest && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Last Backup Manifest
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
              <p className="text-muted-foreground">DB Size</p>
              <p className="font-medium text-foreground mt-1">{formatSize(lastManifest.dbSize ?? 0)}</p>
            </div>
            {lastManifest.stores && lastManifest.stores.length > 0 && (
              <div className="p-3 rounded-lg bg-card border border-border/50 col-span-2 sm:col-span-3">
                <p className="text-muted-foreground">Persisted Stores</p>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {lastManifest.stores.map((s: string) => (
                    <span key={s} className="px-2 py-0.5 rounded-md bg-background border border-border/50 font-mono text-[11px] text-foreground">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {lastManifest.tableRowCounts && (
              <div className="p-3 rounded-lg bg-card border border-border/50 col-span-2 sm:col-span-3">
                <p className="text-muted-foreground">Records per table</p>
                <p className="font-mono text-[11px] text-foreground mt-1.5 leading-relaxed">
                  {Object.entries(lastManifest.tableRowCounts)
                    .filter(([, c]) => c > 0)
                    .map(([t, c]) => `${t}: ${c}`)
                    .join(' · ') || 'All tables empty'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Snapshot list ── */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border/50 bg-muted/40 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">Saved Snapshots</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Restore or delete any internal snapshot. The newest 30 are kept automatically.
            </p>
          </div>
          {busy === 'create' && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        </div>
        <div className="p-6">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading backups...</div>
          ) : backups.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground border border-dashed border-border/50 rounded-xl">
              No snapshots yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {backups.map((b) => (
                <div key={b.filename} className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/20 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate font-mono">{b.filename}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(b.modifiedAt)} &middot; {formatSize(b.size)}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleDeleteBackup(b)}
                      disabled={busy !== null}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Delete snapshot"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleRestore(b)}
                      disabled={busy !== null}
                      className="px-3 py-1.5 text-xs font-medium border border-border text-foreground rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {busy === b.filename ? 'Restoring...' : 'Restore'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Info footer ── */}
      <div className="p-4 rounded-xl bg-muted/30 border border-border/50 flex items-start gap-3">
        <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Internal snapshots live in the app's data folder
          (<code className="font-mono">userData/backups</code>). For a portable copy you can
          move to another computer or keep on a USB drive, use <b>Export Backup (.merpbak)</b> —
          it bundles the full database with a version manifest so restoring is validated.
        </p>
      </div>
    </div>
  );
}
