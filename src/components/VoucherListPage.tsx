import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Eye, FileText, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AccountingEngine } from '../lib/accounting/AccountingEngine';
import { cn } from '../lib/utils';
import { formatCurrency } from '../lib/utils';
import { useERPStore } from '../store/useERPStore';
import { Voucher } from '../types/erp';
import { formInputClass } from './form/formStyles';
import { Dropdown } from './Dropdown';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { DatePicker } from './ui/date-picker';
import { KpiCard } from './ui/KpiCard';
import { SearchInput } from './ui/SearchInput';
import { VoucherDetailModal } from './VoucherDetailModal';
import type { VoucherFormMode } from './CashbookVoucherForm';

interface VoucherListPageProps {
  kind: VoucherFormMode;
  title: string;
  subtitle: string;
}

export function VoucherListPage({ kind, title, subtitle }: VoucherListPageProps) {
  const { vouchers, journalEntries, accounts } = useERPStore();
  const today = new Date().toISOString().split('T')[0];
  const navigate = useNavigate();

  const LIST_ROUTES: Record<VoucherFormMode, string> = {
    'cash-payment': '/accounting/cash-payment',
    'bank-payment': '/accounting/bank-payment',
    'cash-receipt': '/accounting/cash-receipt',
    'bank-receipt': '/accounting/bank-receipt',
    journal: '/accounting/journal-voucher',
  };
  const listRoute = LIST_ROUTES[kind];

  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; description: string; onConfirm: () => void; variant?: 'default' | 'destructive' }>({ open: false, title: '', description: '', onConfirm: () => {} });
  const [viewVoucherId, setViewVoucherId] = useState<string | null>(null);

  // Deep link: /accounting/<kind>?new=1 (Dashboard Quick Entry) opens the
  // full-page create form. Keyed on the param itself so it also fires on
  // same-route navigations; consumes the param when done.
  const [searchParams] = useSearchParams();
  const isNewParam = searchParams.get('new') === '1';
  useEffect(() => {
    if (!isNewParam) return;
    navigate(`${listRoute}/new`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewParam]);

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
    setConfirmDialog({
      open: true,
      title: "Cancel Voucher",
      description: `Cancel voucher ${v.voucherNo}? It will be excluded from all reports.`,
      onConfirm: () => {
        AccountingEngine.cancelVoucher(v.id);
        toast.success("Voucher cancelled", { description: v.voucherNo });
      },
      variant: 'destructive'
    });
  };

  const handleDelete = (v: Voucher) => {
    setConfirmDialog({
      open: true,
      title: "Delete Voucher",
      description: `Permanently delete voucher ${v.voucherNo}? This removes it and its accounting effect.`,
      onConfirm: () => {
        AccountingEngine.deleteVoucher(v.id);
        toast.success("Voucher deleted", { description: v.voucherNo });
      },
      variant: 'destructive'
    });
  };

  const totals = useMemo(() => {
    const debit = filteredVouchers.reduce((s, v) => s + (v.totalDebit || 0), 0);
    const credit = filteredVouchers.reduce((s, v) => s + (v.totalCredit || 0), 0);
    return { debit, credit };
  }, [filteredVouchers]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background min-w-0">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <button
          onClick={() => navigate(`${listRoute}/new`)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Voucher
        </button>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 border-b border-border/50 flex flex-wrap items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <DatePicker value={dateFrom} onChange={setDateFrom} size="sm" className="w-40" placeholder="From" />
          <span className="text-muted-foreground text-sm">to</span>
          <DatePicker value={dateTo} onChange={setDateTo} size="sm" className="w-40" placeholder="To" />
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search voucher, narration, party..."
          className="flex-1 min-w-[200px] max-w-xs"
        />
        <Dropdown
          size="sm"
          ariaLabel="Filter by account"
          value={accountFilter}
          onChange={setAccountFilter}
          triggerClassName="w-64"
          options={[
            { value: 'all', label: 'All Accounts' },
            ...accounts.map(a => ({ value: a.id, label: `${a.code} — ${a.name}` })),
          ]}
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {filteredVouchers.length} voucher{filteredVouchers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Stat strip */}
      <div className="px-6 py-4 border-b border-border/50 shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard
            label="Vouchers in range"
            value={filteredVouchers.length}
            size="sm"
            icon={FileText}
            iconClassName="text-muted-foreground"
            description="Shown for the selected filters"
          />
          <KpiCard
            label="Total Debit"
            value={formatCurrency(totals.debit)}
            size="sm"
            icon={ArrowDownLeft}
            iconClassName="text-muted-foreground"
            accent="text-success"
          />
          <KpiCard
            label="Total Credit"
            value={formatCurrency(totals.credit)}
            size="sm"
            icon={ArrowUpRight}
            iconClassName="text-muted-foreground"
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
      <div className="scroll-thin flex-1 overflow-auto">
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
                            onClick={() => navigate(`${listRoute}/edit/${v.id}`)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-card text-muted-foreground border border-border/60 hover:text-foreground hover:bg-muted transition-all"
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

      {viewVoucherId && <VoucherDetailModal voucherId={viewVoucherId} onClose={() => setViewVoucherId(null)} />}


      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(o) => setConfirmDialog(d => ({ ...d, open: o }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDialog.onConfirm}
              className={confirmDialog.variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}