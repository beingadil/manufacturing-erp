import { Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Column, DataTable } from "../components/DataTable";
import { SearchableSelect } from "../components/SearchableSelect";
import { AccountingEngine } from "../lib/accounting/AccountingEngine";
import { cn, formatCurrency } from "../lib/utils";
import { useERPStore } from "../store/useERPStore";

export function Ledgers() {
  const { 
    processors, suppliers, customers, materials,
    processingSends, processingReceipts,
    accounts, journalEntries, vouchers, accountSubtypes
  } = useERPStore();
  
  const [searchParams, _setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // If navigating from legacy links with tab and id:
  const initialEntityId = searchParams.get("id") || "";
  
  // Find the initial account: prefer a direct account id (?id=<accountId>, used
  // by the Dashboard AR/AP cards to open the control account's ledger), then
  // fall back to the legacy linked-entity lookup (?id=<partyId>), then the
  // first account.
  const initialAccount = initialEntityId 
    ? (accounts.find(a => a.id === initialEntityId) || accounts.find(a => a.linkedEntityId === initialEntityId))
    : accounts[0];
    
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccount?.id || "");
  const [viewMode, setViewMode] = useState<"Financial" | "Goods">("Financial");

  const activeAccount = accounts.find(a => a.id === selectedAccountId);
  const isProcessorAccount = activeAccount?.linkedEntityId && processors.some(p => p.id === activeAccount.linkedEntityId);
  const processorId = isProcessorAccount ? activeAccount.linkedEntityId : null;

  // Sub-ledger: AR/AP control accounts have party accounts nested under them via
  // parentId (spec §15). Postings hit the party child, so the control account's
  // own entry list is empty — show the children with their balances instead.
  const subLedger = activeAccount
    ? AccountingEngine.getSubLedger(activeAccount.id, accounts, journalEntries, vouchers)
    : null;
  const hasSubLedger = !!subLedger && subLedger.children.length > 0;

  // Enforce view mode
  useEffect(() => {
    if (!isProcessorAccount && viewMode === "Goods") {
      setViewMode("Financial");
    }
  }, [isProcessorAccount, viewMode]);
  
  const getProcessorLedgerRows = () => {
    if (!processorId) return [];
    const rows: any[] = [];
    processingSends.filter(s => s.processorId === processorId).forEach(s => {
      const m = materials.find(mat => mat.id === s.materialId);
      rows.push({
        id: `s-${s.id}`,
        date: s.date,
        type: 'Sent',
        material: m?.name,
        pcsSent: s.pcsSent,
        pcsRecvd: '-',
        pcsPending: s.pcsSent,
        rate: `₹${s.ratePerPiece}`,
        billAmount: 'Pending',
        timestamp: new Date(s.date).getTime()
      });
    });
    processingReceipts.filter(r => r.processorId === processorId).forEach(r => {
      const m = materials.find(mat => mat.id === r.materialId);
      const s = processingSends.find(send => send.id === r.sendId);
      rows.push({
        id: `r-${r.id}`,
        date: r.date,
        type: 'Received',
        material: m?.name,
        pcsSent: '-',
        pcsRecvd: r.pcsReceived,
        pcsPending: s ? (s.pcsSent - s.pcsReceived) : '-',
        rate: s ? `₹${s.ratePerPiece}` : '-',
        billAmount: `₹${r.billAmount}`,
        timestamp: new Date(r.date).getTime()
      });
    });
    return rows.sort((a, b) => b.timestamp - a.timestamp);
  };

  const processorRows = useMemo(() => getProcessorLedgerRows().map(r => ({ ...r, formattedDate: new Date(r.date).toLocaleDateString() })), [processorId, processingSends, processingReceipts, materials]);
  
  const filteredEntries = useMemo(() => {
    if (!activeAccount) return [];
    
    const entries = journalEntries
      .filter(je => je.accountId === activeAccount.id)
      .map(je => {
        const voucher = vouchers.find(v => v.id === je.voucherId);
        return {
          ...je,
          voucher,
          date: voucher?.date || new Date().toISOString()
        };
      })
      // Cancelled vouchers never affect ledgers (spec §14)
      .filter(e => e.voucher?.status === 'Posted')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
    let runningBalance = activeAccount.openingBalanceType === 'Debit' ? activeAccount.openingBalance : -activeAccount.openingBalance;
    if (activeAccount.type === 'Liabilities' || activeAccount.type === 'Equity' || activeAccount.type === 'Revenue' || activeAccount.type === 'Other Income') {
        runningBalance = activeAccount.openingBalanceType === 'Credit' ? activeAccount.openingBalance : -activeAccount.openingBalance;
    }

    return entries.map(entry => {
      if (activeAccount.type === 'Assets' || activeAccount.type === 'Expenses' || activeAccount.type === 'Cost of Goods Sold' || activeAccount.type === 'Other Expenses') {
         runningBalance += entry.debit - entry.credit;
      } else {
         runningBalance += entry.credit - entry.debit;
      }
      return { ...entry, formattedDate: new Date(entry.date).toLocaleDateString(), runningBalance };
    });
  }, [activeAccount, journalEntries, vouchers]);

  // Control accounts (AR/AP) show the aggregate of their sub-ledger children;
  // other accounts show their own running balance or opening balance.
  const subLedgerTotal = subLedger?.children.reduce((s, c) => s + c.balance, 0) ?? 0;
  const currentFinancialBalance = hasSubLedger
    ? subLedgerTotal
    : filteredEntries.length > 0 
      ? filteredEntries[filteredEntries.length - 1].runningBalance 
      : (activeAccount?.openingBalance || 0);

  const standardColumns: Column<any>[] = [
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "voucherNo", label: "Voucher No", render: (item) => <span className="font-medium">{item.voucher?.voucherNo || "-"}</span> },
    { key: "type", label: "Type", render: (item) => <span className="text-muted-foreground">{item.voucher?.type || "-"}</span> },
    { key: "narration", label: "Narration", render: (item) => <span className="max-w-[300px] block truncate">{item.narration || item.voucher?.narration || "-"}</span> },
    { key: "debit", label: "Debit (Dr)", render: (item) => <span className="font-medium text-success">{item.debit > 0 ? item.debit.toLocaleString() : ""}</span> },
    { key: "credit", label: "Credit (Cr)", render: (item) => <span className="font-medium text-destructive">{item.credit > 0 ? item.credit.toLocaleString() : ""}</span> },
    { key: "runningBalance", label: "Balance", render: (item) => <span className="font-bold">{Math.abs(item.runningBalance).toLocaleString()} {item.runningBalance >= 0 ? (['Assets', 'Expenses'].includes(activeAccount?.type || '') ? 'Dr' : 'Cr') : (['Assets', 'Expenses'].includes(activeAccount?.type || '') ? 'Cr' : 'Dr')}</span> }
  ];

  const processorColumns: Column<any>[] = [
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "type", label: "Action", render: (item) => (
      <span className={cn("px-2 py-1 rounded-md text-xs font-medium", item.type === 'Sent' ? "bg-warning/10   " : "bg-success/10   ")}>{item.type}</span>
    )},
    { key: "material", label: "Material" },
    { key: "pcsSent", label: "Pcs Sent" },
    { key: "pcsRecvd", label: "Pcs Recvd" },
    { key: "pcsPending", label: "Pending Pcs", render: (item) => <span className="font-medium text-destructive">{item.pcsPending}</span> },
    { key: "rate", label: "Rate" },
    { key: "billAmount", label: "Bill Amt" }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Unified Ledgers</h2>
          <p className="text-sm text-muted-foreground mt-1">View financial and goods statements across the Chart of Accounts.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/accounting/journal-voucher")} className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/90">
            New Journal Voucher
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 border-b border-border/50 bg-muted/40 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Wallet className="h-5 w-5" /></div>
              <div className="flex flex-col flex-1 max-w-md">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Select Account</label>
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
                  onChange={setSelectedAccountId}
                  placeholder="Search account..."
                />
              </div>
            </div>
            {activeAccount && (
              <div className="flex flex-col items-start sm:items-end bg-background p-4 rounded-xl border border-border/50 shadow-sm">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Current Balance</span>
                <div className="flex items-baseline gap-2">
                  <span className={cn("font-bold text-2xl tracking-tight", currentFinancialBalance !== 0 ? "text-primary" : "text-foreground")}>
                    {Math.abs(currentFinancialBalance).toLocaleString()}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {currentFinancialBalance >= 0 ? (['Assets', 'Expenses'].includes(activeAccount.type) ? 'Dr' : 'Cr') : (['Assets', 'Expenses'].includes(activeAccount.type) ? 'Cr' : 'Dr')}
                  </span>
                </div>
              </div>
            )}
          </div>
          
          {isProcessorAccount && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setViewMode("Financial")}
                className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-colors", viewMode === "Financial" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}
              >
                Financial Statement
              </button>
              <button
                onClick={() => setViewMode("Goods")}
                className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-colors", viewMode === "Goods" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}
              >
                Goods Statement
              </button>
            </div>
          )}
        </div>

        {hasSubLedger && (
          <div className="p-6 border-b border-border/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Sub-ledger — {activeAccount?.name}</h3>
              <span className="text-xs font-medium px-2 py-1 rounded-md bg-muted text-muted-foreground">
                {subLedger!.children.length} account{subLedger!.children.length === 1 ? '' : 's'} · click to open
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {subLedger!.children.map(child => {
                const party = customers.find(c => c.id === child.account.linkedEntityId)
                  || suppliers.find(s => s.id === child.account.linkedEntityId)
                  || processors.find(p => p.id === child.account.linkedEntityId);
                const isDebitNormal = ['Assets', 'Expenses'].includes(child.account.type);
                const bal = child.balance;
                return (
                  <button
                    key={child.account.id}
                    onClick={() => setSelectedAccountId(child.account.id)}
                    className="text-left rounded-xl border border-border bg-background p-3 hover:border-primary/40 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{party?.name || child.account.name}</span>
                      <span className={cn("text-sm font-bold", bal !== 0 ? (isDebitNormal ? (bal > 0 ? "text-success" : "text-destructive") : (bal > 0 ? "text-destructive" : "text-success")) : "text-muted-foreground")}>
                        {formatCurrency(Math.abs(bal))}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {child.account.code} • {bal !== 0 ? (bal > 0 === isDebitNormal ? 'Dr' : 'Cr') : '—'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === "Goods" && isProcessorAccount ? (
          <DataTable
            data={processorRows}
            columns={processorColumns}
            searchKeys={["type", "material"]}
            searchPlaceholder="Search goods records..."
            persistKey="ledgers-goods-table"
            defaultSortKey="date"
          />
        ) : (
          <DataTable
            data={filteredEntries}
            columns={standardColumns}
            searchKeys={["voucher" as any, "narration"]}
            searchPlaceholder="Search journal entries..."
            persistKey="ledgers-financial-table"
            defaultSortKey="date"
          />
        )}
      </div>
    </div>
  );
}
