import { describe, expect, it } from 'vitest';
import type { Account } from '../../types/erp';
import { accountMatchesSearch, filterAccountsWithAncestors } from './accountHierarchy';

function acc(id: string, code: string, name: string, parentId?: string): Account {
  return {
    id,
    code,
    name,
    subtypeId: 's',
    type: parentId ? ('Liabilities' as const) : ('Assets' as const),
    openingBalance: 0,
    openingBalanceType: 'Debit',
    status: 'Active',
    isSystem: false,
    parentId,
  };
}

// Shape of the COA: system control accounts at top level, party accounts
// nested under them via parentId (spec §15).
const AP_CONTROL = 'ap-control';
const accounts = [
  acc('cash', '1001', 'Cash in Hand'),
  acc('ar', '1005', 'Accounts Receivable'),
  acc(AP_CONTROL, '2001', 'Accounts Payable'),
  acc('ap2', '2002', 'Short-term Loans'),
  acc('proc1', '2009', 'Sharif Processing', AP_CONTROL),
  acc('proc2', '2010', 'Greenline Job Work', AP_CONTROL),
  acc('sup1', '2015', 'Legacy Sup Old', AP_CONTROL),
];

describe('filterAccountsWithAncestors', () => {
  it('returns all accounts unchanged when the search is empty', () => {
    expect(filterAccountsWithAncestors(accounts, '')).toEqual(accounts);
    expect(filterAccountsWithAncestors(accounts, '   ')).toEqual(accounts);
  });

  it('keeps a matched nested (party) account AND its control-account ancestor visible', () => {
    const visible = filterAccountsWithAncestors(accounts, 'Sharif');
    const ids = visible.map(a => a.id);
    // The party account itself
    expect(ids).toContain('proc1');
    // Its parent control account — without this the chart would render nothing
    expect(ids).toContain(AP_CONTROL);
    // Non-matching siblings and unrelated top-level accounts stay hidden
    expect(ids).not.toContain('proc2');
    expect(ids).not.toContain('sup1');
    expect(ids).not.toContain('cash');
    expect(ids).not.toContain('ap2');
  });

  it('matches by account code as well as name', () => {
    const visible = filterAccountsWithAncestors(accounts, '2010');
    expect(visible.map(a => a.id)).toContain('proc2');
    expect(visible.map(a => a.id)).toContain(AP_CONTROL);
  });

  it('is case-insensitive on names', () => {
    const visible = filterAccountsWithAncestors(accounts, 'GREENLINE');
    expect(visible.map(a => a.id)).toEqual([AP_CONTROL, 'proc2']);
  });

  it('walks multi-level chains (control → sub → sub-sub)', () => {
    const deep = [
      acc('root', '1000', 'Root Control'),
      acc('mid', '1001', 'Mid Child', 'root'),
      acc('leaf', '1002', 'Deep Leaf', 'mid'),
    ];
    const visible = filterAccountsWithAncestors(deep, 'Deep Leaf');
    expect(visible.map(a => a.id)).toEqual(['root', 'mid', 'leaf']);
  });

  it('shows only the matched top-level account when the parent itself matches', () => {
    const visible = filterAccountsWithAncestors(accounts, 'Accounts Payable');
    expect(visible.map(a => a.id)).toEqual([AP_CONTROL]);
  });

  it('does not include non-matching children of a matched parent', () => {
    const visible = filterAccountsWithAncestors(accounts, '2001');
    expect(visible.map(a => a.id)).toEqual([AP_CONTROL]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterAccountsWithAncestors(accounts, 'zzz-none')).toEqual([]);
  });
});

describe('accountMatchesSearch', () => {
  it('matches name, code, case-insensitively', () => {
    expect(accountMatchesSearch(acc('a', '2009', 'Sharif Processing'), 'sharif')).toBe(true);
    expect(accountMatchesSearch(acc('a', '2009', 'Sharif Processing'), '2009')).toBe(true);
    expect(accountMatchesSearch(acc('a', '2009', 'Sharif Processing'), 'hamid')).toBe(false);
    expect(accountMatchesSearch(acc('a', '2009', 'Sharif Processing'), '  ')).toBe(true);
  });
});
