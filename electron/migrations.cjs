// Versioned, idempotent schema migrations.
//
// Why this file exists: schema changes used to be a loose list of
// addColumnIfMissing() calls scattered through createAllTables(), with no record
// of what had been applied — database.cjs even dropped any `_migrations` table it
// found. That is fine until you need to answer "has this already run?" or "what
// changed the user's database?". This module makes every schema change an
// ordered, named, recorded step that runs exactly once and is safe to re-run.
//
// SAFETY PROPERTIES
//   * Idempotent — each migration is written so re-running it is a no-op, and
//     applied versions are recorded, so re-running is skipped anyway.
//   * Backed up — a .sqlite snapshot is taken via `VACUUM INTO` BEFORE the first
//     pending migration runs. VACUUM INTO is used rather than a file copy
//     because it produces a consistent snapshot even while WAL is active.
//   * Transactional — a failing migration rolls back and stops the run; later
//     migrations do not run on a half-migrated database.
//
// Run: npx electron scripts/test-migrations.cjs

const fs = require('fs');
const path = require('path');

const MIGRATION_TABLE = 'schemaMigrations';

/**
 * Ordered migrations. Never edit an applied migration — add a new one.
 * `version` is the identity and must stay unique.
 */
const MIGRATIONS = [
  {
    version: '001',
    name: 'in-form-product-assembly',
    /**
     * Support for assembling a product from several raw materials, configured
     * entirely inside the existing Raw Material and Product forms — there are no
     * BOM tables, no purpose tables, and no separate Manufacturing module.
     *
     * The recipe lives on the product row itself as a JSON array, because it is
     * always read and written together with the product and never queried
     * across products. Material codes and the sellable/part designation live on
     * the material row for the same reason. Everything added here is additive
     * and nullable, so existing rows keep behaving exactly as before: a product
     * with no components array is still a single-material product sold from its
     * own finished stock.
     */
    up(db, helpers) {
      const { addColumnIfMissing } = helpers;

      // The pre-versioned code dropped any `_migrations` table on every launch
      // because nothing recorded what had been applied. `schemaMigrations`
      // replaces it, so retire the dead table once — idempotently.
      db.exec(`DROP TABLE IF EXISTS _migrations;`);

      // ── materials: the "No." designation and how the part is used ───────
      // `code` is the No. the user types next to the material name (4 No, H-1).
      // `usageType` is 'sellable' (its own product) or 'component' (a part of
      // another product). NULL is treated as 'sellable' so every pre-existing
      // row keeps its current behaviour without a data backfill.
      addColumnIfMissing('materials', 'code', 'TEXT');
      addColumnIfMissing('materials', 'usageType', "TEXT DEFAULT 'sellable'");

      // ── products: the recipe ───────────────────────────────────────────
      // `usageType` is 'simple' (one material) or 'assembled' (several).
      // `components` is a JSON array of {materialId, quantity, sortOrder} — the
      // single authority for what a sale of this product consumes.
      addColumnIfMissing('products', 'usageType', "TEXT DEFAULT 'simple'");
      addColumnIfMissing('products', 'components', 'TEXT');

      // ── Lookups that make the picker and the sale screen fast ─────────
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_materials_usageType
          ON materials(usageType);
        CREATE INDEX IF NOT EXISTS idx_materials_code
          ON materials(code);
      `);
    },
  },
];

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      appliedAt TEXT NOT NULL,
      statements INTEGER DEFAULT 0
    );
  `);
}

function getAppliedVersions(db) {
  ensureMigrationTable(db);
  const rows = db
    .prepare(`SELECT version FROM ${MIGRATION_TABLE}`)
    .all();
  return new Set(rows.map(r => r.version));
}

/** Add a column only when absent. SQLite has no IF NOT EXISTS for columns. */
function makeAddColumnIfMissing(db) {
  return function addColumnIfMissing(table, column, definition) {
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name);
    if (cols.includes(column)) return false;
    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
    return true;
  };
}

/**
 * Take a consistent snapshot of the database BEFORE migrating.
 * `VACUUM INTO` writes a fresh, self-contained copy that is safe even with an
 * active WAL, which a plain file copy is not.
 */
function backupDatabase(db, backupPath) {
  if (fs.existsSync(backupPath)) {
    const alt = `${backupPath}.${Date.now()}`;
    fs.renameSync(backupPath, alt);
  }
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  return backupPath;
}

/**
 * Run every pending migration in order.
 *
 * @param db          better-sqlite3 Database handle
 * @param dbPath      path to the live database file (for naming the backup)
 * @param options.backupDir  where to write the pre-migration snapshot
 * @param options.skipBackup  set true to migrate without a snapshot (tests)
 * @returns {{applied: string[], skipped: string[], backupPath: string|null}}
 */
function runMigrations(db, dbPath, options = {}) {
  const appliedSet = getAppliedVersions(db);
  const pending = MIGRATIONS.filter(m => !appliedSet.has(m.version));

  if (pending.length === 0) {
    return { applied: [], skipped: MIGRATIONS.map(m => m.version), backupPath: null };
  }

  let backupPath = null;
  if (!options.skipBackup) {
    const dir = options.backupDir || path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = path.join(dir, `pre-migration-${stamp}.sqlite`);
    backupDatabase(db, backupPath);
    console.log(`[Migrations] Pre-migration backup: ${backupPath}`);
  }

  const addColumnIfMissing = makeAddColumnIfMissing(db);
  const applied = [];
  const skipped = [];

  for (const m of MIGRATIONS) {
    if (appliedSet.has(m.version)) {
      skipped.push(m.version);
      continue;
    }
    const started = Date.now();
    // Each migration is its own transaction: a failure rolls back that
    // migration alone and leaves the schema exactly as it was.
    const run = db.transaction(() => {
      m.up(db, { addColumnIfMissing });
      db.prepare(
        `INSERT INTO ${MIGRATION_TABLE} (version, name, appliedAt, statements)
         VALUES (?, ?, ?, ?)`,
      ).run(m.version, m.name, new Date().toISOString(), 0);
    });
    run();
    applied.push(m.version);
    console.log(
      `[Migrations] Applied ${m.version} — ${m.name} (${Date.now() - started}ms)`,
    );
  }

  return { applied, skipped, backupPath };
}

module.exports = {
  MIGRATIONS,
  MIGRATION_TABLE,
  runMigrations,
  getAppliedVersions,
  backupDatabase,
  makeAddColumnIfMissing,
};