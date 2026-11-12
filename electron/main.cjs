const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const db = require('./database.cjs');
const ai = require('./ai.cjs');
const { detectLegacyInstall } = require('./legacy-install-detector.cjs');
const googleDrive = require('./googleDrive.cjs');

// Test hook (e2e/CI only): redirect userData to a scratch directory so the
// app NEVER touches the real database during automated verification. Never
// set this in production.
if (process.env.WRA_USER_DATA_DIR) {
  try {
    app.setPath('userData', process.env.WRA_USER_DATA_DIR);
    console.log('[Main] WRA_USER_DATA_DIR override active — userData =', app.getPath('userData'));
  } catch (e) {
    console.warn('[Main] WRA_USER_DATA_DIR override failed (non-fatal):', e.message);
  }
}

// Single-instance lock. Two copies of the app opening the same database file
// is exactly how checkpoints go busy and backups silently miss committed
// frames — so a second copy must NEVER open the database; it focuses the
// existing window instead.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  console.warn('[Main] Another instance is already running — quitting this copy.');
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    show: false, // No white flash / loading screen — show only once React has painted
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Manufacturing ERP',
  });

  // Chromium persists accidental page zoom per origin (Ctrl+Scroll / Ctrl+-),
  // and once persisted it appears on EVERY page — looking exactly like the
  // whole app "shrinking after clicking". Pin zoom to 100%.
  //
  // IMPORTANT: webContents.setZoomLevelLimits() does NOT exist in Electron 44.
  // Calling it threw a TypeError here during startup, which aborted window
  // creation entirely: the main process kept running with no window, so the
  // installed app looked like it "never opened". Only use APIs this Electron
  // build actually has, and never let a zoom tweak take the window down.
  const pinZoom = () => {
    if (mainWindow.isDestroyed()) return;
    try {
      mainWindow.webContents.setZoomFactor(1);
    } catch (e) {
      console.warn('[Main] Could not reset zoom factor:', e.message);
    }
  };

  // Block the keyboard zoom shortcuts (Ctrl/Cmd +/-/0) entirely.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const modifier = process.platform === 'darwin' ? input.meta : input.control;
    if (!modifier) return;
    if (['+', '=', '-', '_', '0'].includes(input.key)) event.preventDefault();
  });

  // Ctrl+wheel and pinch emit zoom-changed: cancel the change, then snap back.
  mainWindow.webContents.on('zoom-changed', (event) => {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    pinZoom();
  });

  // A persisted zoom level is re-applied on navigation, so reset after load.
  mainWindow.webContents.on('did-finish-load', pinZoom);

  try {
    const visualLimits = mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
    if (visualLimits && typeof visualLimits.catch === 'function') {
      visualLimits.catch(() => {});
    }
  } catch (e) {
    console.warn('[Main] Could not pin visual zoom:', e.message);
  }
  pinZoom();

  // Show the window as soon as the first frame is painted so the user never
  // sees a loading spinner or blank white screen.
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  // Failsafe: if the page never finishes painting (e.g. a hung load), still
  // show the window after a generous timeout rather than leaving it invisible.
  setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 20000);

  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
};

// A startup exception in createWindow() used to leave the app alive with no
// window at all (only background processes in Task Manager). Never fail
// silently again: surface the error instead of becoming an invisible process.
const createWindowSafe = () => {
  try {
    createWindow();
  } catch (error) {
    console.error('[Main] Failed to create the main window:', error);
    dialog.showErrorBox(
      'Application failed to start',
      'The main window could not be created.\n\n' +
      (error && (error.stack || error.message) ? (error.stack || error.message) : String(error))
    );
  }
};

