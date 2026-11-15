import { describe, expect, it } from 'vitest';
import { buildDefaultStages } from '../lib/processing/processingStageSeed';
import { migrateERPState } from './erpMigration';

/**
 * Mojibake repair (unmojibake): strings saved by an old build were UTF-8
 * decoded as Latin-1/cp1252 and re-encoded — the stage descriptions in real
 * user databases came out as "â\x80\x94" (a double-encoded em-dash). The
 * startup migration repairs them so previous-version users heal automatically.
 */

const FIXTURE_STAGES = buildDefaultStages();

const MOJI_INITIAL = 'First-stage processing â\x80\x94 raw material is worked by the initial processor.';
const MOJI_MACHINE = 'Machine processing â\x80\x94 billed per KG processed.';
const MOJI_ACID = 'Acid treatment â\x80\x94 billed per KG processed.';

/** Minimal batch whose replay result is fully deterministic. */
const FIXTURE_BATCH = {
  id: 'batch-1',
  purchaseId: 'purchase-1',
  supplierId: 'supplier-1',
  materialId: 'mat-1',
  batchNo: 'TEST-PO-0001',
  date: '2026-09-01',
  weight: 100,
  weightUnit: 'KGs',
  ratePerUnit: 300,
  weightPerPiece: 0.5,
  initialPcs: 200,
  remainingPcs: 200,
  atProcessorPcs: 0,
  processedPcs: 0,
  stageAvailableBySource: {},
  amount: 60000,
  status: 'Active',
  purchasePath: 'full_chain',
};

function stateWith(descriptions: (string | undefined)[], batches: any[] = []) {
  const stages = FIXTURE_STAGES.map((s, i) => ({
    ...s,
    description: descriptions[i] ?? s.description,
  }));
  return {
    stateSchemaVersion: 4,
    accountSubtypes: [],
    accounts: [],
    vouchers: [],
    journalEntries: [],
    customers: [],
    suppliers: [],
    processors: [],
    products: [],
    processingStages: stages,
    batches,
    processingSends: [],
    processingReceipts: [],
    processingLosses: [],
    sales: [],
    purchases: [],
    materials: [],
    manufacturingOrders: [],
    finishedGoodsLots: [],
  };
}

describe('erpMigration — mojibake repair', () => {
  it('repairs double-encoded em-dash descriptions from real backups', () => {
    const migrated = migrateERPState(stateWith([MOJI_INITIAL, MOJI_MACHINE, undefined, MOJI_ACID]));
    const byName = Object.fromEntries((migrated.processingStages as any[]).map(s => [s.name, s]));

    expect(byName['Initial Processor'].description).toBe(
      'First-stage processing — raw material is worked by the initial processor.'
    );
    expect(byName['Machine'].description).toBe('Machine processing — billed per KG processed.');
    expect(byName['Acid'].description).toBe('Acid treatment — billed per KG processed.');
  });

  it('leaves clean descriptions byte-identical', () => {
    const migrated = migrateERPState(stateWith([undefined, undefined, undefined, undefined]));
    const byName = Object.fromEntries((migrated.processingStages as any[]).map(s => [s.name, s]));

    expect(byName['Initial Processor'].description).toBe('First-stage processing — raw material is worked by the initial processor.');
    expect(byName['Machine'].description).toBe('Machine processing — billed per KG processed.');
    expect(byName['Acid'].description).toBe('Acid treatment — billed per KG processed.');
  });

  it('is idempotent — a second pass changes nothing', () => {
    const once = migrateERPState(stateWith([MOJI_INITIAL, MOJI_MACHINE, undefined, MOJI_ACID]));
    const twice = migrateERPState(once);
    expect((twice.processingStages as any[]).map(s => s.description))
      .toEqual((once.processingStages as any[]).map(s => s.description));
  });

  it('keeps ids, names, order and billing config intact', () => {
    const migrated = migrateERPState(stateWith([MOJI_INITIAL, MOJI_MACHINE, undefined, MOJI_ACID]));
    const originalIds = FIXTURE_STAGES.map(s => s.name);
    const migratedStages = migrated.processingStages as any[];
    for (const name of originalIds) {
      const before = FIXTURE_STAGES.find(s => s.name === name)!;
      const after = migratedStages.find(s => s.name === name)!;
      expect(after.id).toBe(before.id);
      expect(after.sequence).toBe(before.sequence);
      expect(after.rateMethod).toBe(before.rateMethod);
      expect(after.isFinalStage).toBe(before.isFinalStage ?? false);
    }
  });
});

