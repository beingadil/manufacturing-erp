#!/usr/bin/env node
/**
 * README link checker.
 *
 * Fails the build when the README references a repository path that does not exist
 * or is gitignored. GitHub renders broken links as plain text, and a link to a file
 * that is not tracked looks fine locally but 404s on the repo page.
 *
 * Three reference forms are checked:
 *   1. Markdown links      [text](path)
 *   2. HTML image sources  <img src="path">
 *   3. Bare backticked paths  `docs/SQLITE_SCHEMA.md`
 *
 * The third form matters: the previous README pointed at memory.md and
 * RELEASE_NOTES.md in plain backticks, which a markdown-link-only checker misses.
 *
 * Usage:  node scripts/check-readme-links.cjs [path-to-readme]
 * Exit:   0 = every reference resolves, 1 = at least one is broken
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const README = process.argv[2] || 'README.md';
const md = fs.readFileSync(README, 'utf8');

// Build output and tool caches. These are gitignored on purpose, so a README that
// names one ("the installer is written to dist-electron/") is correct, not broken.
const BUILD_OUTPUT = [
  'dist',
  'dist-electron',
  'node_modules',
  '.rules',
  'dist-ssr',
  'output',
];

const targets = new Set();

// 1. Markdown links
for (const m of md.matchAll(/\]\(([^)\s]+)\)/g)) targets.add(m[1]);
// 2. HTML image sources
for (const m of md.matchAll(/<img[^>]+src="([^"]+)"/g)) targets.add(m[1]);
// 3. Bare backticked paths that look like repository paths
for (const m of md.matchAll(/`([^`\n]+)`/g)) {
  const t = m[1].trim();
  if (/^[a-z-]+\s+/.test(t)) continue; // shell command, not a path
  if (/^(https?:|mailto:)/.test(t)) continue;
  if (/^\.[a-z]+$/.test(t)) continue; // bare file extension: `.sqlite`, `.merpbak`
  if (!/^[A-Za-z0-9_.][\w./-]*$/.test(t)) continue; // contains spaces / prose
  const top = t.replace(/^\.\//, '').split(/[\\/]/)[0];
  if (BUILD_OUTPUT.includes(top)) continue; // gitignored build output
  if (!/[/]|\.(md|ya?ml|json|cjs|ts|tsx|svg|lock)$/.test(t)) continue;
  targets.add(t);
}

let broken = 0;
let checked = 0;

for (const raw of [...targets].sort()) {
  if (/^(https?:|mailto:|#)/.test(raw)) continue;
  const rel = decodeURIComponent(raw.split('#')[0]);
  if (!rel) continue;
  checked++;

  const exists = fs.existsSync(rel);

  let ignored = false;
  try {
    execFileSync('git', ['check-ignore', '-q', rel], { stdio: 'ignore' });
    ignored = true;
  } catch {
    /* not ignored */
  }

  const ok = exists && !ignored;
  if (!ok) broken++;
  const note = !exists ? '   <-- does not exist' : ignored ? '   <-- gitignored, invisible on GitHub' : '';
  console.log(`${ok ? 'OK    ' : 'BROKEN'}  ${raw}${note}`);
}

console.log(`\n${checked} path references checked, ${broken} broken.`);
process.exit(broken ? 1 : 0);