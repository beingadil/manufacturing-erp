import { Search } from 'lucide-react';
import React, { useState } from 'react';
import { useERPStore } from '../store/useERPStore';
import { cn } from '../lib/utils';
import { VoucherHistoryTab } from './VoucherHistoryTab';
import { CashbookVoucherForm } from './CashbookVoucherForm';

import { generateLedgerStatementPDF } from '../lib/documentGenerators';
import { exportToExcel, exportToCSV } from '../lib/exportUtils';
import { ReportExportBar } from './reports/common/ReportExportBar';

export function Cashbook() {
  const [activeTab, setActiveTab] = useState<'entry' | 'history' | 'report'>('report');

  return (
    <div className="flex-1 flex flex-col h-full bg-card">
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Cashbook</h2>
          <p className="text-sm text-muted-foreground">Manage cash and bank transactions</p>
        </div>
      </div>

      <div className="flex border-b border-border/50 bg-muted/10 px-6 pt-2">
        <button
          onClick={() => setActiveTab('entry')}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === 'entry' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
        >
          Cash Entry
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
        >
          Voucher History
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === 'report' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
        >
          Cashbook Report
        </button>
      </div>

      {activeTab === 'entry' && <CashEntryTab />}
      {activeTab === 'history' && <div className="p-6 h-full overflow-y-auto"><VoucherHistoryTab sourceModule="Cashbook" /></div>}
      {activeTab === 'report' && <CashbookReportTab />}
    </div>
  );
}

function CashEntryTab() {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <CashbookVoucherForm />
      </div>
    </div>
  );
}

