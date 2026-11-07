// Dump schema + a peek at every non-empty table of a SQLite database.
// Read-only. Usage: snapshot-db-style: dump-db.cjs <db>

const Database = require('better-sqlite3');
const db = new Database(process.argv[2], { readonly: true, fileMustExist: true });

const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
  .all()
  .map(r => r.name);

for (const t of tables) {
  const count = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
  if (!count) continue;
  const cols = db.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name);
  console.log(`\n=== ${t} (${count} rows) columns: ${cols.join(', ')}`);
  const rows = db.prepare(`SELECT * FROM "${t}" LIMIT 5`).all();
  for (const r of rows) {
    const brief = {};
    for (const c of cols) {
      const v = r[c];
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      brief[c] = s.length > 140 ? s.slice(0, 140) + `…(${s.length})` : s;
    }
    console.log('  ' + JSON.stringify(brief));
  }
}

console.log('\n=== schema DDL of non-empty tables ===');
for (const t of tables) {
  const count = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
  if (!count) continue;
  console.log(
    db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(t).sql,
  );
  console.log();
}
db.close();