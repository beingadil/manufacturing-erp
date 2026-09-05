import { ArrowUpRight, BookOpenText, Scale, Wallet, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AccountingEngine } from '../lib/accounting/AccountingEngine';
import { isDebitNormalAccount } from '../lib/accounting/accountClassification';
import { cn, formatCurrency } from '../lib/utils';
import { useERPStore } from '../store/useERPStore';
import { DatePicker } from './ui/date-picker';
import { ModalOverlay } from './ui/ModalOverlay';
import { VoucherDetailModal } from './VoucherDetailModal';

export type PartyKind = 'Customer' | 'Supplier' | 'Processor';

export interface PartyLedgerModalProps {
  party: { id: string; name: string; kind: PartyKind };
  onClose: () => void;
}

/**
 * Inline drill-down from Customers / Suppliers / Processors into the party's
 * own sub-ledger account (linked via linkedEntityId). Uses the single
 * AccountingEngine.getLedger so the numbers always match the General Ledger
 * (spec §14, §24). Cancelled vouchers never appear.
 */
export function PartyLedgerModal({ party, onClose }: PartyLedgerModalProps) {
  const navigate = useNavigate();
  const { accounts, journalEntries, vouchers } = useERPStore();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewVoucherId, setViewVoucherId] = useState<string | null>(null);

  const account = accounts.find(a => a.linkedEntityId === party.id);

  const { rows, openingBalance } = useMemo(() => {
    if (!account) return { rows: [], openingBalance: 0 };
    return AccountingEngine.getLedger(
      account.id,
      accounts,
      journalEntries,
      vouchers,
      dateFrom || undefined,
      dateTo || undefined
    );
  }, [account, accounts, journalEntries, vouchers, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const debit = rows.reduce((s, r) => s + (r.debit || 0), 0);
    const credit = rows.reduce((s, r) => s + (r.credit || 0), 0);
    const closing = rows.length > 0 ? rows[rows.length - 1].runningBalance : openingBalance;
    return { debit, credit, closing };
  }, [rows, openingBalance]);

  const isDebitNormal = account ? isDebitNormalAccount(account) : party.kind === 'Customer';
  const balanceLabel = party.kind === 'Customer' ? 'Balance Receivable' : 'Balance Payable';

  const formatBalance = (value: number) => {
    const abs = Math.abs(value);
    const drCr = value >= 0 ? (isDebitNormal ? 'Dr' : 'Cr') : (isDebitNormal ? 'Cr' : 'Dr');
    return `${formatCurrency(abs)} ${drCr}`;
  };

  return (
    <ModalOverlay onClose={onClose} zIndex={60}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/50 flex items-start justify-between bg-muted/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <BookOpenText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">{party.name}</h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                  {party.kind}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <span>Account: {account ? `${account.code} — ${account.name}` : 'Not linked'}</span>
                <span>•</span>
                <span>{account?.type || '-'}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors" aria-label="Close">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Balance Cards */}
        <div className="px-6 pt-5 shrink-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Opening Balance</p>
              <p className="text-xl font-bold text-foreground mt-1">{formatBalance(openingBalance)}</p>
            </div>
            <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Debits</p>
              <p className="text-xl font-bold text-success mt-1">{formatCurrency(totals.debit)}</p>
            </div>
            <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Credits</p>
              <p className="text-xl font-bold text-destructive mt-1">{formatCurrency(totals.credit)}</p>
            </div>
            <div className="bg-primary text-primary-foreground rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider opacity-70 flex items-center gap-1">
                <Scale className="h-3.5 w-3.5" /> {balanceLabel}
              </p>
              <p className="text-xl font-bold mt-1">{formatBalance(totals.closing)}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 flex flex-wrap items-center gap-3 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <DatePicker value={dateFrom} onChange={setDateFrom} size="sm" className="w-40" placeholder="From" />
            <span className="text-muted-foreground text-sm">to</span>
            <DatePicker value={dateTo} onChange={setDateTo} size="sm" className="w-40" placeholder="To" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {account && (
              <button
                onClick={() => { onClose(); navigate(`/ledgers?id=${party.id}`); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-muted text-foreground hover:bg-muted/80 rounded-lg transition-colors"
              >
                <Wallet className="h-3.5 w-3.5" />
                Open in Ledgers
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="text-xs text-muted-foreground">{rows.length} entr{rows.length === 1 ? 'y' : 'ies'}</span>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voucher</th>
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Narration</th>
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Debit</th>
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Credit</th>
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {!account && (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-muted-foreground text-sm">
                    No linked account found for this {party.kind.toLowerCase()}. Create a transaction to auto-generate one.
                  </td>
                </tr>
              )}
              {account && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-muted-foreground text-sm">
                    No journal entries for {party.name} in the selected range.
                  </td>
                </tr>
              )}
              {/* Newest entry at the top; each row still carries its own running
                  balance from the full ascending sequence, and the closing
                  balance card is the FINAL running balance — never the latest
                  entry's amount. */}
              {[...rows].reverse().map(row => (
                <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-6 text-sm text-foreground whitespace-nowrap">
                    {row.voucher?.date ? new Date(row.voucher.date).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3 px-6 text-sm">
                    <button
                      onClick={() => setViewVoucherId(row.voucherId)}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.voucher?.voucherNo || '-'}
                    </button>
                  </td>
                  <td className="py-3 px-6 text-sm text-muted-foreground">{row.voucher?.type || '-'}</td>
                  <td className="py-3 px-6 text-sm text-muted-foreground max-w-[260px] truncate">
                    {row.narration || row.voucher?.narration || '-'}
                  </td>
                  <td className={cn('py-3 px-6 text-sm text-right font-medium', row.debit > 0 && 'text-success')}>
                    {row.debit > 0 ? formatCurrency(row.debit) : ''}
                  </td>
                  <td className={cn('py-3 px-6 text-sm text-right font-medium', row.credit > 0 && 'text-destructive')}>
                    {row.credit > 0 ? formatCurrency(row.credit) : ''}
                  </td>
                  <td className="py-3 px-6 text-sm text-right font-semibold text-foreground">
                    {formatBalance(row.runningBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-muted/30 font-semibold border-t-2 border-border">
                <tr>
                  <td colSpan={4} className="py-3.5 px-6 text-sm text-right text-foreground">Totals</td>
                  <td className="py-3.5 px-6 text-sm text-right text-success">{formatCurrency(totals.debit)}</td>
                  <td className="py-3.5 px-6 text-sm text-right text-destructive">{formatCurrency(totals.credit)}</td>
                  <td className="py-3.5 px-6 text-sm text-right text-foreground">{formatBalance(totals.closing)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {viewVoucherId && <VoucherDetailModal voucherId={viewVoucherId} onClose={() => setViewVoucherId(null)} />}
    </ModalOverlay>
  );
}
