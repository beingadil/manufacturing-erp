import React, { useMemo } from 'react';
import { useERPStore } from '../../store/useERPStore';
import { CashBookEngine } from '../../lib/finance/CashBookEngine';
import { X, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DailyCashSummaryProps {
  date: string;
  onClose: () => void;
}

export function DailyCashSummary({ date, onClose }: DailyCashSummaryProps) {
  const { accounts, journalEntries, vouchers } = useERPStore();

  const cashAccountIds = useMemo(() => CashBookEngine.getCashBankAccountIds(accounts), [accounts]);

  const summary = useMemo(() =>
    CashBookEngine.getDailySummary(date, cashAccountIds, accounts, journalEntries, vouchers),
    [date, cashAccountIds, accounts, journalEntries, vouchers]
  );

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-lg rounded-2xl shadow-xl border border-border flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Daily Cash Summary</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(date).toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              })}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Opening Cash */}
          <div className="bg-muted/20 rounded-xl p-4 border border-border/50">
            <p className="text-sm text-muted-foreground font-medium">Opening Cash</p>
            <p className="text-2xl font-bold text-foreground mt-1">PKR {summary.openingCash.toLocaleString()}</p>
          </div>

          {/* Receipts */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ArrowUpCircle className="h-5 w-5 text-success" />
              <h3 className="font-semibold text-foreground">Receipts</h3>
              <span className="ml-auto text-sm font-bold text-success">PKR {summary.totalReceipts.toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              {summary.receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground italic pl-7">No receipts recorded.</p>
              ) : (
                summary.receipts.map((r, i) => (
                  <div key={i} className="flex items-center justify-between pl-7 py-1.5 text-sm">
                    <div>
                      <span className="font-medium text-foreground">{r.voucherNo}</span>
                      <span className="text-muted-foreground ml-2">{r.particular}</span>
                    </div>
                    <span className="font-medium text-success">PKR {r.receipt.toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Payments */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ArrowDownCircle className="h-5 w-5 text-destructive" />
              <h3 className="font-semibold text-foreground">Payments</h3>
              <span className="ml-auto text-sm font-bold text-destructive">PKR {summary.totalPayments.toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              {summary.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground italic pl-7">No payments recorded.</p>
              ) : (
                summary.payments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between pl-7 py-1.5 text-sm">
                    <div>
                      <span className="font-medium text-foreground">{p.voucherNo}</span>
                      <span className="text-muted-foreground ml-2">{p.particular}</span>
                    </div>
                    <span className="font-medium text-destructive">PKR {p.payment.toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="border-t border-border/50 pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Opening Cash</span>
              <span className="font-medium text-foreground">PKR {summary.openingCash.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">+ Receipts</span>
              <span className="font-medium text-success">PKR {summary.totalReceipts.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">— Payments</span>
              <span className="font-medium text-destructive">PKR {summary.totalPayments.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base font-bold bg-primary/10 border border-primary/20 p-3 rounded-lg mt-2">
              <span className="text-foreground">Closing Cash</span>
              <span className={cn(
                'text-foreground',
                summary.closingCash >= 0 ? 'text-success' : 'text-destructive'
              )}>
                PKR {Math.abs(summary.closingCash).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/50 bg-muted/10 shrink-0 flex justify-end rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-semibold text-foreground bg-background border border-border hover:bg-muted/50 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
