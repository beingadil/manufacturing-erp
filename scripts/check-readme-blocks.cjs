#!/usr/bin/env node
/**
 * Guard against README code blocks that overflow the rendered README column.
 *
 * GitHub renders a fenced code block that is wider than the content column with a
 * horizontal scrollbar, which silently clips ASCII diagrams — the diagram still
 * exists in the source but the reader loses the right-hand edge on the repo page.
 * This fails when any fenced block exceeds MAX_WIDTH.
 *
 * Usage:  node scripts/check-readme-blocks.cjs [path-to-readme]
 * Exit:   0 = every block fits, 1 = at least one is too wide
 */
const fs = require('fs');

const README = process.argv[2] || 'README.md';
// GitHub's README column starts adding a horizontal scrollbar at around 60
// monospace characters. Anything wider gets clipped or needs dragging, which is
// what silently ate the right edge of the architecture diagram.
const MAX_WIDTH = 60;

const md = fs.readFileSync(README, 'utf8');
const lines = md.split(/\r?\n/);

let inBlock = false;
let startLine = 0;
let widest = 0;
let widestLine = '';
const offenders = [];

lines.forEach((line, i) => {
  if (line.trimStart().startsWith('```')) {
    if (!inBlock) {
      inBlock = true;
      startLine = i + 1;
      widest = 0;
      widestLine = '';
    } else {
      inBlock = false;
      if (widest > MAX_WIDTH) {
        offenders.push({ startLine, endLine: i + 1, widest, widestLine });
      }
    }
    return;
  }
  if (!inBlock) return;
  const w = [...line].length;
  if (w > widest) {
    widest = w;
    widestLine = line;
  }
});

for (const o of offenders) {
  console.log(
    `TOO WIDE  lines ${o.startLine}-${o.endLine}: ${o.widest} chars (max ${MAX_WIDTH})`,
  );
  console.log(`          ${o.widestLine.trim()}`);
}
console.log(`\n${offenders.length} oversized code block(s); limit is ${MAX_WIDTH} characters.`);
process.exit(offenders.length ? 1 : 0);