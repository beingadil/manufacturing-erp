import { format, startOfMonth, startOfWeek, startOfYear, subDays } from 'date-fns';
import { AlertTriangle, ArrowDownCircle, ArrowLeftRight, ArrowRight, ArrowUpCircle, Building2, CircleDollarSign, DollarSign, Factory, Landmark, Layers, Package, PackageSearch, Scale, ShoppingCart, TrendingUp, Truck, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PositionSummary } from '../components/reports/financial/BalanceSheetStatement';
import { KpiCard } from "../components/ui/KpiCard";
import { useAuth } from "../contexts/AuthContext";
import { filterFinancialData } from "../lib/abac";
import { getSystemAccountBySubtype } from '../lib/accounting/accountClassification';
import { DashboardSummaryService } from '../lib/dashboard/DashboardSummaryService';
import { FinancialReportService } from '../lib/reporting/FinancialReportService';
import { cn, formatCurrency, formatNumber } from "../lib/utils";
import { useERPStore } from "../store/useERPStore";

type Preset = 'today' | 'week' | 'month' | 'year' | 'custom';

export function Dashboard() {
  const { profile, isAdmin, dataPolicies } = useAuth();
  const {
    materials, processors, suppliers, customers, processorBills,
    sales, purchases, products, accounts, journalEntries, vouchers, accountSubtypes,
    batches, processingSends, processingReceipts, processingStages,
  } = useERPStore();
  const navigate = useNavigate();

  // AR/AP control accounts (parties are sub-ledgers nested under these — spec §9).
  // The Receivables/Payables cards open the ledger on the matching control account,
  // not the first account in the chart (which is Cash in Hand).
  const arControlAccount = getSystemAccountBySubtype(accounts, accountSubtypes, 'Accounts Receivable');
  const apControlAccount = getSystemAccountBySubtype(accounts, accountSubtypes, 'Accounts Payable');

  const secureSales = filterFinancialData(sales, profile, isAdmin, dataPolicies);
  const securePurchases = filterFinancialData(purchases, profile, isAdmin, dataPolicies);

  // ── Date filter: balances as of period end, activity over the period ───────
  const today = format(new Date(), 'yyyy-MM-dd');
  const [preset, setPreset] = useState<Preset>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const range = useMemo(() => {
    const end = preset === 'custom' ? (customEnd || today) : today;
    let start = today;
    if (preset === 'week') start = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    else if (preset === 'month') start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    else if (preset === 'year') start = format(startOfYear(new Date()), 'yyyy-MM-dd');
    else if (preset === 'custom') start = customStart || end;
    return { start, end };
  }, [preset, customStart, customEnd, today]);

  const summary = useMemo(() => DashboardSummaryService.getSummary(
    {
      accounts, accountSubtypes, journalEntries, vouchers, batches, materials,
      customers, suppliers, processors, processorBills,
      processingSends, processingReceipts, processingStages,
      sales: secureSales, purchases: securePurchases,
    },
    { asOfDate: range.end, periodStart: range.start, periodEnd: range.end }
  ), [accounts, accountSubtypes, journalEntries, vouchers, batches, materials, customers, suppliers, processors, secureSales, securePurchases, processingSends, processingReceipts, processingStages, range]);

  // "Where you stand" — the SAME authoritative balance-sheet figures as the
  // Balance Sheet report (invested / total profit to date / what's yours),
  // so the Dashboard card can never disagree with the report.
  const balanceSheetData = useMemo(
    () => FinancialReportService.getBalanceSheetData(range.end),
    [range.end, accounts, accountSubtypes, journalEntries, vouchers]
  );

  // Generate last 7 days sales data
  const last7DaysSales = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const daySales = secureSales.filter((s: any) => s.date.startsWith(dateStr)).reduce((sum, s) => sum + s.totalAmount, 0);
      data.push({
        name: format(d, 'MMM dd'),
        sales: daySales
      });
    }
    return data;
  }, [secureSales]);

  const topProducts = useMemo(() => {
    const productSales: Record<string, number> = {};
    secureSales.forEach((s: any) => {
      productSales[s.productId] = (productSales[s.productId] || 0) + s.totalAmount;
    });
    return Object.entries(productSales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, amount]) => {
        const p = products.find(prod => prod.id === id);
        return { name: p?.name || 'Unknown', amount };
      });
  }, [secureSales, products]);

  const lowStockMaterials = materials.filter(m => m.stockPcs < 500 && m.stockPcs > 0);
  const outOfStockMaterials = materials.filter(m => m.stockPcs === 0);

  const presets: { key: Preset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'year', label: 'This Year' },
    { key: 'custom', label: 'Custom' },
  ];

  const periodLabel = `${format(new Date(range.start + 'T00:00:00'), 'dd MMM yyyy')} – ${format(new Date(range.end + 'T00:00:00'), 'dd MMM yyyy')}`;
  const asOfLabel = format(new Date(summary.asOfDate + 'T00:00:00'), 'dd MMM yyyy');

  const bankSub = summary.bankAccounts.length === 0 ? (
    <span>No bank accounts configured</span>
  ) : (
    <>
      {summary.bankAccounts.slice(0, 3).map(b => (
        <div key={b.id} className="flex justify-between gap-2">
          <span className="truncate">{b.name}</span>
          <span className="font-medium text-foreground/80 whitespace-nowrap">{formatCurrency(b.balance)}</span>
        </div>
      ))}
      {summary.bankAccounts.length > 3 && (
        <div className="text-muted-foreground/70">+{summary.bankAccounts.length - 3} more banks</div>
      )}
    </>
  );

  const inventorySub = (
    <div className="space-y-0.5">
      <div className="flex justify-between gap-2"><span>Raw materials</span><span className="font-medium text-foreground/80">{formatCurrency(summary.inventory.rawMaterials)}</span></div>
      <div className="flex justify-between gap-2"><span>At processor (WIP)</span><span className="font-medium text-foreground/80">{formatCurrency(summary.inventory.atProcessor)}</span></div>
      <div className="flex justify-between gap-2"><span>Finished goods</span><span className="font-medium text-foreground/80">{formatCurrency(summary.inventory.finishedGoods)}</span></div>
      <div className="flex justify-between gap-2 border-t border-border/60 pt-1.5 mt-1">
        <span className="font-semibold text-foreground">Total Inventory Value</span>
        <span className="font-bold text-foreground">{formatCurrency(summary.inventory.total)}</span>
      </div>
      <div className="flex items-center justify-end gap-1 pt-0.5 text-primary">View Raw Materials <ArrowRight className="h-3 w-3" /></div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Executive Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">Real-time overview of enterprise operations.</p>
        </div>
        <div className="flex items-center gap-3">
           <button onClick={() => navigate('/reports')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">
            View Full Reports <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Date filter ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-muted/40 border border-border rounded-lg p-1">
          {presets.map(p => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                preset === p.key ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-sm" title="From" />
            <span className="text-muted-foreground text-sm">to</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-sm" title="To" />
          </div>
        )}
        <span className="text-xs text-muted-foreground">Balances as of {asOfLabel} · Activity {periodLabel}</span>
      </div>

      {/* ── Financial & Inventory Position ─────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-foreground">Financial & Inventory Position</h3>
          <span className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-full px-3 py-1">As of {asOfLabel}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            icon={CircleDollarSign}
            iconClassName="text-emerald-500"
            label="Cash in Hand"
            value={formatCurrency(summary.cashInHand)}
            description={<span className="flex justify-between"><span>Period receipts</span><span className="font-medium text-success">{formatCurrency(summary.periodCashReceipts)}</span></span>}
            onClick={() => navigate('/accounting/cashbook')}
          />
          <KpiCard
            icon={Landmark}
            iconClassName="text-blue-500"
            label="Bank Balance"
            value={formatCurrency(summary.bankTotal)}
            description={bankSub}
            onClick={() => navigate('/accounting/general-ledger')}
          />
          <KpiCard
            icon={Users}
            iconClassName="text-teal-500"
            label="Accounts Receivable"
            value={formatCurrency(summary.receivables.total)}
            description={<span>{summary.receivables.customersOutstanding} customer{summary.receivables.customersOutstanding === 1 ? '' : 's'} outstanding</span>}
            onClick={() => navigate(arControlAccount ? `/ledgers?id=${arControlAccount.id}` : '/ledgers')}
          />
          <KpiCard
            icon={Truck}
            iconClassName="text-amber-500"
            label="Accounts Payable"
            value={formatCurrency(summary.payables.total)}
            description={<span>{summary.payables.suppliersOutstanding} supplier{summary.payables.suppliersOutstanding === 1 ? '' : 's'} outstanding</span>}
            onClick={() => navigate(apControlAccount ? `/ledgers?id=${apControlAccount.id}` : '/ledgers')}
          />
          <KpiCard
            icon={PackageSearch}
            iconClassName="text-violet-500"
            label="Inventory Value"
            value={formatCurrency(summary.inventory.total)}
            description={inventorySub}
            onClick={() => navigate('/materials')}
          />
        </div>
      </section>

      {/* ── Where you stand ────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <PositionSummary data={balanceSheetData} title="Where you stand" />
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>As of {asOfLabel} · Same figures as the Balance Sheet report</span>
          <button onClick={() => navigate('/accounting/balance-sheet')} className="inline-flex items-center gap-1 text-primary hover:underline">
            View Balance Sheet <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </section>

      {/* ── Financial Position panel ───────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border/50 bg-muted/30">
          <h3 className="font-semibold text-foreground">Financial Position</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Derived from the accounting engine — Trial Balance, Balance Sheet and Profit &amp; Loss views</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 divide-x divide-y md:divide-y-0 divide-border/50">
          <div className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2"><Building2 className="h-4 w-4 text-sky-500" /><span className="text-xs font-medium uppercase tracking-wide">Total Assets</span></div>
            <div className="text-xl font-bold text-foreground">{formatCurrency(summary.totalAssets)}</div>
            <button onClick={() => navigate('/accounting/balance-sheet')} className="mt-1 text-xs text-primary hover:underline">Balance Sheet</button>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2"><Scale className="h-4 w-4 text-rose-500" /><span className="text-xs font-medium uppercase tracking-wide">Total Liabilities</span></div>
            <div className="text-xl font-bold text-foreground">{formatCurrency(summary.totalLiabilities)}</div>
            <button onClick={() => navigate('/accounting/balance-sheet')} className="mt-1 text-xs text-primary hover:underline">Balance Sheet</button>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2"><Wallet className="h-4 w-4 text-amber-500" /><span className="text-xs font-medium uppercase tracking-wide">Owner's Equity</span></div>
            <div className="text-xl font-bold text-foreground">{formatCurrency(summary.equity)}</div>
            <button onClick={() => navigate('/accounting/balance-sheet')} className="mt-1 text-xs text-primary hover:underline">Balance Sheet</button>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2"><ArrowLeftRight className="h-4 w-4 text-indigo-500" /><span className="text-xs font-medium uppercase tracking-wide">Net Working Capital</span></div>
            <div className={cn("text-xl font-bold", summary.netWorkingCapital >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(summary.netWorkingCapital)}</div>
            <button onClick={() => navigate('/accounting/cash-flow')} className="mt-1 text-xs text-primary hover:underline">Cash Flow</button>
          </div>
          <div className="p-5 col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 text-muted-foreground mb-2"><TrendingUp className="h-4 w-4 text-emerald-500" /><span className="text-xs font-medium uppercase tracking-wide">Period Profit / Loss</span></div>
            <div className={cn("text-xl font-bold", summary.profit.net >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(summary.profit.net)}</div>
            <button onClick={() => navigate('/accounting/profit-loss')} className="mt-1 text-xs text-primary hover:underline">Profit &amp; Loss</button>
          </div>
        </div>
      </section>

      {/* ── Period activity ────────────────────────────────────────────────── */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3 text-muted-foreground">
            <ArrowUpCircle className="h-5 w-5 text-emerald-500" />
            <div>
              <div className="text-sm font-medium">Cash Receipts</div>
              <div className="text-xs text-muted-foreground/70">Period</div>
            </div>
          </div>
          <div className="text-xl font-bold text-success">{formatCurrency(summary.periodCashReceipts)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3 text-muted-foreground">
            <ArrowDownCircle className="h-5 w-5 text-red-500" />
            <div>
              <div className="text-sm font-medium">Cash Payments</div>
              <div className="text-xs text-muted-foreground/70">Period</div>
            </div>
          </div>
          <div className="text-xl font-bold text-destructive">{formatCurrency(summary.periodCashPayments)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3 text-muted-foreground">
            <DollarSign className="h-5 w-5 text-blue-500" />
            <div>
              <div className="text-sm font-medium">Sales</div>
              <div className="text-xs text-muted-foreground/70">Period</div>
            </div>
          </div>
          <div className="text-xl font-bold text-foreground">{formatCurrency(summary.periodSales)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3 text-muted-foreground">
            <ShoppingCart className="h-5 w-5 text-violet-500" />
            <div>
              <div className="text-sm font-medium">Purchases</div>
              <div className="text-xs text-muted-foreground/70">Period</div>
            </div>
          </div>
          <div className="text-xl font-bold text-foreground">{formatCurrency(summary.periodPurchases)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Factory className="h-5 w-5 text-orange-500" />
            <div>
              <div className="text-sm font-medium">Processing Bills</div>
              <div className="text-xs text-muted-foreground/70">Period</div>
            </div>
          </div>
          <div className="text-xl font-bold text-foreground">{formatCurrency(summary.periodProcessing)}</div>
        </div>
      </section>

      {/* ── Inventory Position ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-foreground">Inventory Position</h3>
          <span className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-full px-3 py-1">Current operational stock · As of {asOfLabel}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={Layers}
            iconClassName="text-violet-500"
            label="Raw Material Inventory"
            value={`${formatNumber(summary.inventory.rawPcs)} PCS`}
            description={<>
              <div className="flex justify-between"><span>Value</span><span className="font-medium text-foreground/80">{formatCurrency(summary.inventory.rawMaterials)}</span></div>
              <div className="text-muted-foreground/70">At actual purchase cost (per batch)</div>
            </>}
            onClick={() => navigate('/materials')}
          />
          <KpiCard
            icon={Factory}
            iconClassName="text-orange-500"
            label="WIP / At Processor"
            value={`${formatNumber(summary.inventory.wipPcs)} PCS`}
            description={
              <>
                {summary.inventory.stageWip.length > 0 ? (
                  <div className="space-y-0.5">
                    {summary.inventory.stageWip.map(st => (
                      <div key={st.stageId} className="flex justify-between gap-2">
                        <span>{st.name}</span>
                        <span className="font-medium text-foreground/80">{formatNumber(st.pcs)} PCS · {formatCurrency(st.value)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between gap-2 border-t border-border/60 pt-1 mt-1">
                      <span className="font-medium text-foreground">Total WIP</span>
                      <span className="font-semibold text-foreground">{formatNumber(summary.inventory.wipPcs)} PCS · {formatCurrency(summary.inventory.atProcessor)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between"><span>Value</span><span className="font-medium text-foreground/80">{formatCurrency(summary.inventory.atProcessor)}</span></div>
                )}
              </>
            }
            onClick={() => navigate('/job-work')}
          />
          <KpiCard
            icon={Package}
            iconClassName="text-sky-500"
            label="Finished Goods"
            value={`${formatNumber(summary.inventory.finishedPcs)} PCS`}
            description={<>
              <div className="flex justify-between"><span>Value</span><span className="font-medium text-foreground/80">{formatCurrency(summary.inventory.finishedGoods)}</span></div>
              <div className="text-muted-foreground/70">At purchase cost of the producing batch</div>
            </>}
            onClick={() => navigate('/products')}
          />
          <KpiCard
            icon={PackageSearch}
            iconClassName="text-emerald-500"
            label="Total Inventory"
            value={formatCurrency(summary.inventory.total)}
            description={<>
              <div className="flex justify-between"><span>Raw + WIP + Finished</span><span className="font-medium text-foreground/80">{formatCurrency(summary.inventory.rawMaterials + summary.inventory.atProcessor + summary.inventory.finishedGoods)}</span></div>
              <div className={summary.inventory.reconciled ? 'text-muted-foreground/70' : 'text-destructive'}>
                {summary.inventory.reconciled ? 'Reconciled with inventory valuation' : 'Mismatch — check batch/stock state'}
              </div>
            </>}
            onClick={() => navigate('/reports')}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3 md:grid-cols-2">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-border/50">
            <h3 className="text-lg font-bold text-foreground">Revenue Trend (Last 7 Days)</h3>
          </div>
          <div className="p-6 flex-1 min-h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
              <LineChart data={last7DaysSales} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} dx={-10} tickFormatter={(value) => `PKR ${value/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "hsl(var(--card))", color: "hsl(var(--foreground))", borderRadius: '12px', border: "1px solid hsl(var(--border))", boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
                <Line type="monotone" dataKey="sales" stroke="hsl(var(--chart-1))" strokeWidth={3} dot={{ r: 4, fill: 'hsl(var(--chart-1))', strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-border/50">
            <h3 className="text-lg font-bold text-foreground">Top Products by Revenue</h3>
          </div>
          <div className="p-6 flex-1 min-h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--foreground))", fontSize: 13, fontWeight: 500 }} width={100} />
                <Tooltip 
                  cursor={{ fill: "hsl(var(--muted))" }}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", color: "hsl(var(--foreground))", borderRadius: '12px', border: "1px solid hsl(var(--border))", boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
                <Bar dataKey="amount" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border/50 flex items-center justify-between bg-muted/40">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Alerts & Notifications
            </h3>
          </div>
          <div className="p-0 max-h-[300px] overflow-y-auto">
            <ul className="divide-y divide-border/50">
              {outOfStockMaterials.map(m => (
                <li key={m.id} className="p-4 flex items-start gap-3 hover:bg-muted/40">
                  <div className="mt-0.5 rounded-full bg-destructive/10 p-1"><AlertTriangle className="h-4 w-4 text-destructive"/></div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.name} is Out of Stock</p>
                    <p className="text-xs text-muted-foreground mt-1">Please create a purchase order immediately.</p>
                  </div>
                </li>
              ))}
              {lowStockMaterials.map(m => (
                <li key={m.id} className="p-4 flex items-start gap-3 hover:bg-muted/40">
                  <div className="mt-0.5 rounded-full bg-warning/10 p-1"><AlertTriangle className="h-4 w-4 text-warning"/></div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.name} is running low ({m.stockPcs} PCS)</p>
                    <p className="text-xs text-muted-foreground mt-1">Consider restocking soon to avoid production delays.</p>
                  </div>
                </li>
              ))}
              {outOfStockMaterials.length === 0 && lowStockMaterials.length === 0 && (
                <li className="p-8 text-center text-muted-foreground text-sm">No alerts at this time. All systems nominal.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border/50 flex items-center justify-between bg-muted/40">
            <h3 className="font-semibold text-foreground">Recent Transactions</h3>
            <button onClick={() => navigate('/sales')} className="text-sm font-medium text-info hover:text-info">View All Sales</button>
          </div>
          <div className="p-0">
            <table className="w-full text-sm text-left">
              <tbody className="divide-y divide-border/50">
                {(secureSales as any[]).slice(0, 5).map(s => (
                  <tr key={s.id} className="hover:bg-muted/40">
                    <td className="px-5 py-4"><span className="text-xs text-muted-foreground">{new Date(s.date).toLocaleDateString()}</span></td>
                    <td className="px-5 py-4 font-medium">{s.invoiceNo}</td>
                    <td className="px-5 py-4 text-right font-bold text-success">+{formatCurrency(s.totalAmount)}</td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr><td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">No recent transactions</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
