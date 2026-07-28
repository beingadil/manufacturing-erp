import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { useERPStore } from "../store/useERPStore";
import { cn } from "../lib/utils";
import { SearchableSelect } from "../components/SearchableSelect";
import { Calculator, BookText, Receipt, Landmark, Wallet, Plus, Search, Filter, Database, Folder, FolderOpen, Eye, Edit, Trash2, Printer } from "lucide-react";
import { Account, AccountSubtype, AccountType, Voucher, JournalEntry } from "../types/erp";
import { CreateVoucherModal } from "../components/CreateVoucherModal";
import { CashbookEntryModal } from "../components/CashbookEntryModal";
import { AddAccountModal } from "../components/AddAccountModal";
import { Cashbook } from "../components/Cashbook";
import { OpeningBalance } from "./finance/OpeningBalance";
import { generateVoucherPDF, generateLedgerStatementPDF } from "../lib/documentGenerators";

export function Accounting() {
  const location = useLocation();
  const pathParts = location.pathname.split('/');
  const activeTab = pathParts[pathParts.length - 1] || 'chart-of-accounts';

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)]">
      <div className="bg-card rounded-xl border border-border/50 shadow-sm flex-1 flex flex-col overflow-hidden">
        {activeTab === 'chart-of-accounts' && <ChartOfAccounts />}
        {activeTab === 'cashbook' && <Cashbook />}
        {activeTab === 'journal-vouchers' && <JournalVouchers />}
        {activeTab === 'opening-balance' && <OpeningBalance />}
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
  const [dateRange, setDateRange] = useState("this-month");

  const account = accounts.find(a => a.id === selectedAccountId);
  
  const entries = journalEntries
    .filter(je => je.accountId === selectedAccountId)
    .map(je => {
      const voucher = vouchers.find(v => v.id === je.voucherId);
      return {
        ...je,
        voucher,
        date: voucher?.date || new Date().toISOString()
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let runningBalance = account ? (account.openingBalanceType === 'Debit' ? account.openingBalance : -account.openingBalance) : 0;
  if (account && (account.type === 'Liabilities' || account.type === 'Equity' || account.type === 'Revenue' || account.type === 'Other Income')) {
      runningBalance = account.openingBalanceType === 'Credit' ? account.openingBalance : -account.openingBalance;
  }

  const processedEntries = entries.map(entry => {
    let increase = 0;
    if (account && (account.type === 'Assets' || account.type === 'Expenses' || account.type === 'Cost of Goods Sold' || account.type === 'Other Expenses')) {
       runningBalance += entry.debit - entry.credit;
    } else {
       runningBalance += entry.credit - entry.debit;
    }
    return { ...entry, runningBalance };
  });

  const handlePrintLedger = () => {
    if (!account) return;
    const transactions = processedEntries.map(e => ({
      date: new Date(e.date).toLocaleDateString(),
      referenceNo: e.voucher?.voucherNo || '-',
      description: e.narration || '-',
      debit: e.debit,
      credit: e.credit,
      balance: e.runningBalance
    }));
    generateLedgerStatementPDF(account.name, 'Account', transactions, runningBalance);
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
                <td className="py-3 px-6 text-sm text-right text-foreground">{account.openingBalanceType === 'Debit' ? account.openingBalance.toLocaleString() : ''}</td>
                <td className="py-3 px-6 text-sm text-right text-foreground">{account.openingBalanceType === 'Credit' ? account.openingBalance.toLocaleString() : ''}</td>
                <td className="py-3 px-6 text-sm text-right font-medium text-foreground">{account.openingBalance.toLocaleString()} {account.openingBalanceType === 'Debit' ? 'Dr' : 'Cr'}</td>
              </tr>
            )}
            {processedEntries.map((entry) => (
              <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                <td className="py-3 px-6 text-sm text-foreground whitespace-nowrap">{new Date(entry.date).toLocaleDateString()}</td>
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
  const { accounts, journalEntries } = useERPStore();
  
  // Calculate balances
  const balances = accounts.map(account => {
    let totalDebit = account.openingBalanceType === 'Debit' ? account.openingBalance : 0;
    let totalCredit = account.openingBalanceType === 'Credit' ? account.openingBalance : 0;
    
    const entries = journalEntries.filter(je => je.accountId === account.id);
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
          <button className="flex items-center gap-2 bg-muted text-foreground px-4 py-2 rounded-lg hover:bg-muted/80 transition-colors text-sm font-medium whitespace-nowrap border border-border/50">
            Export
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6 flex justify-center">
        <div className="w-full max-w-4xl bg-card border border-border/50 rounded-xl p-8 shadow-sm my-auto">
          <div className="text-center mb-8 pb-6 border-b border-border/50">
            <h2 className="text-2xl font-bold text-foreground">Balance Sheet</h2>
            <p className="text-muted-foreground mt-1">As of {new Date().toLocaleDateString()}</p>
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

function JournalVouchers() {
  const { vouchers, journalEntries, accounts } = useERPStore();
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editVoucherId, setEditVoucherId] = useState<string | undefined>();

  const filteredVouchers = vouchers.filter(v => 
    v.voucherNo.toLowerCase().includes(search.toLowerCase()) || 
    v.narration.toLowerCase().includes(search.toLowerCase()) ||
    v.referenceNo?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Vouchers</h2>
          <p className="text-sm text-muted-foreground">Manage journal and transaction vouchers</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search vouchers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium whitespace-nowrap">
            <Plus className="h-4 w-4" />
            Create JV
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voucher No</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {filteredVouchers.map((voucher) => (
              <React.Fragment key={voucher.id}>
                <tr className="hover:bg-muted/20 transition-colors group">
                  <td className="py-3 px-6 text-sm text-foreground whitespace-nowrap">{new Date(voucher.date).toLocaleDateString()}</td>
                  <td className="py-3 px-6 text-sm font-medium text-foreground">{voucher.voucherNo}</td>
                  <td className="py-3 px-6 text-sm text-muted-foreground">{voucher.type}</td>
                  <td className="py-3 px-6 text-sm text-muted-foreground">{voucher.referenceNo || '-'}</td>
                  <td className="py-3 px-6 text-sm font-medium text-foreground">PKR {voucher.totalDebit.toLocaleString()}</td>
                  <td className="py-3 px-6">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                      voucher.status === 'Posted' ? "bg-success/10 text-success" :
                      voucher.status === 'Draft' ? "bg-warning/10 text-warning" :
                      "bg-destructive/10 text-destructive"
                    )}>
                      {voucher.status}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-right space-x-2">
                    <button 
                      className="text-muted-foreground hover:text-primary transition-colors" 
                      title="Print Voucher"
                      onClick={() => generateVoucherPDF(voucher, journalEntries.filter(je => je.voucherId === voucher.id), accounts, [])}
                    >
                      <Printer className="h-4 w-4 inline" />
                    </button>
                    <button className="text-muted-foreground hover:text-primary transition-colors" title="View details">
                      <Eye className="h-4 w-4 inline" />
                    </button>
                    <button 
                      className="text-muted-foreground hover:text-primary transition-colors"
                      title="Edit voucher"
                      onClick={() => setEditVoucherId(voucher.id)}
                    >
                      <Edit className="h-4 w-4 inline" />
                    </button>
                  </td>
                </tr>
                {/* Embedded Journal Entries (Simple View) */}
                <tr className="bg-muted/5 border-b border-border/50">
                  <td colSpan={7} className="px-6 py-2 pb-4">
                    <div className="pl-6 border-l-2 border-primary/20">
                      <p className="text-xs text-muted-foreground italic mb-2">{voucher.narration}</p>
                      <table className="w-full max-w-2xl text-xs text-left">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="font-medium pb-1 w-1/2">Account</th>
                            <th className="font-medium pb-1 text-right w-1/4">Debit</th>
                            <th className="font-medium pb-1 text-right w-1/4">Credit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                          {journalEntries.filter(je => je.voucherId === voucher.id).map((entry) => {
                            const account = accounts.find(a => a.id === entry.accountId);
                            return (
                              <tr key={entry.id}>
                                <td className="py-1 text-foreground">{account?.name || 'Unknown Account'} {account && <span className="text-muted-foreground opacity-70">({account.code})</span>}</td>
                                <td className="py-1 text-right text-foreground">{entry.debit > 0 ? entry.debit.toLocaleString() : ''}</td>
                                <td className="py-1 text-right text-foreground">{entry.credit > 0 ? entry.credit.toLocaleString() : ''}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              </React.Fragment>
            ))}
            
            {filteredVouchers.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">
                  No vouchers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <CreateVoucherModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={() => setIsModalOpen(false)}
      />

      {editVoucherId && (
        <CashbookEntryModal 
          isOpen={true}
          onClose={() => setEditVoucherId(undefined)}
          onSave={() => setEditVoucherId(undefined)}
          editVoucherId={editVoucherId}
        />
      )}
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
  const { accounts, journalEntries } = useERPStore();
  
  // Calculate balances
  const balances = accounts.map(account => {
    let totalDebit = account.openingBalanceType === 'Debit' ? account.openingBalance : 0;
    let totalCredit = account.openingBalanceType === 'Credit' ? account.openingBalance : 0;
    
    const entries = journalEntries.filter(je => je.accountId === account.id);
    entries.forEach(entry => {
      totalDebit += entry.debit;
      totalCredit += entry.credit;
    });
    
    // Net balance
    let balance = 0;
    let balanceType = 'Debit';
    
    if (account.type === 'Assets' || account.type === 'Expenses' || account.type === 'Cost of Goods Sold') {
      balance = totalDebit - totalCredit;
      balanceType = balance >= 0 ? 'Debit' : 'Credit';
      balance = Math.abs(balance);
    } else {
      balance = totalCredit - totalDebit;
      balanceType = balance >= 0 ? 'Credit' : 'Debit';
      balance = Math.abs(balance);
    }
    
    return {
      ...account,
      totalDebit,
      totalCredit,
      balance,
      balanceType
    };
  }).filter(b => b.totalDebit > 0 || b.totalCredit > 0 || b.balance > 0);

  const grandTotalDebit = balances.reduce((sum, b) => sum + (b.balanceType === 'Debit' ? b.balance : 0), 0);
  const grandTotalCredit = balances.reduce((sum, b) => sum + (b.balanceType === 'Credit' ? b.balance : 0), 0);
  
  const isBalanced = grandTotalDebit === grandTotalCredit;

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Trial Balance</h2>
          <p className="text-sm text-muted-foreground">Verify the equality of debits and credits</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
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
              {balances.map((account) => (
                <tr key={account.id} className="hover:bg-muted/20 transition-colors group">
                  <td className="py-2.5 px-6 text-sm font-mono text-muted-foreground">{account.code}</td>
                  <td className="py-2.5 px-6 text-sm font-medium text-foreground">{account.name}</td>
                  <td className="py-2.5 px-6 text-sm text-foreground text-right">{account.balanceType === 'Debit' && account.balance > 0 ? account.balance.toLocaleString() : '-'}</td>
                  <td className="py-2.5 px-6 text-sm text-foreground text-right">{account.balanceType === 'Credit' && account.balance > 0 ? account.balance.toLocaleString() : '-'}</td>
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
  const { accounts, journalEntries } = useERPStore();
  
  // Calculate balances
  const balances = accounts.map(account => {
    let totalDebit = account.openingBalanceType === 'Debit' ? account.openingBalance : 0;
    let totalCredit = account.openingBalanceType === 'Credit' ? account.openingBalance : 0;
    
    const entries = journalEntries.filter(je => je.accountId === account.id);
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
  const { accounts, journalEntries } = useERPStore();
  
  // Find cash & bank accounts
  const cashAccounts = accounts.filter(a => a.subtypeId === accounts.find(sub => sub.name === 'Cash')?.id || a.subtypeId === accounts.find(sub => sub.name === 'Bank')?.id || a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('bank'));
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
  const entriesByVoucher = journalEntries.reduce((acc, je) => {
    if (!acc[je.voucherId]) acc[je.voucherId] = [];
    acc[je.voucherId].push(je);
    return acc;
  }, {} as Record<string, typeof journalEntries>);

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

function SystemIntegrity() {
  const { vouchers, journalEntries, accounts } = useERPStore();

  const issues: { type: 'error' | 'warning', message: string, detail?: string }[] = [];

  // Check 1: Vouchers total debit vs credit
  vouchers.forEach(v => {
    if (Math.abs(v.totalDebit - v.totalCredit) > 0.01) {
      issues.push({ type: 'error', message: `Voucher ${v.voucherNo} is out of balance.`, detail: `Debit: ${v.totalDebit}, Credit: ${v.totalCredit}` });
    }
  });

  // Check 2: Sum of journal entries per voucher matches voucher totals
  const entriesByVoucher = journalEntries.reduce((acc, je) => {
    if (!acc[je.voucherId]) acc[je.voucherId] = [];
    acc[je.voucherId].push(je);
    return acc;
  }, {} as Record<string, typeof journalEntries>);

  vouchers.forEach(v => {
    const entries = entriesByVoucher[v.id] || [];
    const sumDebit = entries.reduce((s, e) => s + e.debit, 0);
    const sumCredit = entries.reduce((s, e) => s + e.credit, 0);
    
    if (Math.abs(sumDebit - v.totalDebit) > 0.01 || Math.abs(sumCredit - v.totalCredit) > 0.01) {
      issues.push({ type: 'error', message: `Voucher ${v.voucherNo} entries do not match voucher header totals.`, detail: `Header (Dr/Cr): ${v.totalDebit}/${v.totalCredit}, Entries sum: ${sumDebit}/${sumCredit}` });
    }
  });

  // Check 3: Journal Entries referencing invalid accounts
  journalEntries.forEach(je => {
    if (!accounts.find(a => a.id === je.accountId)) {
      issues.push({ type: 'error', message: `Journal entry references invalid account ID: ${je.accountId}` });
    }
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-foreground">System Integrity & Validation</h2>
          <p className="text-sm text-muted-foreground">Continuous check of accounting invariants and double-entry rules</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6">
        {issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-12 text-center">
            <div className="h-16 w-16 bg-success/10 text-emerald-500 rounded-full flex items-center justify-center mb-4">
              <Database className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">All Systems Operational</h3>
            <p className="text-muted-foreground max-w-md">The double-entry accounting engine is perfectly balanced. All vouchers, ledgers, and accounts are in sync.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-destructive/10 border border-rose-500/20 rounded-xl mb-6">
              <h3 className="text-destructive font-semibold mb-1">Integrity Issues Detected</h3>
              <p className="text-sm text-rose-600/80">Found {issues.length} inconsistency issues in the accounting ledger.</p>
            </div>
            
            {issues.map((issue, idx) => (
              <div key={idx} className="p-4 border border-border/50 rounded-xl bg-card flex gap-4 items-start">
                <div className={cn("p-2 rounded-lg shrink-0", issue.type === 'error' ? "bg-destructive/10 text-rose-500" : "bg-warning/10 text-amber-500")}>
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-medium text-foreground">{issue.message}</h4>
                  {issue.detail && <p className="text-sm text-muted-foreground mt-1 font-mono bg-muted/30 p-2 rounded">{issue.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

