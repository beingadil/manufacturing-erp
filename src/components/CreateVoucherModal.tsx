import React, { useState } from 'react';
import { useERPStore } from '../store/useERPStore';
import { X, Plus, Trash2 } from 'lucide-react';
import { ErrorManagement } from '../lib/validation';
import { AccountingService } from '../services/AccountingService';
import { SearchableSelect } from './SearchableSelect';
import { Account, JournalEntry, VoucherType } from '../types/erp';

export function CreateVoucherModal({ isOpen, onClose, onSave }: { isOpen: boolean, onClose: () => void, onSave: () => void }) {
  const { accounts, addVoucher, suppliers, customers, processors, accountSubtypes } = useERPStore();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<VoucherType>('Journal Voucher');
  const [referenceNo, setReferenceNo] = useState('');
  const [narration, setNarration] = useState('');
  
  const [entries, setEntries] = useState<Array<{ id: string, accountId: string, debit: number, credit: number }>>([
    { id: '1', accountId: '', debit: 0, credit: 0 },
    { id: '2', accountId: '', debit: 0, credit: 0 }
  ]);

  if (!isOpen) return null;

  const totalDebit = entries.reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
  const totalCredit = entries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;
  const isValid = isBalanced && entries.every(e => e.accountId) && narration;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    const voucherEntries = entries.map(e => ({
      accountId: e.accountId,
      debit: Number(e.debit) || 0,
      credit: Number(e.credit) || 0,
      narration: ''
    }));

    ErrorManagement.safeExecuteSync(() => {
      AccountingService.createVoucher({
        date,
        type,
        referenceNo,
        sourceModule: 'Manual',
        narration
      }, voucherEntries);
      onSave();
    }, 'Voucher Save');
  };

  const updateEntry = (id: string, field: string, value: string | number) => {
    setEntries(entries.map(e => {
      if (e.id === id) {
        if (field === 'debit') return { ...e, debit: Number(value), credit: 0 };
        if (field === 'credit') return { ...e, credit: Number(value), debit: 0 };
        return { ...e, [field]: value };
      }
      return e;
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-border/50 flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold text-foreground">Create Voucher</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted/50 rounded-lg transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 pb-64 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Date</label>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary bg-background text-foreground" />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Voucher Type</label>
              <select required value={type} onChange={e => setType(e.target.value as VoucherType)} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary bg-background text-foreground">
                <option value="Journal Voucher">Journal Voucher</option>
                <option value="Receipt Voucher">Receipt Voucher</option>
                <option value="Payment Voucher">Payment Voucher</option>
                <option value="Contra Voucher">Contra Voucher</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Reference No (Optional)</label>
              <input type="text" value={referenceNo} onChange={e => setReferenceNo(e.target.value)} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary bg-background text-foreground" placeholder="e.g. Bill #123" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Narration</label>
            <textarea required value={narration} onChange={e => setNarration(e.target.value)} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary bg-background text-foreground" placeholder="Description of the transaction" rows={2} />
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-foreground">Journal Entries</h3>
              <button type="button" onClick={() => setEntries([...entries, { id: Math.random().toString(), accountId: '', debit: 0, credit: 0 }])} className="text-sm text-primary font-medium flex items-center hover:underline">
                <Plus className="h-4 w-4 mr-1" /> Add Row
              </button>
            </div>
            <div className="border border-border/50 rounded-xl overflow-visible bg-muted/10">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="py-2 px-4 text-xs font-semibold text-muted-foreground">Account</th>
                    <th className="py-2 px-4 text-xs font-semibold text-muted-foreground w-32 text-right">Debit</th>
                    <th className="py-2 px-4 text-xs font-semibold text-muted-foreground w-32 text-right">Credit</th>
                    <th className="py-2 px-4 text-xs font-semibold text-muted-foreground w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {entries.map((entry, index) => (
                    <tr key={entry.id}>
                      <td className="p-2">
                        <SearchableSelect
                          options={accounts.map(a => {
                  let relatedParty = '';
                  if (a.linkedEntityId) {
                    const sup = suppliers?.find(s => s.id === a.linkedEntityId);
                    const cus = customers?.find(c => c.id === a.linkedEntityId);
                    const proc = processors?.find(p => p.id === a.linkedEntityId);
                    if (sup) relatedParty = `(Supplier: ${sup.name})`;
                    else if (cus) relatedParty = `(Customer: ${cus.name})`;
                    else if (proc) relatedParty = `(Processor: ${proc.name})`;
                  }
                  const subtype = accountSubtypes?.find(s => s.id === a.subtypeId)?.name || '';
                  return {
                    id: a.id,
                    label: `${a.code} - ${a.name}`,
                    secondaryLabel: `${a.type} ${subtype ? `• ${subtype}` : ''} ${relatedParty}`.trim(),
                    searchValue: `${a.type} ${subtype} ${relatedParty}`
                  };
                })}
                          value={entry.accountId}
                          onChange={(val) => updateEntry(entry.id, 'accountId', val)}
                          placeholder="Search account..."
                          required
                        />
                      </td>
                      <td className="p-2">
                        <input type="number" min="0" step="0.01" value={entry.debit || ''} onChange={e => updateEntry(entry.id, 'debit', e.target.value)} className="w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:border-primary bg-background text-foreground text-right" placeholder="0.00" disabled={entry.credit > 0} />
                      </td>
                      <td className="p-2">
                        <input type="number" min="0" step="0.01" value={entry.credit || ''} onChange={e => updateEntry(entry.id, 'credit', e.target.value)} className="w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:border-primary bg-background text-foreground text-right" placeholder="0.00" disabled={entry.debit > 0} />
                      </td>
                      <td className="p-2 text-center">
                        <button type="button" onClick={() => setEntries(entries.filter(e => e.id !== entry.id))} disabled={entries.length <= 2} className="text-muted-foreground hover:text-rose-500 disabled:opacity-50 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t border-border/50">
                  <tr>
                    <td className="py-3 px-4 font-semibold text-right text-foreground">Totals</td>
                    <td className="py-3 px-4 text-right font-semibold text-foreground">{totalDebit.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-semibold text-foreground">{totalCredit.toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {!isBalanced && totalDebit > 0 && totalCredit > 0 && (
              <p className="text-rose-500 text-sm mt-2">Total Debit must equal Total Credit. Difference: {Math.abs(totalDebit - totalCredit).toLocaleString()}</p>
            )}
          </div>
        </form>
        
        <div className="p-6 border-t border-border/50 bg-muted/10 shrink-0 flex justify-end gap-3 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-foreground bg-background border border-border hover:bg-muted/50 rounded-xl transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!isValid} className="px-6 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Save Voucher
          </button>
        </div>
      </div>
    </div>
  );
}
