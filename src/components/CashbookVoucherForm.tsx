import React, { useState, useMemo, useEffect } from 'react';
import { useERPStore } from '../store/useERPStore';
import { SearchableSelect } from './SearchableSelect';
import { SearchableAccountTree } from '../pages/finance/SearchableAccountTree';
import { AccountingService } from '../services/AccountingService';
import { DocumentNumberingService } from '../lib/business/DocumentNumberingService';
import { ErrorManagement } from '../lib/validation';
import { cn } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, CheckCircle2, Info, Send, RotateCcw, X } from 'lucide-react';
import { AddAccountModal } from './AddAccountModal';
import { AccountType } from '../types/erp';

type CashbookEntryType = 'Payment' | 'Receipt' | 'Contra' | 'Journal';
type RowType = 'supplier' | 'customer' | 'processor' | 'expense' | 'income' | 'cash' | 'account';

interface EntryRow {
  uid: string;
  type: RowType;
  counterpartyId: string;
  invoiceRef: string;
  description: string;
  amount: number | '';
}

interface CashbookVoucherFormProps {
  editVoucherId?: string;
  defaultAccountId?: string;
  /** Entry type to open with when creating a fresh voucher (defaults to Payment). */
  defaultEntryType?: CashbookEntryType;
  /** sourceModule tag written onto created vouchers (defaults to 'Cashbook'). */
  sourceModule?: string;
  onSaved?: () => void;
  onCancel?: () => void;
}

const ENTRY_TYPE_META: { value: CashbookEntryType; label: string; icon: string; activeClass: string; accentText: string; accentBtn: string; accentChipActive: string }[] = [
  {
    value: 'Payment', label: 'Payment', icon: '💳',
    activeClass: 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
    accentText: 'text-rose-600 dark:text-rose-400',
    accentBtn: 'bg-rose-600 hover:bg-rose-500',
    accentChipActive: 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
  },
  {
    value: 'Receipt', label: 'Receipt', icon: '💰',
    activeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
    accentText: 'text-emerald-600 dark:text-emerald-400',
    accentBtn: 'bg-emerald-600 hover:bg-emerald-500',
    accentChipActive: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  },
  {
    value: 'Contra', label: 'Contra', icon: '🔄',
    activeClass: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
    accentText: 'text-amber-600 dark:text-amber-400',
    accentBtn: 'bg-amber-600 hover:bg-amber-500',
    accentChipActive: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  },
  {
    value: 'Journal', label: 'Journal', icon: '📝',
    activeClass: 'bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
    accentText: 'text-sky-600 dark:text-sky-400',
    accentBtn: 'bg-sky-600 hover:bg-sky-500',
    accentChipActive: 'bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
  },
];

const ROW_TYPES: Record<CashbookEntryType, { value: RowType; label: string }[]> = {
  Payment: [
    { value: 'supplier', label: 'Supplier' },
    { value: 'processor', label: 'Processor' },
    { value: 'expense', label: 'Expense' },
    { value: 'account', label: 'Ledger Account' },
  ],
  Receipt: [
    { value: 'customer', label: 'Customer' },
    { value: 'supplier', label: 'Supplier' },
    { value: 'income', label: 'Income' },
    { value: 'account', label: 'Ledger Account' },
  ],
  Contra: [{ value: 'cash', label: 'Bank/Cash' }],
  Journal: [{ value: 'account', label: 'Ledger Account' }],
};

const DEFAULT_ROW_TYPE: Record<CashbookEntryType, RowType> = {
  Payment: 'supplier',
  Receipt: 'customer',
  Contra: 'cash',
  Journal: 'account',
};

