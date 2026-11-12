import { CheckCircle2, CloudUpload, Database, FileDown, FileUp, Loader2, LogOut, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';
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

interface GoogleDriveStatus {
  configured: boolean;
  signedIn: boolean;
  folderName?: string;
  folderId?: string | null;
  message?: string;
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
  const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus | null>(null);
  const [driveBusy, setDriveBusy] = useState<'signin' | 'upload' | 'signout' | null>(null);
  const [lastDriveUpload, setLastDriveUpload] = useState<string | null>(null);

  const refreshDriveStatus = async () => {
    const db = electronDB() as any;
    try {
      const status = await db?.googleStatus?.();
      setDriveStatus(status && typeof status === 'object' ? status : { configured: false, signedIn: false });
    } catch {
      setDriveStatus({ configured: false, signedIn: false });
    }
  };

  useEffect(() => {
    if (isDesktop) void refreshDriveStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  const handleDriveSignIn = async () => {
    const db = electronDB() as any;
    if (!db?.googleSignIn) return;
    setDriveBusy('signin');
    try {
      const res = await db.googleSignIn();
      if (res?.success) {
        toast.success('Signed in to Google');
        await refreshDriveStatus();
      } else {
        toast.error('Could not sign in to Google', { description: res?.error || res?.message || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Could not sign in to Google', { description: e?.message });
    }
    setDriveBusy(null);
  };

  const handleDriveSignOut = async () => {
    const db = electronDB() as any;
    if (!db?.googleSignOut) return;
    setDriveBusy('signout');
    try {
      const res = await db.googleSignOut();
      if (res?.success !== false) {
        setLastDriveUpload(null);
        toast.success('Signed out of Google');
        await refreshDriveStatus();
      }
    } finally {
      setDriveBusy(null);
    }
  };

  const handleDriveUpload = async () => {
    const db = electronDB() as any;
    if (!db?.googleUploadBackup) return;
    setDriveBusy('upload');
    try {
      const res = await db.googleUploadBackup();
      if (res?.success) {
        setLastDriveUpload(res.name || 'backup');
        toast.success('Backup uploaded to Google Drive', { description: res.name });
        await refreshDriveStatus();
      } else {
        toast.error('Upload failed', { description: res?.message || res?.error || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Upload failed', { description: e?.message });
    }
    setDriveBusy(null);
  };

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
        // Note: clearStorageMirrors() above also suspends all persist writes,
        // so no stale in-memory state can be persisted over the restored
        // database in the window before the reload.
        setTimeout(() => window.location.reload(), 400);
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

      {driveStatus && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border/50 bg-muted/40">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <CloudUpload className="h-5 w-5 text-primary" />
              Google Drive Backup
              {!driveStatus.configured && (
                <span className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Not set up</span>
              )}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              One tap makes today's backup and uploads it to your Google Drive — into the
              “Manufacturing ERP Backups” folder. Nothing is ever deleted.
            </p>
          </div>
          <div className="p-6">
            {!driveStatus.configured ? (
              <div className="text-sm text-muted-foreground">
                <p className="max-w-lg">
                  Free, one-time setup in Google Cloud. No credit card needed — the Drive API is free,
                  and the <code>drive.file</code> scope only sees the app's own files.
                </p>
                <ol className="mt-3 space-y-1.5 list-decimal list-inside max-w-lg">
                  <li>Go to <span className="font-mono text-foreground">console.cloud.google.com</span> and create a project (e.g. “Manufacturing ERP”).</li>
                  <li><span className="font-medium text-foreground">APIs &amp; Services → Library</span> → search “Google Drive API” → Enable.</li>
                  <li><span className="font-medium text-foreground">APIs &amp; Services → OAuth consent screen</span> → External, add your email as a test user, add only the <code>drive.file</code> scope.</li>
                  <li><span className="font-medium text-foreground">APIs &amp; Services → Credentials</span> → Create Credentials → OAuth client ID → <span className="font-medium text-foreground">Desktop app</span>.</li>
                  <li>Paste the Client ID and Client Secret into <span className="font-mono text-foreground">electron/googleDrive.cjs</span> (the two placeholders at the top), then rebuild the app.</li>
                </ol>
              </div>
            ) : !driveStatus.signedIn ? (
              <div className="flex flex-wrap items-center gap-4">
                <p className="text-sm text-muted-foreground max-w-md flex-1">
                  Sign in to your Google account. The app can only see the backups it uploads
                  (the <code>drive.file</code> scope) — nothing else in your Drive.
                </p>
                <button
                  onClick={handleDriveSignIn}
                  disabled={driveBusy !== null}
                  className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {driveBusy === 'signin' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                  {driveBusy === 'signin' ? 'Waiting for Google…' : 'Sign in with Google'}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <p className="text-sm text-muted-foreground max-w-md flex-1">
                  {lastDriveUpload
                    ? <>Last upload: <span className="font-medium text-foreground">{lastDriveUpload}</span>. Find it in Drive under “Manufacturing ERP Backups”.</>
                    : <>Signed in and ready. Today's backup will land in “Manufacturing ERP Backups” in your Drive.</>}
                </p>
                <button
                  onClick={handleDriveSignOut}
                  disabled={driveBusy !== null}
                  className="flex items-center gap-2 px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
                <button
                  onClick={handleDriveUpload}
                  disabled={driveBusy !== null}
                  className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {driveBusy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                  {driveBusy === 'upload' ? 'Uploading…' : 'Backup to Drive'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
