
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../../lib/utils';
import { KpiCard } from '../../ui/KpiCard';
import { ChevronRight, HandCoins, Scale, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

export interface StatementRow {
  id: string;
  code: string;
  name: string;
  balance: number;
}

export interface StatementGroup {
  label: string;
  rows: StatementRow[];
  total: number;
}

export interface BalanceSheetData {
  assetGroups: StatementGroup[];
  totalAssets: number;
  liabilityGroups: StatementGroup[];
  totalLiabilities: number;
  equityAccounts: StatementRow[];
  totalEquityAccounts: number;
  netProfit: number;
  totalEquity: number;
  balanced: boolean;
}

function Row({ row, onOpen }: { row: StatementRow; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(row.id)}
      title={`Open ledger: ${row.name}`}
      className="w-full flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded-md hover:bg-muted/60 transition-colors group text-left"
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[10px] text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded shrink-0">{row.code}</span>
        <span className="text-foreground truncate">{row.name}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0">
        <span className={`font-medium tabular-nums ${row.balance < 0 ? 'text-destructive' : 'text-foreground'}`}>
          {formatCurrency(row.balance)}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
      </span>
    </button>
  );
}

function GroupSection({ groups, onOpen }: { groups: StatementGroup[]; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-5">
      {groups.map(group => (
        <div key={group.label}>
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1.5 mb-1">
            <span>{group.label}</span>
            {group.rows.length > 0 && <span className="tabular-nums">{formatCurrency(group.total)}</span>}
          </div>
          {group.rows.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic px-2 py-1">No balance</p>
          ) : (
            <div className="space-y-0.5">
              {group.rows.map(r => <Row key={r.id} row={r} onOpen={onOpen} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Plain-language summary that tells the owner's story: how much they put in,
 * what the business earned, what it owns, what it owes, and where they stand
 * today. Pure presentation — every number comes from the authoritative
 * balance-sheet data (nothing is calculated twice). Shared by the Balance
 * Sheet report and the Dashboard's "Where you stand" card.
 */
export function PositionSummary({ data, title = 'Your position — in plain words' }: { data: BalanceSheetData; title?: string }) {
  const invested = data.totalEquityAccounts;
  const profit = data.netProfit;
  const yours = data.totalEquity;
  const profitPositive = profit > 0.01;
  const profitNegative = profit < -0.01;

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
        <Scale className="h-4 w-4 text-primary" />
        {title}
      </h3>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Money you put in"
          value={formatCurrency(invested)}
          icon={Wallet}
          description="Your capital + earlier profits kept in the business"
        />
        <KpiCard
          label={profitNegative ? 'Loss this period' : 'Profit this period'}
          value={profitNegative ? `−${formatCurrency(Math.abs(profit))}` : formatCurrency(profit)}
          icon={profitNegative ? TrendingDown : TrendingUp}
          iconClassName={profitNegative ? 'text-destructive' : 'text-success'}
          accent={profitNegative ? 'text-destructive' : profitPositive ? 'text-success' : 'text-foreground'}
          description="Sales − cost of goods − all expenses"
        />
        <KpiCard
          label="What's yours today"
          value={formatCurrency(yours)}
          icon={HandCoins}
          iconClassName="text-primary"
          accent="text-primary"
          description="Your put-in + profit − losses"
          className="border-primary/30"
        />
      </div>
    </div>
  );
}

/**
 * Balance Sheet statement body — used by both the Reports section and the
 * Accounting module. Every account row drills down into its General Ledger
 * (control accounts open the sub-ledger view), and each group shows a clear
 * subtotal with grand totals and the accounting equation check.
 */
export function BalanceSheetStatement({ data, asOfLabel }: { data: BalanceSheetData; asOfLabel: string }) {
  const navigate = useNavigate();
  const openLedger = (id: string) => navigate(`/ledgers?id=${id}`);

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden max-w-4xl mx-auto">
      <div className="p-6 border-b border-border/50 text-center bg-muted/20">
        <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">Balance Sheet</h2>
        <p className="text-sm text-muted-foreground mt-1">As of {asOfLabel}</p>
      </div>

      <div className="p-6 pb-0">
        <PositionSummary data={data} />
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Assets */}
        <div>
          <h3 className="text-base font-bold text-foreground border-b-2 border-primary pb-2 mb-4">Assets</h3>
          <GroupSection groups={data.assetGroups} onOpen={openLedger} />
          <div className="flex justify-between items-center text-base font-bold bg-primary/5 border border-primary/20 p-3 rounded-lg mt-6">
            <span className="text-foreground">Total Assets</span>
            <span className="text-foreground tabular-nums">{formatCurrency(data.totalAssets)}</span>
          </div>
        </div>

        {/* Liabilities & Equity */}
        <div>
          <h3 className="text-base font-bold text-foreground border-b-2 border-rose-500 pb-2 mb-4">Liabilities</h3>
          <GroupSection groups={data.liabilityGroups} onOpen={openLedger} />
          <div className="flex justify-between items-center text-sm font-bold text-foreground border border-border/60 bg-muted/30 p-2.5 rounded-lg mt-4">
            <span>Total Liabilities</span>
            <span className="tabular-nums">{formatCurrency(data.totalLiabilities)}</span>
          </div>

          <h3 className="text-base font-bold text-foreground border-b-2 border-amber-500 pb-2 mt-6 mb-3">Equity</h3>
          <div className="space-y-0.5">
            {data.equityAccounts.map(r => <Row key={r.id} row={r} onOpen={openLedger} />)}
            {data.equityAccounts.length === 0 && <p className="text-xs text-muted-foreground/60 italic px-2 py-1">No balance</p>}
            <div className="flex justify-between items-center text-sm py-1.5 px-2 rounded-md">
              <span className="text-foreground">Current Period Profit</span>
              <span className={`font-medium tabular-nums ${data.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatCurrency(Math.abs(data.netProfit))}{data.netProfit < 0 ? ' (Loss)' : ''}
              </span>
            </div>
          </div>

          <div className={`flex justify-between items-center text-base font-bold p-3 rounded-lg mt-6 border ${data.balanced ? 'bg-muted/30 border-border/50' : 'bg-destructive/10 border-destructive/30'}`}>
            <span className="text-foreground">Total Liabilities & Equity</span>
            <span className={`tabular-nums ${data.balanced ? 'text-foreground' : 'text-destructive'}`}>
              {formatCurrency(data.totalLiabilities + data.totalEquity)}
            </span>
          </div>
        </div>
      </div>

      {/* Equation check */}
      <div className={`px-6 py-4 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm ${data.balanced ? 'bg-success/5' : 'bg-destructive/10'}`}>
        <div className={`flex items-center gap-2 font-medium ${data.balanced ? 'text-success' : 'text-destructive'}`}>
          <Scale className="h-4 w-4" />
          {data.balanced ? 'Balanced — Assets = Liabilities + Equity' : `Not balanced — difference ${formatCurrency(Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)))}`}
        </div>
        <div className="flex items-center gap-6 text-xs text-muted-foreground tabular-nums">
          <span>Assets {formatCurrency(data.totalAssets)}</span>
          <span>=</span>
          <span>Liabilities {formatCurrency(data.totalLiabilities)} + Equity {formatCurrency(data.totalEquity)}</span>
        </div>
      </div>
    </div>
  );
}
