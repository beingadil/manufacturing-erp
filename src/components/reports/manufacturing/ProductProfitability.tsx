import { PiggyBank, TrendingUp, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ManufacturingReportService } from '../../../lib/reporting/ManufacturingReportService';
import { formatCurrency, formatNumber, formatPercent } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

/**
 * Product profitability — revenue against the FIFO lot cost each manufactured
 * sale actually posted. Pre-v4 sales fall back to the current material cost.
 */
export function ProductProfitability() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');
  const data = useMemo(
    () => ManufacturingReportService.getProductProfitabilityData(dateRange, search),
    [dateRange, search],
  );

  const totalRevenue = data.reduce((sum, row) => sum + row.revenue, 0);
  const totalCogs = data.reduce((sum, row) => sum + row.cogs, 0);
  const totalProfit = totalRevenue - totalCogs;
  const blendedMargin = totalRevenue > 0 ? totalProfit / totalRevenue : 0;

  return (
    <GenericReportTemplate
      title="Manufacturing — Product Profitability"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: 'Revenue', value: formatCurrency(totalRevenue), icon: Wallet },
        { title: 'Gross Profit', value: formatCurrency(totalProfit), icon: PiggyBank },
        { title: 'Blended Margin', value: formatPercent(blendedMargin), icon: TrendingUp },
      ]}
      columns={[
        { key: 'productName', label: 'Product', sortable: true },
        { key: 'saleCount', label: 'Sales', align: 'right', sortable: true, render: item => formatNumber(item.saleCount) },
        { key: 'pcsSold', label: 'PCS Sold', align: 'right', sortable: true, render: item => formatNumber(item.pcsSold) },
        { key: 'revenue', label: 'Revenue', align: 'right', sortable: true, render: item => formatCurrency(item.revenue) },
        { key: 'cogs', label: 'COGS (lot cost)', align: 'right', sortable: true, render: item => formatCurrency(item.cogs) },
        {
          key: 'profit',
          label: 'Gross Profit',
          align: 'right',
          sortable: true,
          render: item => (
            <span className={item.profit < 0 ? 'font-semibold text-destructive' : 'font-semibold text-emerald-600 dark:text-emerald-400'}>
              {formatCurrency(item.profit)}
            </span>
          ),
        },
        {
          key: 'margin',
          label: 'Margin',
          align: 'right',
          sortable: true,
          render: item => <span className={item.margin < 0 ? 'text-destructive' : 'text-muted-foreground'}>{formatPercent(item.margin)}</span>,
        },
      ]}
      tableSummaryRow={[
        <span key="label" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</span>,
        <span key="sales" />,
        <span key="pcs" />,
        <span key="revenue" className="text-right font-semibold tabular-nums">{formatCurrency(totalRevenue)}</span>,
        <span key="cogs" className="text-right font-semibold tabular-nums">{formatCurrency(totalCogs)}</span>,
        <span key="profit" className="text-right font-semibold tabular-nums">{formatCurrency(totalProfit)}</span>,
        <span key="margin" className="text-right font-semibold tabular-nums">{formatPercent(blendedMargin)}</span>,
      ]}
      searchKeys={['productName']}
      searchPlaceholder="Search products…"
      exportDataMapping={item => ({
        ...item,
        saleCount: formatNumber(item.saleCount),
        pcsSold: formatNumber(item.pcsSold),
        revenue: formatCurrency(item.revenue),
        cogs: formatCurrency(item.cogs),
        profit: formatCurrency(item.profit),
        margin: formatPercent(item.margin),
      })}
    />
  );
}
