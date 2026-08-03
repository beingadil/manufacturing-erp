import React, { useState, useMemo } from 'react';
import { useERPStore } from '../../store/useERPStore';
import { CashBookEngine, CashBookRow } from '../../lib/finance/CashBookEngine';
import { getCashAccounts } from '../../lib/accounting/accountClassification';
import { ArrowUpCircle, ArrowDownCircle, CalendarDays } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Cash Book (spec §22–23).
 *
 * Single-date page: pick a date → Opening Cash + Receipts − Payments = Closing Cash.
 * Cash-only by construction: accounts are resolved by the 'Cash' subtype, never by
 * account name, and bank accounts are intentionally excluded (they belong to the
 * bank ledgers).
 */
export function CashBookPage() {
  const { accounts, journalEntries, vouchers, accountSubtypes } = useERPStore();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const cashAccountIds = useMemo(
    () => getCashAccounts(accounts, accountSubtypes).map(a => a.id),
    [accounts, accountSubtypes]
  );

  const summary = useMemo(
    () => CashBookEngine.getDailySummary(date, cashAccountIds, accounts, journalEntries, vouchers),
    [date, cashAccountIds, accounts, journalEntries, vouchers]
  );

  const allRows: CashBookRow[] = useMemo(() => {
    const { rows } = CashBookEngine.getCashBook(cashAccountIds, accounts, journalEntries, vouchers, date, date);
    return rows;
  }, [date, cashAccountIds, accounts, journalEntries, vouchers]);

  return (
    <div className="flex-1 flex flex-col h-full bg-card">
      {/* Header */}
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Cash Book</h2>
          <p className="text-sm text-muted-foreground">
            Physical cash in hand — opening, receipts, payments, closing
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-muted/20 border border-border/50 rounded-lg px-3 py-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="bg-transparent text-sm text-foreground focus:outline-none"
              title="Select date"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 border-b border-border/50 shrink-0">
        <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Opening Cash</p>
          <p className="text-2xl font-bold text-foreground mt-1">PKR {summary.openingCash.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Cash Receipts</p>
          <p className="text-2xl font-bold text-success mt-1">PKR {summary.totalReceipts.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Cash Payments</p>
          <p className="text-2xl font-bold text-destructive mt-1">PKR {summary.totalPayments.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Closing Cash</p>
          <p className={cn('text-2xl font-bold mt-1', summary.closingCash >= 0 ? 'text-success' : 'text-destructive')}>
            PKR {Math.abs(summary.closingCash).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Day's entries */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voucher #</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Particular</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Receipts (Dr)</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Payments (Cr)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {allRows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-muted-foreground text-sm">
                  <ArrowDownCircle className="h-8 w-8 mx-auto mb-3 opacity-20" />
                  No cash activity on {new Date(date).toLocaleDateString()}.
                </td>
              </tr>
            )}
            {allRows.map((row, idx) => (
              <tr key={`${row.voucherId}-${idx}`} className="hover:bg-muted/20 transition-colors">
                <td className="py-3 px-6 text-sm font-medium text-primary">{row.voucherNo}</td>
                <td className="py-3 px-6 text-sm text-muted-foreground">{row.particular}</td>
                <td className="py-3 px-6 text-sm text-right text-success font-medium">
                  {row.receipt > 0 ? `PKR ${row.receipt.toLocaleString()}` : ''}
                </td>
                <td className="py-3 px-6 text-sm text-right text-destructive font-medium">
                  {row.payment > 0 ? `PKR ${row.payment.toLocaleString()}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
          {allRows.length > 0 && (
            <tfoot className="bg-muted/30 font-semibold border-t-2 border-border">
              <tr>
                <td colSpan={2} className="py-4 px-6 text-sm text-right text-foreground">Totals</td>
                <td className="py-4 px-6 text-sm text-right text-success">PKR {summary.totalReceipts.toLocaleString()}</td>
                <td className="py-4 px-6 text-sm text-right text-destructive">PKR {summary.totalPayments.toLocaleString()}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
