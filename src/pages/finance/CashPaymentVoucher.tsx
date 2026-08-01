import React, { useState, useMemo } from 'react';
import { useERPStore } from '../../store/useERPStore';
import { SearchableSelect } from '../../components/SearchableSelect';
import { SearchableAccountTree } from './SearchableAccountTree';
import { AccountingService } from '../../services/AccountingService';
import { DocumentNumberingService } from '../../lib/business/DocumentNumberingService';
import { ErrorManagement } from '../../lib/validation';
import { cn } from '../../lib/utils';
import { Save, Building2, Receipt, BookText, User } from 'lucide-react';

type PaidToType = 'supplier' | 'expense' | 'account' | 'employee';

export function CashPaymentVoucher() {
  const { accounts, suppliers, accountSubtypes, vouchers } = useERPStore();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [cashAccountId, setCashAccountId] = useState('');
  const [paidToType, setPaidToType] = useState<PaidToType>('supplier');
  const [paidToId, setPaidToId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [narration, setNarration] = useState('');
  const [referenceNo, setReferenceNo] = useState('');

  // Cash & Bank accounts
  const cashAccounts = useMemo(() =>
    accounts.filter(a => {
      const sub = accountSubtypes?.find(s => s.id === a.subtypeId);
      return sub?.name === 'Cash' || sub?.name === 'Bank' ||
        a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('bank');
    }),
    [accounts, accountSubtypes]
  );

  // Voucher number preview
  const voucherNo = useMemo(() => {
    const prefix = DocumentNumberingService.getVoucherPrefix('Cash Payment');
    const count = DocumentNumberingService.countByType(vouchers, 'Cash Payment');
    return DocumentNumberingService.generateVoucherNumber(prefix, count + 1);
  }, [vouchers]);

  // Counterparty options based on type
  const counterpartyOptions = useMemo((): { id: string; label: string; accountId: string | null; secondaryLabel?: string }[] => {
    switch (paidToType) {
      case 'supplier':
        return suppliers.map(s => ({
          id: s.id,
          label: s.name,
          accountId: accounts.find(a => a.linkedEntityId === s.id)?.id || null,
          secondaryLabel: `Balance: PKR ${(s.balancePayable || 0).toLocaleString()}`,
        }));
      case 'expense':
        return accounts
          .filter(a => a.type === 'Expenses' || a.type === 'Cost of Goods Sold' || a.type === 'Other Expenses')
          .map(a => ({
            id: a.id,
            label: `${a.code} — ${a.name}`,
            accountId: a.id,
            secondaryLabel: a.type,
          }));
      case 'account':
        return accounts
          .filter(a => a.type === 'Liabilities' || a.type === 'Assets')
          .map(a => ({
            id: a.id,
            label: `${a.code} — ${a.name}`,
            accountId: a.id,
            secondaryLabel: a.type,
          }));
      case 'employee':
        return accounts
          .filter(a => a.name.toLowerCase().includes('salary') || a.type === 'Expenses')
          .slice(0, 20)
          .map(a => ({
            id: a.id,
            label: `${a.code} — ${a.name}`,
            accountId: a.id,
            secondaryLabel: a.type,
          }));
      default:
        return [];
    }
  }, [paidToType, suppliers, accounts]);

  const selectedCounterparty = counterpartyOptions.find(o => o.id === paidToId);
  const selectedCashAccount = cashAccounts.find(a => a.id === cashAccountId);
  const isValid = cashAccountId && paidToId && amount !== '' && Number(amount) > 0 && narration;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    const numAmount = Number(amount);
    let debitAccountId: string | null = null;

    if (paidToType === 'supplier') {
      debitAccountId = selectedCounterparty?.accountId || null;
    } else {
      debitAccountId = paidToId;
    }

    if (!debitAccountId) {
      alert('Could not resolve counterparty account. Make sure the selected entity has a linked account.');
      return;
    }

    // Validate supplier balance
    if (paidToType === 'supplier') {
      const sup = suppliers.find(s => s.id === paidToId);
      if (sup && numAmount > sup.balancePayable) {
        alert(`Cannot pay beyond outstanding balance of PKR ${sup.balancePayable.toLocaleString()}.`);
        return;
      }
    }

    ErrorManagement.safeExecuteSync(() => {
      AccountingService.createVoucher({
        date,
        type: 'Cash Payment' as any,
        referenceNo,
        sourceModule: 'Cashbook',
        narration,
      }, [
        { accountId: debitAccountId, debit: numAmount, credit: 0, narration },
        { accountId: cashAccountId, debit: 0, credit: numAmount, narration },
      ]);

      // Update supplier payable balance
      if (paidToType === 'supplier') {
        const sup = suppliers.find(s => s.id === paidToId);
        if (sup) {
          useERPStore.getState().updateSupplier(sup.id, {
            balancePayable: Math.max(0, sup.balancePayable - numAmount),
          });
        }
      }

      alert(`Cash Payment Voucher ${voucherNo} saved!`);
      setAmount('');
      setNarration('');
      setReferenceNo('');
      setPaidToId('');
    }, 'Cash Payment Voucher');
  };

  const getNarrationHint = () => {
    switch (paidToType) {
      case 'supplier': return 'e.g. Payment to supplier against invoice';
      case 'expense': return 'e.g. Electricity bill, rent, fuel, office expense';
      case 'account': return 'e.g. Loan payment, asset purchase';
      case 'employee': return 'e.g. Salary payment, advance to employee';
      default: return 'Description of payment';
    }
  };

  const getCounterpartyName = () => {
    if (paidToType === 'supplier') return suppliers.find(s => s.id === paidToId)?.name;
    if (paidToType === 'expense' || paidToType === 'account' || paidToType === 'employee') {
      const acc = accounts.find(a => a.id === paidToId);
      return acc ? `${acc.code} — ${acc.name}` : undefined;
    }
    return undefined;
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        {/* Voucher Header */}
        <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden mb-6">
          <div className="border-b border-border/50 bg-gradient-to-r from-rose-50 to-rose-100/50 dark:from-rose-950/20 dark:to-rose-900/10 px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">Cash Payment Voucher</h2>
                <p className="text-sm text-muted-foreground mt-1">Record money going out of the business</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">{voucherNo}</p>
                <p className="text-xs text-muted-foreground mt-1">Auto-generated</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} className="p-6 space-y-6">
            {/* Date & Reference */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">Date</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">Reference (Optional)</label>
                <input
                  type="text"
                  value={referenceNo}
                  onChange={e => setReferenceNo(e.target.value)}
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="e.g. Check #, Bank Ref"
                />
              </div>
            </div>

            {/* Cash Account (Credit) */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                <span className="text-rose-600 font-bold">Credit</span> — Cash/Bank Account (Paying from)
              </label>
              <SearchableSelect
                options={cashAccounts.map(a => ({
                  id: a.id,
                  label: `${a.code} — ${a.name}`,
                  secondaryLabel: `Balance: ${a.openingBalanceType === 'Debit' ? 'Dr' : 'Cr'} ${a.openingBalance.toLocaleString()}`,
                }))}
                value={cashAccountId}
                onChange={setCashAccountId}
                placeholder="Select cash or bank account..."
                required
              />
            </div>

            {/* Paid To Type */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                <span className="text-emerald-600 font-bold">Debit</span> — Paid To
              </label>
              <div className="grid grid-cols-4 gap-3 mb-3">
                {([
                  { value: 'supplier' as const, label: 'Supplier', icon: Building2 },
                  { value: 'expense' as const, label: 'Expense', icon: Receipt },
                  { value: 'account' as const, label: 'Ledger Account', icon: BookText },
                  { value: 'employee' as const, label: 'Employee', icon: User },
                ]).map(ct => (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => { setPaidToType(ct.value); setPaidToId(''); }}
                    className={cn(
                      "flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium rounded-xl border-2 transition-all",
                      paidToType === ct.value
                        ? "bg-primary/10 text-primary border-primary"
                        : "bg-background border-border text-muted-foreground hover:border-muted-foreground/30"
                    )}
                  >
                    <ct.icon className="h-4 w-4" />
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Counterparty Search */}
            {paidToType === 'supplier' && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">Search Supplier</label>
                <SearchableSelect
                  options={counterpartyOptions}
                  value={paidToId}
                  onChange={setPaidToId}
                  placeholder="Search supplier..."
                  required
                />
              </div>
            )}
            {(paidToType === 'expense' || paidToType === 'employee') && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  {paidToType === 'expense' ? 'Search Expense Account' : 'Search Employee/Expense Account'}
                </label>
                <SearchableAccountTree
                  value={paidToId}
                  onChange={setPaidToId}
                  allowedTypes={['Expenses', 'Cost of Goods Sold', 'Other Expenses']}
                  placeholder={`Select ${paidToType} account...`}
                  required
                />
              </div>
            )}
            {paidToType === 'account' && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">Search Account</label>
                <SearchableAccountTree
                  value={paidToId}
                  onChange={setPaidToId}
                  placeholder="Select account..."
                  required
                />
              </div>
            )}

            {/* Amount & Narration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">PKR</span>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-xl border border-border pl-14 pr-4 py-2.5 text-sm bg-background text-foreground focus:border-primary"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Narration</label>
                <textarea
                  required
                  value={narration}
                  onChange={e => setNarration(e.target.value)}
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm bg-background text-foreground focus:border-primary"
                  placeholder={getNarrationHint()}
                  rows={2}
                />
              </div>
            </div>

            {/* Journal Preview */}
            {isValid && (
              <div className="p-4 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl border border-rose-200/50 dark:border-rose-800/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Journal Entry Preview</p>
                <div className="space-y-2 text-sm font-mono">
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-emerald-600 font-bold">Dr</span>
                    <span className="text-foreground">{getCounterpartyName() || 'Counterparty'}</span>
                    <span className="ml-auto font-medium">PKR {Number(amount).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3 pl-8">
                    <span className="text-rose-600 font-bold">Cr</span>
                    <span className="text-muted-foreground">{selectedCashAccount?.name || 'Cash/Bank'}</span>
                    <span className="ml-auto font-medium">PKR {Number(amount).toLocaleString()}</span>
                  </div>
                  <div className="border-t border-rose-200/50 dark:border-rose-800/30 pt-2 text-xs text-muted-foreground mt-2">
                    <span className="font-medium">Narration:</span> {narration}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
              <button
                type="button"
                onClick={() => { setAmount(''); setNarration(''); setReferenceNo(''); setPaidToId(''); }}
                className="px-6 py-2.5 text-sm font-semibold text-foreground bg-background border border-border hover:bg-muted/50 rounded-xl transition-colors"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={!isValid}
                className="flex items-center gap-2 px-8 py-2.5 text-sm font-semibold text-primary-foreground bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <Save className="h-4 w-4" />
                Save Voucher
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
