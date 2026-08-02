import React, { useState, useMemo } from 'react';
import { useERPStore } from '../../store/useERPStore';
import { SearchableSelect } from '../../components/SearchableSelect';
import { SearchableAccountTree } from './SearchableAccountTree';
import { AccountingService } from '../../services/AccountingService';
import { DocumentNumberingService } from '../../lib/business/DocumentNumberingService';
import { ErrorManagement } from '../../lib/validation';
import { cn } from '../../lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, CheckCircle2, Info, Send, RotateCcw } from 'lucide-react';

export interface MultiEntryVoucherConfig {
  mode: 'payment' | 'receipt' | 'contra';
  title: string;
  subtitle: string;
  accent: 'rose' | 'emerald' | 'amber';
}

interface EntryRow {
  uid: string;
  type: RowType;
  counterpartyId: string;
  invoiceRef: string;
  description: string;
  amount: number | '';
}

type RowType = 'supplier' | 'customer' | 'expense' | 'income' | 'employee' | 'account' | 'cash';

const PAYMENT_TYPES: { value: RowType; label: string }[] = [
  { value: 'supplier', label: 'Supplier' },
  { value: 'expense', label: 'Expense' },
  { value: 'account', label: 'Ledger Account' },
  { value: 'employee', label: 'Employee' },
];

const RECEIPT_TYPES: { value: RowType; label: string }[] = [
  { value: 'customer', label: 'Customer' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'income', label: 'Income' },
  { value: 'account', label: 'Ledger Account' },
];

const CONTRA_TYPES: { value: RowType; label: string }[] = [
  { value: 'cash', label: 'Bank/Cash' },
];

