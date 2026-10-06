// Diff two fingerprints produced by snapshot-db.cjs.
//
// Compares the tables that existed in the BEFORE snapshot against the AFTER
// snapshot. Columns added by a migration are ignored (the BEFORE column list is
// what gets compared), so a pure additive schema change shows as "identical"
// while any lost or altered row shows up as a mismatch.
//
// Usage: diff-snapshots.cjs <before.json> <after.json>
// Exit code 0 = no data loss, 1 = mismatch.

const fs = require('fs');

const [, , beforePath, afterPath] = process.argv;
if (!beforePath || !afterPath) {
  console.error('usage: diff-snapshots.cjs <before.json> <after.json>');
  process.exit(2);
}

const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));

let mismatches = 0;
let compared = 0;

console.log(`before: ${before.dbPath} (${before.size} bytes)`);
console.log(`after:  ${after.dbPath} (${after.size} bytes)`);
console.log('');

for (const [table, b] of Object.entries(before.tables)) {
  const a = after.tables[table];
  if (!a) {
    console.log(`✗ ${table}: TABLE MISSING after migration (had ${b.count} rows)`);
    mismatches += 1;
    continue;
  }
  compared += 1;
  const newCols = a.columns.filter(c => !b.columns.includes(c));
  const missingCols = b.columns.filter(c => !a.columns.includes(c));
  const contentSame = b.sha256 === a.sha256;
  if (!contentSame || missingCols.length) {
    mismatches += 1;
    console.log(
      `✗ ${table}: ${b.count} → ${a.count} rows, content ${contentSame ? 'same' : 'CHANGED'}` +
        (missingCols.length ? `, DROPPED columns: ${missingCols.join(', ')}` : '') +
        (newCols.length ? `, added columns: ${newCols.join(', ')}` : ''),
    );
  } else {
    console.log(
      `✓ ${table}: ${b.count} rows, content identical` +
        (newCols.length ? ` (+${newCols.length} column${newCols.length > 1 ? 's' : ''}: ${newCols.join(', ')})` : ''),
    );
  }
}

// Tables that did not exist before are new schema, not lost data.
const added = Object.keys(after.tables).filter(t => !before.tables[t]);
if (added.length) console.log(`\n+ new tables: ${added.join(', ')}`);

console.log(
  `\n${compared} existing tables compared, ${mismatches} mismatch${mismatches === 1 ? '' : 'es'}`,
);
process.exit(mismatches === 0 ? 0 : 1);