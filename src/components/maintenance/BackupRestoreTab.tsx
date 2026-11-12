import { CheckCircle2, CloudDownload, CloudUpload, Database, FileDown, FileUp, Loader2, LogOut, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { clearStorageMirrors } from '../../database/sqlite/SQLiteStorageAdapter';
import { formInputClass } from '../form/formStyles';
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

interface DriveBackupFile {
  id: string;
  name: string;
  size: number;
  createdTime: string | null;
  webViewLink: string | null;
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
  const [driveBusy, setDriveBusy] = useState<'signin' | 'upload' | 'signout' | 'save-creds' | null>(null);
  const [lastDriveUpload, setLastDriveUpload] = useState<string | null>(null);
  const [credsId, setCredsId] = useState('');
  const [credsSecret, setCredsSecret] = useState('');
  const [showCredsForm, setShowCredsForm] = useState(false);
  const [showDriveRestore, setShowDriveRestore] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveBackupFile[] | null>(null);
  const [driveListBusy, setDriveListBusy] = useState(false);
  const [driveListError, setDriveListError] = useState<string | null>(null);
  const [restoreCandidateId, setRestoreCandidateId] = useState<string | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);

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

  const handleSaveCredentials = async () => {
    const db = electronDB() as any;
    if (!db?.googleSetCredentials) return;
    setDriveBusy('save-creds');
    try {
      const res = await db.googleSetCredentials({ clientId: credsId, clientSecret: credsSecret });
      if (res?.success) {
        setCredsId('');
        setCredsSecret('');
        setShowCredsForm(false);
        toast.success('Credentials saved');
        await refreshDriveStatus();
      } else {
        toast.error('Credentials were not saved', { description: res?.error || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Credentials were not saved', { description: e?.message });
    }
    setDriveBusy(null);
  };

  const handleClearCredentials = async () => {
    const db = electronDB() as any;
    if (!db?.googleClearCredentials) return;
    try {
      await db.googleClearCredentials();
      setLastDriveUpload(null);
      toast.success('Google Drive credentials cleared');
      await refreshDriveStatus();
    } catch (e: any) {
      toast.error('Could not clear credentials', { description: e?.message });
    }
  };

  const refreshDriveList = async () => {
    const db = electronDB() as any;
    setDriveListBusy(true);
    setDriveListError(null);
    try {
      const res = await db?.googleListBackups?.();
      if (res?.success) {
        setDriveFiles(res.files || []);
      } else {
        setDriveListError(res?.message || res?.error || 'Could not list the Drive backups.');
        setDriveFiles([]);
      }
    } catch (e: any) {
      setDriveListError(e?.message || 'Could not list the Drive backups.');
      setDriveFiles([]);
    }
    setDriveListBusy(false);
  };

  const handleToggleDriveRestore = async () => {
    const next = !showDriveRestore;
    setShowDriveRestore(next);
    if (next) await refreshDriveList();
  };

  const handleRestoreFromDrive = async () => {
    const db = electronDB() as any;
    const fileId = restoreCandidateId;
    if (!db?.googleRestoreBackup || !fileId) return;
    setRestoreBusy(true);
    setRestoreCandidateId(null);
    try {
      const res = await db.googleRestoreBackup(fileId);
      if (res?.success) {
        const info = res?.manifest
          ? `Restored v${res.manifest.appVersion ?? '?'} · ${res.manifest.stores?.length ?? 0} store(s) · ${formatDate(res.manifest.createdAt ?? '')}`
          : `Restored from ${res?.sourceFile || 'Drive'}`;
        toast.success('Restore complete. Reloading…', { description: info });
        clearStorageMirrors();
        setTimeout(() => window.location.reload(), 400);
      } else {
        toast.error('Restore failed', { description: res?.error || 'Unknown error' });
        setRestoreBusy(false);
      }
    } catch (e: any) {
      toast.error('Restore failed', { description: e?.message || 'Unknown error' });
      setRestoreBusy(false);
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

  const credentialsForm = (
    <div className="mt-4 max-w-lg rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-semibold text-foreground mb-3">Your Google OAuth credentials</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="drive-client-id" className="text-xs font-medium text-muted-foreground">Client ID</label>
          <input
            id="drive-client-id"
            type="text"
            value={credsId}
            onChange={e => setCredsId(e.target.value)}
            placeholder="….apps.googleusercontent.com"
            autoComplete="off"
            spellCheck={false}
            className={formInputClass}
          />
        </div>
        <div>
          <label htmlFor="drive-client-secret" className="text-xs font-medium text-muted-foreground">Client secret</label>
          <input
            id="drive-client-secret"
            type="password"
            value={credsSecret}
            onChange={e => setCredsSecret(e.target.value)}
            placeholder="GOCSPX-…"
            autoComplete="off"
            className={formInputClass}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleSaveCredentials}
          disabled={driveBusy !== null || !credsId.trim() || !credsSecret.trim()}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {driveBusy === 'save-creds' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {driveBusy === 'save-creds' ? 'Saving…' : 'Save credentials'}
        </button>
        <button
          onClick={handleClearCredentials}
          className="text-sm font-medium text-destructive/80 hover:text-destructive transition-colors"
        >
          Clear credentials
        </button>
      </div>
    </div>
  );

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
                  <li>Go to <span className="font-mono text-foreground">console.cloud.google.com</span>, create a project (e.g. “Manufacturing ERP”) and enable the <span className="font-medium text-foreground">Google Drive API</span>.</li>
                  <li><span className="font-medium text-foreground">APIs &amp; Services → OAuth consent screen</span> → External, add your own email as a <span className="font-medium text-foreground">test user</span>, keep only the <code>drive.file</code> scope.</li>
                  <li><span className="font-medium text-foreground">APIs &amp; Services → Credentials</span> → Create credentials → OAuth client ID → <span className="font-medium text-foreground">Desktop app</span>.</li>
                  <li>Paste the Client ID and Client secret below. They are stored on this machine — never in the repo — and can be cleared anytime.</li>
                </ol>
                {credentialsForm}
              </div>
            ) : !driveStatus.signedIn ? (
              <div>
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
                  <button
                    onClick={() => setShowCredsForm(v => !v)}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showCredsForm ? 'Hide credentials' : 'Change credentials'}
                  </button>
                </div>
                {showCredsForm && credentialsForm}
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-4">
                  <p className="text-sm text-muted-foreground max-w-md flex-1">
                    {lastDriveUpload
                      ? <>Last upload: <span className="font-medium text-foreground">{lastDriveUpload}</span>. Find it in Drive under “Manufacturing ERP Backups”.</>
                      : <>Signed in and ready. Today's backup will land in “Manufacturing ERP Backups” in your Drive.</>}
                  </p>
                  <button
                    onClick={handleDriveSignOut}
                    disabled={driveBusy !== null || restoreBusy}
                    className="flex items-center gap-2 px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors disabled:opacity-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                  <button
                    onClick={handleToggleDriveRestore}
                    disabled={driveBusy !== null || restoreBusy}
                    className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border border-border text-foreground rounded-xl hover:bg-muted/60 transition-colors disabled:opacity-50"
                  >
                    {restoreBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
                    {restoreBusy ? 'Restoring…' : 'Restore from Drive'}
                  </button>
                  <button
                    onClick={handleDriveUpload}
                    disabled={driveBusy !== null || restoreBusy}
                    className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {driveBusy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                    {driveBusy === 'upload' ? 'Uploading…' : 'Backup to Drive'}
                  </button>
                  <button
                    onClick={() => setShowCredsForm(v => !v)}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showCredsForm ? 'Hide credentials' : 'Change credentials'}
                  </button>
                </div>
                {showCredsForm && credentialsForm}

                {showDriveRestore && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-border max-w-xl">
                    <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-4 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Backups in Drive{driveFiles ? ` (${driveFiles.length})` : ''}
                      </p>
                      <button
                        onClick={refreshDriveList}
                        disabled={driveListBusy}
                        className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        Refresh
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {driveListBusy && (
                        <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading your Drive backups…
                        </div>
                      )}
                      {!driveListBusy && driveListError && (
                        <p className="px-4 py-6 text-sm text-destructive">{driveListError}</p>
                      )}
                      {!driveListBusy && !driveListError && driveFiles && driveFiles.length === 0 && (
                        <p className="px-4 py-6 text-sm text-muted-foreground">
                          No backups in Drive yet. Press “Backup to Drive” first.
                        </p>
                      )}
                      {!driveListBusy && !driveListError && driveFiles && driveFiles.length > 0 && (
                        <ul className="divide-y divide-border/50">
                          {driveFiles.map(file => (
                            <li key={file.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                              <CloudDownload className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                                <p className="text-[11px] tabular-nums text-muted-foreground">
                                  {file.createdTime ? formatDate(file.createdTime) : '—'} · {formatSize(file.size)}
                                </p>
                              </div>
                              <button
                                onClick={() => setRestoreCandidateId(file.id)}
                                disabled={restoreBusy}
                                className="rounded-lg border border-warning/40 px-3 py-1.5 text-xs font-semibold text-warning hover:bg-warning/10 transition-colors disabled:opacity-50"
                              >
                                Restore
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
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

      <AlertDialog open={restoreCandidateId !== null} onOpenChange={open => { if (!open) setRestoreCandidateId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup from Drive?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces everything currently in the app with the contents of the selected
              Drive backup. Your current data is saved first (a safety copy), and the app
              restarts when the restore finishes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleRestoreFromDrive();
              }}
            >
              Download and restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
