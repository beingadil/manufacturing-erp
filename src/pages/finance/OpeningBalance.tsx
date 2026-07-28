import React, { useState, useMemo } from 'react';
import { useERPStore } from '../../store/useERPStore';
import { Search, Save, Calculator } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AccountType } from '../../types/erp';
import { ErrorManagement } from '../../lib/validation';

export function OpeningBalance() {
  const { accounts, accountSubtypes } = useERPStore();
  const [search, setSearch] = useState('');
  const [editBalances, setEditBalances] = useState<Record<string, { balance: number; type: 'Debit' | 'Credit' }>>({});
  const [saving, setSaving] = useState(false);

  const types: AccountType[] = [
    'Assets', 'Liabilities', 'Equity', 'Revenue',
    'Cost of Goods Sold', 'Expenses', 'Other Income', 'Other Expenses',
  ];

  const filteredAccounts = useMemo(() => {
    return accounts.filter(a =>
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.code.toLowerCase().includes(search.toLowerCase())
    );
  }, [accounts, search]);

  const handleBalanceChange = (accountId: string, field: 'balance' | 'type', value: number | 'Debit' | 'Credit') => {
    setEditBalances(prev => ({
      ...prev,
      [accountId]: {
        balance: field === 'balance' ? (value as number) : (prev[accountId]?.balance ?? 0),
        type: field === 'type' ? (value as 'Debit' | 'Credit') : (prev[accountId]?.type ?? 'Debit'),
      },
    }));
  };

  const handleSaveAll = () => {
    setSaving(true);
    ErrorManagement.safeExecuteSync(() => {
      const store = useERPStore.getState();
      Object.entries(editBalances).forEach(([id, data]) => {
        const account = accounts.find(a => a.id === id);
        if (account && (account.openingBalance !== data.balance || account.openingBalanceType !== data.type)) {
          store.updateAccount(id, {
            openingBalance: data.balance,
            openingBalanceType: data.type,
          });
        }
      });
      setEditBalances({});
      alert('Opening balances saved successfully!');
    }, 'Opening Balance');
    setSaving(false);
  };

  // Calculate totals for validation
  const changedEntries = Object.entries(editBalances);
  const totalDebitBalances = changedEntries
    .filter(([_, d]) => d.type === 'Debit')
    .reduce((s, [_, d]) => s + d.balance, 0);
  const totalCreditBalances = changedEntries
    .filter(([_, d]) => d.type === 'Credit')
    .reduce((s, [_, d]) => s + d.balance, 0);
  const isBalanced = changedEntries.length === 0 || Math.abs(totalDebitBalances - totalCreditBalances) < 0.01;

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Opening Balances</h2>
          <p className="text-sm text-muted-foreground">
            Set initial balances for all accounts — total debits must equal total credits
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            onClick={handleSaveAll}
            disabled={changedEntries.length === 0 || !isBalanced || saving}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      </div>

      {/* Balance Validation Banner */}
      {changedEntries.length > 0 && (
        <div
          className={cn(
            'px-6 py-3 border-b text-sm flex items-center gap-2',
            isBalanced
              ? 'bg-success/10 text-success border-success/20'
              : 'bg-destructive/10 text-destructive border-destructive/20'
          )}
        >
          <Calculator className="h-4 w-4" />
          {isBalanced
            ? `Balanced: Total Debits PKR ${totalDebitBalances.toLocaleString()} = Total Credits PKR ${totalCreditBalances.toLocaleString()}`
            : `Unbalanced: Difference PKR ${Math.abs(totalDebitBalances - totalCreditBalances).toLocaleString()}`}
          <span className="text-xs opacity-70 ml-auto">
            {changedEntries.length} account{changedEntries.length !== 1 ? 's' : ''} edited
          </span>
        </div>
      )}

      {/* Account List by Type */}
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          {types.map((type) => {
            const typeAccounts = filteredAccounts.filter((a) => a.type === type);
            if (typeAccounts.length === 0) return null;

            return (
              <div key={type} className="border border-border/50 rounded-xl overflow-hidden">
                <div className="bg-muted/30 px-4 py-3 border-b border-border/50">
                  <h3 className="font-semibold text-foreground">{type}</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-muted/10 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left w-20">Code</th>
                      <th className="px-4 py-2 text-left">Account</th>
                      <th className="px-4 py-2 text-center w-24">Type</th>
                      <th className="px-4 py-2 text-right w-44">Opening Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {typeAccounts.map((account) => {
                      const editData = editBalances[account.id] || {
                        balance: account.openingBalance,
                        type: account.openingBalanceType,
                      };
                      const hasChanged =
                        editData.balance !== account.openingBalance ||
                        editData.type !== account.openingBalanceType;

                      return (
                        <tr
                          key={account.id}
                          className={cn(
                            'hover:bg-muted/20 transition-colors',
                            hasChanged && 'bg-amber-500/5'
                          )}
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                            {account.code}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-medium text-foreground">{account.name}</span>
                            {account.isSystem && (
                              <span className="ml-2 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">
                                SYSTEM
                              </span>
                            )}
                            {hasChanged && (
                              <span className="ml-2 text-[10px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded font-semibold">
                                EDITED
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              value={editData.type}
                              onChange={(e) =>
                                handleBalanceChange(account.id, 'type', e.target.value as 'Debit' | 'Credit')
                              }
                              className="w-20 px-2 py-1 rounded border border-border bg-background text-xs text-center"
                            >
                              <option value="Debit">Dr</option>
                              <option value="Credit">Cr</option>
                            </select>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                PKR
                              </span>
                              <input
                                type="number"
                                value={editData.balance}
                                onChange={(e) =>
                                  handleBalanceChange(account.id, 'balance', Number(e.target.value))
                                }
                                className="w-full text-right pl-10 pr-3 py-1.5 rounded border border-border bg-background text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {filteredAccounts.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              No accounts found matching "{search}".
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
