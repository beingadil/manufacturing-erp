import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useERPStore } from '../../store/useERPStore';
import { CashBookEngine } from '../../lib/finance/CashBookEngine';
import { ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { CashReceiptVoucher } from './CashReceiptVoucher';
import { CashPaymentVoucher } from './CashPaymentVoucher';
import { ContraVoucher } from './ContraVoucher';
import { CashBookReport } from './CashBookReport';

type FinanceTab = 'crv' | 'cpv' | 'contra' | 'cashbook' | 'daily-summary';

export function FinanceLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as FinanceTab | null;
  const [activeTab, setActiveTab] = useState<FinanceTab>(tabParam || 'cashbook');

  const tabs: { id: FinanceTab; label: string; icon: string }[] = [
    { id: 'crv', label: 'Cash Receipt Voucher', icon: '💰' },
    { id: 'cpv', label: 'Cash Payment Voucher', icon: '💳' },
    { id: 'contra', label: 'Contra Voucher', icon: '🔄' },
    { id: 'cashbook', label: 'Cash Book', icon: '📒' },
    { id: 'daily-summary', label: 'Daily Cash Summary', icon: '📊' },
  ];

  const handleTabChange = (tab: FinanceTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-card">
      {/* Tabs */}
      <div className="flex border-b border-border/50 bg-muted/10 px-6 pt-2 overflow-x-auto shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'crv' && <CashReceiptVoucher />}
        {activeTab === 'cpv' && <CashPaymentVoucher />}
        {activeTab === 'contra' && <ContraVoucher />}
        {activeTab === 'cashbook' && <CashBookReport />}
        {activeTab === 'daily-summary' && <DailyCashSummaryContent />}
      </div>
    </div>
  );
}

/** Standalone Daily Cash Summary content (not a modal) */
function DailyCashSummaryContent() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-4">
          <label className="block text-sm font-medium text-muted-foreground mb-1.5">Select Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm bg-background text-foreground focus:border-primary"
          />
        </div>
        {date && <DailyCashSummaryInline date={date} />}
      </div>
    </div>
  );
}



function DailyCashSummaryInline({ date }: { date: string }) {
  const { accounts, journalEntries, vouchers } = useERPStore();
  const cashAccountIds = React.useMemo(() => CashBookEngine.getCashBankAccountIds(accounts), [accounts]);
  const summary = React.useMemo(() =>
    CashBookEngine.getDailySummary(date, cashAccountIds, accounts, journalEntries, vouchers),
    [date, cashAccountIds, accounts, journalEntries, vouchers]
  );

  return (
    <div className="bg-card border border-border/50 rounded-2xl shadow-sm p-6 space-y-6">
      <div className="bg-muted/20 rounded-xl p-4 border border-border/50">
        <p className="text-sm text-muted-foreground font-medium">Opening Cash</p>
        <p className="text-2xl font-bold text-foreground mt-1">PKR {summary.openingCash.toLocaleString()}</p>
      </div>

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
          <span className={summary.closingCash >= 0 ? 'text-success' : 'text-destructive'}>
            PKR {Math.abs(summary.closingCash).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
