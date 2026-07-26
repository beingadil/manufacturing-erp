import React, { useMemo, useState } from 'react';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Activity, DollarSign, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { PurchaseReportService } from "../../../lib/reporting/PurchaseReportService";

export function PurchaseTrend() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => PurchaseReportService.getPurchaseTrendData(dateRange, search), [dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="Purchase Trend Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Active Days", value: data.length, icon: Calendar },
        { title: "Total Transactions", value: data.reduce((sum, item) => sum + item.count, 0), icon: Activity },
        { title: "Total Volume", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "dateStr", label: "Date" },
        { key: "count", label: "Transactions", align: "right" },
        { key: "weight", label: "Weight", align: "right", render: (item) => formatNumber(item.weight) },
        { key: "amount", label: "Amount", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        weight: formatNumber(item.weight),
        amount: formatCurrency(item.amount)
      })}
      summaryRows={[[{ dateStr: 'TOTAL', count: data.reduce((s,i)=>s+i.count,0).toString(), amount: formatCurrency(totalAmount) }]]}
    />
  );
}
