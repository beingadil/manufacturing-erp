import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard against calling Electron APIs that do not exist in the pinned runtime.
 *
 * v1.3.0 shipped with `webContents.setZoomLevelLimits(...)`, which was removed
 * from Electron. The call threw while `createWindow()` was running, so the
 * app started with NO window at all — visible only as background processes.
 * Unit tests could not see it because nothing imports the main process.
 *
 * This test reads `electron/main.cjs`, strips comments, and asserts every
 * `webContents.<method>(...)` call exists on the `WebContents` type of the
 * installed Electron version. A removed or renamed API fails the suite
 * instead of shipping an installer that never opens.
 */
describe('electron main process API compatibility', () => {
  const root = process.cwd();
  const mainSource = readFileSync(resolve(root, 'electron/main.cjs'), 'utf8');
  const typings = readFileSync(resolve(root, 'node_modules/electron/electron.d.ts'), 'utf8');

  const stripComments = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const code = stripComments(mainSource);
  const calls = [...code.matchAll(/webContents\.([A-Za-z0-9_]+)\s*\(/g)].map((m) => m[1]);
  const usedMethods = [...new Set(calls)].sort();

  // Isolate the WebContents class body so a method that only exists on another
  // Electron class cannot satisfy this check.
  const classStart = typings.search(/^\s{2}class WebContents\b/m);
  const afterClass = typings.slice(classStart + 1);
  const nextClassOffset = afterClass.search(/^\s{2}class /m);
  const webContentsBlock =
    nextClassOffset === -1 ? afterClass : afterClass.slice(0, nextClassOffset);

  const declaredMethods = new Set(
    [...webContentsBlock.matchAll(/^\s{4}([A-Za-z0-9_]+)\s*[<(]/gm)].map((m) => m[1])
  );

  it('finds the main process source and the Electron WebContents typings', () => {
    expect(mainSource.length).toBeGreaterThan(0);
    expect(classStart).toBeGreaterThan(-1);
    expect(declaredMethods.size).toBeGreaterThan(10);
    expect(usedMethods.length).toBeGreaterThan(0);
  });

  it('only uses webContents methods that exist in the pinned Electron version', () => {
    const missing = usedMethods.filter((name) => !declaredMethods.has(name));
    expect(
      missing,
      `Removed or unknown Electron webContents API: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('never references the removed setZoomLevelLimits API', () => {
    expect(usedMethods).not.toContain('setZoomLevelLimits');
  });
});
