import { ArrowRight, HandCoins, Package, Scale, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../../lib/utils';
import { KpiCard } from '../../ui/KpiCard';
import type { BalanceSheetData } from './BalanceSheetStatement';

/**
 * "Where you stand" strip for the Profit & Loss page. The P&L statement is a
 * period view (revenue − COGS − expenses) and, by accounting design, never
 * shows the balance sheet. Owners, however, read the P&L asking "where do we
 * stand?" — this strip answers that question with the exact same figures the
 * Balance Sheet and Dashboard use (nothing is calculated twice):
 *
 *   Inventory on hand (Raw / WIP / Finished from the ledger-aligned groups)
 *   Money you put in · Net P/L (all time) · What's yours today
 *
 * The inventory rows are derived from the Balance Sheet's Inventory group,
 * which is already split into the three physical stage buckets, so both pages
 * show identical amounts.
 */
export function PnlPositionStrip({ data, asOfLabel }: { data: BalanceSheetData; asOfLabel: string }) {
  const navigate = useNavigate();

  const inventoryGroup = data.assetGroups.find(g => g.label === 'Inventory');
  const rowOf = (kw: string) => inventoryGroup?.rows.find(r => r.name.toLowerCase().includes(kw))?.balance ?? 0;
  const raw = rowOf('raw material');
  const wip = rowOf('work in progress');
  const finished = rowOf('finished');
  const inventoryTotal = inventoryGroup?.total ?? 0;

  const invested = data.totalEquityAccounts;
  const netProfit = data.netProfit;
  const yours = data.totalEquity;
  const profitPositive = netProfit > 0.01;
  const profitNegative = netProfit < -0.01;

  return (
    <div className="w-full max-w-4xl rounded-2xl border border-primary/25 bg-primary/5 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
          <Scale className="h-4 w-4 text-primary" />
          Where you stand
          <span className="hidden sm:inline font-medium normal-case tracking-normal text-muted-foreground">· as of {asOfLabel}</span>
        </h3>
        <button
          onClick={() => navigate('/accounting/balance-sheet')}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
        >
          View Balance Sheet <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard
          label="Inventory on hand"
          value={formatCurrency(inventoryTotal)}
          icon={Package}
          iconClassName="text-violet-500"
          description={
            <span>
              Raw {formatCurrency(raw)} · WIP {formatCurrency(wip)} · FG {formatCurrency(finished)}
            </span>
          }
        />
        <KpiCard
          label="Money you put in"
          value={formatCurrency(invested)}
          icon={Wallet}
          iconClassName="text-amber-500"
          description="Your capital + profits kept in the business"
        />
        <KpiCard
          label="Net P/L (all time)"
          value={profitNegative ? `−${formatCurrency(Math.abs(netProfit))}` : formatCurrency(netProfit)}
          icon={profitNegative ? TrendingDown : TrendingUp}
          iconClassName={profitNegative ? 'text-destructive' : 'text-success'}
          accent={profitNegative ? 'text-destructive' : profitPositive ? 'text-success' : 'text-foreground'}
          description="Sales − COGS − all expenses, same as Balance Sheet"
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
