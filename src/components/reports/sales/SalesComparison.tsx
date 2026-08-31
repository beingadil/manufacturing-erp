import { DollarSign, Percent } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SalesReportService } from "../../../lib/reporting/SalesReportService";
import { formatCurrency, formatPercent } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function SalesComparison() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => SalesReportService.getSalesComparisonData(dateRange, search), [dateRange, search]);

  const totalCurrent = data.reduce((sum, item) => sum + item.currentAmount, 0);
  const totalPrev = data.reduce((sum, item) => sum + item.prevAmount, 0);
  const totalGrowth = totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : 0;

  return (
    <GenericReportTemplate
      title="Sales Comparison Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Current Revenue", value: formatCurrency(totalCurrent), icon: DollarSign },
        { title: "Previous Revenue", value: formatCurrency(totalPrev), icon: DollarSign },
        { title: "Growth %", value: formatPercent(totalGrowth / 100), icon: Percent }
      ]}
      columns={[
        { key: "productName", label: "Product Name" },
        { key: "currentAmount", label: "Current Revenue", align: "right", render: (item) => formatCurrency(item.currentAmount) },
        { key: "prevAmount", label: "Prev Revenue", align: "right", render: (item) => formatCurrency(item.prevAmount) },
        { key: "growth", label: "Growth", align: "right", render: (item) => <span className={item.growth > 0 ? "text-success" : item.growth < 0 ? "text-destructive" : "text-muted-foreground"}>{item.growth > 0 ? '+' : ''}{formatPercent(item.growth / 100)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentAmount: formatCurrency(item.currentAmount),
        prevAmount: formatCurrency(item.prevAmount),
        growth: `${item.growth > 0 ? '+' : ''}${formatPercent(item.growth / 100)}`
      })}
      tableSummaryRow={[
        'TOTAL',
        formatCurrency(totalCurrent),
        formatCurrency(totalPrev),
        <span className={totalGrowth > 0 ? "text-success" : totalGrowth < 0 ? "text-destructive" : "text-muted-foreground"}>{formatPercent(totalGrowth / 100)}</span>
      ]}
    />
  );
}
