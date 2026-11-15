import { describe, expect, it } from 'vitest';
import { ERP_STORAGE_DATA_KEYS, partializeERPState } from './useERPStore';

/**
 * Regression-proof for the erp-storage persist allowlist. If a new state key
 * carrying real business data is ever added without updating the allowlist,
 * this test fails loudly — that is the whole point: a silently missing key
 * would mean data disappears from every future save.
 */

/** Keys exactly as persisted by the 2026-11-15 production backup. */
const BACKUP_DATA_KEYS = [
  'accountSubtypes',
  'accounts',
  'batches',
  'categories',
  'companySettings',
  'currentUser',
  'customers',
  'documentSettings',
  'finishedGoodsLots',
  'inventoryMovements',
  'inventoryThreshold',
  'journalEntries',
  'manufacturingOrders',
  'materials',
  'processingLosses',
  'processingReceipts',
  'processingSends',
  'processingStages',
  'processorBills',
  'processors',
  'products',
  'purchases',
  'sales',
  'stateSchemaVersion',
  'suppliers',
  'vouchers',
] as const;

describe('ERP_STORAGE_DATA_KEYS — persist allowlist', () => {
  it('covers every data key the live backup persists', () => {
    for (const key of BACKUP_DATA_KEYS) {
      expect(ERP_STORAGE_DATA_KEYS).toContain(key);
    }
  });

  it('contains no surprises beyond the backup shape + trailVersion', () => {
    expect([...ERP_STORAGE_DATA_KEYS].sort()).toEqual(
      [...BACKUP_DATA_KEYS, 'trailVersion', 'narrationCopyFixVersion'].sort(),
    );
  });
});

describe('partializeERPState', () => {
  const fullState = () =>
    Object.fromEntries(
      ERP_STORAGE_DATA_KEYS.map(key => [key, key === 'stateSchemaVersion' ? 4 : key === 'trailVersion' ? 1 : []]),
    );

  it('keeps every data key and drops functions', () => {
    const state = {
      ...fullState(),
      addVoucher: () => 'never-persisted',
      updateModuleItem: () => 'never-persisted',
    };
    const out = partializeERPState(state);
    expect(Object.keys(out).sort()).toEqual([...ERP_STORAGE_DATA_KEYS].sort());
    expect(out).not.toHaveProperty('addVoucher');
    expect(out).not.toHaveProperty('updateModuleItem');
  });

  it('survives a JSON round-trip intact (write → read path)', () => {
    const state = fullState();
    const blob = JSON.stringify(partializeERPState(state));
    const rehydrated = JSON.parse(blob);
    for (const key of ERP_STORAGE_DATA_KEYS) {
      expect(rehydrated[key]).toEqual(state[key]);
    }
  });
});
