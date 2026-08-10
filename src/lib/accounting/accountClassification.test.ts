import { describe, it, expect } from 'vitest';
import { getSystemInventoryAccount, getSystemCOGSAccount } from './accountClassification';
import type { Account, AccountSubtype } from '../../types/erp';

function build(): { accounts: Account[]; subtypes: AccountSubtype[] } {
  const subtypes: AccountSubtype[] = [
    { id: 'st-inv', name: 'Inventory', type: 'Assets', isSystem: true },
    { id: 'st-purch', name: 'Purchases', type: 'Cost of Goods Sold', isSystem: true },
  ];
  const accounts: Account[] = [
    { id: 'rm', code: '1101', name: 'Raw Material Inventory', subtypeId: 'st-inv', type: 'Assets', openingBalance: 0, openingBalanceType: 'Debit', status: 'Active', isSystem: true },
    { id: 'wip', code: '1102', name: 'Work in Progress Inventory', subtypeId: 'st-inv', type: 'Assets', openingBalance: 0, openingBalanceType: 'Debit', status: 'Active', isSystem: true },
    { id: 'fg', code: '1103', name: 'Finished Goods Inventory', subtypeId: 'st-inv', type: 'Assets', openingBalance: 0, openingBalanceType: 'Debit', status: 'Active', isSystem: true },
    { id: 'cogs', code: '5001', name: 'Purchases', subtypeId: 'st-purch', type: 'Cost of Goods Sold', openingBalance: 0, openingBalanceType: 'Debit', status: 'Active', isSystem: true },
  ];
  return { accounts, subtypes };
}

describe('accountClassification posting helpers', () => {
  it('resolves each inventory bucket by name, never mixing the three seeded accounts', () => {
    const { accounts, subtypes } = build();
    expect(getSystemInventoryAccount(accounts, subtypes, 'Raw Material Inventory')?.id).toBe('rm');
    expect(getSystemInventoryAccount(accounts, subtypes, 'Work in Progress Inventory')?.id).toBe('wip');
    expect(getSystemInventoryAccount(accounts, subtypes, 'Finished Goods Inventory')?.id).toBe('fg');
  });

  it('falls back to any system inventory account when the named bucket is missing', () => {
    const { accounts, subtypes } = build();
    const withoutRm = accounts.filter(a => a.id !== 'rm');
    expect(getSystemInventoryAccount(withoutRm, subtypes, 'Raw Material Inventory')?.id).toBe('wip');
  });

  it('prefers a dedicated Cost of Goods Sold account if one exists', () => {
    const { accounts, subtypes } = build();
    const withDedicated = [...accounts, { id: 'cogs2', code: '5002', name: 'Cost of Goods Sold', subtypeId: 'st-purch', type: 'Cost of Goods Sold' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: false }];
    expect(getSystemCOGSAccount(withDedicated, subtypes)?.id).toBe('cogs2');
    // Without a dedicated account, falls back to the seeded system COGS account
    expect(getSystemCOGSAccount(accounts, subtypes)?.id).toBe('cogs');
  });
});