export function CashbookVoucherForm({ editVoucherId, defaultAccountId, defaultEntryType, sourceModule, onSaved, onCancel }: CashbookVoucherFormProps) {
  const { accounts, suppliers, customers, processors, accountSubtypes, vouchers, journalEntries } = useERPStore();

  const initialType = defaultEntryType || 'Payment';
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryType, setEntryType] = useState<CashbookEntryType>(initialType);
  const [cashAccountId, setCashAccountId] = useState(defaultAccountId || '');
  const [rows, setRows] = useState<EntryRow[]>([newRow(DEFAULT_ROW_TYPE[initialType])]);
  const [narration, setNarration] = useState('');
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [addAccountTypeFilter, setAddAccountTypeFilter] = useState<{ type?: AccountType; subtypeName?: string } | undefined>();

  function newRow(type: RowType): EntryRow {
    return { uid: uuidv4(), type, counterpartyId: '', invoiceRef: '', description: '', amount: '' };
  }

  const updateRow = (uid: string, patch: Partial<EntryRow>) =>
    setRows(prev => prev.map(r => (r.uid === uid ? { ...r, ...patch } : r)));

  const removeRow = (uid: string) =>
    setRows(prev => (prev.length === 1 ? prev : prev.filter(r => r.uid !== uid)));

  // Reset form to a fresh single row whenever the entry type changes
  const switchEntryType = (type: CashbookEntryType) => {
    setEntryType(type);
    setRows([newRow(DEFAULT_ROW_TYPE[type])]);
    setCashAccountId('');
  };

  // Cash & Bank accounts
  const cashAccounts = useMemo(() =>
    accounts.filter(a => {
      const sub = accountSubtypes?.find(s => s.id === a.subtypeId);
      return sub?.name === 'Cash' || sub?.name === 'Bank' ||
        a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('bank');
    }),
    [accounts, accountSubtypes]
  );

  const isCashOrBank = (acc: any): boolean => {
    if (!acc) return false;
    const sub = accountSubtypes?.find(s => s.id === acc.subtypeId);
    return sub?.name === 'Cash' || sub?.name === 'Bank' ||
      acc.name?.toLowerCase().includes('cash') || acc.name?.toLowerCase().includes('bank');
  };

  // Resolve voucher type from the entry type + ledger subtype
  const voucherType = useMemo(() => {
    if (entryType === 'Contra') return 'Contra Voucher';
    if (entryType === 'Journal') return 'Journal Voucher';
    const cashAcc = accounts.find(a => a.id === cashAccountId);
    const sub = accountSubtypes?.find(s => s.id === cashAcc?.subtypeId);
    const isCash = sub?.name === 'Cash' || (!sub && (cashAcc?.name.toLowerCase().includes('cash') ?? false));
    if (entryType === 'Payment') return isCash ? 'Cash Payment' : 'Bank Payment';
    return isCash ? 'Cash Receipt' : 'Bank Receipt';
  }, [entryType, cashAccountId, accounts, accountSubtypes]);

  const isEditing = !!editVoucherId;
  const editingVoucher = isEditing ? vouchers.find(v => v.id === editVoucherId) : undefined;

  // Voucher number: existing when editing, next preview otherwise
  const voucherNo = useMemo(() => {
    if (editingVoucher) return editingVoucher.voucherNo;
    const prefix = DocumentNumberingService.getVoucherPrefix(voucherType);
    const count = DocumentNumberingService.countByType(vouchers, voucherType);
    return DocumentNumberingService.generateVoucherNumber(prefix, count + 1);
  }, [editingVoucher, vouchers, voucherType]);

  // Pre-fill from an existing voucher (edit mode)
  useEffect(() => {
    if (!editVoucherId) return;
    const v = vouchers.find(x => x.id === editVoucherId);
    if (!v) return;
    const jes = journalEntries.filter(je => je.voucherId === editVoucherId);

    let et: CashbookEntryType = 'Journal';
    if (v.type === 'Cash Receipt' || v.type === 'Bank Receipt' || v.type === 'Receipt Voucher') et = 'Receipt';
    else if (v.type === 'Cash Payment' || v.type === 'Bank Payment' || v.type === 'Payment Voucher') et = 'Payment';
    else if (v.type === 'Contra Voucher') et = 'Contra';
    setEntryType(et);
    setDate(v.date);
    setNarration(v.narration || '');

    // Header ledger = the cash side (credit for payment/contra/journal, debit for receipt)
    const headerJe = et === 'Receipt'
      ? jes.find(je => je.debit > 0)
      : jes.find(je => je.credit > 0);
    setCashAccountId(headerJe?.accountId || '');

    // Remaining lines become rows (carry the voucher's reference into the first line so edits don't wipe it)
    const rowJes = jes.filter(je => je !== headerJe);
    if (rowJes.length > 0) {
      setRows(rowJes.map((je, i) => {
        const acc = accounts.find(a => a.id === je.accountId);
        const type = inferRowType(acc);
        return {
          uid: uuidv4(),
          type,
          counterpartyId: acc?.linkedEntityId || je.accountId,
          invoiceRef: i === 0 && v.referenceNo ? v.referenceNo : '',
          description: je.narration || '',
          amount: je.debit > 0 ? je.debit : je.credit,
        };
      }));
    } else {
      setRows([newRow(DEFAULT_ROW_TYPE[et])]);
    }
    // Pre-fill runs once per editVoucherId; store values are read fresh at save time.
  }, [editVoucherId]);

  const inferRowType = (acc: any): RowType => {
    if (!acc) return 'account';
    if (acc.linkedEntityId) {
      if (suppliers.some(s => s.id === acc.linkedEntityId)) return 'supplier';
      if (customers.some(c => c.id === acc.linkedEntityId)) return 'customer';
      if (processors.some(p => p.id === acc.linkedEntityId)) return 'processor';
    }
    if (acc.type === 'Expenses' || acc.type === 'Cost of Goods Sold' || acc.type === 'Other Expenses') return 'expense';
    if (acc.type === 'Revenue' || acc.type === 'Other Income') return 'income';
    if (isCashOrBank(acc)) return 'cash';
    return 'account';
  };

  const entityOptionsFor = (type: RowType) => {
    if (type === 'supplier') {
      return suppliers.map(s => ({ id: s.id, label: s.name, secondaryLabel: `Balance: PKR ${(s.balancePayable || 0).toLocaleString()}` }));
    }
    if (type === 'customer') {
      return customers.map(c => ({ id: c.id, label: c.name, secondaryLabel: `Balance: PKR ${(c.balanceReceivable || 0).toLocaleString()}` }));
    }
    if (type === 'processor') {
      return processors.map(p => ({ id: p.id, label: p.name, secondaryLabel: `Balance: PKR ${(p.balancePayable || 0).toLocaleString()}` }));
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
    return undefined;
  };

  const resolveRowAccount = (row: EntryRow): string | null => {
    if (row.type === 'supplier' || row.type === 'customer' || row.type === 'processor') {
      return accounts.find(a => a.linkedEntityId === row.counterpartyId)?.id || null;
    }
    return row.counterpartyId || null;
  };

  // Header ledger options: cash/bank for Payment/Receipt/Contra, all accounts for Journal
  const headerOptions = useMemo(() => {
    if (entryType === 'Journal') {
      return accounts.map(a => ({
        id: a.id,
        label: `${a.code} — ${a.name}`,
        secondaryLabel: a.type,
      }));
    }
    return cashAccounts.map(a => ({
      id: a.id,
      label: `${a.code} — ${a.name}`,
      secondaryLabel: `Balance: ${a.openingBalanceType === 'Debit' ? 'Dr' : 'Cr'} ${a.openingBalance.toLocaleString()}`,
    }));
  }, [entryType, accounts, cashAccounts]);

  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
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
      if (entryType === 'Payment' && (r.type === 'supplier' || r.type === 'processor')) {
        supplierTotals.set(r.counterpartyId, (supplierTotals.get(r.counterpartyId) || 0) + amt);
      }
      if (entryType === 'Receipt' && r.type === 'customer') {
        customerTotals.set(r.counterpartyId, (customerTotals.get(r.counterpartyId) || 0) + amt);
      }
    });
    for (const [sid, amt] of supplierTotals) {
      const sup = suppliers.find(s => s.id === sid);
      if (sup && amt > sup.balancePayable) {
        alert(`Cannot pay ${sup.name} beyond outstanding balance of PKR ${sup.balancePayable.toLocaleString()}.`);
        return;
      }
      const proc = processors.find(p => p.id === sid);
      if (proc && amt > proc.balancePayable) {
        alert(`Cannot pay ${proc.name} beyond pending amount of PKR ${proc.balancePayable.toLocaleString()}.`);
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
    const rowsAreDebit = entryType !== 'Receipt'; // payment/contra/journal rows debit; receipt rows credit

    for (const row of rows) {
      const amt = Number(row.amount) || 0;
      const isTouched = !!row.counterpartyId || amt > 0;
      if (!isTouched) continue;
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

    // Header ledger side — one line for the whole voucher
    entries.push({
      accountId: cashAccountId,
      debit: rowsAreDebit ? 0 : total,
      credit: rowsAreDebit ? total : 0,
      narration,
    });

    const referenceNo = rows.map(r => r.invoiceRef).filter(Boolean).join(', ');

    ErrorManagement.safeExecuteSync(() => {
      if (isEditing) {
        AccountingService.updateVoucher(editVoucherId, {
          date,
          referenceNo: referenceNo || undefined,
          narration,
        }, entries as any);
      } else {
        AccountingService.createVoucher({
          date,
          type: voucherType as any,
          referenceNo: referenceNo || undefined,
          sourceModule: sourceModule || 'Cashbook',
          narration,
        }, entries as any);
      }

      // Update entity balances only when creating (edits already applied them)
      if (!isEditing) {
        rows.forEach(row => {
          const amt = Number(row.amount) || 0;
          if (entryType === 'Payment' && (row.type === 'supplier' || row.type === 'processor')) {
            const sup = suppliers.find(s => s.id === row.counterpartyId);
            if (sup) useERPStore.getState().updateSupplier(sup.id, { balancePayable: Math.max(0, sup.balancePayable - amt) });
            const proc = processors.find(p => p.id === row.counterpartyId);
            if (proc) useERPStore.getState().updateProcessor(proc.id, { balancePayable: Math.max(0, proc.balancePayable - amt) });
          }
          if (entryType === 'Receipt' && row.type === 'customer') {
            const cus = customers.find(c => c.id === row.counterpartyId);
            if (cus) useERPStore.getState().updateCustomer(cus.id, { balanceReceivable: Math.max(0, cus.balanceReceivable - amt) });
          }
        });
      }

      alert(`${entryType} Voucher ${voucherNo} saved!`);
      if (onSaved) onSaved();
    }, `${entryType} Voucher`);
  };

  const resetForm = () => {
    setRows([newRow(DEFAULT_ROW_TYPE[entryType])]);
    setNarration('');
    setCashAccountId('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  const meta = ENTRY_TYPE_META.find(m => m.value === entryType)!;
  const rowTypes = ROW_TYPES[entryType];
  const ledgerLabel = entryType === 'Payment'
    ? 'Cash/Bank (Credit — paying from)'
    : entryType === 'Receipt'
      ? 'Cash/Bank (Debit — receiving into)'
      : entryType === 'Contra'
        ? 'Transfer From (Credit)'
        : 'Credit Side Account';

  return (
    <>
      {/* Entry type switcher — locked while editing (updateVoucher keeps the voucher type) */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Transaction Type{isEditing ? ' (fixed for this voucher)' : ''}
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ENTRY_TYPE_META.map(t => (
            <button
              key={t.value}
              type="button"
              disabled={isEditing}
              onClick={() => switchEntryType(t.value)}
              className={cn(
                "px-4 py-3 text-sm font-semibold rounded-xl border-2 transition-all text-center",
                entryType === t.value ? t.activeClass : "bg-background border-border text-muted-foreground hover:border-muted-foreground/30",
                isEditing && entryType !== t.value && "opacity-40 cursor-not-allowed"
              )}
            >
              <div className="text-lg mb-0.5">{t.icon}</div>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* noValidate: isValid() already enforces ledger, narration & row completeness */}
      <form id="cashbook-voucher-form" onSubmit={handleSave} noValidate>
        {/* Header Bento Grid */}
        <div className="grid grid-cols-12 gap-4 mb-6">
          <div className="col-span-12 lg:col-span-8 bg-card border border-border/50 rounded-xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Voucher No</label>
              <input
                type="text"
                readOnly
                value={voucherNo}
                className={cn("w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm font-mono font-bold", meta.accentText)}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">{ledgerLabel}</label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => { setAddAccountTypeFilter(undefined); setIsAddAccountModalOpen(true); }}
                    className="text-[10px] flex items-center gap-0.5 text-primary hover:underline font-medium"
                  >
                    <Plus className="h-3 w-3" /> Account
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddAccountTypeFilter({ type: 'Assets', subtypeName: 'Bank' }); setIsAddAccountModalOpen(true); }}
                    className="text-[10px] flex items-center gap-0.5 text-primary hover:underline font-medium"
                  >
                    <Plus className="h-3 w-3" /> Bank
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddAccountTypeFilter({ type: 'Assets', subtypeName: 'Cash' }); setIsAddAccountModalOpen(true); }}
                    className="text-[10px] flex items-center gap-0.5 text-primary hover:underline font-medium"
                  >
                    <Plus className="h-3 w-3" /> Cash
                  </button>
                </div>
              </div>
              <SearchableSelect
                options={headerOptions}
                value={cashAccountId}
                onChange={setCashAccountId}
                placeholder={entryType === 'Journal' ? 'Select credit side account...' : 'Select cash or bank account...'}
                required
              />
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
                  {entryType === 'Payment' ? 'Debit Account / Vendor' : entryType === 'Receipt' ? 'Credit Account / Party' : entryType === 'Contra' ? 'Transfer To (Debit)' : 'Debit Account'}
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
                    {rowTypes.length > 1 ? (
                      <select
                        value={row.type}
                        onChange={e => updateRow(row.uid, { type: e.target.value as RowType, counterpartyId: '' })}
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 mb-1.5 text-xs font-medium text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                      >
                        {rowTypes.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="mb-1.5" />
                    )}
                    {row.type === 'supplier' || row.type === 'customer' || row.type === 'processor' || row.type === 'cash' ? (
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
                        placeholder={`Select ${row.type} account...`}
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
              onClick={() => setRows(prev => [...prev, newRow(rowTypes.length === 1 ? rowTypes[0].value : DEFAULT_ROW_TYPE[entryType])])}
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
              placeholder={entryType === 'Payment'
                ? 'e.g. Payment to suppliers & expenses for the month'
                : entryType === 'Receipt'
                  ? 'e.g. Cash received against invoices & other income'
                  : 'e.g. Transfer between cash and bank accounts'}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
          <div className="col-span-12 lg:col-span-4 bg-card border border-border/50 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{entryType === 'Receipt' ? 'Subtotal Receipts' : entryType === 'Contra' ? 'Subtotal Transfers' : 'Subtotal Debits'}</span>
              <span className="font-medium">PKR {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Lines</span>
              <span className="font-medium">{completedRows.length}</span>
            </div>
            <div className="h-px bg-border/50"></div>
            <div className="flex justify-between items-end">
              <span className="text-xs font-bold uppercase tracking-wider">Net {entryType}</span>
              <span className={cn("text-2xl font-bold font-mono", total > 0 ? meta.accentText : "text-foreground")}>
                PKR {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border/50">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border text-foreground font-semibold rounded-xl hover:bg-muted/50 transition-all active:scale-95 text-sm"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          )}
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
            form="cashbook-voucher-form"
            disabled={!isValid}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 text-white font-semibold rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm",
              meta.accentBtn
            )}
          >
            <Send className="h-4 w-4" />
            {isEditing ? 'Update' : 'Post'} {entryType}
          </button>
        </div>
      </form>

      <AddAccountModal
        isOpen={isAddAccountModalOpen}
        onClose={() => setIsAddAccountModalOpen(false)}
        onSave={() => setIsAddAccountModalOpen(false)}
        quickAddType={addAccountTypeFilter}
      />
    </>
  );
}
