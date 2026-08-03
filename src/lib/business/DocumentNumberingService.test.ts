import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the settings store so tests can flip yearly reset + prefixes
// without touching the real zustand store / SQLite adapter.
const settingsState: { voucherYearlyReset: boolean; voucherPrefixes: Record<string, string> } = {
  voucherYearlyReset: true,
  voucherPrefixes: {},
};

vi.mock('../../store/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => settingsState,
  },
}));

import { DocumentNumberingService } from './DocumentNumberingService';

interface V {
  type: string;
  date: string;
  voucherNo?: string;
}

const cp = (date: string, voucherNo: string): V => ({ type: 'Cash Payment', date, voucherNo });

describe('DocumentNumberingService.extractVoucherSequence', () => {
  it('parses the trailing 4-digit sequence', () => {
    expect(DocumentNumberingService.extractVoucherSequence('CP-0007')).toBe(7);
    expect(DocumentNumberingService.extractVoucherSequence('JV-0001')).toBe(1);
  });

  it('parses legacy year-suffixed formats (migrated data)', () => {
    expect(DocumentNumberingService.extractVoucherSequence('CP-2026-0007')).toBe(7);
    expect(DocumentNumberingService.extractVoucherSequence('PUV-2025-0012')).toBe(12);
  });

  it('returns 0 for missing/malformed numbers', () => {
    expect(DocumentNumberingService.extractVoucherSequence(undefined)).toBe(0);
    expect(DocumentNumberingService.extractVoucherSequence('')).toBe(0);
    expect(DocumentNumberingService.extractVoucherSequence('NOPE')).toBe(0);
  });
});

describe('DocumentNumberingService.nextVoucherNumber', () => {
  beforeEach(() => {
    settingsState.voucherYearlyReset = true;
    settingsState.voucherPrefixes = {};
  });

  it('starts a fresh sequence at 0001', () => {
    expect(DocumentNumberingService.nextVoucherNumber([], 'Cash Payment', '2026-01-15')).toBe('CP-0001');
  });

  it('is MAX-based, not count-based — deleted numbers are never reused', () => {
    // Vouchers 1, 2, 3 created. Delete #2 → count is 2, but max is 3.
    const existing = [cp('2026-01-01', 'CP-0001'), cp('2026-01-02', 'CP-0003')];
    expect(DocumentNumberingService.nextVoucherNumber(existing, 'Cash Payment', '2026-01-03')).toBe('CP-0004');
  });

  it('keeps the sequence gap-free after deleting the LAST voucher', () => {
    // Delete #5 (the highest). max drops to 4 → next is 5 again. No gap,
    // no duplicate.
    const existing = [cp('2026-01-01', 'CP-0004')];
    expect(DocumentNumberingService.nextVoucherNumber(existing, 'Cash Payment', '2026-01-02')).toBe('CP-0005');
  });

  it('scopes to the voucher\u2019s own year when yearly reset is ON', () => {
    // 2025 already has 5 CPs; 2026 has 1. A 2026 voucher must be 2026-0002.
    const existing = [
      cp('2025-03-01', 'CP-0001'),
      cp('2025-03-02', 'CP-0002'),
      cp('2025-03-03', 'CP-0003'),
      cp('2025-03-04', 'CP-0004'),
      cp('2025-03-05', 'CP-0005'),
      cp('2026-01-01', 'CP-0001'),
    ];
    expect(DocumentNumberingService.nextVoucherNumber(existing, 'Cash Payment', '2026-02-01')).toBe('CP-0002');
    expect(DocumentNumberingService.nextVoucherNumber(existing, 'Cash Payment', '2025-04-01')).toBe('CP-0006');
  });

  it('uses the voucher\u2019s date year, NOT the current clock year', () => {
    // Backdated voucher: clock is 2026 but the voucher is dated 2025.
    const existing = [cp('2025-11-01', 'CP-0003')];
    expect(DocumentNumberingService.nextVoucherNumber(existing, 'Cash Payment', '2025-12-15')).toBe('CP-0004');
  });

  it('spans all years combined when yearly reset is OFF', () => {
    settingsState.voucherYearlyReset = false;
    const existing = [
      cp('2025-03-01', 'CP-0005'),
      cp('2026-01-01', 'CP-0006'),
    ];
    expect(DocumentNumberingService.nextVoucherNumber(existing, 'Cash Payment', '2026-02-01')).toBe('CP-0007');
  });

  it('keeps separate sequences per voucher type', () => {
    const existing = [
      cp('2026-01-01', 'CP-0009'),
      { type: 'Bank Payment', date: '2026-01-01', voucherNo: 'BP-0002' },
    ];
    expect(DocumentNumberingService.nextVoucherNumber(existing, 'Bank Payment', '2026-01-02')).toBe('BP-0003');
  });

  it('uses the configured custom prefix', () => {
    settingsState.voucherPrefixes = { 'Cash Payment': 'CASH' };
    expect(DocumentNumberingService.nextVoucherNumber([], 'Cash Payment', '2026-01-01')).toBe('CASH-0001');
  });

  it('continues from legacy numbers even when the prefix changed', () => {
    settingsState.voucherPrefixes = { 'Cash Payment': 'CA' };
    const existing = [cp('2026-01-01', 'CP-0004')];
    expect(DocumentNumberingService.nextVoucherNumber(existing, 'Cash Payment', '2026-01-02')).toBe('CA-0005');
  });
});

describe('DocumentNumberingService.nextDocumentNumber', () => {
  it('starts a fresh year-scoped sequence at 0001', () => {
    expect(DocumentNumberingService.nextDocumentNumber([], 'purchaseNo', 'PO', '2026-01-10')).toBe('PO-2026-0001');
  });

  it('is MAX-based across the document’s own year — deleted numbers are never reused', () => {
    // PO-2026-0001, PO-2026-0003 exist (0002 deleted). Count=2, max=3.
    const existing = [
      { purchaseNo: 'PO-2026-0001' },
      { purchaseNo: 'PO-2026-0003' },
    ];
    expect(DocumentNumberingService.nextDocumentNumber(existing, 'purchaseNo', 'PO', '2026-01-15')).toBe('PO-2026-0004');
  });

  it('scopes to the document’s own year, not the clock year', () => {
    const existing = [{ invoiceNo: 'INV-2025-0005' }, { invoiceNo: 'INV-2026-0002' }];
    expect(DocumentNumberingService.nextDocumentNumber(existing, 'invoiceNo', 'INV', '2025-12-30')).toBe('INV-2025-0006');
    expect(DocumentNumberingService.nextDocumentNumber(existing, 'invoiceNo', 'INV', '2026-01-02')).toBe('INV-2026-0003');
  });

  it('keeps separate sequences per prefix / document field', () => {
    const existing = [
      { dispatchNo: 'DSP-2026-0007' },
      { receiveNo: 'REC-2026-0001' },
    ];
    expect(DocumentNumberingService.nextDocumentNumber(existing, 'receiveNo', 'REC', '2026-01-01')).toBe('REC-2026-0002');
  });
});
