import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { useERPStore } from "../store/useERPStore";
import { cn } from "../lib/utils";
import { SearchableSelect } from "../components/SearchableSelect";
import { Calculator, Plus, Search, Folder, FolderOpen, Edit, Trash2, Printer, CalendarRange } from "lucide-react";
import { Account, AccountType, JournalEntry, Voucher } from "../types/erp";
import { AddAccountModal } from "../components/AddAccountModal";
import { generateLedgerStatementPDF } from "../lib/documentGenerators";
import { getCashBankAccounts } from "../lib/accounting/accountClassification";
import { AccountingEngine } from "../lib/accounting/AccountingEngine";

/**
 * Shared report helper (spec §14, §24): returns only journal entries whose
 * voucher is Posted and falls inside the optional date window. Cancelled and
 * deleted vouchers never affect any report.
 */
function activeEntries(
  journalEntries: JournalEntry[],
  vouchers: Voucher[],
  dateFrom?: string,
  dateTo?: string
): JournalEntry[] {
  const active = vouchers.filter(v => v.status === 'Posted');
  const dates = new Map(active.map(v => [v.id, v.date]));
  return journalEntries.filter(je => {
    const d = dates.get(je.voucherId);
    if (!d) return false;
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });
}

export function Accounting() {
  const location = useLocation();
  const pathParts = location.pathname.split('/');
  const activeTab = pathParts[pathParts.length - 1] || 'chart-of-accounts';

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)]">
      <div className="bg-card rounded-xl border border-border/50 shadow-sm flex-1 flex flex-col overflow-hidden">
        {activeTab === 'chart-of-accounts' && <ChartOfAccounts />}
        {activeTab === 'general-ledger' && <GeneralLedger />}
        {activeTab === 'trial-balance' && <TrialBalance />}
        {activeTab === 'profit-loss' && <ProfitAndLoss />}
        {activeTab === 'balance-sheet' && <BalanceSheet />}
        {activeTab === 'cash-flow' && <CashFlow />}
      </div>
    </div>
  );
}