function CashbookReportTab() {
  const { accounts, journalEntries, vouchers } = useERPStore();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const cashAccounts = accounts.filter(a => a.subtypeId === accounts.find(sub => sub.name === 'Cash')?.id || a.subtypeId === accounts.find(sub => sub.name === 'Bank')?.id || a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('bank'));

  // Get ALL account entries sorted chronologically (no date filter yet)
  const allEntries = journalEntries
    .filter(je => {
      if (selectedAccountId !== 'all' && je.accountId !== selectedAccountId) return false;
      if (selectedAccountId === 'all' && !cashAccounts.some(ca => ca.id === je.accountId)) return false;
      return true;
    })
    .map(je => {
      const voucher = vouchers.find(v => v.id === je.voucherId);
      const acc = accounts.find(a => a.id === je.accountId);
      return {
        ...je,
        voucher,
        accountName: acc?.name,
        date: voucher?.date || new Date().toISOString()
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate the opening balance for the period by summing:
  // account opening balance + all net changes from entries BEFORE dateFrom
  let periodOpening = 0;
  if (selectedAccountId !== 'all') {
     const activeAccount = cashAccounts.find(a => a.id === selectedAccountId);
     if (activeAccount) {
         periodOpening = activeAccount.openingBalanceType === 'Debit' ? activeAccount.openingBalance : -activeAccount.openingBalance;
     }
  } else {
     cashAccounts.forEach(activeAccount => {
         periodOpening += activeAccount.openingBalanceType === 'Debit' ? activeAccount.openingBalance : -activeAccount.openingBalance;
     });
  }
  // Add entries before the filter date to get the true period-opening balance
  if (dateFrom) {
    allEntries
      .filter(e => e.date < dateFrom)
      .forEach(e => { periodOpening += e.debit - e.credit; });
  }

  // Now filter by date range for the visible entries
  const filteredEntries = allEntries.filter(e => {
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo && e.date > dateTo) return false;
    return true;
  });

  // Calculate running balance starting from the correct period-opening balance
  let runningBalance = periodOpening;
  const processedEntries = filteredEntries.map(entry => {
    runningBalance += entry.debit - entry.credit;
    return { ...entry, runningBalance };
  });

  const totalReceipts = filteredEntries.reduce((sum, e) => sum + e.debit, 0);
  const totalPayments = filteredEntries.reduce((sum, e) => sum + e.credit, 0);

  const handleExportPDF = () => {
    const transactions = processedEntries.map(e => ({
      date: new Date(e.date).toLocaleDateString(),
      referenceNo: e.voucher?.voucherNo || '-',
      description: e.narration || '-',
      debit: e.debit,
      credit: e.credit,
      balance: e.runningBalance
    }));

    generateLedgerStatementPDF(selectedAccountId === 'all' ? 'All Cash & Bank' : cashAccounts.find(a => a.id === selectedAccountId)?.name || 'Cashbook', 'Account', transactions, periodOpening);
  };

  const exportColumns = [
    { header: 'Date', dataKey: 'date', format: (val: any) => new Date(val).toLocaleDateString() },
    { header: 'Voucher', dataKey: 'voucherNo' },
    { header: 'Account', dataKey: 'accountName' },
    { header: 'Description', dataKey: 'narration' },
    { header: 'Receipt (Dr)', dataKey: 'debit' },
    { header: 'Payment (Cr)', dataKey: 'credit' },
    { header: 'Balance', dataKey: 'runningBalance' }
  ];

  const exportData = processedEntries.map(e => ({
    date: e.date,
    voucherNo: e.voucher?.voucherNo || '-',
    accountName: e.accountName || '-',
    narration: e.narration || '-',
    debit: e.debit,
    credit: e.credit,
    runningBalance: e.runningBalance
  }));

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 bg-muted/5">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <select
            value={selectedAccountId}
            onChange={e => setSelectedAccountId(e.target.value)}
            className="w-full sm:w-48 px-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Cash & Bank Accounts</option>
            {cashAccounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="w-full sm:w-40 px-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="From"
            title="Date From"
          />
          <span className="text-muted-foreground text-sm hidden sm:inline">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="w-full sm:w-40 px-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="To"
            title="Date To"
          />
          <div className="relative w-full sm:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search narration..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>
        </div>

        <ReportExportBar
          onExportPDF={handleExportPDF}
          onPrint={handleExportPDF}
          onExportExcel={() => exportToExcel({ data: exportData, columns: exportColumns, filename: 'Cashbook.xlsx' })}
          onExportCSV={() => exportToCSV({ data: exportData, columns: exportColumns, filename: 'Cashbook.csv' })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 border-b border-border/50 shrink-0">
        <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Opening Balance</p>
          <p className="text-2xl font-bold text-foreground mt-1">PKR {periodOpening.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Total Receipts</p>
          <p className="text-2xl font-bold text-success mt-1">PKR {totalReceipts.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Total Payments</p>
          <p className="text-2xl font-bold text-destructive mt-1">PKR {totalPayments.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Closing Balance</p>
          <p className={cn("text-2xl font-bold mt-1", runningBalance >= 0 ? "text-success" : "text-destructive")}>PKR {Math.abs(runningBalance).toLocaleString()}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voucher</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Narration</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Receipts (Dr)</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Payments (Cr)</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {processedEntries.filter(e => !search || e.voucher?.narration.toLowerCase().includes(search.toLowerCase()) || e.voucher?.voucherNo.toLowerCase().includes(search.toLowerCase())).map((entry) => (
              <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                <td className="py-3 px-6 text-sm text-foreground whitespace-nowrap">{new Date(entry.date).toLocaleDateString()}</td>
                <td className="py-3 px-6 text-sm font-medium text-foreground">{entry.accountName}</td>
                <td className="py-3 px-6 text-sm font-medium text-primary cursor-pointer hover:underline">{entry.voucher?.voucherNo}</td>
                <td className="py-3 px-6 text-sm text-muted-foreground">{entry.voucher?.narration}</td>
                <td className="py-3 px-6 text-sm text-right text-success font-medium">{entry.debit > 0 ? entry.debit.toLocaleString() : ''}</td>
                <td className="py-3 px-6 text-sm text-right text-destructive font-medium">{entry.credit > 0 ? entry.credit.toLocaleString() : ''}</td>
                <td className="py-3 px-6 text-sm text-right font-medium text-foreground">{Math.abs(entry.runningBalance).toLocaleString()} {entry.runningBalance >= 0 ? 'Dr' : 'Cr'}</td>
              </tr>
            ))}
            {processedEntries.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">
                  No transactions found in this cashbook.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
