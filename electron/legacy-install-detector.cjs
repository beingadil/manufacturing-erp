// electron/legacy-install-detector.cjs
//
// Detects "legacy per-machine install" situations for the in-app update
// migration notice.
//
// Background: v1.0.0–v1.0.2 of the NSIS installer used perMachine:true, so
// the app installed into C:\Program Files\<ProductName>. v1.0.3+ switched to
// per-user installs (%LOCALAPPDATA%\Programs). Windows treats a per-machine
// and a per-user install as two DIFFERENT apps, so anyone still on the old
// copy ended up with a duplicate app after updating. This detector powers an
// in-app banner that guides those users to uninstall the old copy.
//
// The function is pure (dependencies injected) so it can be unit-tested
// without Electron: scripts/test-legacy-install.cjs

const path = require('path');
const fs = require('fs');

// Product names used across releases (the app was renamed at some point).
const PRODUCT_NAMES = ['Manufacturing ERP', 'W-RAW ERP PROFESSIONAL'];

/**
 * Detect legacy per-machine install state.
 *
 * @param {object} [opts] overrides for testability
 * @param {string} [opts.execPath]   defaults to process.execPath
 * @param {object} [opts.env]        defaults to process.env
 * @param {string} [opts.platform]   defaults to process.platform
 * @param {object} [opts.fs]         defaults to require('fs')
 * @param {object} [opts.path]       defaults to require('path')
 * @returns {{
 *   runningFromLegacy: boolean,
 *   legacyInstallPaths: string[],
 *   currentExePath: string,
 *   currentDir: string,
 *   isWindows: boolean,
 * }}
 */
function detectLegacyInstall(opts = {}) {
  const execPath = opts.execPath || process.execPath || '';
  const env = opts.env || process.env || {};
  const platform = opts.platform || process.platform || '';
  const fsImpl = opts.fs || fs;
  const pathImpl = opts.path || path;

  const result = {
    runningFromLegacy: false,
    legacyInstallPaths: [],
    currentExePath: execPath,
    currentDir: execPath ? pathImpl.dirname(execPath) : '',
    isWindows: platform === 'win32',
  };

  if (!result.isWindows) {
    // Per-machine vs per-user is a Windows installer concern only.
    return result;
  }

  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const programFilesBases = [programFiles, programFilesX86].map((p) => p.toLowerCase());
  const currentDirLower = result.currentDir.toLowerCase();

  // 1. Are we RUNNING from a legacy per-machine install?
  result.runningFromLegacy = programFilesBases.some(
    (base) => currentDirLower === base || currentDirLower.startsWith(base + pathImpl.sep),
  );

  // 2. Does a legacy per-machine copy still EXIST on disk? (e.g. we're now
  //    running the per-user build, but the old Program Files copy lingers.)
  const candidates = [];
  for (const base of [programFiles, programFilesX86]) {
    for (const name of PRODUCT_NAMES) {
      candidates.push(pathImpl.join(base, name));
    }
  }

  result.legacyInstallPaths = candidates.filter((dir) => {
    try {
      if (!fsImpl.existsSync(dir)) return false;
      // Require an uninstaller or a known app exe so an empty folder is not
      // mistaken for a real install.
      const hasUninstaller = fsImpl.existsSync(pathImpl.join(dir, 'unins000.exe'));
      const hasAppExe = PRODUCT_NAMES.some((name) =>
        fsImpl.existsSync(pathImpl.join(dir, `${name}.exe`)),
      );
      return hasUninstaller || hasAppExe;
    } catch {
      return false;
    }
  });

  return result;
}

module.exports = { detectLegacyInstall };
