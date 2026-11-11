import { Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Column, DataTable } from "../components/DataTable";
import { LedgerPeriodFilter, type LedgerPeriod } from "../components/ledger/LedgerPeriodFilter";
import { LedgerStatement, ledgerBalanceSide, type LedgerStatementRow } from "../components/ledger/LedgerStatement";
import { SearchableSelect } from "../components/SearchableSelect";
import { VoucherDetailModal } from "../components/VoucherDetailModal";
import { AccountingEngine } from "../lib/accounting/AccountingEngine";
import { isDebitNormalAccount } from "../lib/accounting/accountClassification";
import { generateLedgerStatementPDF } from "../lib/documentGenerators";
import { cn, formatCurrency, formatDate, formatDateISO } from "../lib/utils";
import { useERPStore } from "../store/useERPStore";

export function Ledgers() {
  const {
    processors, suppliers, customers, materials,
    processingSends, processingReceipts,
    accounts, journalEntries, vouchers, accountSubtypes
  } = useERPStore();

  const [searchParams] = useSearchParams();
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
  const [period, setPeriod] = useState<LedgerPeriod>({ start: "", end: "", label: "All Time" });
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);

  const activeAccount = accounts.find(a => a.id === selectedAccountId);
  const isProcessorAccount = activeAccount?.linkedEntityId && processors.some(p => p.id === activeAccount.linkedEntityId);
  const processorId = isProcessorAccount && activeAccount ? activeAccount.linkedEntityId : null;

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
        rate: formatCurrency(s.ratePerPiece),
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
        pcsPending: s ? Math.max(0, s.pcsSent - s.pcsReceived - (s.lossQuantity || 0)) : '-',
        rate: s ? formatCurrency(s.ratePerPiece) : '-',
        billAmount: formatCurrency(r.billAmount),
        timestamp: new Date(r.date).getTime()
      });
    });
    return rows.sort((a, b) => a.timestamp - b.timestamp);
  };

  const processorRows = useMemo(
    () => getProcessorLedgerRows().map(r => ({ ...r, formattedDate: new Date(r.date).toLocaleDateString() })),
    [processorId, processingSends, processingReceipts, materials]
  );

  const dateFrom = period.start ? formatDateISO(period.start) : undefined;
  const dateTo = period.end ? formatDateISO(period.end) : undefined;

  // One engine source for rows, opening balance and running balance (spec §24).
  // getLedger already sorts date → voucherNo → createdAt → id, so same-day rows
  // keep issuance order and the closing balance matches the chronological stream.
  const ledger = useMemo(() => {
    if (!activeAccount) return { rows: [], openingBalance: 0 };
    return AccountingEngine.getLedger(
      activeAccount.id,
      accounts,
      journalEntries,
      vouchers,
      dateFrom,
      dateTo
    );
  }, [activeAccount, accounts, journalEntries, vouchers, dateFrom, dateTo]);

  const isDebitNormal = activeAccount ? isDebitNormalAccount(activeAccount) : true;
  const closingBalance = ledger.rows.length > 0
    ? ledger.rows[ledger.rows.length - 1].runningBalance
    : ledger.openingBalance;
  const showOpeningRow = ledger.rows.length > 0 || Math.abs(ledger.openingBalance) > 0.005;

  // Control accounts (AR/AP) show the aggregate of their sub-ledger children;
  // other accounts show their own closing balance.
  const subLedgerTotal = subLedger?.children.reduce((s, c) => s + c.balance, 0) ?? 0;
  const currentFinancialBalance = hasSubLedger ? subLedgerTotal : closingBalance;

  const statementRows: LedgerStatementRow[] = useMemo(
    () => ledger.rows.map(row => ({
      id: row.id,
      date: row.voucher?.date || "",
      reference: row.voucher ? (
        <button
          type="button"
          onClick={() => setSelectedVoucherId(row.voucher!.id)}
          className="text-primary transition-colors hover:text-primary/80 hover:underline"
        >
          {row.voucher.voucherNo}
        </button>
      ) : "—",
      description: row.narration || row.voucher?.narration || "—",
      badges: row.voucher?.type ? [{ label: row.voucher.type, tone: "neutral" as const }] : [],
      debit: row.debit,
      credit: row.credit,
      balance: row.runningBalance,
    })),
    [ledger.rows]
  );

  const handleExportPDF = () => {
    if (!activeAccount) return;
    const transactions = [
      ...(showOpeningRow
        ? [{
            date: "",
            referenceNo: "OPENING",
            description: "Balance brought forward",
            debit: 0,
            credit: 0,
            balance: ledger.openingBalance,
          }]
        : []),
      ...ledger.rows.map(row => ({
        date: row.voucher?.date ? formatDate(row.voucher.date) : "-",
        referenceNo: row.voucher?.voucherNo || "-",
        description: row.narration || row.voucher?.narration || "-",
        debit: row.debit,
        credit: row.credit,
        balance: row.runningBalance,
      })),
    ];
    generateLedgerStatementPDF(activeAccount.name, "Account", transactions, closingBalance, {
      title: "GENERAL LEDGER STATEMENT",
      periodLabel: period.label,
      accountCode: activeAccount.code,
    });
  };

  const standardColumns: Column<any>[] = [
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "type", label: "Action", render: (item) => (
      <span className={cn("px-2 py-1 rounded-md text-xs font-medium", item.type === 'Sent' ? "bg-warning/10 text-warning" : "bg-success/10 text-success")}>{item.type}</span>
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
          <p className="text-sm text-muted-foreground mt-1">
            Account statements with opening balance, period totals and a running closing balance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/accounting/journal-voucher")} className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/90">
            New Journal Voucher
          </button>
          <button onClick={handleExportPDF} disabled={!activeAccount} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            Export PDF
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 sm:p-6 border-b border-border/50 bg-muted/30 flex flex-col gap-4">
          <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 flex-1">
              <div className="flex items-center gap-3 flex-1 max-w-md">
                <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Wallet className="h-5 w-5" />
                </div>
                <div className="flex flex-col flex-1">
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

              <div className="flex flex-col">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Statement Period</label>
                <LedgerPeriodFilter onChange={setPeriod} defaultLabel="All Time" />
              </div>
            </div>

            {activeAccount && (
              <div className="flex flex-col items-start xl:items-end bg-background p-4 rounded-xl border border-border/50 shadow-sm">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  {hasSubLedger ? 'Sub-ledger Balance' : 'Closing Balance'}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className={cn("font-bold text-2xl tracking-tight tabular-nums", currentFinancialBalance !== 0 ? "text-primary" : "text-foreground")}>
                    {formatCurrency(Math.abs(currentFinancialBalance))}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {ledgerBalanceSide(currentFinancialBalance, isDebitNormal)}
                  </span>
                </div>
                <span className="mt-0.5 text-[11px] text-muted-foreground">{period.label}</span>
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
          <div className="p-4 sm:p-6 border-b border-border/50">
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
                const childIsDebitNormal = isDebitNormalAccount(child.account);
                const bal = child.balance;
                return (
                  <button
                    key={child.account.id}
                    onClick={() => setSelectedAccountId(child.account.id)}
                    className="text-left rounded-xl border border-border bg-background p-3 hover:border-primary/40 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{party?.name || child.account.name}</span>
                      <span className={cn("text-sm font-bold tabular-nums", bal !== 0 ? (childIsDebitNormal ? (bal > 0 ? "text-success" : "text-destructive") : (bal > 0 ? "text-destructive" : "text-success")) : "text-muted-foreground")}>
                        {formatCurrency(Math.abs(bal))}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {child.account.code} • {bal !== 0 ? ledgerBalanceSide(bal, childIsDebitNormal) : '—'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === "Goods" && isProcessorAccount ? (
          <div className="p-4 sm:p-6">
            <DataTable
              data={processorRows}
              columns={standardColumns}
              searchKeys={["type", "material"]}
              searchPlaceholder="Search goods records..."
              persistKey="ledgers-goods-table"
              defaultSortKey="date"
              defaultSortDirection="asc"
              showPageSize={false}
            />
          </div>
        ) : activeAccount ? (
          <div className="p-4 sm:p-6">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {activeAccount.code} — {activeAccount.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {activeAccount.type}
                  {accountSubtypes?.find(s => s.id === activeAccount.subtypeId)?.name
                    ? ` · ${accountSubtypes.find(s => s.id === activeAccount.subtypeId)!.name}`
                    : ''}
                  {' · '}{period.label}
                </p>
              </div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {isDebitNormal ? 'Debit-normal account' : 'Credit-normal account'}
              </span>
            </div>

            {hasSubLedger && (
              <p className="mb-3 text-xs text-muted-foreground">
                Party balances are listed above. Direct postings to this control account appear in the statement below.
              </p>
            )}

            <LedgerStatement
              embedded
              rows={statementRows}
              openingBalance={showOpeningRow ? ledger.openingBalance : undefined}
              closingBalance={closingBalance}
              isDebitNormal={isDebitNormal}
              pageSize={250}
              emptyMessage="No posted entries for this account in the selected period."
            />
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            Select an account to view its ledger statement.
          </div>
        )}
      </div>

      {selectedVoucherId && (
        <VoucherDetailModal
          voucherId={selectedVoucherId}
          onClose={() => setSelectedVoucherId(null)}
        />
      )}
    </div>
  );
}