export function MultiEntryVoucher({ config }: { config: MultiEntryVoucherConfig }) {
  const { accounts, suppliers, customers, accountSubtypes, vouchers } = useERPStore();
  const { mode, title, subtitle, accent } = config;
  const isPayment = mode === 'payment';
  const isContra = mode === 'contra';
  const defaultRowType: RowType = isContra ? 'cash' : isPayment ? 'supplier' : 'customer';

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [cashAccountId, setCashAccountId] = useState('');
  const [rowType, setRowType] = useState<RowType>(defaultRowType);
  const [rows, setRows] = useState<EntryRow[]>([newRow(defaultRowType)]);
  const [narration, setNarration] = useState('');

  function newRow(type: RowType): EntryRow {
    return { uid: uuidv4(), type, counterpartyId: '', invoiceRef: '', description: '', amount: '' };
  }

  const updateRow = (uid: string, patch: Partial<EntryRow>) =>
    setRows(prev => prev.map(r => (r.uid === uid ? { ...r, ...patch } : r)));

  const removeRow = (uid: string) =>
    setRows(prev => (prev.length === 1 ? prev : prev.filter(r => r.uid !== uid)));

  const addRow = () => setRows(prev => [...prev, newRow(rowType)]);

  // Cash & Bank accounts
  const cashAccounts = useMemo(() =>
    accounts.filter(a => {
      const sub = accountSubtypes?.find(s => s.id === a.subtypeId);
      return sub?.name === 'Cash' || sub?.name === 'Bank' ||
        a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('bank');
    }),
    [accounts, accountSubtypes]
  );

  // Resolve voucher type: fixed for contra, otherwise from the ledger subtype
  const voucherType = useMemo(() => {
    if (isContra) return 'Contra Voucher';
    const cashAcc = accounts.find(a => a.id === cashAccountId);
    const sub = accountSubtypes?.find(s => s.id === cashAcc?.subtypeId);
    const isCash = sub?.name === 'Cash' || (!sub && (cashAcc?.name.toLowerCase().includes('cash') ?? false));
    if (isPayment) return isCash ? 'Cash Payment' : 'Bank Payment';
    return isCash ? 'Cash Receipt' : 'Bank Receipt';
  }, [isContra, cashAccountId, accounts, accountSubtypes, isPayment]);

  // Voucher number preview
  const voucherNo = useMemo(() => {
    const prefix = DocumentNumberingService.getVoucherPrefix(voucherType);
    const count = DocumentNumberingService.countByType(vouchers, voucherType);
    return DocumentNumberingService.generateVoucherNumber(prefix, count + 1);
  }, [vouchers, voucherType]);

  const entityOptionsFor = (type: RowType) => {
    if (type === 'supplier') {
      return suppliers.map(s => ({ id: s.id, label: s.name, secondaryLabel: `Balance: PKR ${(s.balancePayable || 0).toLocaleString()}` }));
    }
    if (type === 'customer') {
      return customers.map(c => ({ id: c.id, label: c.name, secondaryLabel: `Balance: PKR ${(c.balanceReceivable || 0).toLocaleString()}` }));
    }
    if (type === 'cash') {
      return cashAccounts
        .filter(a => a.id !== cashAccountId)
        .map(a => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
          secondaryLabel: `Balance: ${a.openingBalanceType === 'Debit' ? 'Dr' : 'Cr'} ${a.openingBalance.toLocaleString()}`,
        }));
    }
    return [];
  };

  const accountTypesFor = (type: RowType): Parameters<typeof SearchableAccountTree>[0]['allowedTypes'] => {
    if (type === 'expense') return ['Expenses', 'Cost of Goods Sold', 'Other Expenses'];
    if (type === 'income') return ['Revenue', 'Other Income', 'Equity'];
    if (type === 'employee') return ['Expenses'];
    return undefined;
  };

  const resolveRowAccount = (row: EntryRow): string | null => {
    if (row.type === 'supplier' || row.type === 'customer') {
      return accounts.find(a => a.linkedEntityId === row.counterpartyId)?.id || null;
    }
    return row.counterpartyId || null;
  };

  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  // Only rows the user has touched must be complete; fully blank rows are ignored.
  const touchedRows = rows.filter(r => r.counterpartyId || r.amount || r.invoiceRef || r.description);
  const completedRows = rows.filter(r => r.counterpartyId && (Number(r.amount) || 0) > 0);
  const isValid = !!date && !!cashAccountId && narration.trim() !== '' && completedRows.length > 0 &&
    touchedRows.every(r => r.counterpartyId && (Number(r.amount) || 0) > 0);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    // Aggregate per entity so cross-line overpayment is caught too
    const supplierTotals = new Map<string, number>();
    const customerTotals = new Map<string, number>();
    rows.forEach(r => {
      const amt = Number(r.amount) || 0;
      if (amt <= 0 || !r.counterpartyId) return;
      if (isPayment && r.type === 'supplier') {
        supplierTotals.set(r.counterpartyId, (supplierTotals.get(r.counterpartyId) || 0) + amt);
      }
      if (!isPayment && r.type === 'customer') {
        customerTotals.set(r.counterpartyId, (customerTotals.get(r.counterpartyId) || 0) + amt);
      }
    });
    for (const [sid, amt] of supplierTotals) {
      const sup = suppliers.find(s => s.id === sid);
      if (sup && amt > sup.balancePayable) {
        alert(`Cannot pay ${sup.name} beyond outstanding balance of PKR ${sup.balancePayable.toLocaleString()}.`);
        return;
      }
    }
    for (const [cid, amt] of customerTotals) {
      const cus = customers.find(c => c.id === cid);
      if (cus && amt > cus.balanceReceivable) {
        alert(`Cannot receive from ${cus.name} beyond outstanding balance of PKR ${cus.balanceReceivable.toLocaleString()}.`);
        return;
      }
    }

    const entries: { accountId: string; debit: number; credit: number; narration: string }[] = [];
    const rowsAreDebit = !isPayment; // payment & contra rows debit; receipt rows credit

    for (const row of rows) {
      const amt = Number(row.amount) || 0;
      const isTouched = !!row.counterpartyId || amt > 0;
      if (!isTouched) continue; // fully blank line — ignored
      const accId = resolveRowAccount(row);
      if (!accId) {
        alert('Could not resolve counterparty account. Make sure the selected entity has a linked account.');
        return;
      }
      if (amt <= 0) continue;

      entries.push({
        accountId: accId,
        debit: rowsAreDebit ? amt : 0,
        credit: rowsAreDebit ? 0 : amt,
        narration: row.description || narration,
      });
    }

    // Cash/bank side — one line for the whole voucher (Credit for payment/contra, Debit for receipt)
    entries.push({
      accountId: cashAccountId,
      debit: rowsAreDebit ? 0 : total,
      credit: rowsAreDebit ? total : 0,
      narration,
    });

    const referenceNo = rows.map(r => r.invoiceRef).filter(Boolean).join(', ');

    ErrorManagement.safeExecuteSync(() => {
      AccountingService.createVoucher({
        date,
        type: voucherType as any,
        referenceNo: referenceNo || undefined,
        sourceModule: 'Cashbook',
        narration,
      }, entries as any);

      // Update entity balances
      rows.forEach(row => {
        const amt = Number(row.amount) || 0;
        if (isPayment && row.type === 'supplier') {
          const sup = suppliers.find(s => s.id === row.counterpartyId);
          if (sup) useERPStore.getState().updateSupplier(sup.id, { balancePayable: Math.max(0, sup.balancePayable - amt) });
        }
        if (!isPayment && row.type === 'customer') {
          const cus = customers.find(c => c.id === row.counterpartyId);
          if (cus) useERPStore.getState().updateCustomer(cus.id, { balanceReceivable: Math.max(0, cus.balanceReceivable - amt) });
        }
      });

      alert(`${title} ${voucherNo} saved!`);
      resetForm();
    }, `${title} Voucher`);
  };

  const resetForm = () => {
    setRows([newRow(defaultRowType)]);
    setNarration('');
    setCashAccountId('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  const accentText = accent === 'rose'
    ? 'text-rose-600 dark:text-rose-400'
    : accent === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-amber-600 dark:text-amber-400';
  const accentBtn = accent === 'rose'
    ? 'bg-rose-600 hover:bg-rose-500'
    : accent === 'emerald'
      ? 'bg-emerald-600 hover:bg-emerald-500'
      : 'bg-amber-600 hover:bg-amber-500';
  const accentChipActive = accent === 'rose'
    ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800'
    : accent === 'emerald'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
      : 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800';

  const rowTypes = isContra ? CONTRA_TYPES : isPayment ? PAYMENT_TYPES : RECEIPT_TYPES;
  const ledgerLabel = isContra ? 'Transfer From (Credit)' : 'Cash/Bank Ledger';
  const rowHeader = isContra ? 'Transfer To (Debit)' : isPayment ? 'Debit Account / Vendor' : 'Credit Account / Party';
  const chipsLabel = isContra
    ? 'Transfer To (default for new lines)'
    : isPayment
      ? 'Paid To (default for new lines)'
      : 'Received From (default for new lines)';
  const subtotalLabel = isContra ? 'Subtotal Transfers' : isPayment ? 'Subtotal Payments' : 'Subtotal Receipts';
  const netLabel = isContra ? 'Transfer' : isPayment ? 'Payment' : 'Receipt';
  const narrationPlaceholder = isContra
    ? 'e.g. Transfer from cash to bank, bank deposit'
    : isPayment
      ? 'e.g. Payment to suppliers & expenses for the month'
      : 'e.g. Cash received against invoices & other income';

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        {/* Breadcrumbs & Title */}
        <div className="mb-6 flex justify-between items-end gap-4 flex-wrap">
          <div>
            <nav className="flex text-xs text-muted-foreground mb-2">
              <span className="hover:text-primary cursor-pointer">Cash Book</span>
              <span className="mx-2">/</span>
              <span className="text-foreground font-semibold">{title}</span>
            </nav>
            <h3 className="text-2xl font-bold text-foreground tracking-tight">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border text-foreground font-semibold rounded-xl hover:bg-muted/50 transition-all active:scale-95 text-sm"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
            <button
              type="submit"
              form="multi-entry-voucher-form"
              disabled={!isValid}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 text-white font-semibold rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm",
                accentBtn
              )}
            >
              <Send className="h-4 w-4" />
              Post {netLabel}
            </button>
          </div>
        </div>

        {/* noValidate: isValid() already enforces cash account, narration & row completeness; without it, blank rows' hidden required inputs would block native submission */}
        <form id="multi-entry-voucher-form" onSubmit={handleSave} noValidate>
          {/* Header Bento Grid */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            <div className="col-span-12 lg:col-span-8 bg-card border border-border/50 rounded-xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Date</label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Voucher No</label>
                <input
                  type="text"
                  readOnly
                  value={voucherNo}
                  className={cn("w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm font-mono font-bold", accentText)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
                  {ledgerLabel}
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
              {/* Default type for new lines */}
              <div className="col-span-1 sm:col-span-3 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
                  {chipsLabel}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {rowTypes.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setRowType(t.value)}
                      className={cn(
                        "px-3 py-2 text-sm font-medium rounded-lg border transition-all",
                        rowType === t.value
                          ? cn(accentChipActive, "border-2")
                          : "bg-background border-border text-muted-foreground hover:border-muted-foreground/30"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Total Voucher Balance card */}
            <div className="col-span-12 lg:col-span-4 bg-primary text-primary-foreground rounded-xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-widest opacity-60 font-medium">Total Voucher Balance</p>
                <h4 className="text-3xl font-bold mt-2 font-mono">PKR {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h4>
              </div>
              {total > 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-400 mt-4">
                  <CheckCircle2 className="h-4 w-4" />
                  Voucher is balanced and ready
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-white/60 mt-4">
                  <Info className="h-4 w-4" />
                  Add entry lines below
                </div>
              )}
            </div>
          </div>

          {/* Dynamic Entry Table */}
          <div className="bg-card border border-border/50 rounded-xl shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/30 border-b border-border/50 [&>th:first-child]:rounded-tl-xl [&>th:last-child]:rounded-tr-xl">
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-10">#</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {rowHeader}
                  </th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-40">Invoice Ref</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Description</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-right w-44">Amount</th>
                  <th className="px-4 py-3.5 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((row, idx) => (
                  <tr key={row.uid} className="group hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground align-top pt-5">
                      {String(idx + 1).padStart(2, '0')}
                    </td>
                    <td className="px-4 py-3 align-top w-64">
                      <select
                        value={row.type}
                        onChange={e => updateRow(row.uid, { type: e.target.value as RowType, counterpartyId: '' })}
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 mb-1.5 text-xs font-medium text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                      >
                        {rowTypes.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      {row.type === 'supplier' || row.type === 'customer' || row.type === 'cash' ? (
                        <SearchableSelect
                          options={entityOptionsFor(row.type)}
                          value={row.counterpartyId}
                          onChange={id => updateRow(row.uid, { counterpartyId: id })}
                          placeholder={row.type === 'cash' ? 'Select destination account...' : `Search ${row.type}...`}
                          required
                        />
                      ) : (
                        <SearchableAccountTree
                          value={row.counterpartyId}
                          onChange={id => updateRow(row.uid, { counterpartyId: id })}
                          allowedTypes={accountTypesFor(row.type)}
                          placeholder={`Select ${row.type === 'employee' ? 'expense' : row.type} account...`}
                          required
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <input
                        type="text"
                        value={row.invoiceRef}
                        onChange={e => updateRow(row.uid, { invoiceRef: e.target.value })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="INV-001"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <input
                        type="text"
                        value={row.description}
                        onChange={e => updateRow(row.uid, { description: e.target.value })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="e.g. Oct freight charges"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-xs text-muted-foreground">PKR</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={row.amount}
                          onChange={e => updateRow(row.uid, { amount: e.target.value ? Number(e.target.value) : '' })}
                          className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm text-right font-bold text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                          placeholder="0.00"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(row.uid)}
                        disabled={rows.length === 1}
                        className="text-muted-foreground hover:text-red-600 disabled:opacity-30 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                        title="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-border/50 bg-muted/10">
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-2 text-sm text-primary font-semibold hover:underline"
              >
                <Plus className="h-4 w-4" />
                Add Another Entry
              </button>
            </div>
          </div>

          {/* Footer: Notes + Totals */}
          <div className="mt-4 grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-8 bg-card border border-border/50 rounded-xl p-5 shadow-sm">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">
                Notes / Narration
              </label>
              <textarea
                required
                value={narration}
                onChange={e => setNarration(e.target.value)}
                rows={3}
                placeholder={narrationPlaceholder}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div className="col-span-12 lg:col-span-4 bg-card border border-border/50 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{subtotalLabel}</span>
                <span className="font-medium">PKR {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Lines</span>
                <span className="font-medium">{completedRows.length}</span>
              </div>
              <div className="h-px bg-border/50"></div>
              <div className="flex justify-between items-end">
                <span className="text-xs font-bold uppercase tracking-wider">Net {netLabel}</span>
                <span className={cn("text-2xl font-bold font-mono", total > 0 ? accentText : "text-foreground")}>
                  PKR {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
