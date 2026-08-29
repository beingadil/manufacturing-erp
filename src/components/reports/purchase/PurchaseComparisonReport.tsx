import { Activity, DollarSign, Percent } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PurchaseReportService } from "../../../lib/reporting/PurchaseReportService";
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function PurchaseComparisonReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => PurchaseReportService.getPurchaseComparisonReportData(dateRange, search), [dateRange, search]);

  const totalCurrent = data.reduce((sum, item) => sum + item.currentAmount, 0);
  const totalPrev = data.reduce((sum, item) => sum + item.prevAmount, 0);
  const totalGrowth = totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : 0;

  return (
    <GenericReportTemplate
      title="Purchase Comparison (Current vs Previous Period)"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Current Period Purchases", value: formatCurrency(totalCurrent), icon: DollarSign },
        { title: "Previous Period Purchases", value: formatCurrency(totalPrev), icon: DollarSign },
        { title: "Growth %", value: `${totalGrowth.toFixed(2)}%`, icon: Percent },
        { title: "Materials Compared", value: data.length, icon: Activity }
      ]}
      columns={[
        { key: "materialName", label: "Material Name" },
        { key: "currentWeight", label: "Current Weight", align: "right", render: (item) => formatNumber(item.currentWeight) },
        { key: "prevWeight", label: "Prev Weight", align: "right", render: (item) => formatNumber(item.prevWeight) },
        { key: "currentAmount", label: "Current Amount", align: "right", render: (item) => formatCurrency(item.currentAmount) },
        { key: "prevAmount", label: "Prev Amount", align: "right", render: (item) => formatCurrency(item.prevAmount) },
        { key: "growth", label: "Growth", align: "right", render: (item) => <span className={item.growth > 0 ? "text-emerald-600" : "text-rose-600"}>{item.growth > 0 ? '+' : ''}{item.growth.toFixed(2)}%</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentWeight: formatNumber(item.currentWeight),
        prevWeight: formatNumber(item.prevWeight),
        currentAmount: formatCurrency(item.currentAmount),
        prevAmount: formatCurrency(item.prevAmount),
        growth: `${item.growth > 0 ? '+' : ''}${item.growth.toFixed(2)}%`
      })}
      summaryRows={[[{ materialName: 'TOTAL', currentAmount: formatCurrency(totalCurrent), prevAmount: formatCurrency(totalPrev), growth: `${totalGrowth > 0 ? '+' : ''}${totalGrowth.toFixed(2)}%` }]]}
    />
  );
}
