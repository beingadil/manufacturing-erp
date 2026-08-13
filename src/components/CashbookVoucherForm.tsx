import React, { useState, useMemo, useEffect } from 'react';
import { useERPStore } from '../store/useERPStore';
import { SearchableSelect } from './SearchableSelect';
import { SearchableAccountTree } from '../pages/finance/SearchableAccountTree';
import { AccountingService } from '../services/AccountingService';
import { DocumentNumberingService } from '../lib/business/DocumentNumberingService';
import { ErrorManagement } from '../lib/validation';
import { cn } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, CheckCircle2, Info, Send, RotateCcw, X, Banknote, Landmark, BookOpen } from 'lucide-react';
import { getCashAccounts, getBankAccounts } from '../lib/accounting/accountClassification';
import type { VoucherType } from '../types/erp';

/**
 * Purpose-specific voucher form (spec §4–8).
 *
 * Each voucher page has its OWN form mode — no Payment/Receipt/Journal tabs,
 * no manual debit/credit lines for simple transactions. The system knows the
 * ledger side automatically:
 *
 *   Cash Payment   → Credit = Cash in Hand (auto)
 *   Bank Payment   → Credit = selected Bank account
 *   Cash Receipt   → Debit  = Cash in Hand (auto)
 *   Bank Receipt   → Debit  = selected Bank account
 *   Journal        → full multi-line Debit/Credit table (manual entries)
 *
 * Simple modes show an "Accounting Effect" preview (spec §14) so the user can
 * trust the generated double entry before saving. "+ Add Another Entry" is
 * progressive disclosure for split allocations — never the default screen.
 */
export type VoucherFormMode = 'cash-payment' | 'bank-payment' | 'cash-receipt' | 'bank-receipt' | 'journal';

type RowType = 'supplier' | 'customer' | 'processor' | 'expense' | 'income' | 'account';

interface CounterpartyRow {
  uid: string;
  type: RowType;
  /** Party id (linked sub-ledger) for party types, or final account id for 'account'. */
  counterpartyId: string;
  /** Set when the account picker selected a control account (AR/AP) with children. */
  parentAccountId?: string;
  amount: number | '';
  /** Per-entry narration — shown in the ledger for this line (spec: ledger drill-down). */
  narration?: string;
}

interface JournalRow {
  uid: string;
  accountId: string;
  debit: number | '';
  credit: number | '';
  narration?: string;
}

interface CashbookVoucherFormProps {
  mode: VoucherFormMode;
  editVoucherId?: string;
  defaultAccountId?: string;
  /** sourceModule tag written onto created vouchers (defaults to 'Cashbook'). */
  sourceModule?: string;
  onSaved?: () => void;
  onCancel?: () => void;
}

const MODE_META: Record<VoucherFormMode, {
  voucherType: VoucherType;
  title: string;
  saveLabel: string;
  accentBtn: string;
  accentText: string;
  soft: string;
  icon: React.ReactNode;
}> = {
  'cash-payment': {
    voucherType: 'Cash Payment',
    title: 'New Cash Payment Voucher',
    saveLabel: 'Save Payment',
    accentBtn: 'bg-rose-600 hover:bg-rose-500',
    accentText: 'text-rose-600 dark:text-rose-400',
    soft: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
    icon: <Banknote className="h-5 w-5" />,
  },
  'bank-payment': {
    voucherType: 'Bank Payment',
    title: 'New Bank Payment Voucher',
    saveLabel: 'Save Payment',
    accentBtn: 'bg-amber-600 hover:bg-amber-500',
    accentText: 'text-amber-600 dark:text-amber-400',
    soft: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
    icon: <Landmark className="h-5 w-5" />,
  },
  'cash-receipt': {
    voucherType: 'Cash Receipt',
    title: 'New Cash Receipt Voucher',
    saveLabel: 'Save Receipt',
    accentBtn: 'bg-emerald-600 hover:bg-emerald-500',
    accentText: 'text-emerald-600 dark:text-emerald-400',
    soft: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
    icon: <Banknote className="h-5 w-5" />,
  },
  'bank-receipt': {
    voucherType: 'Bank Receipt',
    title: 'New Bank Receipt Voucher',
    saveLabel: 'Save Receipt',
    accentBtn: 'bg-sky-600 hover:bg-sky-500',
    accentText: 'text-sky-600 dark:text-sky-400',
    soft: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
    icon: <Landmark className="h-5 w-5" />,
  },
  journal: {
    voucherType: 'Journal Voucher',
    title: 'New Journal Voucher',
    saveLabel: 'Post Journal Voucher',
    accentBtn: 'bg-sky-600 hover:bg-sky-500',
    accentText: 'text-sky-600 dark:text-sky-400',
    soft: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
    icon: <BookOpen className="h-5 w-5" />,
  },
};

