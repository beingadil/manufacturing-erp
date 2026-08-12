const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const db = require('./database.cjs');
const { detectLegacyInstall } = require('./legacy-install-detector.cjs');

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

app.whenReady().then(() => {
  console.log('[Main] App ready, userData:', app.getPath('userData'));

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
      console.log('[Main] No update-safe backup found — will create new database');
    }
  }

  // Initialize database (creates tables if needed — no-op if DB already has them)
  const initResult = db.initializeDatabase();
  if (!initResult.success) {
    console.error('[Main] Database initialization failed');
    app.quit();
    return;
  }

  // Schedule daily backup (check if already done today)
  const today = new Date().toISOString().slice(0, 10);
  try {
    const fs = require('fs');
    const backupsDir = require('path').join(app.getPath('userData'), 'backups');
    const files = fs.existsSync(backupsDir)
      ? fs.readdirSync(backupsDir).filter(f => f.includes(today))
      : [];
    if (files.length === 0) {
      console.log('[Main] No backup for today, creating one...');
      db.backupDatabase();
    } else {
      console.log('[Main] Backup for today already exists, skipping');
    }
  } catch (e) {
    console.warn('[Main] Backup schedule check failed (non-fatal):', e.message);
  }

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

  ipcMain.handle('db:backup', async () => {
    try {
      const result = db.backupDatabase();
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:restore', async (event, backupPath) => {
    try {
      const result = db.restoreDatabase(backupPath);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:listBackups', async () => {
    try {
      const result = db.listBackups();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('db:deleteBackup', async (event, filename) => {
    try {
      const result = db.deleteBackup(filename);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
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

  // ── Event Handlers ─────────────────────────────────────────────────────
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...');
    sendUpdateStatus({ status: 'checking', message: 'Checking for updates...' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    // `autoDownload = true` handles downloading automatically; this notification
    // lets the UI show the available-version banner while download runs.
    sendUpdateStatus({ status: 'available', message: `Version ${info.version} available`, info });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] No updates available');
    sendUpdateStatus({ status: 'up-to-date', message: `Up to date (v${app.getVersion()})`, info });
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
    const backupResult = db.createUpdateSafeBackup();
    if (backupResult.success) {
      console.log('[AutoUpdater] Pre-update database backup saved:', backupResult.path);
    } else {
      console.warn('[AutoUpdater] Pre-update backup failed (non-fatal):', backupResult.error);
    }

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
    // Don't show network errors to users — they're expected behind firewalls
    sendUpdateStatus({ status: 'error', message: error.message, silent: true });
  });

  // ── IPC Handlers ────────────────────────────────────────────────────────
  ipcMain.handle('update:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (error) {
      console.warn('[AutoUpdater] Check failed:', error.message);
      return { success: false, error: error.message };
    }
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

  createWindow();

  // Check for updates after a delay (give the window time to render)
  setTimeout(() => {
    if (app.isPackaged) {
      console.log('[AutoUpdater] Starting update check...');
      autoUpdater.checkForUpdates().catch(err => {
        console.warn('[AutoUpdater] Initial check failed:', err.message);
      });
    } else {
      console.log('[AutoUpdater] Skipping update check in dev mode');
    }
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
