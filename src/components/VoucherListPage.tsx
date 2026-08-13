import React, { useState, useMemo } from 'react';
import { useERPStore } from '../store/useERPStore';
import { Voucher } from '../types/erp';
import { Search, Plus, Eye, Pencil, XCircle, Trash2, FileText, CheckCircle2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { KpiCard } from './ui/KpiCard';
import { VoucherDetailModal } from './VoucherDetailModal';
import { VoucherEditorModal, VoucherPageKind } from './VoucherEditorModal';
import { AccountingEngine } from '../lib/accounting/AccountingEngine';
import { ACCENT_BTN, ACCENT_SOFT, ACCENT_BAR, ACCENT_HEAD, KIND_ICON } from './voucherAccents';

interface VoucherListPageProps {
  kind: VoucherPageKind;
  title: string;
  subtitle: string;
  accent: 'rose' | 'emerald' | 'sky' | 'amber';
  /** Voucher types shown on this page. For JV, system module vouchers are excluded. */
}


export function VoucherListPage({ kind, title, subtitle, accent }: VoucherListPageProps) {
  const { vouchers, journalEntries, accounts } = useERPStore();
  const today = new Date().toISOString().split('T')[0];

  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editVoucherId, setEditVoucherId] = useState<string | undefined>();
  const [viewVoucherId, setViewVoucherId] = useState<string | null>(null);

  const KindIcon = KIND_ICON[kind];

  const matchedTypes = useMemo(() => {
    switch (kind) {
      case 'cash-payment': return ['Cash Payment'];
      case 'bank-payment': return ['Bank Payment'];
      case 'cash-receipt': return ['Cash Receipt'];
      case 'bank-receipt': return ['Bank Receipt'];
      case 'journal': return ['Journal Voucher'];
      default: return [];
    }
  }, [kind]);

  // For JV page, exclude system-posted vouchers (Purchase/Sales/Processing) — spec §16
  const excludedModules = useMemo(() =>
    kind === 'journal' ? new Set(['Purchase', 'Sales', 'Processing']) : new Set<string>(),
    [kind]
  );

  const filteredVouchers = useMemo(() => {
    return vouchers
      .filter(v => matchedTypes.includes(v.type))
      .filter(v => !excludedModules.has(v.sourceModule))
      .filter(v => {
        if (dateFrom && v.date < dateFrom) return false;
        if (dateTo && v.date > dateTo) return false;
        return true;
      })
      .filter(v => {
        if (!search) return true;
        const q = search.toLowerCase();
        const entryAccountNames = journalEntries
          .filter(je => je.voucherId === v.id)
          .map(je => accounts.find(a => a.id === je.accountId)?.name || '')
          .join(' ');
        return (
          v.voucherNo.toLowerCase().includes(q) ||
          v.narration?.toLowerCase().includes(q) ||
          v.referenceNo?.toLowerCase().includes(q) ||
          entryAccountNames.toLowerCase().includes(q)
        );
      })
      .filter(v => {
        if (accountFilter === 'all') return true;
        return journalEntries.some(je => je.voucherId === v.id && je.accountId === accountFilter);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [vouchers, journalEntries, accounts, matchedTypes, excludedModules, dateFrom, dateTo, search, accountFilter]);

  const handleCancel = (v: Voucher) => {
    if (window.confirm(`Cancel voucher ${v.voucherNo}? It will be excluded from all reports.`)) {
      AccountingEngine.cancelVoucher(v.id);
    }
  };

  const handleDelete = (v: Voucher) => {
    if (window.confirm(`Permanently delete voucher ${v.voucherNo}? This removes it and its accounting effect.`)) {
      AccountingEngine.deleteVoucher(v.id);
    }
  };

  const totals = useMemo(() => {
    const debit = filteredVouchers.reduce((s, v) => s + (v.totalDebit || 0), 0);
    const credit = filteredVouchers.reduce((s, v) => s + (v.totalCredit || 0), 0);
    return { debit, credit };
  }, [filteredVouchers]);

  return (
    <div className="flex-1 flex flex-col h-full bg-card">
      {/* Accent banner */}
      <div className={cn('shrink-0 h-1.5 bg-gradient-to-r', ACCENT_BAR[accent])} />

      {/* Header */}
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl border shadow-sm', ACCENT_SOFT[accent])}>
            <KindIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className={cn('text-xl font-bold', ACCENT_HEAD[accent])}>{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <button
          onClick={() => { setEditVoucherId(undefined); setIsEditorOpen(true); }}
          className={cn('flex items-center gap-2 px-4 py-2.5 rounded-lg text-white font-semibold shadow-sm transition-all active:scale-95 text-sm', ACCENT_BTN[accent])}
        >
          <Plus className="h-4 w-4" />
          New Voucher
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-border/50 bg-muted/10 flex flex-wrap items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="w-40 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            title="Date From"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="w-40 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            title="Date To"
          />
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search voucher, narration, party..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={accountFilter}
          onChange={e => setAccountFilter(e.target.value)}
          className="w-56 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          title="Filter by account"
        >
          <option value="all">All Accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filteredVouchers.length} voucher{filteredVouchers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Stat strip */}
      <div className="px-4 py-3 border-b border-border/50 shrink-0 bg-card">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard
            label="Vouchers in range"
            value={filteredVouchers.length}
            size="sm"
            icon={FileText}
            description="Shown for the selected filters"
          />
          <KpiCard
            label="Total Debit"
            value={`PKR ${totals.debit.toLocaleString()}`}
            size="sm"
            icon={ArrowDownLeft}
            iconClassName="text-success"
            accent="text-success"
          />
          <KpiCard
            label="Total Credit"
            value={`PKR ${totals.credit.toLocaleString()}`}
            size="sm"
            icon={ArrowUpRight}
            iconClassName="text-destructive"
            accent="text-destructive"
          />
        </div>
        <div className="flex justify-end mt-2">
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="text-xs text-muted-foreground hover:text-primary font-medium transition-colors"
          >
            Clear date range
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
              <th className="py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voucher No</th>
              <th className="py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference</th>
              <th className="py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Narration</th>
              <th className="py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Debit</th>
              <th className="py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Credit</th>
              <th className="py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {filteredVouchers.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted-foreground text-sm">
                  <FileText className="h-8 w-8 mx-auto mb-3 opacity-20" />
                  No {title.toLowerCase()} entries for the selected filters.
                </td>
              </tr>
            )}
            {filteredVouchers.map(v => {
              const entries = journalEntries.filter(je => je.voucherId === v.id);
              return (
                <tr key={v.id} className={cn('hover:bg-muted/20 transition-colors group', v.status === 'Cancelled' && 'opacity-60')}>
                  <td className="py-2.5 px-4 text-sm text-foreground whitespace-nowrap">{new Date(v.date).toLocaleDateString()}</td>
                  <td className="py-2.5 px-4 text-sm font-medium text-foreground">
                    <button className="hover:text-primary hover:underline" onClick={() => setViewVoucherId(v.id)}>{v.voucherNo}</button>
                  </td>
                  <td className="py-2.5 px-4 text-sm text-muted-foreground">{v.referenceNo || '-'}</td>
                  <td className="py-2.5 px-4 text-sm text-muted-foreground max-w-[240px] truncate">{v.narration || '-'}</td>
                  <td className="py-2.5 px-4 text-sm text-right font-medium text-success">{v.totalDebit > 0 ? v.totalDebit.toLocaleString() : ''}</td>
                  <td className="py-2.5 px-4 text-sm text-right font-medium text-destructive">{v.totalCredit > 0 ? v.totalCredit.toLocaleString() : ''}</td>
                  <td className="py-2.5 px-4">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                      v.status === 'Posted' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                    )}>
                      {v.status === 'Posted' && <CheckCircle2 className="h-3 w-3" />}
                      {v.status === 'Cancelled' && <XCircle className="h-3 w-3" />}
                      {v.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60 transition-all active:scale-95"
                        title="View voucher details"
                        onClick={() => setViewVoucherId(v.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                      {v.status === 'Posted' && (
                        <>
                          <button
                            className={cn('inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-card text-muted-foreground hover:text-foreground border border-border/60 hover:border-primary/40 transition-all active:scale-95')}
                            title="Edit voucher"
                            onClick={() => { setEditVoucherId(v.id); setIsEditorOpen(true); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-card text-amber-600 dark:text-amber-400 border border-border/60 hover:border-amber-400/50 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-all active:scale-95"
                            title="Cancel / void voucher"
                            onClick={() => handleCancel(v)}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Void
                          </button>
                        </>
                      )}
                      <button
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-card text-destructive border border-border/60 hover:border-destructive/50 hover:bg-destructive/10 transition-all active:scale-95"
                        title="Permanently delete voucher"
                        onClick={() => handleDelete(v)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <VoucherEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSaved={() => setIsEditorOpen(false)}
        kind={kind}
        editVoucherId={editVoucherId}
      />
      {viewVoucherId && <VoucherDetailModal voucherId={viewVoucherId} onClose={() => setViewVoucherId(null)} />}
    </div>
  );
}
