import React, { useMemo, useState } from 'react';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Activity, DollarSign, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { SalesReportService } from "../../../lib/reporting/SalesReportService";

export function SalesTrend() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => SalesReportService.getSalesTrendData(dateRange, search), [dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="Sales Trend Report"
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
        { key: "pcs", label: "PCS Sold", align: "right", render: (item) => formatNumber(item.pcs) },
        { key: "amount", label: "Amount", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        pcs: formatNumber(item.pcs),
        amount: formatCurrency(item.amount)
      })}
    />
  );
}
