import { describe, expect, it } from 'vitest';
import { buildJournalEntries, voucherNarrationOf } from './journalEntries';

describe('buildJournalEntries — per-line narration rules', () => {
  it('keeps each line’s own narration and leaves empty lines empty', () => {
    const entries = buildJournalEntries([
      { accountId: 'acc-1', debit: 1000, credit: 0, narration: ' Steel ' },
      { accountId: 'acc-2', debit: 0, credit: 1000, narration: '' },
      { accountId: 'acc-3', debit: 500, credit: 0 },
    ]);
    expect(entries.map(e => e.narration)).toEqual(['Steel', '', '']);
  });

  it('never copies the first non-empty narration into empty lines', () => {
    const entries = buildJournalEntries([
      { accountId: 'acc-1', debit: 100, credit: 0, narration: 'Steel' },
      { accountId: 'acc-2', debit: 0, credit: 100, narration: '' },
      { accountId: 'acc-3', debit: 50, credit: 50, narration: '  ' }, // whitespace counts as empty
    ]);
    expect(entries.map(e => e.narration)).toEqual(['Steel', '', '']);
  });

  it('trims the narration text', () => {
    const entries = buildJournalEntries([{ accountId: 'a', debit: 1, credit: 0, narration: '  rent paid  ' }]);
    expect(entries[0].narration).toBe('rent paid');
  });

  it('coerces string amounts to numbers and defaults bad input to 0', () => {
    const entries = buildJournalEntries([{ accountId: 'a', debit: '100.50', credit: 'oops', narration: '' }]);
    expect(entries[0].debit).toBe(100.5);
    expect(entries[0].credit).toBe(0);
  });
});

describe('voucherNarrationOf — voucher summary narration', () => {
  it('returns the first non-empty (trimmed) line narration', () => {
    expect(voucherNarrationOf([
      { narration: '' },
      { narration: '  ' },
      { narration: 'Salaries' },
      { narration: 'Rent' },
    ])).toBe('Salaries');
  });

  it('returns empty string when every line is empty — never guesses', () => {
    expect(voucherNarrationOf([{}, { narration: '   ' }, { narration: '' }])).toBe('');
  });

  it('handles a completely empty entry list', () => {
    expect(voucherNarrationOf([])).toBe('');
  });
});
