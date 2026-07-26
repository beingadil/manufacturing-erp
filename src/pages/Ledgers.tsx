import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useERPStore } from "../store/useERPStore";
import { useAuth } from "../contexts/AuthContext";
import { filterFinancialData } from "../lib/abac";
import { formatCurrency, cn } from "../lib/utils";
import { Download, Wallet } from "lucide-react";
import { DataTable, Column } from "../components/DataTable";
import { SearchableSelect } from "../components/SearchableSelect";

export function Ledgers() {
  const { profile, isAdmin, dataPolicies } = useAuth();
  const { 
    processors, suppliers, customers, materials,
    processingSends, processingReceipts,
    accounts, journalEntries, vouchers, accountSubtypes
  } = useERPStore();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // If navigating from legacy links with tab and id:
  const initialEntityId = searchParams.get("id") || "";
  
  // Find the initial account based on legacy entity ID or just use first account
  const initialAccount = initialEntityId 
    ? accounts.find(a => a.linkedEntityId === initialEntityId)
    : accounts[0];
    
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccount?.id || "");
  const [viewMode, setViewMode] = useState<"Financial" | "Goods">("Financial");

  const activeAccount = accounts.find(a => a.id === selectedAccountId);
  const isProcessorAccount = activeAccount?.linkedEntityId && processors.some(p => p.id === activeAccount.linkedEntityId);
  const processorId = isProcessorAccount ? activeAccount.linkedEntityId : null;

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

  const currentFinancialBalance = filteredEntries.length > 0 
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
          <button onClick={() => navigate("/accounting/journal-vouchers")} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Create Journal Entry
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 border-b border-border/50 bg-muted/40/50 flex flex-col gap-4">
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
