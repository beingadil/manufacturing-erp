import React, { useState, useMemo } from 'react';
import { formatCurrency } from '../../../lib/utils';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { useERPStore } from '../../../store/useERPStore';
import { AccountingEngine } from '../../../lib/accounting/AccountingEngine';

export function BalanceSheetReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'As of Today' });
  const asOfDate = dateRange.end || '';

  const data = useMemo(() => {
    const state = useERPStore.getState();
    const { accounts, journalEntries, vouchers } = state;
    const balances = AccountingEngine.getAccountBalances(accounts, journalEntries, vouchers, asOfDate || undefined);

    const assetAccounts = accounts
      .filter(a => a.type === 'Assets' && Math.abs(balances.get(a.id) || 0) > 0.01)
      .map(a => ({ id: a.id, code: a.code, name: a.name, balance: balances.get(a.id) || 0 }))
      .sort((a, b) => a.code.localeCompare(b.code));
    const liabilityAccounts = accounts
      .filter(a => a.type === 'Liabilities' && Math.abs(balances.get(a.id) || 0) > 0.01)
      .map(a => ({ id: a.id, code: a.code, name: a.name, balance: balances.get(a.id) || 0 }))
      .sort((a, b) => a.code.localeCompare(b.code));
    const equityAccounts = accounts
      .filter(a => a.type === 'Equity' && Math.abs(balances.get(a.id) || 0) > 0.01)
      .map(a => ({ id: a.id, code: a.code, name: a.name, balance: balances.get(a.id) || 0 }))
      .sort((a, b) => a.code.localeCompare(b.code));

    // Current-period profit (posted only, up to as-of date)
    const activeEntries = journalEntries.filter(je => {
      const v = vouchers.find(x => x.id === je.voucherId);
      return v && v.status === 'Posted' && (!asOfDate || v.date <= asOfDate);
    });
    let revenue = 0;
    let expenses = 0;
    for (const je of activeEntries) {
      const acc = accounts.find(a => a.id === je.accountId);
      if (!acc) continue;
      if (acc.type === 'Revenue' || acc.type === 'Other Income') revenue += je.credit || 0;
      else if (acc.type === 'Cost of Goods Sold' || acc.type === 'Expenses' || acc.type === 'Other Expenses') expenses += je.debit || 0;
    }
    const netProfit = revenue - expenses;

    const totalAssets = assetAccounts.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilityAccounts.reduce((s, a) => s + a.balance, 0);
    const totalEquity = equityAccounts.reduce((s, a) => s + a.balance, 0) + netProfit;

    return { assetAccounts, liabilityAccounts, equityAccounts, netProfit, totalAssets, totalLiabilities, totalEquity, balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01 };
  }, [asOfDate]);

  const handleExportPDF = () => generateEnterpriseDocument({
    title: 'Balance Sheet', filters: [{ label: 'As Of', value: dateRange.label }],
    tables: [{
      columns: [
        { header: 'Particulars', dataKey: 'particulars', align: 'left' },
        { header: 'Amount', dataKey: 'amount', align: 'right' }
      ],
      rows: [
        { particulars: 'Total Assets', amount: formatCurrency(data.totalAssets) },
        { particulars: 'Total Liabilities', amount: formatCurrency(data.totalLiabilities) },
        { particulars: 'Total Equity (incl. current profit)', amount: formatCurrency(data.totalEquity) }
      ]
    }]
  });

  return (
    <div className="space-y-6">
      <ReportFilterBar 
        onDateRangeChange={setDateRange} 
        onExportPDF={handleExportPDF}
      />

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden max-w-4xl mx-auto">
        <div className="p-6 border-b border-border/50 text-center bg-muted/20">
          <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">Balance Sheet</h2>
          <p className="text-sm text-muted-foreground mt-1">As of {dateRange.label || new Date().toLocaleDateString()}</p>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-lg font-bold text-foreground border-b-2 border-primary pb-2 mb-4">Assets</h3>
            <div className="space-y-2">
              {data.assetAccounts.length === 0 && <p className="text-sm text-muted-foreground italic">No assets with balance.</p>}
              {data.assetAccounts.map(a => (
                <div key={a.id} className="flex justify-between items-center text-sm">
                  <span className="text-foreground">{a.name}</span>
                  <span className="text-foreground font-medium">{formatCurrency(a.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center text-base font-bold bg-muted/30 p-3 rounded-lg mt-6 border border-border/50">
                <span className="text-foreground">Total Assets</span>
                <span className="text-foreground">{formatCurrency(data.totalAssets)}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-foreground border-b-2 border-rose-500 pb-2 mb-4">Liabilities</h3>
            <div className="space-y-2 mb-6">
              {data.liabilityAccounts.length === 0 && <p className="text-sm text-muted-foreground italic">No liabilities with balance.</p>}
              {data.liabilityAccounts.map(a => (
                <div key={a.id} className="flex justify-between items-center text-sm">
                  <span className="text-foreground">{a.name}</span>
                  <span className="text-foreground font-medium">{formatCurrency(a.balance)}</span>
                </div>
              ))}
            </div>

            <h3 className="text-lg font-bold text-foreground border-b-2 border-amber-500 pb-2 mb-4">Equity</h3>
            <div className="space-y-2">
              {data.equityAccounts.map(a => (
                <div key={a.id} className="flex justify-between items-center text-sm">
                  <span className="text-foreground">{a.name}</span>
                  <span className="text-foreground font-medium">{formatCurrency(a.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center text-sm">
                <span className="text-foreground">Current Period Profit</span>
                <span className="text-foreground font-medium">{formatCurrency(data.netProfit)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center text-base font-bold bg-muted/30 p-3 rounded-lg mt-6 border border-border/50">
              <span className="text-foreground">Total Liabilities & Equity</span>
              <span className={data.balanced ? 'text-foreground' : 'text-destructive'}>
                {formatCurrency(data.totalLiabilities + data.totalEquity)}
              </span>
            </div>
            {!data.balanced && (
              <p className="text-xs text-destructive mt-2">
                Difference: {formatCurrency(Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)))} — check for unbalanced vouchers.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
