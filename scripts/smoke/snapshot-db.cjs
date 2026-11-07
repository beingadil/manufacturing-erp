// Read-only fingerprint of a SQLite database: for every user table, the
// column list, the row count, and a sha256 over a canonical serialisation of
// every row. Used to prove "no data loss" across a migration by diffing a
// fingerprint taken before and after.
//
// Usage:
//   ELECTRON_RUN_AS_NODE=1 electron.exe snapshot-db.cjs <db> <out.json>
//   ELECTRON_RUN_AS_NODE=1 electron.exe snapshot-db.cjs <db> <out.json> \
//       --columns-from <before.json>
//
// With --columns-from, each table is projected onto the column list recorded in
// that earlier fingerprint, so a table that gained columns from a migration
// still hashes identically as long as the original data is untouched.
//
// Opens the database READ-ONLY and never writes to it.

const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const argv = process.argv.slice(2);
const dbPath = argv[0];
const outPath = argv[1];
if (!dbPath || !outPath) {
  console.error('usage: snapshot-db.cjs <db> <out.json> [--columns-from <before.json>]');
  process.exit(2);
}
const columnsFromIdx = argv.indexOf('--columns-from');
const baseline = columnsFromIdx === -1 ? null : JSON.parse(fs.readFileSync(argv[columnsFromIdx + 1], 'utf8'));

const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const tables = db
  .prepare(
    `SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name`,
  )
  .all()
  .map(r => r.name);

const fingerprint = { dbPath, size: fs.statSync(dbPath).size, tables: {} };

for (const t of tables) {
  const actual = db.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name);
  const expected = baseline && baseline.tables[t] ? baseline.tables[t].columns : actual;
  const missing = expected.filter(c => !actual.includes(c));
  if (missing.length) {
    console.error(`snapshot: table ${t} is missing expected column(s): ${missing.join(', ')}`);
    process.exit(1);
  }
  const cols = expected;
  const count = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
  const colList = cols.map(c => `"${c}"`).join(', ');
  // Order by the same column list so the row stream is deterministic and the
  // hash is a fingerprint of the multiset of rows, not of the storage layout.
  const rows = db.prepare(`SELECT ${colList} FROM "${t}" ORDER BY ${colList}`).all();
  const canonical = rows
    .map(r => cols.map(c => normalise(r[c])).join('␟'))
    .join('␞');
  fingerprint.tables[t] = {
    columns: actual,
    hashedColumns: cols,
    count,
    sha256: crypto.createHash('sha256').update(canonical).digest('hex'),
  };
}

db.close();
fs.writeFileSync(outPath, JSON.stringify(fingerprint, null, 2));

const totalRows = Object.values(fingerprint.tables).reduce((a, t) => a + t.count, 0);
console.log(
  `snapshot: ${tables.length} tables, ${totalRows} rows, db ${fingerprint.size} bytes -> ${outPath}`,
);
for (const [name, info] of Object.entries(fingerprint.tables)) {
  const added = info.columns.length - info.hashedColumns.length;
  console.log(
    `  ${name}: ${info.count} rows${added ? ` (+${added} new column${added > 1 ? 's' : ''} not hashed)` : ''}, ${info.sha256.slice(0, 12)}`,
  );
}

function normalise(v) {
  if (v === null || v === undefined) return '\\N';
  if (Buffer.isBuffer(v)) return 'B:' + v.toString('hex');
  return String(v);
}