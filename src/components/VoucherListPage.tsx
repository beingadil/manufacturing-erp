import React, { useState, useMemo } from 'react';
import { useERPStore } from '../store/useERPStore';
import { Voucher, JournalEntry } from '../types/erp';
import { Search, Plus, Eye, Pencil, XCircle, Trash2, FileText, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { VoucherDetailModal } from './VoucherDetailModal';
import { VoucherEditorModal, VoucherPageKind } from './VoucherEditorModal';
import { AccountingEngine } from '../lib/accounting/AccountingEngine';

interface VoucherListPageProps {
  kind: VoucherPageKind;
  title: string;
  subtitle: string;
  accent: 'rose' | 'emerald' | 'sky' | 'amber';
  /** Voucher types shown on this page. For JV, system module vouchers are excluded. */
}

const ACCENT_BTN: Record<string, string> = {
  rose: 'bg-rose-600 hover:bg-rose-500',
  emerald: 'bg-emerald-600 hover:bg-emerald-500',
  sky: 'bg-sky-600 hover:bg-sky-500',
  amber: 'bg-amber-600 hover:bg-amber-500',
};

const ACCENT_TEXT: Record<string, string> = {
  rose: 'text-rose-600 dark:text-rose-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  sky: 'text-sky-600 dark:text-sky-400',
  amber: 'text-amber-600 dark:text-amber-400',
};

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

  const matchedTypes = useMemo(() => {
    switch (kind) {
      case 'Cash Payment': return ['Cash Payment'];
      case 'Bank Payment': return ['Bank Payment'];
      case 'Cash Receipt': return ['Cash Receipt'];
      case 'Bank Receipt': return ['Bank Receipt'];
      case 'Journal Voucher': return ['Journal Voucher'];
    }
  }, [kind]);

  // For JV page, exclude system-posted vouchers (Purchase/Sales/Processing) — spec §16
  const excludedModules = useMemo(() =>
    kind === 'Journal Voucher' ? new Set(['Purchase', 'Sales', 'Processing']) : new Set<string>(),
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

  return (
    <div className="flex-1 flex flex-col h-full bg-card">
      {/* Header */}
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <button
          onClick={() => { setEditVoucherId(undefined); setIsEditorOpen(true); }}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-white font-semibold shadow-sm transition-all active:scale-95 text-sm', ACCENT_BTN[accent])}
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

      {/* List */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voucher No</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Narration</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Debit</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Credit</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
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
                  <td className="py-3 px-6 text-sm text-foreground whitespace-nowrap">{new Date(v.date).toLocaleDateString()}</td>
                  <td className="py-3 px-6 text-sm font-medium text-foreground">
                    <button className="hover:text-primary hover:underline" onClick={() => setViewVoucherId(v.id)}>{v.voucherNo}</button>
                  </td>
                  <td className="py-3 px-6 text-sm text-muted-foreground">{v.referenceNo || '-'}</td>
                  <td className="py-3 px-6 text-sm text-muted-foreground max-w-[240px] truncate">{v.narration || '-'}</td>
                  <td className="py-3 px-6 text-sm text-right font-medium text-success">{v.totalDebit > 0 ? v.totalDebit.toLocaleString() : ''}</td>
                  <td className="py-3 px-6 text-sm text-right font-medium text-destructive">{v.totalCredit > 0 ? v.totalCredit.toLocaleString() : ''}</td>
                  <td className="py-3 px-6">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                      v.status === 'Posted' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                    )}>
                      {v.status === 'Posted' && <CheckCircle2 className="h-3 w-3" />}
                      {v.status === 'Cancelled' && <XCircle className="h-3 w-3" />}
                      {v.status}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-primary transition-colors" title="View" onClick={() => setViewVoucherId(v.id)}>
                        <Eye className="h-4 w-4" />
                      </button>
                      {v.status === 'Posted' && (
                        <>
                          <button className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-primary transition-colors" title="Edit" onClick={() => { setEditVoucherId(v.id); setIsEditorOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-amber-600 transition-colors" title="Cancel / Void" onClick={() => handleCancel(v)}>
                            <XCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      <button className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-destructive transition-colors" title="Permanent Delete" onClick={() => handleDelete(v)}>
                        <Trash2 className="h-4 w-4" />
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