describe('erpMigration — narration copy collapse (2026-11 copy bug)', () => {
  const entry = (id: string, voucherId: string, narration: string) => ({
    id,
    voucherId,
    accountId: `acc-${id}`,
    debit: 100,
    credit: 0,
    narration,
  });

  const journalState = (journalEntries: any[], vouchers: any[] = [{ id: 'v-1', voucherNo: 'JV-0001', narration: 'online', type: 'Journal Voucher' }]) => ({
    ...stateWith([undefined, undefined, undefined, undefined]),
    journalEntries,
    vouchers,
  });

  it('collapses copies of one narration down to the first entry that carried it', () => {
    const migrated = migrateERPState(journalState([
      entry('e1', 'v-1', 'online'),
      entry('e2', 'v-1', 'online'),
      entry('e3', 'v-1', ''),
      entry('e4', 'v-1', 'online'),
    ]));
    const byId = Object.fromEntries((migrated.journalEntries as any[]).map(je => [je.id, je]));
    expect(byId.e1.narration).toBe('online');
    expect(byId.e2.narration).toBe('');
    expect(byId.e3.narration).toBe('');
    expect(byId.e4.narration).toBe('');
    expect(migrated.narrationCopyFixVersion).toBe(1);
    expect(migrated.vouchers[0].narration).toBe('online'); // voucher summary untouched
  });

  it('leaves distinct narrations alone', () => {
    const migrated = migrateERPState(journalState([
      entry('e1', 'v-1', 'Steel'),
      entry('e2', 'v-1', 'Salaries'),
      entry('e3', 'v-1', 'Steel'),
    ]));
    const byId = Object.fromEntries((migrated.journalEntries as any[]).map(je => [je.id, je]));
    expect(byId.e1.narration).toBe('Steel');
    expect(byId.e2.narration).toBe('Salaries');
    expect(byId.e3.narration).toBe(''); // third Steel is a copy of the first
  });

  it('dedupes per voucher, not globally', () => {
    const migrated = migrateERPState(journalState([
      entry('e1', 'v-1', 'online'),
      entry('e2', 'v-1', 'online'),
      entry('e3', 'v-2', 'online'),
      entry('e4', 'v-2', 'online'),
    ], [
      { id: 'v-1', voucherNo: 'JV-0001', narration: 'online', type: 'Journal Voucher' },
      { id: 'v-2', voucherNo: 'JV-0002', narration: 'online', type: 'Journal Voucher' },
    ]));
    const byId = Object.fromEntries((migrated.journalEntries as any[]).map(je => [je.id, je]));
    expect([byId.e1.narration, byId.e2.narration, byId.e3.narration, byId.e4.narration])
      .toEqual(['online', '', 'online', '']);
  });

  it('never touches whitespace-only text or empty entries', () => {
    const migrated = migrateERPState(journalState([
      entry('e1', 'v-1', '   '),
      entry('e2', 'v-1', ''),
    ]));
    const byId = Object.fromEntries((migrated.journalEntries as any[]).map(je => [je.id, je]));
    expect(byId.e1.narration).toBe('   ');
    expect(byId.e2.narration).toBe('');
  });

  it('leaves already-migrated state untouched (marker survives)', () => {
    const once = migrateERPState(journalState([
      entry('e1', 'v-1', 'Steel'),
      entry('e2', 'v-1', 'Steel'),
    ]));
    expect(once.narrationCopyFixVersion).toBe(1);
    expect((once.journalEntries as any[])[0].narration).toBe('Steel');
    expect((once.journalEntries as any[])[1].narration).toBe('');
    // Re-run with the marker present — even a deliberately typed duplicate stays.
    const twice = migrateERPState(once);
    expect((twice.journalEntries as any[])[0].narration).toBe('Steel');
    expect((twice.journalEntries as any[])[1].narration).toBe('');
    expect(twice.narrationCopyFixVersion).toBe(1);
  });
});

describe('erpMigration — trail replay cache', () => {
  it('stamps trailVersion=1 after a clean full replay', () => {
    const migrated = migrateERPState(stateWith(
      [undefined, undefined, undefined, undefined],
      [{ ...FIXTURE_BATCH }],
    ));
    expect(migrated.trailVersion).toBe(1);
    expect(migrated.batches).toHaveLength(1);
  });

  it('skips the replay when the marker is already set (boot stays flat)', () => {
    const once = migrateERPState(stateWith(
      [undefined, undefined, undefined, undefined],
      [{ ...FIXTURE_BATCH, remainingPcs: 999 }],
    ));
    expect(once.trailVersion).toBe(1);
    expect(once.batches[0].remainingPcs).toBe(200); // replay rebuilt to purchase baseline

    // Tamper the stored trail AFTER a clean replay — with the marker set, the
    // replay must NOT run, so the tamper survives intact.
    const tampered = { ...once, batches: once.batches.map(b => ({ ...b, remainingPcs: 999 })) };
    const twice = migrateERPState(tampered);
    expect(twice.trailVersion).toBe(1);
    expect(twice.batches[0].batchNo).toBe('TEST-PO-0001');
    expect(twice.batches[0].remainingPcs).toBe(999);
  });

  it('re-runs the replay when the marker is missing (data heals)', () => {
    const once = migrateERPState(stateWith(
      [undefined, undefined, undefined, undefined],
      [{ ...FIXTURE_BATCH, remainingPcs: 999 }],
    ));
    expect(once.trailVersion).toBe(1);
    expect(once.batches[0].remainingPcs).toBe(200); // replay rebuilt it to purchase baseline

    // Marker stripped — as if persisted by an older build.
    const stripped = { ...once };
    delete stripped.trailVersion;
    const twice = migrateERPState(stripped);
    expect(twice.trailVersion).toBe(1);
    expect(twice.batches[0].remainingPcs).toBe(200);
  });
});
