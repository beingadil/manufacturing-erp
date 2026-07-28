import React, { useState, useMemo } from 'react';
import { useERPStore } from '../../store/useERPStore';
import { CashBookEngine, CashBookRow } from '../../lib/finance/CashBookEngine';
import { Search, Filter, Download, Printer } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DailyCashSummary } from './DailyCashSummary';
import { ReportExportBar } from '../../components/reports/common/ReportExportBar';
import { exportToExcel, exportToCSV } from '../../lib/exportUtils';
import { generateLedgerStatementPDF } from '../../lib/documentGenerators';

export function CashBookReport() {
  const { accounts, journalEntries, vouchers, accountSubtypes } = useERPStore();

  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const cashAccounts = useMemo(() => CashBookEngine.getCashBankAccounts(accounts), [accounts]);

  // Determine which cash account IDs to filter by
  const cashAccountIds = useMemo(() => {
    if (selectedAccountId === 'all') {
      return CashBookEngine.getCashBankAccountIds(accounts);
    }
    return [selectedAccountId];
  }, [accounts, selectedAccountId]);

  // Get cash book data
  const { openingBalance, rows } = useMemo(() =>
    CashBookEngine.getCashBook(
      cashAccountIds, accounts, journalEntries, vouchers, dateFrom || undefined, dateTo || undefined
    ),
    [cashAccountIds, accounts, journalEntries, vouchers, dateFrom, dateTo]
  );

  // Filter by search
  const filteredRows = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.voucherNo.toLowerCase().includes(q) ||
      r.particular.toLowerCase().includes(q) ||
      r.voucherType.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalReceipts = filteredRows.reduce((s, r) => s + r.receipt, 0);
  const totalPayments = filteredRows.reduce((s, r) => s + r.payment, 0);
  const closingBalance = openingBalance + totalReceipts - totalPayments;

  const handleExportPDF = () => {
    const transactions = filteredRows.map(r => ({
      date: new Date(r.date).toLocaleDateString(),
      referenceNo: r.voucherNo,
      description: r.particular,
      debit: r.receipt,
      credit: r.payment,
      balance: r.balance,
    }));
    generateLedgerStatementPDF(
      selectedAccountId === 'all' ? 'Cash Book (All Accounts)' : cashAccounts.find(a => a.id === selectedAccountId)?.name || 'Cash Book',
      'Account',
      transactions,
      openingBalance
    );
  };

  const exportColumns = [
    { header: 'Date', dataKey: 'date', format: (val: string) => new Date(val).toLocaleDateString() },
    { header: 'Voucher #', dataKey: 'voucherNo' },
    { header: 'Type', dataKey: 'voucherType' },
    { header: 'Particular', dataKey: 'particular' },
    { header: 'Receipts (Dr)', dataKey: 'receipt' },
    { header: 'Payments (Cr)', dataKey: 'payment' },
    { header: 'Balance', dataKey: 'balance' },
  ];

  const exportData = filteredRows.map(r => ({
    date: r.date,
    voucherNo: r.voucherNo,
    voucherType: r.voucherType,
    particular: r.particular,
    receipt: r.receipt,
    payment: r.payment,
    balance: r.balance,
  }));

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Filters */}
      <div className="p-6 border-b border-border/50 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shrink-0 bg-muted/5">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <select
            value={selectedAccountId}
            onChange={e => setSelectedAccountId(e.target.value)}
            className="w-full sm:w-56 px-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Cash & Bank Accounts</option>
            {cashAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="w-full sm:w-40 px-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            title="Date From"
          />
          <span className="text-muted-foreground text-sm hidden sm:inline">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="w-full sm:w-40 px-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            title="Date To"
          />
          <div className="relative w-full sm:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <ReportExportBar
          onExportPDF={handleExportPDF}
          onPrint={handleExportPDF}
          onExportExcel={() => exportToExcel({ data: exportData, columns: exportColumns, filename: 'CashBook.xlsx' })}
          onExportCSV={() => exportToCSV({ data: exportData, columns: exportColumns, filename: 'CashBook.csv' })}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 border-b border-border/50 shrink-0">
        <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Opening Balance</p>
          <p className="text-2xl font-bold text-foreground mt-1">PKR {openingBalance.toLocaleString()}</p>
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
          <p className={cn("text-2xl font-bold mt-1", closingBalance >= 0 ? "text-success" : "text-destructive")}>
            PKR {Math.abs(closingBalance).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Cash Book Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30 sticky top-0">
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voucher #</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Particular</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Receipts (Dr)</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Payments (Cr)</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {/* Opening Balance Row */}
            <tr className="bg-muted/10 font-medium">
              <td className="py-3 px-6 text-sm text-foreground" colSpan={3}>
                {new Date(dateFrom || new Date().toISOString().split('T')[0]).toLocaleDateString()} — Opening Balance
              </td>
              <td className="py-3 px-6 text-sm text-right text-foreground"></td>
              <td className="py-3 px-6 text-sm text-right text-foreground"></td>
              <td className="py-3 px-6 text-sm text-right font-bold text-foreground">
                PKR {openingBalance.toLocaleString()}
              </td>
            </tr>

            {filteredRows.map((row, idx) => (
              <tr key={`${row.voucherId}-${idx}`} className="hover:bg-muted/20 transition-colors group">
                <td
                  className="py-3 px-6 text-sm text-foreground whitespace-nowrap cursor-pointer hover:text-primary hover:underline"
                  onClick={() => setSelectedDate(row.date)}
                  title="Click to view daily summary"
                >
                  {new Date(row.date).toLocaleDateString()}
                </td>
                <td className="py-3 px-6 text-sm font-medium text-primary">{row.voucherNo}</td>
                <td className="py-3 px-6 text-sm text-muted-foreground">{row.particular}</td>
                <td className="py-3 px-6 text-sm text-right text-success font-medium">
                  {row.receipt > 0 ? `PKR ${row.receipt.toLocaleString()}` : ''}
                </td>
                <td className="py-3 px-6 text-sm text-right text-destructive font-medium">
                  {row.payment > 0 ? `PKR ${row.payment.toLocaleString()}` : ''}
                </td>
                <td className="py-3 px-6 text-sm text-right font-medium text-foreground">
                  {Math.abs(row.balance).toLocaleString()} {row.balance >= 0 ? 'Dr' : 'Cr'}
                </td>
              </tr>
            ))}

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                  No transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Daily Cash Summary Modal */}
      {selectedDate && (
        <DailyCashSummary
          date={selectedDate}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
