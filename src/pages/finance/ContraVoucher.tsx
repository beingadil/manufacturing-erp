import React, { useState, useMemo } from 'react';
import { useERPStore } from '../../store/useERPStore';
import { SearchableSelect } from '../../components/SearchableSelect';
import { AccountingService } from '../../services/AccountingService';
import { DocumentNumberingService } from '../../lib/business/DocumentNumberingService';
import { ErrorManagement } from '../../lib/validation';
import { cn } from '../../lib/utils';
import { Save, ArrowLeftRight } from 'lucide-react';

export function ContraVoucher() {
  const { accounts, accountSubtypes, vouchers } = useERPStore();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
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
    const prefix = DocumentNumberingService.getVoucherPrefix('Contra Voucher');
    const count = DocumentNumberingService.countByType(vouchers, 'Contra Voucher');
    return DocumentNumberingService.generateVoucherNumber(prefix, count + 1);
  }, [vouchers]);

  const isValid = fromAccountId && toAccountId && fromAccountId !== toAccountId && amount !== '' && Number(amount) > 0 && narration;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    const numAmount = Number(amount);

    ErrorManagement.safeExecuteSync(() => {
      AccountingService.createVoucher({
        date,
        type: 'Contra Voucher' as any,
        referenceNo,
        sourceModule: 'Cashbook',
        narration,
      }, [
        { accountId: fromAccountId, debit: 0, credit: numAmount, description: narration },
        { accountId: toAccountId, debit: numAmount, credit: 0, description: narration },
      ]);

      alert(`Contra Voucher ${voucherNo} saved!`);
      setAmount('');
      setNarration('');
      setReferenceNo('');
      setFromAccountId('');
      setToAccountId('');
    }, 'Contra Voucher');
  };

  const fromAccount = cashAccounts.find(a => a.id === fromAccountId);
  const toAccount = cashAccounts.find(a => a.id === toAccountId);

  const cashAccountOptions = cashAccounts.map(a => ({
    id: a.id,
    label: `${a.code} — ${a.name}`,
    secondaryLabel: `Balance: ${a.openingBalanceType === 'Debit' ? 'Dr' : 'Cr'} ${a.openingBalance.toLocaleString()}`,
  }));

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden mb-6">
          <div className="border-b border-border/50 bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10 px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">Contra Voucher</h2>
                <p className="text-sm text-muted-foreground mt-1">Transfer between cash and bank accounts</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">{voucherNo}</p>
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
                  placeholder="e.g. Bank Slip #"
                />
              </div>
            </div>

            {/* Transfer Section */}
            <div className="bg-muted/10 p-6 rounded-xl border border-border/50">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    <span className="text-rose-600 font-bold">Credit (From)</span>
                  </label>
                  <SearchableSelect
                    options={cashAccountOptions.filter(o => o.id !== toAccountId)}
                    value={fromAccountId}
                    onChange={setFromAccountId}
                    placeholder="Select account to transfer from..."
                    required
                  />
                </div>
                <div className="pt-6">
                  <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <ArrowLeftRight className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    <span className="text-emerald-600 font-bold">Debit (To)</span>
                  </label>
                  <SearchableSelect
                    options={cashAccountOptions.filter(o => o.id !== fromAccountId)}
                    value={toAccountId}
                    onChange={setToAccountId}
                    placeholder="Select account to transfer to..."
                    required
                  />
                </div>
              </div>

              {/* Amount */}
              <div className="max-w-sm">
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
            </div>

            {/* Narration */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Narration</label>
              <textarea
                required
                value={narration}
                onChange={e => setNarration(e.target.value)}
                className="w-full rounded-xl border border-border px-4 py-2.5 text-sm bg-background text-foreground focus:border-primary"
                placeholder="e.g. Transfer from cash to bank, bank deposit"
                rows={2}
              />
            </div>

            {/* Journal Preview */}
            {isValid && (
              <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/50 dark:border-amber-800/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Journal Entry Preview</p>
                <div className="space-y-2 text-sm font-mono">
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-emerald-600 font-bold">Dr</span>
                    <span className="text-foreground">{toAccount?.name || 'Destination'}</span>
                    <span className="ml-auto font-medium">PKR {Number(amount).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3 pl-8">
                    <span className="text-rose-600 font-bold">Cr</span>
                    <span className="text-muted-foreground">{fromAccount?.name || 'Source'}</span>
                    <span className="ml-auto font-medium">PKR {Number(amount).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
              <button
                type="button"
                onClick={() => { setAmount(''); setNarration(''); setReferenceNo(''); setFromAccountId(''); setToAccountId(''); }}
                className="px-6 py-2.5 text-sm font-semibold text-foreground bg-background border border-border hover:bg-muted/50 rounded-xl transition-colors"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={!isValid}
                className="flex items-center gap-2 px-8 py-2.5 text-sm font-semibold text-primary-foreground bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
