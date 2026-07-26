import React, { useMemo, useState } from 'react';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Activity, DollarSign, Target } from 'lucide-react';
import { PurchaseReportService } from "../../../lib/reporting/PurchaseReportService";

export function PurchaseCostAnalysis() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => PurchaseReportService.getPurchaseCostAnalysisData(dateRange, search), [dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="Purchase Cost Analysis"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Materials Analyzed", value: data.length, icon: Target },
        { title: "Total Transactions", value: data.reduce((sum, item) => sum + item.count, 0), icon: Activity },
        { title: "Total Value Analyzed", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "materialName", label: "Material Name" },
        { key: "minRate", label: "Min Rate", align: "right", render: (item) => formatCurrency(item.minRate) },
        { key: "maxRate", label: "Max Rate", align: "right", render: (item) => formatCurrency(item.maxRate) },
        { key: "avgRate", label: "Avg Rate", align: "right", render: (item) => formatCurrency(item.avgRate) },
        { key: "variance", label: "Variance", align: "right", render: (item) => <span className={item.variance > 0 ? "text-rose-600 font-medium" : ""}>{formatCurrency(item.variance)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        minRate: formatCurrency(item.minRate),
        maxRate: formatCurrency(item.maxRate),
        avgRate: formatCurrency(item.avgRate),
        variance: formatCurrency(item.variance)
      })}
    />
  );
}
