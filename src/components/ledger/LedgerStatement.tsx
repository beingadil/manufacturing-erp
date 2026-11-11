import { ChevronDown } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { cn, formatCurrency, formatDate } from '../../lib/utils';

export type LedgerBadgeTone = 'debit' | 'credit' | 'info' | 'neutral';

export interface LedgerStatementRow {
  id: string;
  /** Business date (YYYY-MM-DD or ISO). */
  date: string;
  /** Optional account cell — shown as a column only when a row supplies one. */
  account?: ReactNode;
  /** Voucher number / reference cell. */
  reference?: ReactNode;
  /** Narration cell. */
  description?: ReactNode;
  /** Optional second line under the narration (party, case, etc.). */
  detail?: ReactNode;
  debit: number;
  credit: number;
  /** Running balance on the account's normal side. */
  balance?: number;
  /** Small narration-type chips, e.g. the voucher type. */
  badges?: { label: string; tone?: LedgerBadgeTone }[];
}

export interface LedgerStatementProps {
  rows: LedgerStatementRow[];
  /** Omit to hide the opening-balance row (e.g. an all-accounts register). */
  openingBalance?: number;
  /** Omit to hide the closing-balance bar. */
  closingBalance?: number;
  /** True for Assets/Expenses/COGS/Other Expenses. */
  isDebitNormal?: boolean;
  /** Show the running Balance column. Defaults to true. */
  showBalance?: boolean;
  /** Remove the outer card so the table can sit inside an existing panel. */
  embedded?: boolean;
  emptyMessage?: string;
  pageSize?: number;
}

const BADGE_TONES: Record<LedgerBadgeTone, string> = {
  debit: 'bg-success/10 text-success',
  credit: 'bg-destructive/10 text-destructive',
  info: 'bg-primary/10 text-primary',
  neutral: 'bg-muted text-muted-foreground',
};

const amountFormat = new Intl.NumberFormat('en-PK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatAmount(amount: number): string {
  return amountFormat.format(Math.abs(amount));
}

/** Signed balance -> Dr/Cr label, using the account's normal side. */
export function ledgerBalanceSide(balance: number, isDebitNormal = true): 'Dr' | 'Cr' {
  return (balance >= 0) === isDebitNormal ? 'Dr' : 'Cr';
}

export function LedgerStatement({
  rows,
  openingBalance,
  closingBalance,
  isDebitNormal = true,
  showBalance = true,
  embedded = false,
  emptyMessage = 'No entries in this period.',
  pageSize = 250,
}: LedgerStatementProps) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [rows.length, pageSize]);

  const totalDebit = rows.reduce((sum, row) => sum + (row.debit || 0), 0);
  const totalCredit = rows.reduce((sum, row) => sum + (row.credit || 0), 0);
  const showAccount = rows.some((row) => row.account !== undefined);
  const visibleRows = rows.slice(0, visibleCount);
  const hiddenCount = rows.length - visibleRows.length;

  // Leading text columns before the money columns.
  const textColumns = 3 + (showAccount ? 1 : 0);
  const columnCount = textColumns + 2 + (showBalance ? 1 : 0);

  return (
    <div
      className={cn(
        'overflow-hidden',
        !embedded && 'rounded-2xl border border-border bg-card shadow-sm'
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40">
              <th scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date
              </th>
              {showAccount && (
                <th scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Account
                </th>
              )}
              <th scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Voucher
              </th>
              <th scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Narration
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Debit (Dr)
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Credit (Cr)
              </th>
              {showBalance && (
                <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Balance
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-border/40">
            {openingBalance !== undefined && (
              <tr className="bg-warning/[0.06]">
                <td colSpan={textColumns} className="px-4 py-2.5 text-sm italic text-muted-foreground">
                  Opening Balance
                  <span className="ml-1.5 text-xs not-italic text-muted-foreground/80">
                    — balance brought forward
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-sm text-muted-foreground">—</td>
                <td className="px-4 py-2.5 text-right text-sm text-muted-foreground">—</td>
                {showBalance && (
                  <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                    {formatAmount(openingBalance)}
                    <span className="ml-1 text-[11px] font-medium text-muted-foreground">
                      {ledgerBalanceSide(openingBalance, isDebitNormal)}
                    </span>
                  </td>
                )}
              </tr>
            )}

            {visibleRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-muted/20">
                <td className="whitespace-nowrap px-4 py-2.5 text-sm text-foreground">
                  {row.date ? formatDate(row.date) : '—'}
                </td>
                {showAccount && <td className="px-4 py-2.5 text-sm text-foreground">{row.account ?? '—'}</td>}
                <td className="whitespace-nowrap px-4 py-2.5 text-sm font-medium text-foreground">
                  {row.reference ?? '—'}
                </td>
                <td className="max-w-[320px] px-4 py-2.5 text-sm text-foreground">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="min-w-0 break-words">{row.description ?? '—'}</span>
                    {row.badges?.map((badge, index) => (
                      <span
                        key={`${badge.label}-${index}`}
                        className={cn(
                          'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                          BADGE_TONES[badge.tone ?? 'neutral']
                        )}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                  {row.detail && <div className="mt-0.5 text-xs text-muted-foreground">{row.detail}</div>}
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-success">
                  {row.debit > 0 ? formatAmount(row.debit) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-destructive">
                  {row.credit > 0 ? formatAmount(row.credit) : '—'}
                </td>
                {showBalance && (
                  <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                    {row.balance === undefined ? '—' : (
                      <>
                        {formatAmount(row.balance)}
                        <span className="ml-1 text-[11px] font-medium text-muted-foreground">
                          {ledgerBalanceSide(row.balance, isDebitNormal)}
                        </span>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}

            {hiddenCount > 0 && (
              <tr>
                <td colSpan={columnCount} className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => count + pageSize)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    Show {Math.min(hiddenCount, pageSize)} more of {rows.length}
                  </button>
                </td>
              </tr>
            )}
          </tbody>

          <tfoot>
            <tr className="border-t border-border/60 bg-muted/30">
              <td colSpan={textColumns} className="px-4 py-2.5 text-sm font-semibold text-foreground">
                Total Period Activity
              </td>
              <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-success">
                {formatAmount(totalDebit)}
              </td>
              <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-destructive">
                {formatAmount(totalCredit)}
              </td>
              {showBalance && (
                <td className="px-4 py-2.5 text-right text-sm text-muted-foreground">—</td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      {closingBalance !== undefined && (
        <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Closing Balance
          </span>
          <span className="text-base font-bold tabular-nums text-foreground">
            {formatCurrency(Math.abs(closingBalance))}
            <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
              {ledgerBalanceSide(closingBalance, isDebitNormal)}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