function GeneralLedger() {
  const { accounts, vouchers, journalEntries, suppliers, customers, processors, accountSubtypes } = useERPStore();
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const account = accounts.find(a => a.id === selectedAccountId);

  // Single engine source for ledger rows + running balance (spec §24, §14)
  const { rows: processedEntries, openingBalance } = AccountingEngine.getLedger(
    selectedAccountId,
    accounts,
    journalEntries,
    vouchers,
    dateFrom || undefined,
    dateTo || undefined
  );

  const handlePrintLedger = () => {
    if (!account) return;
    const transactions = processedEntries.map(e => ({
      date: new Date(e.voucher?.date || new Date().toISOString()).toLocaleDateString(),
      referenceNo: e.voucher?.voucherNo || '-',
      description: e.narration || '-',
      debit: e.debit,
      credit: e.credit,
      balance: e.runningBalance
    }));
    generateLedgerStatementPDF(account.name, 'Account', transactions, processedEntries[processedEntries.length - 1]?.runningBalance ?? openingBalance);
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">General Ledger</h2>
          <p className="text-sm text-muted-foreground">View detailed account transactions</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button 
            onClick={handlePrintLedger}
            disabled={!account}
            className="flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg hover:bg-secondary/80 transition-colors text-sm font-medium whitespace-nowrap disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print Ledger
          </button>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            title="Date From"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            title="Date To"
          />
          <div className="w-full sm:w-80">
            <SearchableSelect 
              options={accounts.map(a => {
              let relatedParty = '';
              if (a.linkedEntityId) {
                const sup = suppliers?.find(s => s.id === a.linkedEntityId);
                const cus = customers?.find(c => c.id === a.linkedEntityId);
                const proc = processors?.find(p => p.id === a.linkedEntityId);
                if (sup) relatedParty = `(Supplier: ${sup.name})`;
                else if (cus) relatedParty = `(Customer: ${cus.name})`;
                else if (proc) relatedParty = `(Processor: ${proc.name})`;
              }
              const subtype = accountSubtypes?.find(s => s.id === a.subtypeId)?.name || '';
              return {
                id: a.id,
                label: `${a.code} - ${a.name}`,
                secondaryLabel: `${a.type} ${subtype ? `• ${subtype}` : ''} ${relatedParty}`.trim(),
                searchValue: `${a.type} ${subtype} ${relatedParty}`
              };
            })}
              value={selectedAccountId}
              onChange={val => setSelectedAccountId(val)}
              placeholder="Search account..."
            />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voucher</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Narration</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Debit</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Credit</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {account && (
              <tr className="bg-muted/10">
                <td className="py-3 px-6 text-sm text-foreground" colSpan={3}>Opening Balance</td>
                <td className="py-3 px-6 text-sm text-right text-foreground">{openingBalance >= 0 ? openingBalance.toLocaleString() : ''}</td>
                <td className="py-3 px-6 text-sm text-right text-foreground">{openingBalance < 0 ? Math.abs(openingBalance).toLocaleString() : ''}</td>
                <td className="py-3 px-6 text-sm text-right font-medium text-foreground">{Math.abs(openingBalance).toLocaleString()} {openingBalance >= 0 ? (account.type === 'Assets' || account.type === 'Expenses' || account.type === 'Cost of Goods Sold' || account.type === 'Other Expenses' ? 'Dr' : 'Cr') : (account.type === 'Assets' || account.type === 'Expenses' || account.type === 'Cost of Goods Sold' || account.type === 'Other Expenses' ? 'Cr' : 'Dr')}</td>
              </tr>
            )}
            {processedEntries.map((entry) => (
              <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                <td className="py-3 px-6 text-sm text-foreground whitespace-nowrap">{new Date(entry.voucher?.date || new Date().toISOString()).toLocaleDateString()}</td>
                <td className="py-3 px-6 text-sm font-medium text-foreground">{entry.voucher?.voucherNo}</td>
                <td className="py-3 px-6 text-sm text-muted-foreground">{entry.voucher?.narration}</td>
                <td className="py-3 px-6 text-sm text-right text-foreground">{entry.debit > 0 ? entry.debit.toLocaleString() : ''}</td>
                <td className="py-3 px-6 text-sm text-right text-foreground">{entry.credit > 0 ? entry.credit.toLocaleString() : ''}</td>
                <td className="py-3 px-6 text-sm text-right font-medium text-foreground">{Math.abs(entry.runningBalance).toLocaleString()} {entry.runningBalance >= 0 ? (account?.type === 'Assets' || account?.type === 'Expenses' || account?.type === 'Cost of Goods Sold' || account?.type === 'Other Expenses' ? 'Dr' : 'Cr') : (account?.type === 'Assets' || account?.type === 'Expenses' || account?.type === 'Cost of Goods Sold' || account?.type === 'Other Expenses' ? 'Cr' : 'Dr')}</td>
              </tr>
            ))}
            {processedEntries.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                  No transactions found for this account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BalanceSheet() {
  const { accounts, journalEntries, vouchers } = useERPStore();
  const [asOfDate, setAsOfDate] = useState('');

  const active = activeEntries(journalEntries, vouchers, undefined, asOfDate || undefined);

  // Calculate balances
  const balances = accounts.map(account => {
    let totalDebit = account.openingBalanceType === 'Debit' ? account.openingBalance : 0;
    let totalCredit = account.openingBalanceType === 'Credit' ? account.openingBalance : 0;
    
    const entries = active.filter(je => je.accountId === account.id);
    entries.forEach(entry => {
      totalDebit += entry.debit;
      totalCredit += entry.credit;
    });
    
    let balance = 0;
    if (account.type === 'Assets') {
      balance = totalDebit - totalCredit;
    } else if (account.type === 'Liabilities' || account.type === 'Equity') {
      balance = totalCredit - totalDebit;
    } else if (account.type === 'Revenue' || account.type === 'Other Income') {
      balance = totalCredit - totalDebit;
    } else if (account.type === 'Cost of Goods Sold' || account.type === 'Expenses' || account.type === 'Other Expenses') {
      balance = totalDebit - totalCredit;
    }
    
    return { ...account, balance };
  });

  const assetAccounts = balances.filter(a => a.type === 'Assets' && a.balance !== 0);
  const liabilityAccounts = balances.filter(a => a.type === 'Liabilities' && a.balance !== 0);
  const equityAccounts = balances.filter(a => a.type === 'Equity' && a.balance !== 0);
  
  // Calculate retained earnings (net profit)
  const revenueTotal = balances.filter(a => a.type === 'Revenue' || a.type === 'Other Income').reduce((sum, a) => sum + a.balance, 0);
  const expenseTotal = balances.filter(a => a.type === 'Cost of Goods Sold' || a.type === 'Expenses' || a.type === 'Other Expenses').reduce((sum, a) => sum + a.balance, 0);
  const netProfit = revenueTotal - expenseTotal;

  const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalEquity = equityAccounts.reduce((sum, a) => sum + a.balance, 0) + netProfit;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Balance Sheet</h2>
          <p className="text-sm text-muted-foreground">Statement of financial position</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-muted/20 border border-border/50 rounded-lg px-3 py-2">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={asOfDate}
              onChange={e => setAsOfDate(e.target.value)}
              className="bg-transparent text-sm text-foreground focus:outline-none"
              title="As of date"
            />
          </div>
          <button className="flex items-center gap-2 bg-muted text-foreground px-4 py-2 rounded-lg hover:bg-muted/80 transition-colors text-sm font-medium whitespace-nowrap border border-border/50">
            Export
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6 flex justify-center">
        <div className="w-full max-w-4xl bg-card border border-border/50 rounded-xl p-8 shadow-sm my-auto">
          <div className="text-center mb-8 pb-6 border-b border-border/50">
            <h2 className="text-2xl font-bold text-foreground">Balance Sheet</h2>
            <p className="text-muted-foreground mt-1">As of {asOfDate ? new Date(asOfDate).toLocaleDateString() : new Date().toLocaleDateString()}</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Assets */}
            <div>
              <h3 className="text-lg font-bold text-foreground border-b-2 border-primary pb-2 mb-4">Assets</h3>
              <div className="space-y-2">
                {assetAccounts.map(account => (
                  <div key={account.id} className="flex justify-between items-center text-sm">
                    <span className="text-foreground">{account.name}</span>
                    <span className="text-foreground font-medium">{account.balance.toLocaleString()}</span>
                  </div>
                ))}
                {assetAccounts.length === 0 && <p className="text-sm text-muted-foreground italic">No assets found.</p>}
              </div>
              <div className="flex justify-between items-center text-base font-bold bg-muted/30 p-3 rounded-lg mt-6 border border-border/50">
                <span className="text-foreground">Total Assets</span>
                <span className="text-foreground">PKR {totalAssets.toLocaleString()}</span>
              </div>
            </div>

            {/* Liabilities & Equity */}
            <div>
              <h3 className="text-lg font-bold text-foreground border-b-2 border-rose-500 pb-2 mb-4">Liabilities</h3>
              <div className="space-y-2 mb-6">
                {liabilityAccounts.map(account => (
                  <div key={account.id} className="flex justify-between items-center text-sm">
                    <span className="text-foreground">{account.name}</span>
                    <span className="text-foreground font-medium">{account.balance.toLocaleString()}</span>
                  </div>
                ))}
                {liabilityAccounts.length === 0 && <p className="text-sm text-muted-foreground italic">No liabilities found.</p>}
              </div>
              
              <h3 className="text-lg font-bold text-foreground border-b-2 border-amber-500 pb-2 mb-4">Equity</h3>
              <div className="space-y-2">
                {equityAccounts.map(account => (
                  <div key={account.id} className="flex justify-between items-center text-sm">
                    <span className="text-foreground">{account.name}</span>
                    <span className="text-foreground font-medium">{account.balance.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-foreground">Retained Earnings (Net Profit)</span>
                  <span className="text-foreground font-medium">{netProfit.toLocaleString()}</span>
                </div>
              </div>
              
              <div className="flex justify-between items-center text-base font-bold bg-muted/30 p-3 rounded-lg mt-6 border border-border/50">
                <span className="text-foreground">Total Liabilities & Equity</span>
                <span className={cn(
                  "text-foreground",
                  totalAssets !== totalLiabilities + totalEquity && "text-destructive"
                )}>
                  PKR {(totalLiabilities + totalEquity).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartOfAccounts() {
  const { accounts, accountSubtypes } = useERPStore();
  const [search, setSearch] = useState("");
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [editAccountId, setEditAccountId] = useState<string | undefined>();
  const [quickAddType, setQuickAddType] = useState<{type: AccountType, subtypeName: string} | undefined>();
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, id: string, no: string}>({isOpen: false, id: "", no: ""});

  const handleDelete = () => {
    const store = useERPStore.getState();
    const hasEntries = store.journalEntries.some(je => je.accountId === deleteModal.id);
    if (hasEntries) {
      alert("Cannot delete this account because it has linked financial transactions.");
      return;
    }
    store.deleteAccount(deleteModal.id);
    setDeleteModal({isOpen: false, id: '', no: ''});
  };

  const types: AccountType[] = ["Assets", "Liabilities", "Equity", "Revenue", "Cost of Goods Sold", "Expenses", "Other Income", "Other Expenses"];

  const filteredAccounts = accounts.filter(a => 
    a.name.toLowerCase().includes(search.toLowerCase()) || 
    a.code.toLowerCase().includes(search.toLowerCase())
  );

  const renderAccount = (account: Account, level: number = 0) => {
    const children = filteredAccounts.filter(a => a.parentId === account.id);
    return (
      <div key={account.id} className="w-full">
        <div className={cn("px-6 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors group", level > 0 && "border-l-2 border-border/50")} style={{ paddingLeft: `${level * 1.5 + 1.5}rem` }}>
          <div className="flex items-center gap-3">
            <span className="w-16 font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{account.code}</span>
            <span className={cn("text-sm text-foreground", level === 0 ? "font-semibold" : "font-medium")}>{account.name}</span>
            {account.isSystem && (
              <span className="text-[10px] uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm font-semibold">System</span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className={cn(
              "px-2 py-0.5 rounded text-xs font-medium",
              account.status === 'Active' ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
            )}>
              {account.status}
            </span>
            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => { setQuickAddType(undefined); setEditAccountId(account.id); setIsAddAccountModalOpen(true); }} className="p-1 hover:bg-muted text-muted-foreground rounded transition-colors"><Edit className="h-4 w-4" /></button>
              {!account.isSystem && (
                <button onClick={() => setDeleteModal({isOpen: true, id: account.id, no: account.code + ' - ' + account.name})} className="p-1 hover:bg-destructive/10 text-destructive rounded transition-colors"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
          </div>
        </div>
        {children.length > 0 && (
          <div className="flex flex-col">
            {children.map(child => renderAccount(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const handleQuickAdd = (type: AccountType, subtypeName: string) => {
    setQuickAddType({ type, subtypeName });
    setEditAccountId(undefined);
    setIsAddAccountModalOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Chart of Accounts</h2>
          <p className="text-sm text-muted-foreground">Manage your master accounts</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 min-w-[200px] max-w-[250px] mr-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>
          <button onClick={() => handleQuickAdd("Assets", "Bank")} className="bg-secondary/50 text-secondary-foreground hover:bg-secondary px-3 py-2 rounded-lg text-xs font-medium transition-colors">
            + Bank
          </button>
          <button onClick={() => handleQuickAdd("Assets", "Cash")} className="bg-secondary/50 text-secondary-foreground hover:bg-secondary px-3 py-2 rounded-lg text-xs font-medium transition-colors">
            + Cash
          </button>
          <button onClick={() => handleQuickAdd("Expenses", "Operating Expenses")} className="bg-secondary/50 text-secondary-foreground hover:bg-secondary px-3 py-2 rounded-lg text-xs font-medium transition-colors">
            + Expense
          </button>
          <button onClick={() => handleQuickAdd("Revenue", "Sales")} className="bg-secondary/50 text-secondary-foreground hover:bg-secondary px-3 py-2 rounded-lg text-xs font-medium transition-colors">
            + Revenue
          </button>
          <button onClick={() => { setQuickAddType(undefined); setEditAccountId(undefined); setIsAddAccountModalOpen(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium whitespace-nowrap ml-1">
            <Plus className="h-4 w-4" />
            Add Account
          </button>
        </div>
      </div>
      
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="space-y-6">
          {types.map(type => {
            const subtypesOfType = accountSubtypes.filter(st => st.type === type);
            const typeAccounts = filteredAccounts.filter(a => a.type === type && !a.parentId); // Only top-level
            
            if (typeAccounts.length === 0 && search !== "") return null;
            if (typeAccounts.length === 0 && search === "") return null; // Optionally hide empty types
            
            return (
              <div key={type} className="border border-border/50 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-muted/30 px-4 py-3 flex items-center gap-2 border-b border-border/50">
                  <FolderOpen className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">{type}</h3>
                  <span className="text-xs bg-background border border-border text-muted-foreground px-2 py-0.5 rounded-full ml-auto">
                    {filteredAccounts.filter(a => a.type === type).length} accounts
                  </span>
                </div>
                
                <div className="divide-y divide-border/50 bg-card">
                  {subtypesOfType.map(subtype => {
                    const subtypeAccounts = typeAccounts.filter(a => a.subtypeId === subtype.id);
                    if (subtypeAccounts.length === 0) return null;
                    
                    return (
                      <div key={subtype.id}>
                        <div className="px-4 py-2.5 flex items-center gap-2 text-sm font-medium text-muted-foreground border-b border-border/50 bg-muted/10">
                          <Folder className="h-4 w-4" />
                          {subtype.name}
                        </div>
                        <div className="divide-y divide-border/50">
                          {subtypeAccounts.map(account => renderAccount(account))}
                        </div>
                      </div>
                    );
                  })}
                  
                  {typeAccounts.filter(a => !subtypesOfType.find(st => st.id === a.subtypeId)).map(account => renderAccount(account))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <AddAccountModal 
        isOpen={isAddAccountModalOpen} 
        onClose={() => { setIsAddAccountModalOpen(false); setEditAccountId(undefined); }} 
        onSave={() => { setIsAddAccountModalOpen(false); setEditAccountId(undefined); }} 
        editAccountId={editAccountId} 
        quickAddType={quickAddType}
      />
      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({isOpen: false, id: '', no: ''})}
        onConfirm={handleDelete}
        title="Delete Account"
        recordNo={deleteModal.no}
        description="Are you sure you want to permanently delete this account?"
      />
    </div>
  );
}

function TrialBalance() {
  const { accounts, journalEntries, vouchers, accountSubtypes } = useERPStore();
  const [asOfDate, setAsOfDate] = useState('');

  // Single engine source (spec §19, §24)
  const tb = AccountingEngine.getTrialBalance(
    accounts, accountSubtypes, journalEntries, vouchers, asOfDate || undefined
  );
  const balances = tb.rows;
  const grandTotalDebit = tb.totalDebit;
  const grandTotalCredit = tb.totalCredit;
  const isBalanced = tb.balanced;

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Trial Balance</h2>
          <p className="text-sm text-muted-foreground">Verify the equality of debits and credits</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-muted/20 border border-border/50 rounded-lg px-3 py-2">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={asOfDate}
              onChange={e => setAsOfDate(e.target.value)}
              className="bg-transparent text-sm text-foreground focus:outline-none"
              title="As of date"
            />
          </div>
          <button className="flex items-center gap-2 bg-muted text-foreground px-4 py-2 rounded-lg hover:bg-muted/80 transition-colors text-sm font-medium whitespace-nowrap border border-border/50">
            Export
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6">
        <div className="border border-border/50 rounded-xl overflow-hidden bg-card">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account Code</th>
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account Name</th>
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Debit Balance</th>
                <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Credit Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {balances.map((row) => (
                <tr key={row.account.id} className="hover:bg-muted/20 transition-colors group">
                  <td className="py-2.5 px-6 text-sm font-mono text-muted-foreground">{row.account.code}</td>
                  <td className="py-2.5 px-6 text-sm font-medium text-foreground">{row.account.name}</td>
                  <td className="py-2.5 px-6 text-sm text-foreground text-right">{row.debit > 0 ? row.debit.toLocaleString() : '-'}</td>
                  <td className="py-2.5 px-6 text-sm text-foreground text-right">{row.credit > 0 ? row.credit.toLocaleString() : '-'}</td>
                </tr>
              ))}
              
              {balances.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground text-sm">
                    No transactions found.
                  </td>
                </tr>
              )}
            </tbody>
            {balances.length > 0 && (
              <tfoot className="bg-muted/30 font-semibold border-t-2 border-border">
                <tr>
                  <td colSpan={2} className="py-4 px-6 text-sm text-right text-foreground">Totals</td>
                  <td className={cn("py-4 px-6 text-sm text-right", isBalanced ? "text-foreground" : "text-rose-500")}>PKR {grandTotalDebit.toLocaleString()}</td>
                  <td className={cn("py-4 px-6 text-sm text-right", isBalanced ? "text-foreground" : "text-rose-500")}>PKR {grandTotalCredit.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        
        {balances.length > 0 && !isBalanced && (
          <div className="mt-4 p-4 bg-destructive/10 border border-rose-500/20 rounded-lg flex items-center justify-between">
            <div className="text-destructive text-sm font-medium flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Trial Balance is not balanced. Difference: PKR {Math.abs(grandTotalDebit - grandTotalCredit).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfitAndLoss() {
  const { accounts, journalEntries, vouchers } = useERPStore();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const active = activeEntries(journalEntries, vouchers, dateFrom || undefined, dateTo || undefined);

  // Calculate balances
  const balances = accounts.map(account => {
    let totalDebit = account.openingBalanceType === 'Debit' ? account.openingBalance : 0;
    let totalCredit = account.openingBalanceType === 'Credit' ? account.openingBalance : 0;
    
    const entries = active.filter(je => je.accountId === account.id);
    entries.forEach(entry => {
      totalDebit += entry.debit;
      totalCredit += entry.credit;
    });
    
    let balance = 0;
    if (account.type === 'Revenue' || account.type === 'Other Income') {
      balance = totalCredit - totalDebit;
    } else if (account.type === 'Cost of Goods Sold' || account.type === 'Expenses' || account.type === 'Other Expenses') {
      balance = totalDebit - totalCredit;
    }
    
    return {
      ...account,
      balance
    };
  }).filter(b => b.balance !== 0);

  const revenueAccounts = balances.filter(a => a.type === 'Revenue' || a.type === 'Other Income');
  const cogsAccounts = balances.filter(a => a.type === 'Cost of Goods Sold');
  const expenseAccounts = balances.filter(a => a.type === 'Expenses' || a.type === 'Other Expenses');

  const totalRevenue = revenueAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalCogs = cogsAccounts.reduce((sum, a) => sum + a.balance, 0);
  const grossProfit = totalRevenue - totalCogs;
  
  const totalExpenses = expenseAccounts.reduce((sum, a) => sum + a.balance, 0);
  const netProfit = grossProfit - totalExpenses;

  const renderSection = (title: string, data: typeof balances, total: number) => (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50 pb-2 mb-3">{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground italic pl-4">No data for this period.</p>
      ) : (
        <div className="space-y-2 pl-4">
          {data.map(account => (
            <div key={account.id} className="flex justify-between items-center text-sm">
              <span className="text-foreground">{account.name}</span>
              <span className="text-foreground font-medium">{account.balance.toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between items-center text-sm font-semibold border-t border-border/50 pt-2 mt-2">
            <span className="text-foreground">Total {title}</span>
            <span className="text-foreground">{total.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Profit & Loss</h2>
          <p className="text-sm text-muted-foreground">Statement of comprehensive income</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            title="Date From"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            title="Date To"
          />
          <button className="flex items-center gap-2 bg-muted text-foreground px-4 py-2 rounded-lg hover:bg-muted/80 transition-colors text-sm font-medium whitespace-nowrap border border-border/50">
            Export
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6 flex justify-center">
        <div className="w-full max-w-3xl bg-card border border-border/50 rounded-xl p-8 shadow-sm my-auto">
          <div className="text-center mb-8 pb-6 border-b border-border/50">
            <h2 className="text-2xl font-bold text-foreground">Profit & Loss Statement</h2>
            <p className="text-muted-foreground mt-1">For the period ending {new Date().toLocaleDateString()}</p>
          </div>
          
          {renderSection("Revenue", revenueAccounts, totalRevenue)}
          {renderSection("Cost of Goods Sold", cogsAccounts, totalCogs)}
          
          <div className="flex justify-between items-center text-base font-bold bg-muted/30 p-3 rounded-lg mb-6 border border-border/50">
            <span className="text-foreground">Gross Profit</span>
            <span className={cn(grossProfit >= 0 ? "text-success" : "text-destructive")}>
              PKR {grossProfit.toLocaleString()}
            </span>
          </div>
          
          {renderSection("Operating Expenses", expenseAccounts, totalExpenses)}
          
          <div className="flex justify-between items-center text-lg font-bold bg-primary/10 border border-primary/20 p-4 rounded-lg mt-8">
            <span className="text-foreground">Net Profit</span>
            <span className={cn(netProfit >= 0 ? "text-success" : "text-destructive")}>
              PKR {netProfit.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CashFlow() {
  const { accounts, journalEntries, vouchers, accountSubtypes } = useERPStore();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const active = activeEntries(journalEntries, vouchers, dateFrom || undefined, dateTo || undefined);

  // Find cash & bank accounts by subtype (spec §25) — never by name
  const cashAccounts = getCashBankAccounts(accounts, accountSubtypes);
  const cashAccountIds = cashAccounts.map(a => a.id);
  
  let openingCash = 0;
  cashAccounts.forEach(a => {
    openingCash += a.openingBalanceType === 'Debit' ? a.openingBalance : -a.openingBalance;
  });

  // Calculate net cash flows
  let operatingCashFlow = 0; // from Revenue, COGS, Expenses
  let investingCashFlow = 0; // from Assets (non-cash)
  let financingCashFlow = 0; // from Liabilities, Equity
  
  // Group by voucher
  const entriesByVoucher = active.reduce((acc, je) => {
    if (!acc[je.voucherId]) acc[je.voucherId] = [];
    acc[je.voucherId].push(je);
    return acc;
  }, {} as Record<string, typeof active>);

  Object.values(entriesByVoucher).forEach(entries => {
    const cashEntries = entries.filter(je => cashAccountIds.includes(je.accountId));
    if (cashEntries.length === 0) return; // No cash involved in this transaction

    // Calculate net cash movement for this voucher
    const netCashChange = cashEntries.reduce((sum, je) => sum + (je.debit - je.credit), 0);
    
    // Now determine the primary category of the other entries in this voucher
    const nonCashEntries = entries.filter(je => !cashAccountIds.includes(je.accountId));
    if (nonCashEntries.length === 0) return;

    // We can distribute the netCashChange proportionally, but for simplicity, we look at the primary account type
    const primaryEntry = nonCashEntries.sort((a, b) => Math.max(b.debit, b.credit) - Math.max(a.debit, a.credit))[0];
    const primaryAccount = accounts.find(a => a.id === primaryEntry.accountId);
    
    if (primaryAccount) {
      if (primaryAccount.type === 'Revenue' || primaryAccount.type === 'Cost of Goods Sold' || primaryAccount.type === 'Expenses' || primaryAccount.type === 'Other Expenses' || primaryAccount.type === 'Other Income') {
        operatingCashFlow += netCashChange;
      } else if (primaryAccount.type === 'Assets') {
        investingCashFlow += netCashChange;
      } else if (primaryAccount.type === 'Liabilities' || primaryAccount.type === 'Equity') {
        financingCashFlow += netCashChange;
      }
    }
  });

  const netIncreaseInCash = operatingCashFlow + investingCashFlow + financingCashFlow;
  const closingCash = openingCash + netIncreaseInCash;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Cash Flow Statement</h2>
          <p className="text-sm text-muted-foreground">Inflows and outflows of cash</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            title="Date From"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            title="Date To"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 flex justify-center">
        <div className="w-full max-w-3xl bg-card border border-border/50 rounded-xl p-8 shadow-sm my-auto">
          <div className="text-center mb-8 pb-6 border-b border-border/50">
            <h2 className="text-2xl font-bold text-foreground">Statement of Cash Flows</h2>
            <p className="text-muted-foreground mt-1">For the period ending {new Date().toLocaleDateString()}</p>
          </div>
          
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50 pb-2 mb-3">Operating Activities</h3>
            <div className="flex justify-between items-center text-sm pl-4 mb-2">
              <span className="text-foreground">Net Cash from Operating</span>
              <span className="text-foreground font-medium">{operatingCashFlow.toLocaleString()}</span>
            </div>
          </div>
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50 pb-2 mb-3">Investing Activities</h3>
            <div className="flex justify-between items-center text-sm pl-4 mb-2">
              <span className="text-foreground">Net Cash from Investing</span>
              <span className="text-foreground font-medium">{investingCashFlow.toLocaleString()}</span>
            </div>
          </div>
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50 pb-2 mb-3">Financing Activities</h3>
            <div className="flex justify-between items-center text-sm pl-4 mb-2">
              <span className="text-foreground">Net Cash from Financing</span>
              <span className="text-foreground font-medium">{financingCashFlow.toLocaleString()}</span>
            </div>
          </div>

          <div className="flex justify-between items-center text-base font-bold bg-muted/30 p-3 rounded-lg mb-6 border border-border/50">
            <span className="text-foreground">Net Increase (Decrease) in Cash</span>
            <span className={cn(netIncreaseInCash >= 0 ? "text-success" : "text-destructive")}>
              PKR {netIncreaseInCash.toLocaleString()}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm pl-4 mb-2">
            <span className="text-foreground">Opening Cash Balance</span>
            <span className="text-foreground font-medium">{openingCash.toLocaleString()}</span>
          </div>
          
          <div className="flex justify-between items-center text-lg font-bold bg-primary/10 border border-primary/20 p-4 rounded-lg mt-4">
            <span className="text-foreground">Closing Cash Balance</span>
            <span className="text-foreground">PKR {closingCash.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}


