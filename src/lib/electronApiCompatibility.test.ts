import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard against calling Electron APIs that do not exist in the pinned runtime.
 *
 * v1.3.0 shipped with `webContents.setZoomLevelLimits(...)`, which was removed
 * from Electron. The call threw while `createWindow()` was running, so the app
 * started with NO window at all — visible only as background processes. Unit
 * tests could not see it because nothing imports the main process.
 *
 * This test reads `electron/main.cjs`, strips comments, and checks every call
 * made on a known Electron object against that object's class in the installed
 * `electron.d.ts`. A removed or renamed API fails the suite instead of shipping.
 */

/**
 * The code-side name of each Electron object used in the main process, mapped
 * to the class that declares it in `electron.d.ts`. Only objects we can name
 * unambiguously are checked — a receiver that is really a local variable
 * (`win`, `mainWindow`) cannot be mapped by name alone.
 */
const ELECTRON_OBJECTS: Record<string, string> = {
  webContents: 'WebContents',
  app: 'App',
  BrowserWindow: 'BrowserWindow',
  session: 'Session',
  ipcMain: 'IpcMain',
  ipcRenderer: 'IpcRenderer',
  shell: 'Shell',
  dialog: 'Dialog',
  clipboard: 'Clipboard',
  screen: 'Screen',
  globalShortcut: 'GlobalShortcut',
  powerMonitor: 'PowerMonitor',
  protocol: 'Protocol',
  Menu: 'Menu',
  Tray: 'Tray',
  Notification: 'Notification',
};

describe('electron main process API compatibility', () => {
  const root = process.cwd();
  const mainSource = readFileSync(resolve(root, 'electron/main.cjs'), 'utf8');
  const preloadSource = readFileSync(resolve(root, 'electron/preload.cjs'), 'utf8');
  const typings = readFileSync(resolve(root, 'node_modules/electron/electron.d.ts'), 'utf8');

  const stripComments = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const code = stripComments(mainSource);
  const preloadCode = stripComments(preloadSource);

  /**
   * Members every Electron object inherits from the Node event emitter. The
   * typings declare them on the base class, not on each interface, so they are
   * accepted everywhere.
   */
  const EVENT_EMITTER_MEMBERS = [
    'on', 'once', 'off', 'addListener', 'removeListener', 'removeAllListeners',
    'emit', 'listenerCount', 'listeners', 'setMaxListeners', 'getMaxListeners',
    'prependListener', 'prependOnceListener', 'eventNames',
  ];

  /**
   * Every public member declared on a class or interface in electron.d.ts
   * (instance members and statics). `App` is an interface, `WebContents` a
   * class — both have to be read the same way.
   */
  const membersOf = (name: string): Set<string> => {
    const decl = new RegExp(`^\\s{2}(?:class|interface)\\s+${name}\\b`, 'm').exec(typings);
    if (!decl) return new Set();
    const bodyStart = typings.indexOf('\n', decl.index) + 1;
    const rest = typings.slice(bodyStart);
    const nextDecl = /^\s{2}(?:class|interface|const|let|var|function|type|enum|namespace|abstract|declare)\b/m.exec(rest);
    const block = nextDecl ? rest.slice(0, nextDecl.index) : rest;
    const instance = [...block.matchAll(/^\s{4}(?!static\b)([A-Za-z0-9_]+)\s*[<(]/gm)].map(m => m[1]);
    const statics = [...block.matchAll(/^\s{4}static\s+([A-Za-z0-9_]+)\s*[<(]/gm)].map(m => m[1]);
    return new Set([...instance, ...statics]);
  };

  const declaredMembers = new Map<string, Set<string>>(
    Object.values(ELECTRON_OBJECTS).map(className => [className, membersOf(className)])
  );

  /** Every `object.method(` call in the stripped main process source. */
  const callsOf = (source: string) =>
    [...source.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\.([A-Za-z0-9_$]+)\s*\(/g)].map(m => ({
      receiver: m[1],
      method: m[2],
    }));

  const calls = callsOf(code);
  /** The preload runs in the main process too — a removed API there is just as fatal. */
  const preloadCalls = callsOf(preloadCode);

  /** The calls we can attribute to a known Electron object. */
  const electronCalls = [
    ...calls.filter(call => ELECTRON_OBJECTS[call.receiver]),
    ...preloadCalls.filter(call => ELECTRON_OBJECTS[call.receiver]),
  ];

  it('finds the main process source and the Electron typings', () => {
    expect(mainSource.length).toBeGreaterThan(0);
    expect(preloadSource.length).toBeGreaterThan(0);
    expect(typings.length).toBeGreaterThan(0);
    expect(declaredMembers.size).toBeGreaterThan(5);
    expect(electronCalls.length).toBeGreaterThan(0);
    // Every mapped object must actually be readable from the typings — an
    // unreadable one would silently check nothing.
    for (const [receiver, className] of Object.entries(ELECTRON_OBJECTS)) {
      const members = declaredMembers.get(className);
      expect(members, `${receiver} -> ${className} was not found in electron.d.ts`).toBeTruthy();
      expect(members!.size, `${receiver} -> ${className} has no members`).toBeGreaterThan(0);
    }
  });

  it('only calls Electron methods that exist in the pinned Electron version', () => {
    const missing: string[] = [];
    for (const call of electronCalls) {
      const className = ELECTRON_OBJECTS[call.receiver];
      const members = declaredMembers.get(className);
      if (!members || members.size === 0) continue;
      if (!members.has(call.method) && !EVENT_EMITTER_MEMBERS.includes(call.method)) {
        missing.push(`${call.receiver}.${call.method}() (${className})`);
      }
    }
    expect(
      missing,
      `Removed or unknown Electron API: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('never references the removed setZoomLevelLimits API', () => {
    const used = calls.map(call => call.method);
    expect(used).not.toContain('setZoomLevelLimits');
  });
});
