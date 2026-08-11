import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../../lib/utils';
import { BarChart3, ChevronRight, CircleDollarSign, Receipt, TrendingDown, TrendingUp } from 'lucide-react';

export interface PLRow {
  id: string;
  code: string;
  type: string;
  name: string;
  balance: number;
}

export interface ProfitLossData {
  revenueAccounts: PLRow[];
  totalRevenue: number;
  cogsAccounts: PLRow[];
  totalCogs: number;
  grossProfit: number;
  expenseAccounts: PLRow[];
  totalExpenses: number;
  netProfit: number;
}

function Row({ row, pct, onOpen }: { row: PLRow; pct?: number; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(row.id)}
      title={`Open ledger: ${row.name}`}
      className="w-full flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded-md hover:bg-muted/60 transition-colors group text-left"
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[10px] text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded shrink-0">{row.code}</span>
        <span className="text-foreground truncate">{row.name}</span>
        {typeof pct === 'number' && (
          <span className="text-[10px] text-muted-foreground/60 shrink-0">{pct.toFixed(1)}%</span>
        )}
      </span>
      <span className="flex items-center gap-1 shrink-0">
        <span className="font-medium text-foreground tabular-nums">{formatCurrency(Math.abs(row.balance))}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
      </span>
    </button>
  );
}

function Section({ title, rows, total, pctOf, onOpen }: {
  title: string;
  rows: PLRow[];
  total: number;
  pctOf: number;
  onOpen: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1.5 mb-1">
        <span>{title}</span>
        <span className="tabular-nums">{formatCurrency(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 italic px-2 py-1">No data for this period</p>
      ) : (
        <div className="space-y-0.5">
          {rows.map(r => <Row key={r.id} row={r} pct={pctOf > 0 ? (Math.abs(r.balance) / pctOf) * 100 : 0} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Plain-language KPI strip matching the Balance Sheet's summary cards.
 * Revenue → Costs (COGS + operating expenses) → Net Profit. Pure
 * presentation — every number comes from the authoritative P&L data.
 */
function PeriodSummary({ data }: { data: ProfitLossData }) {
  const costs = data.totalCogs + data.totalExpenses;
  const netPositive = data.netProfit > 0.01;
  const netNegative = data.netProfit < -0.01;

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
        <BarChart3 className="h-4 w-4 text-primary" />
        At a glance
      </h3>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-card border border-border/60 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CircleDollarSign className="h-3.5 w-3.5 shrink-0" />
            Revenue
          </div>
          <div className="mt-1.5 text-xl font-bold text-success tabular-nums">{formatCurrency(data.totalRevenue)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground/80">Money earned from sales</div>
        </div>

        <div className="rounded-xl bg-card border border-border/60 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Receipt className="h-3.5 w-3.5 shrink-0" />
            Costs
          </div>
          <div className="mt-1.5 text-xl font-bold text-foreground tabular-nums">{formatCurrency(costs)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground/80">Cost of goods sold + operating expenses</div>
        </div>

        <div className="rounded-xl bg-card border border-primary/30 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {netNegative
              ? <TrendingDown className="h-3.5 w-3.5 text-destructive shrink-0" />
              : <TrendingUp className="h-3.5 w-3.5 text-success shrink-0" />}
            {netNegative ? 'Net loss' : 'Net profit'}
          </div>
          <div className={`mt-1.5 text-xl font-bold tabular-nums ${netNegative ? 'text-destructive' : netPositive ? 'text-success' : 'text-foreground'}`}>
            {netNegative ? `−${formatCurrency(Math.abs(data.netProfit))}` : formatCurrency(data.netProfit)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground/80">Revenue − costs</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Profit & Loss statement body — used by both the Reports section and the
 * Accounting module. Revenue and expenses are shown with % of revenue,
 * followed by Gross Profit and Net Profit (a loss is displayed in red).
 * Every account row drills down into its General Ledger.
 */
export function ProfitLossStatement({ data, periodLabel }: { data: ProfitLossData; periodLabel: string }) {
  const navigate = useNavigate();
  const openLedger = (id: string) => navigate(`/ledgers?id=${id}`);

  const revenue = data.revenueAccounts.filter(r => r.type === 'Revenue');
  const otherIncome = data.revenueAccounts.filter(r => r.type !== 'Revenue');
  const expenses = data.expenseAccounts;

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden max-w-4xl mx-auto">
      <div className="p-6 border-b border-border/50 text-center bg-muted/20">
        <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">Profit & Loss Statement</h2>
        <p className="text-sm text-muted-foreground mt-1">For {periodLabel}</p>
      </div>

      <div className="p-6 pb-0">
        <PeriodSummary data={data} />
      </div>

      <div className="p-6 space-y-6">
        <Section title="Revenue" rows={revenue} total={revenue.reduce((s, r) => s + r.balance, 0)} pctOf={data.totalRevenue} onOpen={openLedger} />
        {otherIncome.length > 0 && (
          <Section title="Other Income" rows={otherIncome} total={otherIncome.reduce((s, r) => s + r.balance, 0)} pctOf={data.totalRevenue} onOpen={openLedger} />
        )}

        {/* Total Revenue */}
        <div className="flex justify-between items-center text-sm font-bold text-foreground bg-muted/30 border border-border/60 p-2.5 rounded-lg">
          <span>Total Revenue</span>
          <span className="tabular-nums">{formatCurrency(data.totalRevenue)}</span>
        </div>

        <Section title="Cost of Goods Sold" rows={data.cogsAccounts} total={data.totalCogs} pctOf={data.totalRevenue} onOpen={openLedger} />

        {/* Gross Profit */}
        <div className={`flex justify-between items-center font-bold text-base p-3 rounded-lg ${data.grossProfit >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
          <span>{data.grossProfit >= 0 ? 'Gross Profit' : 'Gross Loss'}</span>
          <span className="tabular-nums">{formatCurrency(Math.abs(data.grossProfit))}</span>
        </div>

        <Section title="Operating Expenses" rows={expenses} total={data.totalExpenses} pctOf={data.totalRevenue} onOpen={openLedger} />

        {/* Net Profit */}
        <div className={`flex justify-between items-center font-bold text-lg p-4 rounded-xl border ${data.netProfit >= 0 ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-destructive/10 border-destructive/30 text-destructive'}`}>
          <span className="flex items-center gap-2">
            {data.netProfit >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            {data.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
          </span>
          <span className="tabular-nums">{formatCurrency(Math.abs(data.netProfit))}</span>
        </div>
      </div>
    </div>
  );
}