/** Counterparty kinds per ledger direction (simple modes only). */
const ROW_TYPES: Record<'payment' | 'receipt', { value: RowType; label: string }[]> = {
  payment: [
    { value: 'supplier', label: 'Supplier' },
    { value: 'processor', label: 'Processor' },
    { value: 'expense', label: 'Expense' },
    { value: 'account', label: 'Ledger Account' },
  ],
  receipt: [
    { value: 'customer', label: 'Customer' },
    { value: 'supplier', label: 'Supplier' },
    { value: 'income', label: 'Income' },
    { value: 'account', label: 'Ledger Account' },
  ],
};

export function CashbookVoucherForm({ mode, editVoucherId, defaultAccountId, sourceModule, onSaved, onCancel }: CashbookVoucherFormProps) {
  const { accounts, suppliers, customers, processors, accountSubtypes, vouchers, journalEntries } = useERPStore();

  const isJournal = mode === 'journal';
  const direction: 'payment' | 'receipt' = mode.endsWith('payment') ? 'payment' : 'receipt';
  /** Simple-mode rows are DEBIT for payments, CREDIT for receipts; the ledger is the opposite side. */
  const rowsAreDebit = direction === 'payment';
  const isCashMode = mode === 'cash-payment' || mode === 'cash-receipt';

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [ledgerAccountId, setLedgerAccountId] = useState(defaultAccountId || '');
  const [referenceNo, setReferenceNo] = useState('');
  const [narration, setNarration] = useState('');
  const [counterpartyRows, setCounterpartyRows] = useState<CounterpartyRow[]>([newCounterpartyRow(direction === 'payment' ? 'supplier' : 'customer')]);
  const [journalRows, setJournalRows] = useState<JournalRow[]>([newJournalRow()]);

  function newCounterpartyRow(type: RowType): CounterpartyRow {
    return { uid: uuidv4(), type, counterpartyId: '', amount: '', narration: '' };
  }
  function newJournalRow(): JournalRow {
    return { uid: uuidv4(), accountId: '', debit: '', credit: '', narration: '' };
  }

  const updateCounterparty = (uid: string, patch: Partial<CounterpartyRow>) =>
    setCounterpartyRows(prev => prev.map(r => (r.uid === uid ? { ...r, ...patch } : r)));
  const updateJournal = (uid: string, patch: Partial<JournalRow>) =>
    setJournalRows(prev => prev.map(r => (r.uid === uid ? { ...r, ...patch } : r)));

  // ── Ledger side ────────────────────────────────────────────────────────────
  // Cash modes: only accounts classified with the 'Cash' subtype (spec §5, §10).
  // Bank modes: only accounts classified with the 'Bank' subtype. No name matching.
  const ledgerAccounts = useMemo(() => {
    if (isCashMode) return getCashAccounts(accounts, accountSubtypes);
    return getBankAccounts(accounts, accountSubtypes);
  }, [accounts, accountSubtypes, isCashMode]);

  // Auto-default the ledger: system cash account (Cash in Hand) for cash modes,
  // first bank account for bank modes — exactly the spec's "cash in hand default".
  useEffect(() => {
    if (editVoucherId || ledgerAccountId) return;
    const preferred = ledgerAccounts.find(a => a.isSystem) || ledgerAccounts[0];
    if (preferred) setLedgerAccountId(preferred.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerAccounts.length, editVoucherId]);

  const meta = MODE_META[mode];
  const isEditing = !!editVoucherId;
  const editingVoucher = isEditing ? vouchers.find(v => v.id === editVoucherId) : undefined;

  const voucherNo = useMemo(() => {
    if (editingVoucher) return editingVoucher.voucherNo;
    return DocumentNumberingService.nextVoucherNumber(vouchers, meta.voucherType, date);
  }, [editingVoucher, vouchers, meta.voucherType, date]);

  // ── Pre-fill from an existing voucher (edit mode) ──────────────────────────
  useEffect(() => {
    if (!editVoucherId) return;
    const v = vouchers.find(x => x.id === editVoucherId);
    if (!v) return;
    const jes = journalEntries.filter(je => je.voucherId === editVoucherId);

    setDate(v.date);
    setNarration(v.narration || '');
    setReferenceNo(v.referenceNo || '');

    if (isJournal) {
      setJournalRows(jes.map(je => ({
        uid: uuidv4(),
        accountId: je.accountId,
        debit: je.debit > 0 ? je.debit : '',
        credit: je.credit > 0 ? je.credit : '',
        narration: je.narration || '',
      })));
      return;
    }

    // Simple modes: ledger side = the cash/bank line (credit for payment, debit for receipt)
    const ledgerJe = rowsAreDebit
      ? jes.find(je => je.credit > 0)
      : jes.find(je => je.debit > 0);
    setLedgerAccountId(ledgerJe?.accountId || '');

    const rowJes = jes.filter(je => je !== ledgerJe);
    if (rowJes.length > 0) {
      setCounterpartyRows(rowJes.map(je => {
        const acc = accounts.find(a => a.id === je.accountId);
        return {
          uid: uuidv4(),
          type: inferRowType(acc),
          counterpartyId: acc?.linkedEntityId || je.accountId,
          amount: rowsAreDebit ? je.debit : je.credit,
          narration: je.narration || '',
        };
      }));
    } else {
      setCounterpartyRows([newCounterpartyRow(direction === 'payment' ? 'supplier' : 'customer')]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return 'account';
  };

  // ── Counterparty helpers ───────────────────────────────────────────────────
  const partyName = (accountId?: string) => {
    if (!accountId) return '';
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return '';
    if (acc.linkedEntityId) {
      const sup = suppliers.find(s => s.id === acc.linkedEntityId);
      if (sup) return `${sup.name}`;
      const cus = customers.find(c => c.id === acc.linkedEntityId);
      if (cus) return `${cus.name}`;
      const proc = processors.find(p => p.id === acc.linkedEntityId);
      if (proc) return `${proc.name}`;
    }
    return acc.name;
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
    return [];
  };

  const accountTypesFor = (type: RowType): Parameters<typeof SearchableAccountTree>[0]['allowedTypes'] => {
    if (type === 'expense') return ['Expenses', 'Cost of Goods Sold', 'Other Expenses'];
    if (type === 'income') return ['Revenue', 'Other Income', 'Equity'];
    return undefined;
  };

  /**
   * Resolve a counterparty row to its posting account id.
   * Party rows resolve through their linked sub-ledger account. 'Account' rows
   * post to the picked account — but if a control account (AR/AP) was selected,
   * the posting MUST be the chosen sub-ledger child, never the control account
   * itself (that would bypass party balances and break sub-ledger reconciliation).
   */
  const resolveRowAccount = (row: CounterpartyRow): string | null => {
    if (row.type === 'supplier' || row.type === 'customer' || row.type === 'processor') {
      return accounts.find(a => a.linkedEntityId === row.counterpartyId)?.id || null;
    }
    if (row.parentAccountId) return row.counterpartyId || null;
    return row.counterpartyId || null;
  };

  // ── Totals & validity (simple modes) ──────────────────────────────────────
  const total = counterpartyRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const touchedRows = counterpartyRows.filter(r => r.counterpartyId || Number(r.amount) > 0);
  const completedRows = counterpartyRows.filter(r => {
    const accId = resolveRowAccount(r);
    return accId && (Number(r.amount) || 0) > 0;
  });
  const isValidSimple =
    !!date &&
    !!ledgerAccountId &&
    completedRows.length > 0 &&
    touchedRows.every(r => resolveRowAccount(r) && (Number(r.amount) || 0) > 0);

  // ── Totals & validity (journal) ───────────────────────────────────────────
  const filledJournal = journalRows.filter(r => r.accountId && (Number(r.debit) > 0 || Number(r.credit) > 0));
  const totalDebit = filledJournal.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const totalCredit = filledJournal.reduce((s, r) => s + (Number(r.credit) || 0), 0);
  const difference = totalDebit - totalCredit;
  const isBalancedJournal = filledJournal.length >= 2 && Math.abs(difference) < 0.01;
  const touchedJournal = journalRows.filter(r => r.accountId || Number(r.debit) > 0 || Number(r.credit) > 0);
  const isValidJournal = !!date && isBalancedJournal && touchedJournal.every(r => r.accountId);

  const isValid = isJournal ? isValidJournal : isValidSimple;

  // ── Accounting Effect preview (spec §14) ──────────────────────────────────
  const effectLines = useMemo(() => {
    if (isJournal) return [];
    const lines: { label: string; debit: number; credit: number }[] = [];
    counterpartyRows.forEach(row => {
      const amt = Number(row.amount) || 0;
      if (amt <= 0) return;
      const accId = resolveRowAccount(row);
      lines.push({
        label: accId ? (partyName(accId) || 'Account') : 'Select an account',
        debit: rowsAreDebit ? amt : 0,
        credit: rowsAreDebit ? 0 : amt,
      });
    });
    const ledgerAcc = accounts.find(a => a.id === ledgerAccountId);
    lines.push({
      label: ledgerAcc ? ledgerAcc.name : isCashMode ? 'Cash in Hand' : 'Bank account',
      debit: rowsAreDebit ? 0 : total,
      credit: rowsAreDebit ? total : 0,
    });
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counterpartyRows, ledgerAccountId, accounts, rowsAreDebit, total, isJournal]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    if (isJournal) {
      const entries = filledJournal.map(r => ({
        accountId: r.accountId,
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
        narration: r.narration?.trim() || narration,
      }));
      ErrorManagement.safeExecuteSync(() => {
        if (isEditing) {
          AccountingService.updateVoucher(editVoucherId, { date, referenceNo: referenceNo || undefined, narration }, entries as any);
        } else {
          AccountingService.createVoucher({
            date, type: meta.voucherType, referenceNo: referenceNo || undefined, sourceModule: sourceModule || 'Manual', narration,
          }, entries as any);
        }
        alert(`Journal Voucher ${voucherNo} posted!`);
        if (onSaved) onSaved();
      }, 'Journal Voucher');
      return;
    }

    // Simple modes: overpayment guards against party balances
    const supplierTotals = new Map<string, number>();
    const customerTotals = new Map<string, number>();
    counterpartyRows.forEach(r => {
      const amt = Number(r.amount) || 0;
      if (amt <= 0 || !r.counterpartyId) return;
      if (rowsAreDebit && (r.type === 'supplier' || r.type === 'processor')) {
        supplierTotals.set(r.counterpartyId, (supplierTotals.get(r.counterpartyId) || 0) + amt);
      }
      if (!rowsAreDebit && r.type === 'customer') {
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
    for (const row of counterpartyRows) {
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
        narration: row.narration?.trim() || narration,
      });
    }

    // Ledger side — one line for the whole voucher
    entries.push({
      accountId: ledgerAccountId,
      debit: rowsAreDebit ? 0 : total,
      credit: rowsAreDebit ? total : 0,
      narration,
    });

    ErrorManagement.safeExecuteSync(() => {
      if (isEditing) {
        AccountingService.updateVoucher(editVoucherId, { date, referenceNo: referenceNo || undefined, narration }, entries as any);
      } else {
        AccountingService.createVoucher({
          date, type: meta.voucherType, referenceNo: referenceNo || undefined, sourceModule: sourceModule || 'Cashbook', narration,
        }, entries as any);
      }

      // NOTE: party balances are NOT adjusted here — AccountingService already
      // runs AccountingEngine.recomputePartyBalances(), which derives every
      // balance from the linked account's COMPLETE ledger (spec §14).

      alert(`${meta.voucherType} ${voucherNo} saved!`);
      if (onSaved) onSaved();
    }, meta.voucherType);
  };

  const resetForm = () => {
    setCounterpartyRows([newCounterpartyRow(direction === 'payment' ? 'supplier' : 'customer')]);
    setJournalRows([newJournalRow()]);
    setNarration('');
    setReferenceNo('');
    setLedgerAccountId('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  const ledgerLabel = rowsAreDebit ? 'Paid From' : 'Received Into';
  const ledgerHint = rowsAreDebit ? 'Credit — source of the payment' : 'Debit — account receiving the money';

  return (
    <>
      <form id="cashbook-voucher-form" onSubmit={handleSave} noValidate>
        {/* Header card */}
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
                className={cn('w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm font-mono font-bold', meta.accentText)}
              />
            </div>
            {!isJournal ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">{ledgerLabel}</label>
                  {isCashMode ? (
                    <span className="text-[10px] text-muted-foreground/70 font-medium">Cash in Hand default</span>
                  ) : null}
                </div>
                <SearchableSelect
                  options={ledgerAccounts.map(a => ({
                    id: a.id,
                    label: `${a.code} — ${a.name}`,
                    secondaryLabel: `Balance: ${a.openingBalanceType === 'Debit' ? 'Dr' : 'Cr'} ${a.openingBalance.toLocaleString()}`,
                  }))}
                  value={ledgerAccountId}
                  onChange={setLedgerAccountId}
                  placeholder={isCashMode ? 'Select cash account...' : 'Select bank account...'}
                  required
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Narration</label>
                <textarea
                  value={narration}
                  onChange={e => setNarration(e.target.value)}
                  rows={1}
                  placeholder="e.g. Monthly depreciation"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            )}
          </div>

          {/* Total card */}
          <div className="col-span-12 lg:col-span-4 bg-primary text-primary-foreground rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-widest opacity-60 font-medium">
                {isJournal ? 'Journal Totals' : 'Total Voucher Amount'}
              </p>
              <h4 className="text-3xl font-bold mt-2 font-mono">
                PKR {(isJournal ? totalDebit : total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h4>
            </div>
            {isJournal ? (
              isBalancedJournal ? (
                <div className="flex items-center gap-2 text-sm text-emerald-400 mt-4">
                  <CheckCircle2 className="h-4 w-4" />
                  Balanced — ready to post
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-white/60 mt-4">
                  <Info className="h-4 w-4" />
                  Difference: PKR {difference.toLocaleString()}
                </div>
              )
            ) : total > 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-400 mt-4">
                <CheckCircle2 className="h-4 w-4" />
                Ready to save
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-white/60 mt-4">
                <Info className="h-4 w-4" />
                Enter an amount
              </div>
            )}
          </div>
        </div>

        {isJournal ? (
          /* ── JOURNAL VOUCHER: full multi-line debit/credit (spec §8) ─────── */
          <div className="bg-card border border-border/50 rounded-xl shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/30 border-b border-border/50 [&>th:first-child]:rounded-tl-xl [&>th:last-child]:rounded-tr-xl">
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-10">#</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Account</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Narration</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-right w-44">Debit</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-right w-44">Credit</th>
                  <th className="px-4 py-3.5 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {journalRows.map((row, idx) => (
                  <tr key={row.uid} className="group hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground align-top pt-5">{String(idx + 1).padStart(2, '0')}</td>
                    <td className="px-4 py-3 align-top">
                      <SearchableAccountTree
                        value={row.accountId}
                        onChange={id => updateJournal(row.uid, { accountId: id })}
                        placeholder="Select account..."
                        required
                      />
                    </td>
                    <td className="px-4 py-3 align-top min-w-[220px]">
                      <input
                        type="text"
                        value={row.narration || ''}
                        onChange={e => updateJournal(row.uid, { narration: e.target.value })}
                        placeholder="Line narration (optional)"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={row.debit}
                        onChange={e => updateJournal(row.uid, { debit: e.target.value ? Number(e.target.value) : '' })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-right font-bold text-success focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={row.credit}
                        onChange={e => updateJournal(row.uid, { credit: e.target.value ? Number(e.target.value) : '' })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-right font-bold text-destructive focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <button
                        type="button"
                        onClick={() => setJournalRows(prev => (prev.length === 1 ? prev : prev.filter(r => r.uid !== row.uid)))}
                        disabled={journalRows.length === 1}
                        className="text-muted-foreground hover:text-red-600 disabled:opacity-30 p-1"
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
                onClick={() => setJournalRows(prev => [...prev, newJournalRow()])}
                className="flex items-center gap-2 text-sm text-primary font-semibold hover:underline"
              >
                <Plus className="h-4 w-4" /> Add Another Entry
              </button>
            </div>
          </div>
        ) : (
          /* ── SIMPLE MODES: counterparty rows (progressive disclosure) ────── */
          <>
            <div className="bg-card border border-border/50 rounded-xl shadow-sm">
              <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg border shrink-0', meta.soft)}>{meta.icon}</span>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
                      {rowsAreDebit ? 'Payment To' : 'Received From'}
                    </label>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {rowsAreDebit ? 'Who or what is this payment for?' : 'Who or what is this money from?'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground/60 font-medium shrink-0">{ledgerHint}</span>
              </div>

              <div className="divide-y divide-border/50">
                {counterpartyRows.map((row, idx) => (
                  <div key={row.uid} className="px-5 py-4 grid grid-cols-12 gap-3 items-start group">
                    <div className="col-span-12 sm:col-span-2">
                      <select
                        value={row.type}
                        onChange={e => updateCounterparty(row.uid, { type: e.target.value as RowType, counterpartyId: '', parentAccountId: undefined })}
                        className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                      >
                        {ROW_TYPES[direction].map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-5">
                      {row.type === 'supplier' || row.type === 'customer' || row.type === 'processor' ? (
                        <SearchableSelect
                          options={entityOptionsFor(row.type)}
                          value={row.counterpartyId}
                          onChange={id => updateCounterparty(row.uid, { counterpartyId: id })}
                          placeholder={`Search ${row.type}...`}
                          required
                        />
                      ) : (
                        <>
                          <SearchableAccountTree
                            value={row.parentAccountId || row.counterpartyId}
                            onChange={id => {
                              const acc = accounts.find(a => a.id === id);
                              const hasChildren = acc ? accounts.some(a => a.parentId === acc.id) : false;
                              if (hasChildren) updateCounterparty(row.uid, { parentAccountId: id, counterpartyId: '' });
                              else updateCounterparty(row.uid, { counterpartyId: id, parentAccountId: undefined });
                            }}
                            allowedTypes={accountTypesFor(row.type)}
                            // Allow control accounts (AR/AP) to be picked so the sub-ledger
                            // cascade can reveal only the linked parties (spec §9).
                            allowParents
                            placeholder={row.type === 'expense' ? 'Select expense account...' : row.type === 'income' ? 'Select income account...' : 'Select account...'}
                            required
                          />
                          {row.parentAccountId && (
                            <div className="mt-2">
                              <SearchableSelect
                                options={accounts
                                  .filter(a => a.parentId === row.parentAccountId)
                                  .map(a => ({ id: a.id, label: partyName(a.id) || a.name, secondaryLabel: `${a.code} — ${a.name}` }))}
                                value={row.counterpartyId}
                                onChange={id => updateCounterparty(row.uid, { counterpartyId: id })}
                                placeholder="Select sub-ledger (party)..."
                                required
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div className="col-span-12 sm:col-span-4 flex items-center justify-end gap-1.5">
                      <span className="text-xs text-muted-foreground">PKR</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={row.amount}
                        onChange={e => updateCounterparty(row.uid, { amount: e.target.value ? Number(e.target.value) : '' })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-right font-bold text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setCounterpartyRows(prev => (prev.length === 1 ? prev : prev.filter(r => r.uid !== row.uid)))}
                        disabled={counterpartyRows.length === 1}
                        className="text-muted-foreground hover:text-red-600 disabled:opacity-30 p-1"
                        title="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="col-span-12">
                      <input
                        type="text"
                        value={row.narration || ''}
                        onChange={e => updateCounterparty(row.uid, { narration: e.target.value })}
                        placeholder="Narration for this line (optional) — shows in the ledger"
                        className="w-full rounded-lg border border-border/70 bg-background/50 px-3 py-1.5 text-xs text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:text-foreground transition-colors"
                      />
                    </div>
                    {idx === counterpartyRows.length - 1 && (
                      <div className="col-span-12 mt-2">
                        <button
                          type="button"
                          onClick={() => setCounterpartyRows(prev => [...prev, newCounterpartyRow(row.type)])}
                          className="flex items-center gap-2 text-sm text-primary font-semibold hover:underline"
                        >
                          <Plus className="h-4 w-4" /> Add Another Entry
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Reference + Narration */}
            <div className="mt-4 grid grid-cols-12 gap-4">
              <div className="col-span-12 sm:col-span-4 bg-card border border-border/50 rounded-xl p-5 shadow-sm">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">Invoice / Reference</label>
                <input
                  type="text"
                  value={referenceNo}
                  onChange={e => setReferenceNo(e.target.value)}
                  placeholder="INV-001 (optional)"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-mono text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="col-span-12 sm:col-span-8 bg-card border border-border/50 rounded-xl p-5 shadow-sm">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">Description / Narration</label>
                <textarea
                  value={narration}
                  onChange={e => setNarration(e.target.value)}
                  rows={2}
                  placeholder={rowsAreDebit ? 'e.g. Payment against invoice #104' : 'e.g. Cash received against invoice #104'}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            </div>

            {/* Accounting Effect preview (spec §14) */}
            <div className="mt-4 bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-muted/30 border-b border-border/50 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Accounting Effect</span>
                <span className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                  total > 0 && completedRows.length > 0 ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                )}>
                  <CheckCircle2 className="h-3 w-3" />
                  {total > 0 && completedRows.length > 0 ? 'Balanced double entry' : 'Waiting for entry'}
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {effectLines.length === 0 && (
                  <div className="px-5 py-6 text-center text-sm text-muted-foreground">
                    The auto-generated journal entry will appear here.
                  </div>
                )}
                {effectLines.map((line, i) => (
                  <div key={i} className="px-5 py-2.5 grid grid-cols-12 gap-3 items-center text-sm">
                    <div className="col-span-12 sm:col-span-6 flex items-center gap-2">
                      {line.debit > 0 ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-success/10 text-success uppercase">Dr</span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive uppercase">Cr</span>
                      )}
                      <span className="font-medium text-foreground truncate">{line.label}</span>
                    </div>
                    <div className="col-span-6 sm:col-span-3 text-right font-mono text-success">{line.debit > 0 ? line.debit.toLocaleString() : ''}</div>
                    <div className="col-span-6 sm:col-span-3 text-right font-mono text-destructive">{line.credit > 0 ? line.credit.toLocaleString() : ''}</div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 bg-muted/20 border-t border-border/50 grid grid-cols-12 gap-3 items-center text-sm font-semibold">
                <div className="col-span-12 sm:col-span-6 text-muted-foreground uppercase tracking-wider text-xs">Total</div>
                <div className="col-span-6 sm:col-span-3 text-right font-mono text-success">{total > 0 ? total.toLocaleString() : ''}</div>
                <div className="col-span-6 sm:col-span-3 text-right font-mono text-destructive">{total > 0 ? total.toLocaleString() : ''}</div>
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border/50">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border text-foreground font-semibold rounded-xl hover:bg-muted/50 transition-all active:scale-95 text-sm"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          )}
          <button
            type="button"
            onClick={resetForm}
            className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border text-foreground font-semibold rounded-xl hover:bg-muted/50 transition-all active:scale-95 text-sm"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
          <button
            type="submit"
            form="cashbook-voucher-form"
            disabled={!isValid}
            className={cn(
              'flex items-center gap-2 px-6 py-2.5 text-white font-semibold rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm',
              meta.accentBtn
            )}
          >
            <Send className="h-4 w-4" />
            {isEditing ? 'Update' : meta.saveLabel}
          </button>
        </div>
      </form>
    </>
  );
}
