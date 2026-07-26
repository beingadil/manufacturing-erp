import { ErrorManagement } from '../lib/validation';
import { AccountingService } from '../services/AccountingService';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import { Eye, Edit, Trash2, Search, Plus, Filter, Download } from 'lucide-react';
import React, { useState } from 'react';
import { useERPStore } from '../store/useERPStore';
import { cn } from '../lib/utils';
import { Account } from '../types/erp';
import { VoucherHistoryTab } from './VoucherHistoryTab';
import { CashbookEntryModal } from './CashbookEntryModal';

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
  // We can just embed the CashbookEntryModal form here, but it's easier to just show the Entry form directly.
  // We'll import the form logic or reuse CashbookEntryModal components.
  // Actually, CashbookEntryModal expects to be a modal. Let's just render the modal contents without the fixed wrapper.
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <CashEntryForm />
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

// A wrapper to use CashbookEntryModal contents inline
import { SearchableSelect } from './SearchableSelect';
import { AddAccountModal } from './AddAccountModal';
import { AccountType } from '../types/erp';

function CashEntryForm() {
  const { accounts, suppliers, customers, processors, accountSubtypes } = useERPStore();
  
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryType, setEntryType] = useState<'Payment' | 'Receipt' | 'Contra' | 'Journal'>('Payment');
  const [cashAccountId, setCashAccountId] = useState('');
  const [counterpartyType, setCounterpartyType] = useState<'supplier' | 'customer' | 'processor' | 'expense' | 'income' | 'cash' | 'account'>('supplier');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [referenceNo, setReferenceNo] = useState('');
  const [narration, setNarration] = useState('');

  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [addAccountTypeFilter, setAddAccountTypeFilter] = useState<{type?: AccountType, subtypeName?: string} | undefined>();

  // Reset counterparty type when entry type changes
  React.useEffect(() => {
    if (entryType === 'Payment') setCounterpartyType('supplier');
    else if (entryType === 'Receipt') setCounterpartyType('customer');
    else if (entryType === 'Contra') setCounterpartyType('cash');
    else setCounterpartyType('account');
    setCounterpartyId('');
  }, [entryType]);

  // Get cash and bank accounts
  const cashAccounts = accounts.filter(a => 
    accountSubtypes?.find(s => s.id === a.subtypeId)?.name === 'Cash' ||
    accountSubtypes?.find(s => s.id === a.subtypeId)?.name === 'Bank' ||
    a.name.toLowerCase().includes('cash') || 
    a.name.toLowerCase().includes('bank')
  );

  // Get counterparty options based on type
  const counterpartyOptions = (): { id: string; label: string; accountId: string | null; entity?: any }[] => {
    switch (counterpartyType) {
      case 'supplier':
        return suppliers.map(s => ({
          id: s.id,
          label: `${s.name} — Balance: PKR ${(s.balancePayable || 0).toLocaleString()}`,
          accountId: accounts.find(a => a.linkedEntityId === s.id)?.id || null,
          entity: s
        }));
      case 'customer':
        return customers.map(c => ({
          id: c.id,
          label: `${c.name} — Balance: PKR ${(c.balanceReceivable || 0).toLocaleString()}`,
          accountId: accounts.find(a => a.linkedEntityId === c.id)?.id || null,
          entity: c
        }));
      case 'processor':
        return processors.map(p => ({
          id: p.id,
          label: `${p.name} — Balance: PKR ${(p.balancePayable || 0).toLocaleString()}`,
          accountId: accounts.find(a => a.linkedEntityId === p.id)?.id || null,
          entity: p
        }));
      case 'expense':
        return accounts
          .filter(a => a.type === 'Expenses' || a.type === 'Cost of Goods Sold' || a.type === 'Other Expenses')
          .map(a => ({ id: a.id, label: `${a.code} - ${a.name}`, accountId: a.id }));
      case 'income':
        return accounts
          .filter(a => a.type === 'Revenue' || a.type === 'Other Income')
          .map(a => ({ id: a.id, label: `${a.code} - ${a.name}`, accountId: a.id }));
      case 'cash':
        return cashAccounts
          .filter(a => a.id !== cashAccountId)
          .map(a => ({ id: a.id, label: `${a.code} - ${a.name}`, accountId: a.id }));
      case 'account':
        return accounts.map(a => ({
          id: a.id,
          label: `${a.code} - ${a.name}`,
          accountId: a.id,
          secondaryLabel: `${a.type}`
        }));
      default:
        return [];
    }
  };

  const getCounterpartyLabel = () => {
    switch (entryType) {
      case 'Payment':
        switch (counterpartyType) {
          case 'supplier': return 'Pay to Supplier';
          case 'processor': return 'Pay to Processor';
          case 'expense': return 'Expense Account (Debit)';
          default: return 'Counter-party';
        }
      case 'Receipt':
        switch (counterpartyType) {
          case 'customer': return 'Receive from Customer';
          case 'income': return 'Income Account (Credit)';
          default: return 'Counter-party';
        }
      case 'Contra':
        return 'Transfer to Account (Debit)';
      case 'Journal':
        return 'Counter Account (Debit)';
      default:
        return 'Counter-party';
    }
  };

  const getCounterpartyTypes = () => {
    if (entryType === 'Payment') return [
      { value: 'supplier' as const, label: 'Supplier' },
      { value: 'processor' as const, label: 'Processor' },
      { value: 'expense' as const, label: 'Expense' },
    ];
    if (entryType === 'Receipt') return [
      { value: 'customer' as const, label: 'Customer' },
      { value: 'income' as const, label: 'Income' },
    ];
    return [];
  };

  // Derive from/to account IDs from the user-friendly selections
  const deriveAccountIds = (): { fromAccountId: string; toAccountId: string } | null => {
    if (!cashAccountId || !counterpartyId || amount === '' || Number(amount) <= 0) return null;

    // Resolve the counterparty account ID
    const options = counterpartyOptions();
    const selected = options.find(o => o.id === counterpartyId);
    if (!selected || !selected.accountId) return null;

    const counterpartyAccId = selected.accountId;

    switch (entryType) {
      case 'Payment':
        return { fromAccountId: cashAccountId, toAccountId: counterpartyAccId };
      case 'Receipt':
        return { fromAccountId: counterpartyAccId, toAccountId: cashAccountId };
      case 'Contra':
        return { fromAccountId: cashAccountId, toAccountId: counterpartyAccId };
      case 'Journal':
        return { fromAccountId: cashAccountId, toAccountId: counterpartyAccId };
      default:
        return null;
    }
  };

  const derived = deriveAccountIds();
  const isValid = derived !== null && narration && cashAccountId !== counterpartyId;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !derived) return;

    const { fromAccountId, toAccountId } = derived;
    const numAmount = Number(amount);
    const fromAcc = accounts.find(a => a.id === fromAccountId);
    const toAcc = accounts.find(a => a.id === toAccountId);

    // Validation for entity balances
    if (entryType === 'Payment' && toAcc?.linkedEntityId) {
       const sup = suppliers.find(s => s.id === toAcc.linkedEntityId);
       if (sup && numAmount > sup.balancePayable) {
           alert(`Cannot pay supplier beyond outstanding balance of PKR ${sup.balancePayable.toLocaleString()}.`);
           return;
       }
       const proc = processors.find(p => p.id === toAcc.linkedEntityId);
       if (proc && numAmount > proc.balancePayable) {
           alert(`Cannot pay processor beyond pending amount of PKR ${proc.balancePayable.toLocaleString()}.`);
           return;
       }
    }

    if (entryType === 'Receipt' && fromAcc?.linkedEntityId) {
       const cus = customers.find(c => c.id === fromAcc.linkedEntityId);
       if (cus && numAmount > cus.balanceReceivable) {
           alert(`Cannot receive beyond customer outstanding balance of PKR ${cus.balanceReceivable.toLocaleString()}.`);
           return;
       }
    }

    const jes = [
      {
        accountId: fromAccountId, // Credit
        debit: 0,
        credit: numAmount,
        description: narration
      },
      {
        accountId: toAccountId, // Debit
        debit: numAmount,
        credit: 0,
        description: narration
      }
    ];

    let voucherTypeStr = 'Journal Voucher';
    if (entryType === 'Payment') voucherTypeStr = cashAccounts.find(a => a.id === cashAccountId) && (accountSubtypes?.find(s => s.id === accounts.find(a2 => a2.id === cashAccountId)?.subtypeId)?.name === 'Cash') ? 'Cash Payment' : 'Bank Payment';
    else if (entryType === 'Receipt') voucherTypeStr = cashAccounts.find(a => a.id === cashAccountId) && (accountSubtypes?.find(s => s.id === accounts.find(a2 => a2.id === cashAccountId)?.subtypeId)?.name === 'Cash') ? 'Cash Receipt' : 'Bank Receipt';
    else if (entryType === 'Contra') voucherTypeStr = 'Contra Voucher';

    ErrorManagement.safeExecuteSync(() => {
      AccountingService.createVoucher({
        date,
        type: voucherTypeStr as any,
        referenceNo,
        sourceModule: 'Cashbook',
        narration
      }, jes);

      // Update entity balances if applicable
      if (entryType === 'Payment' && toAcc?.linkedEntityId) {
         const sup = suppliers.find(s => s.id === toAcc.linkedEntityId);
         if (sup) {
             useERPStore.getState().updateSupplier(sup.id, { balancePayable: sup.balancePayable - numAmount });
         }
         const proc = processors.find(p => p.id === toAcc.linkedEntityId);
         if (proc) {
             useERPStore.getState().updateProcessor(proc.id, { balancePayable: proc.balancePayable - numAmount });
         }
      }
      if (entryType === 'Receipt' && fromAcc?.linkedEntityId) {
         const cus = customers.find(c => c.id === fromAcc.linkedEntityId);
         if (cus) {
             useERPStore.getState().updateCustomer(cus.id, { balanceReceivable: cus.balanceReceivable - numAmount });
         }
      }

      alert("Cashbook Entry Saved!");
      setAmount('');
      setNarration('');
      setReferenceNo('');
      setCashAccountId('');
      setCounterpartyId('');
    }, 'Cashbook Quick Entry');
  };

  const cashAccountOptions = cashAccounts.map(a => ({
    id: a.id,
    label: `${a.code} - ${a.name}`,
    secondaryLabel: `Balance: ${a.openingBalanceType === 'Debit' ? 'Dr' : 'Cr'} ${a.openingBalance.toLocaleString()}`
  }));

  const cpOptions = counterpartyOptions().map(o => ({
    id: o.id,
    label: o.label,
    secondaryLabel: (o as any).secondaryLabel || ''
  }));

  const cashAccName = cashAccounts.find(a => a.id === cashAccountId)?.name || 'Cash/Bank';
  const getNarrationPlaceholder = () => {
    if (entryType === 'Payment') return `e.g. Payment to supplier, expense payment via ${cashAccName}`;
    if (entryType === 'Receipt') return `e.g. Receipt from customer, income received via ${cashAccName}`;
    return `Description of the transaction`;
  };

  return (
    <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-6 border-b border-border/50">
        <h3 className="text-lg font-bold text-foreground">New Cashbook Entry</h3>
        <p className="text-sm text-muted-foreground mt-1">Record payments, receipts, contra transfers, or journal entries</p>
      </div>

      <form onSubmit={handleSave} className="p-6">
        {/* Entry Type */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-muted-foreground mb-3">Transaction Type</label>
          <div className="grid grid-cols-4 gap-3">
            {(['Payment', 'Receipt', 'Contra', 'Journal'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setEntryType(type)}
                className={cn(
                  "px-4 py-3 text-sm font-semibold rounded-xl border-2 transition-all text-center",
                  entryType === type 
                    ? type === 'Payment' ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800' :
                      type === 'Receipt' ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' :
                      type === 'Contra' ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800' :
                      'bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800'
                    : "bg-background border-border text-muted-foreground hover:border-muted-foreground/30"
                )}
              >
                <div className="text-lg mb-0.5">
                  {type === 'Payment' ? '💳' : type === 'Receipt' ? '💰' : type === 'Contra' ? '🔄' : '📝'}
                </div>
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-muted/10 p-6 rounded-xl border border-border/50 space-y-6">
          <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-2">
            <h3 className="font-semibold text-foreground">Transaction Details</h3>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setAddAccountTypeFilter(undefined); setIsAddAccountModalOpen(true); }} className="text-xs flex items-center gap-1 text-primary hover:text-primary/80 font-medium bg-primary/10 px-2 py-1 rounded"><Plus className="h-3 w-3"/> Account</button>
              <button type="button" onClick={() => { setAddAccountTypeFilter({type: 'Assets', subtypeName: 'Bank'}); setIsAddAccountModalOpen(true); }} className="text-xs flex items-center gap-1 text-primary hover:text-primary/80 font-medium bg-primary/10 px-2 py-1 rounded"><Plus className="h-3 w-3"/> Bank</button>
              <button type="button" onClick={() => { setAddAccountTypeFilter({type: 'Assets', subtypeName: 'Cash'}); setIsAddAccountModalOpen(true); }} className="text-xs flex items-center gap-1 text-primary hover:text-primary/80 font-medium bg-primary/10 px-2 py-1 rounded"><Plus className="h-3 w-3"/> Cash</button>
            </div>
          </div>

          {/* Cash/Bank Account */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              {entryType === 'Payment' ? 'Cash/Bank Account (Paying from)' :
               entryType === 'Receipt' ? 'Cash/Bank Account (Receiving into)' :
               entryType === 'Contra' ? 'Cash/Bank Account (Transfer from)' :
               'Cash/Bank Account (Credit side)'}
            </label>
            <SearchableSelect
              options={cashAccountOptions}
              value={cashAccountId}
              onChange={setCashAccountId}
              placeholder="Select cash or bank account..."
              required
            />
          </div>

          {/* Counter-party Type selector (only for Payment/Receipt) */}
          {getCounterpartyTypes().length > 0 && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                {entryType === 'Payment' ? 'Pay To' : 'Receive From'}
              </label>
              <div className="flex gap-2 mb-3">
                {getCounterpartyTypes().map(ct => (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => { setCounterpartyType(ct.value); setCounterpartyId(''); }}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-lg border transition-all",
                      counterpartyType === ct.value
                        ? "bg-primary/10 text-primary border-primary"
                        : "bg-background border-border text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Counter-party selector */}
          {(counterpartyType !== 'cash' || entryType === 'Contra') && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                {getCounterpartyLabel()}
                {entryType === 'Payment' && counterpartyType === 'expense' && ' (Debit)'}
                {entryType === 'Receipt' && counterpartyType === 'income' && ' (Credit)'}
              </label>
              <SearchableSelect
                options={cpOptions}
                value={counterpartyId}
                onChange={setCounterpartyId}
                placeholder={entryType === 'Contra' ? 'Select destination account...' : `Select ${counterpartyType}...`}
                required
              />
            </div>
          )}

          {/* Amount & Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">PKR</span>
                <input 
                  type="number" 
                  required 
                  min="0.01" 
                  step="0.01" 
                  value={amount} 
                  onChange={e => setAmount(e.target.value ? Number(e.target.value) : '')} 
                  className="w-full rounded-xl border border-border pl-14 pr-4 py-2.5 text-sm focus:border-primary bg-background text-foreground" 
                  placeholder="0.00" 
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Date</label>
              <input 
                type="date" 
                required 
                value={date} 
                onChange={e => setDate(e.target.value)} 
                className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary bg-background text-foreground" 
              />
            </div>
          </div>

          {/* Reference & Narration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Reference No (Optional)</label>
              <input 
                type="text" 
                value={referenceNo} 
                onChange={e => setReferenceNo(e.target.value)} 
                className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary bg-background text-foreground" 
                placeholder={entryType === 'Payment' ? 'e.g. Check #, Bank Ref' : 'e.g. Invoice #, Receipt #'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Narration</label>
              <textarea 
                required 
                value={narration} 
                onChange={e => setNarration(e.target.value)} 
                className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary bg-background text-foreground" 
                placeholder={getNarrationPlaceholder()}
                rows={2} 
              />
            </div>
          </div>
        </div>

        {/* Double-entry preview */}
        {derived && (
          <div className="mt-6 p-4 bg-muted/20 rounded-xl border border-border/50">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Double-Entry Preview</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-400 shrink-0" />
                <span className="text-muted-foreground">Credit:</span>
                <span className="font-medium text-foreground">{accounts.find(a => a.id === derived.fromAccountId)?.name}</span>
                <span className="text-muted-foreground">PKR {Number(amount).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-muted-foreground">Debit:</span>
                <span className="font-medium text-foreground">{accounts.find(a => a.id === derived.toAccountId)?.name}</span>
                <span className="text-muted-foreground">PKR {Number(amount).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <button 
            type="submit" 
            disabled={!isValid} 
            className="px-8 py-3 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            Save Entry
          </button>
        </div>
      </form>

      <AddAccountModal 
        isOpen={isAddAccountModalOpen} 
        onClose={() => setIsAddAccountModalOpen(false)} 
        onSave={() => setIsAddAccountModalOpen(false)}
        quickAddType={addAccountTypeFilter}
      />
    </div>
  );
}