// Only the lock holder may proceed with startup wiring and window creation.
if (gotSingleInstanceLock) app.whenReady().then(() => {
  console.log('[Main] App ready, userData:', app.getPath('userData'));

  // AI gateway config lives in userData (key never in renderer/SQLite).
  ai.initAiConfig(app.getPath('userData'));

  const fs = require('fs');
  const dbPath = require('path').join(app.getPath('userData'), 'manufacturing-erp.sqlite');

  // ── Database recovery: if DB is missing, try to restore from update-safe backup FIRST ──
  // This MUST happen before initializeDatabase() because that call creates a new empty
  // DB file — making fs.existsSync() always return true afterwards.
  if (fs.existsSync(dbPath)) {
    const stat = fs.statSync(dbPath);
    console.log('[Main] Existing database found:', dbPath, 'size:', stat.size, 'bytes');
  } else {
    console.log('[Main] Database not found at', dbPath);
    console.log('[Main] Attempting recovery from update-safe backup...');
    const recoveryResult = db.restoreFromUpdateSafeBackup();
    if (recoveryResult.success) {
      console.log('[Main] Database recovered successfully from update-safe backup');
    } else {
      // LOUD — but only when there is evidence this machine previously had
      // data. On a genuine first install there is nothing to lose, and
      // showing an alarming dialog to every new user would be wrong too.
      // Evidence of prior data, scoped to THIS profile's own artifacts — the
      // userData backups folder (survives uninstalls with deleteAppDataOnUninstall:false)
      // and the update-safe backup next to the EXE. A Documents-folder copy is
      // deliberately NOT used as a signal: it belongs to the machine, not to
      // this profile, and would false-positive on every fresh install and in
      // isolated test profiles.
      const backupsDir = path.join(app.getPath('userData'), 'backups');
      const hasUserBackups = (() => {
        try {
          return fs.existsSync(backupsDir)
            && fs.readdirSync(backupsDir).some(f =>
              (f.startsWith('manufacturing-erp-') && f.endsWith('.sqlite.bak'))
              || f.startsWith('pre-restore-safety-')
              || f.startsWith('pre-import-safety-'));
        } catch { return false; }
      })();
      const updateSafeBackup = (() => {
        try {
          return fs.existsSync(path.join(path.dirname(app.getPath('exe')), 'pre-update-backup.sqlite'));
        } catch { return false; }
      })();
      const hadPriorData = hasUserBackups || updateSafeBackup;
      const reason = (recoveryResult && recoveryResult.error) ? recoveryResult.error : 'no usable update-safe backup found';
      if (hadPriorData) {
        // LOUD, not silent: a missing production database previously holding
        // data almost certainly means it disappeared UNEXPECTEDLY.
        console.error('[Main] Database missing and recovery failed — backups exist but no database was found:', reason);
        dialog.showErrorBox(
          'Your data file is missing',
          `The application could not find its database at:\n${dbPath}\n\n` +
          `This computer HAS previous backups, so a missing database is not a fresh install.\n\n` +
          `A NEW, EMPTY database will now be created. Your previous data was NOT deleted — it is simply not being opened by this copy of the app.\n\n` +
          `To recover your records, close the app and restore your most recent backup (.merpbak) via Settings → System Maintenance → Restore from file.\n\n` +
          `Recovery detail: ${reason}`
        );
      } else {
        console.log('[Main] First launch (or no prior backups anywhere) — creating a new empty database.');
      }
    }
  }

  // Initialize database (creates tables if needed — no-op if DB already has them)
  const initResult = db.initializeDatabase();
  if (!initResult.success) {
    console.error('[Main] Database initialization failed');
    dialog.showErrorBox(
      'Database initialization failed',
      'The application could not open or initialize its database. It will now close.\n\n' +
      'If this keeps happening, restore from your most recent backup (.merpbak).'
    );
    app.quit();
    return;
  }
  if (initResult.integrity && initResult.integrity !== 'ok') {
    // Corrupt database: keep the app open so the user can restore from a
    // backup, but make unmistakably clear that nothing should be saved.
    dialog.showErrorBox(
      'Database integrity check FAILED',
      'The integrity check of your database FAILED, which means the stored data may be corrupt.\n\n' +
      'DO NOT enter or change any records. Close the app and restore your most recent backup (.merpbak) via Settings → System Maintenance → Restore from file.'
    );
  }

  // Daily backup: one snapshot per calendar day (startup + hourly re-check so
  // long-running desktop sessions still get the day's snapshot if the app was
  // left open across midnight). Each snapshot is also copied to a user-visible
  // Documents/Manufacturing ERP Backups folder by runDailyBackup().
  const runDailyBackupSafe = () => {
    try {
      const result = db.runDailyBackup();
      if (result.success && result.skipped) {
        console.log('[Main] Backup for today already exists, skipping');
      } else if (result.success) {
        console.log('[Main] Daily backup created:', result.path);
      } else {
        console.warn('[Main] Daily backup failed:', result.error);
      }
    } catch (e) {
      console.warn('[Main] Daily backup check failed (non-fatal):', e.message);
    }
  };
  runDailyBackupSafe();
  const dailyBackupTimer = setInterval(runDailyBackupSafe, 60 * 60 * 1000);
  app.on('will-quit', () => clearInterval(dailyBackupTimer));

  // Register IPC handlers
  ipcMain.handle('db:initialize', async () => {
    try {
      const result = db.initializeDatabase();
      return result;
    } catch (error) {
      return { success: false, error: { message: error.message } };
    }
  });

  ipcMain.handle('db:query', async (event, req) => {
    try {
      const rows = db.query(req.sql, req.params);
      return { id: req.id, success: true, data: rows };
    } catch (error) {
      return { id: req.id, success: false, error: { message: error.message } };
    }
  });

  ipcMain.handle('db:queryOne', async (event, req) => {
    try {
      const row = db.queryOne(req.sql, req.params);
      return { id: req.id, success: true, data: row || null };
    } catch (error) {
      return { id: req.id, success: false, error: { message: error.message } };
    }
  });

  ipcMain.handle('db:execute', async (event, req) => {
    try {
      const result = db.execute(req.sql, req.params);
      return { id: req.id, success: true, data: result };
    } catch (error) {
      return { id: req.id, success: false, error: { message: error.message } };
    }
  });

  ipcMain.handle('db:transaction', async (event, req) => {
    try {
      const results = db.transaction(req.operations);
      return { id: req.id, success: true, data: results };
    } catch (error) {
      return { id: req.id, success: false, error: { message: error.message } };
    }
  });

  ipcMain.handle('db:close', async () => {
    try {
      db.closeDatabase();
      return { success: true };
    } catch (error) {
      return { success: false, error: { message: error.message } };
    }
  });

  ipcMain.handle('db:integrityCheck', async () => {
    try {
      const result = db.runIntegrityCheck();
      return result;
    } catch (error) {
      return { success: false, details: [error.message], error: error.message };
    }
  });

  ipcMain.handle('db:diag', async () => {
    try {
      const fs = require('fs');
      const p = require('path').join(app.getPath('userData'), 'manufacturing-erp.sqlite');
      const exists = fs.existsSync(p);
      const info = { path: p, exists, size: exists ? fs.statSync(p).size : 0 };
      return { success: true, data: info };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ─── Native Backup File Dialogs ───────────────────────────────────────────

  ipcMain.handle('dialog:exportBackup', async () => {
    try {
      const { dialog } = require('electron');
      const result = await dialog.showSaveDialog({
        title: 'Export Unified Backup',
        defaultPath: path.join(app.getPath('documents'), `manufacturing-erp-backup-${new Date().toISOString().slice(0, 10)}.merpbak`),
        filters: [
          { name: 'Manufacturing ERP Backup (.merpbak)', extensions: ['merpbak'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }
      // Ensure the file has the .merpbak extension so the manifest format is clear.
      // Replace any other extension the user typed (e.g. foo.sqlite → foo.merpbak).
      let target = result.filePath;
      if (!target.toLowerCase().endsWith('.merpbak')) {
        const dot = target.lastIndexOf('.');
        const sep = target.lastIndexOf(path.sep);
        if (dot > sep) {
          target = target.slice(0, dot) + '.merpbak';
        } else {
          target = target + '.merpbak';
        }
      }
      const exportResult = db.exportUnifiedBackupToPath(target);
      return exportResult;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dialog:importBackup', async () => {
    try {
      const { dialog } = require('electron');
      const result = await dialog.showOpenDialog({
        title: 'Import Unified Backup',
        filters: [
          { name: 'Manufacturing ERP Backup (.merpbak)', extensions: ['merpbak'] },
          { name: 'SQLite Database (legacy)', extensions: ['sqlite', 'db', 'bak'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }
      const importResult = db.importUnifiedBackupFromPath(result.filePaths[0]);
      return importResult;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ─── Google Drive backup upload ──────────────────────────────────────────
  // Renders the "Backup to Drive" card in Settings → Maintenance. Everything
  // that talks to Google lives in ./googleDrive.cjs; these are thin wrappers.

  ipcMain.handle('google:status', async () => {
    try {
      return googleDrive.getStatus();
    } catch (error) {
      return { configured: false, signedIn: false, folderName: 'Manufacturing ERP Backups', message: error.message };
    }
  });

  ipcMain.handle('google:signIn', async () => {
    try {
      return await googleDrive.signIn();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('google:signOut', async () => {
    try {
      return googleDrive.signOut();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('google:uploadBackup', async () => {
    try {
      return await googleDrive.uploadTodayBackup();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('google:setCredentials', async (_event, creds) => {
    try {
      return googleDrive.setCredentials(creds || {});
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('google:clearCredentials', async () => {
    try {
      return googleDrive.clearCredentials();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ─── Auto-Update ──────────────────────────────────────────────────────────
  // Full documentation: https://www.electron.build/auto-update

  function sendUpdateStatus(status) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send('update:status', status);
    }
  }

  // ── Configuration ───────────────────────────────────────────────────────
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.channel = 'latest'

  autoUpdater.logger = {
    info: (msg) => console.log('[AutoUpdater]', msg),
    warn: (msg) => console.warn('[AutoUpdater]', msg),
    error: (msg) => console.error('[AutoUpdater]', msg),
  };

  // ── Check Schedule ─────────────────────────────────────────────────────
  // A single failed check at startup used to leave the app stuck on the old
  // version until the user fully restarted it. GitHub has served 504s to
  // anonymous update checks for hours, so one attempt is not enough.
  //
  // Attempt 1 runs shortly after launch. Failures retry with backoff, then
  // fall back to a periodic check every few hours. Automatic checks stay
  // silent until every retry has failed; only then does the UI show a quiet
  // "couldn't check for updates" card. Manual checks always report back.
  const UPDATE_FIRST_CHECK_DELAY_MS = 5000;
  const UPDATE_RETRY_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000];
  const UPDATE_PERIODIC_INTERVAL_MS = 4 * 60 * 60_000;
  const UPDATE_PERIODIC_JITTER_MS = 15 * 60_000;

  let updateCheckTimer = null;
  let updateCheckInFlight = false;
  let updateCheckReason = 'startup';
  let updateFailures = 0;
  let updateLastError = '';
  let updateLastFailureAt = 0;
  let updateReadyVersion = null;

  const describeDelay = (ms) => {
    const seconds = Math.max(1, Math.round(ms / 1000));
    return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;
  };

  const nextPeriodicDelay = () =>
    UPDATE_PERIODIC_INTERVAL_MS + Math.floor(Math.random() * UPDATE_PERIODIC_JITTER_MS);

  function scheduleUpdateCheck(delayMs, reason) {
    if (updateCheckTimer) {
      clearTimeout(updateCheckTimer);
      updateCheckTimer = null;
    }
    updateCheckTimer = setTimeout(() => {
      updateCheckTimer = null;
      void runUpdateCheck(reason);
    }, delayMs);
    // Do not keep the process alive just to run an update check.
    if (typeof updateCheckTimer.unref === 'function') updateCheckTimer.unref();
  }

  function reportUpdateFailure(error, { manual }) {
    // electron-updater can emit `error` and reject the check promise for the
    // same failure. Count it once so the backoff is not shortened — but never
    // swallow a failure the user explicitly asked for.
    const now = Date.now();
    if (!manual && now - updateLastFailureAt < 2000) return;
    updateLastFailureAt = now;

    updateFailures += 1;
    updateLastError = error?.message || String(error);
    const canRetry = updateFailures <= UPDATE_RETRY_DELAYS_MS.length;
    const delay = canRetry
      ? UPDATE_RETRY_DELAYS_MS[updateFailures - 1]
      : nextPeriodicDelay();
    const quiet = canRetry && !manual;
    const message = canRetry
      ? `Couldn't check for updates. Retrying in ${describeDelay(delay)}.`
      : "Couldn't check for updates. Will try again automatically.";

    console.warn(
      `[AutoUpdater] Check failed (attempt ${updateFailures}): ${updateLastError}. ` +
      `Next attempt in ${describeDelay(delay)}.`
    );
    sendUpdateStatus({
      status: 'error',
      message,
      detail: updateLastError,
      silent: quiet,
      retryable: true,
      attempts: updateFailures,
    });
    scheduleUpdateCheck(delay, canRetry ? 'retry' : 'periodic');
  }

  async function runUpdateCheck(reason) {
    if (!app.isPackaged) return { success: true, skipped: true };
    if (updateCheckInFlight) {
      // A manual click while a background check is already running adopts
      // that check: the user is now watching, so its result must not be silent.
      if (reason === 'manual') updateCheckReason = 'manual';
      return { success: true, skipped: true };
    }
    // Once an update is downloaded and waiting for install, stop automatic
    // re-checks — they would re-emit update-downloaded and run the pre-install
    // database backup again for the same version. Manual checks still work.
    if (reason !== 'manual' && updateReadyVersion) return { success: true, skipped: true };
    // A manual check starts a fresh backoff cycle instead of inheriting the
    // failures that made the user click the button in the first place.
    if (reason === 'manual') updateFailures = 0;

    updateCheckInFlight = true;
    updateCheckReason = reason;
    try {
      await autoUpdater.checkForUpdates();
      updateFailures = 0;
      updateLastError = '';
      scheduleUpdateCheck(nextPeriodicDelay(), 'periodic');
      return { success: true };
    } catch (error) {
      reportUpdateFailure(error, { manual: updateCheckReason === 'manual' });
      return { success: false, error: updateLastError };
    } finally {
      updateCheckInFlight = false;
    }
  }

  // ── Event Handlers ─────────────────────────────────────────────────────
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...');
    sendUpdateStatus({
      status: 'checking',
      message: 'Checking for updates...',
      // Background checks (startup, retries, periodic) must not pop a toast.
      silent: updateCheckReason !== 'manual',
    });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    // `autoDownload = true` handles downloading automatically; this notification
    // lets the UI show the available-version banner while download runs.
    sendUpdateStatus({ status: 'available', message: `Version ${info.version} available`, info });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] No updates available');
    sendUpdateStatus({
      status: 'up-to-date',
      message: `Up to date (v${app.getVersion()})`,
      info,
      // Only a user-initiated check should announce that it is up to date.
      silent: updateCheckReason !== 'manual',
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    console.log('[AutoUpdater] Downloading...', `${pct}%`);
    sendUpdateStatus({
      status: 'downloading',
      message: `Downloading update... ${pct}%`,
      percent: pct,
      bytesPerSecond: progress.bytesPerSecond,
      total: progress.total,
      transferred: progress.transferred,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);

    // ── Critical: backup database before update installs ──
    // The backup goes to the EXE directory which survives uninstall.
    // Only back up once per version: a manual re-check after the download
    // re-emits this event from the cache, and a second backup is pointless.
    if (updateReadyVersion !== info.version) {
      const backupResult = db.createUpdateSafeBackup();
      if (backupResult.success) {
        console.log('[AutoUpdater] Pre-update database backup saved:', backupResult.path);
      } else {
        console.warn('[AutoUpdater] Pre-update backup failed (non-fatal):', backupResult.error);
      }
    }
    updateReadyVersion = info.version;

    sendUpdateStatus({
      status: 'downloaded',
      message: `Version ${info.version} ready to install — database backed up`,
      info,
    });

    // ── No forced install at launch ──
    // The update downloads silently in the background and installs either
    // (a) silently when the user quits the app (autoInstallOnAppQuit), or
    // (b) via the in-app "Restart & Update" button. This prevents the app
    // from quitting itself and showing an installer window right after
    // startup, which users mistook for a blocking install screen.
    console.log('[AutoUpdater] Update downloaded; will install on quit or via Restart & Update');
  });

  autoUpdater.on('error', (error) => {
    console.error('[AutoUpdater] Error:', error.message);
    updateLastError = error.message;
    // A failed CHECK is handled (and retried) by runUpdateCheck's catch. This
    // event also fires for failed background DOWNLOADS, which happen after the
    // check promise has resolved — retry those on the same backoff instead of
    // waiting for the next periodic check.
    if (!updateCheckInFlight) {
      reportUpdateFailure(error, { manual: updateCheckReason === 'manual' });
    }
  });

  // ── IPC Handlers ────────────────────────────────────────────────────────
  ipcMain.handle('update:check', async () => {
    // Never throws: failures are reported through update:status and retried
    // on the schedule above, so the renderer just needs success/skipped.
    return runUpdateCheck('manual');
  });

  ipcMain.handle('update:install', async () => {
    try {
      // Silent install (isSilent=true) so the NSIS installer UI never pops up;
      // the app relaunches automatically after the update is applied.
      setImmediate(() => autoUpdater.quitAndInstall(true, true));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ─── Update Migration Notice (legacy per-machine install detection) ──
  // v1.0.2 and earlier installed per-machine (C:\Program Files\...). Users
  // still on that copy see a duplicate app after updating to the per-user
  // build. The renderer asks for the install state so it can show an
  // in-app notice guiding them to uninstall the old copy.
  ipcMain.handle('migration:checkLegacyInstall', async () => {
    try {
      const data = detectLegacyInstall();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  createWindowSafe();

  // First check runs shortly after launch, then the schedule owns every
  // subsequent attempt (retry backoff or the periodic re-check).
  if (app.isPackaged) {
    console.log('[AutoUpdater] First update check scheduled in 5s');
    scheduleUpdateCheck(UPDATE_FIRST_CHECK_DELAY_MS, 'startup');
  } else {
    console.log('[AutoUpdater] Skipping update check in dev mode');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindowSafe();
    }
  });

  // AI (Groq) IPC handlers — config, tool-calling chat, Whisper transcription.
  ai.registerAiHandlers(ipcMain);
});

// Close the database cleanly on shutdown: pending WAL frames are checkpointed
// and the connection is closed before the process exits — never rely on the
// native addon's exit destructor.
app.on('before-quit', () => {
  try {
    db.closeDatabase();
    console.log('[Main] Database closed cleanly on quit');
  } catch (e) {
    console.warn('[Main] Database close on quit failed (WAL will be replayed on next open):', e.message);
  }
});

if (gotSingleInstanceLock) {
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
