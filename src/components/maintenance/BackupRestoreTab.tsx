import React, { useState, useEffect } from 'react';
import { DownloadCloud, AlertTriangle, CheckCircle2, Database, FileDown, FileUp, HardDrive, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// ─── Electron IPC helpers ──────────────────────────────────────────────────
const electronDB = () => (window as any).electronDB;

// ─── BackupRestoreTab ─────────────────────────────────────────────────────
export function BackupRestoreTab() {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const db = electronDB();
      if (db?.listBackups) {
        const res = await db.listBackups();
        if (res.success) setBackups(res.data || []);
      }
    } catch { /* not in electron */ }
    setLoading(false);
  };

  useEffect(() => { loadBackups(); }, []);

  const handleCreateBackup = async () => {
    setBackingUp(true);
    try {
      const db = electronDB();
      if (db?.backup) {
        const res = await db.backup();
        if (res.success) {
          toast.success('Backup Created', { description: 'SQLite database snapshot saved.' });
          await loadBackups();
        } else {
          toast.error('Backup Failed', { description: res.error || 'Unknown error' });
        }
      }
    } catch (e: any) {
      toast.error('Backup Failed', { description: e.message });
    }
    setBackingUp(false);
  };

  const handleRestore = async (backupPath: string) => {
    if (!confirm('WARNING: Restoring will replace ALL current data with the backup. This cannot be undone.\n\nCreate a safety backup first?')) return;
    setRestoring(true);
    try {
      const db = electronDB();
      // Auto safety backup
      if (db?.backup) await db.backup();
      if (db?.restore) {
        const res = await db.restore(backupPath);
        if (res.success) {
          alert('Database restored successfully. The application will now reload.');
          window.location.reload();
        } else {
          toast.error('Restore Failed', { description: res.error });
        }
      }
    } catch (e: any) {
      toast.error('Restore Failed', { description: e.message });
    }
    setRestoring(false);
  };

  const handleExportBackup = async () => {
    const db = electronDB();
    if (!db?.exportBackup) {
      toast.error('Not available', { description: 'Export backup is only available in the desktop app.' });
      return;
    }
    setExporting(true);
    try {
      const result = await db.exportBackup();
      if (result.canceled) return;
      if (result.success) {
        toast.success('Backup Exported', { description: `Saved to: ${result.path}` });
      } else {
        toast.error('Export Failed', { description: result.error || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Export Failed', { description: e.message });
    }
    setExporting(false);
  };

  const handleImportBackup = async () => {
    const db = electronDB();
    if (!db?.importBackup) {
      toast.error('Not available', { description: 'Import backup is only available in the desktop app.' });
      return;
    }
    if (!confirm('WARNING: Importing will REPLACE ALL current data with the backup file.\n\nA safety backup of your current database will be created first.\n\nAre you sure?')) return;
    setImporting(true);
    try {
      const result = await db.importBackup();
      if (result.canceled) return;
      if (result.success) {
        alert('Database imported successfully. The application will now reload.');
        window.location.reload();
      } else {
        toast.error('Import Failed', { description: result.error || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Import Failed', { description: e.message });
    }
    setImporting(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* ── Create & Manage Internal Backups ── */}
      <div className="md:col-span-2 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border/50 bg-muted/40/50">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            SQLite Database Backups
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create, restore, export, and import full SQLite database snapshots. Daily backups are automatic.
          </p>
        </div>
        <div className="p-6 space-y-6">
          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <button
              onClick={handleCreateBackup}
              disabled={backingUp}
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {backingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
              {backingUp ? 'Backing up...' : 'Create Backup'}
            </button>
            <button
              onClick={handleExportBackup}
              disabled={exporting}
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-secondary text-secondary-foreground rounded-xl hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              {exporting ? 'Exporting...' : 'Export to File'}
            </button>
            <button
              onClick={handleImportBackup}
              disabled={importing}
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-2 border-amber-400/50 text-amber-700 dark:text-amber-300 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {importing ? 'Importing...' : 'Import from File'}
            </button>
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/50">
              <HardDrive className="h-4 w-4 shrink-0" />
              <span>Auto-backup daily + before updates</span>
            </div>
          </div>

          {/* Backup List */}
          <div>
            <h4 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wider">Saved Snapshots</h4>
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading backups...</div>
            ) : backups.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground border border-dashed border-border/50 rounded-xl">
                No backups found. Create one to get started.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {backups.map((b, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/20 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{b.filename}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(b.modifiedAt)} &middot; {formatSize(b.size)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRestore(b.path)}
                      disabled={restoring}
                      className="shrink-0 ml-4 px-3 py-1.5 text-xs font-medium border border-border text-foreground rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {restoring ? 'Restoring...' : 'Restore'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
