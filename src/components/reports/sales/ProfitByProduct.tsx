import React, { useMemo, useState } from 'react';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Package, DollarSign, Activity } from 'lucide-react';
import { SalesReportService } from "../../../lib/reporting/SalesReportService";

export function ProfitByProduct() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => SalesReportService.getProfitByProductData(dateRange, search), [dateRange, search]);

  const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0);
  const totalProfit = data.reduce((sum, item) => sum + item.profit, 0);

  return (
    <GenericReportTemplate
      title="Profit by Product (Estimate)"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Products Sold", value: data.length, icon: Package },
        { title: "Total Revenue", value: formatCurrency(totalRevenue), icon: DollarSign },
        { title: "Total Est. Profit", value: formatCurrency(totalProfit), icon: Activity }
      ]}
      columns={[
        { key: "productName", label: "Product Name" },
        { key: "revenue", label: "Revenue", align: "right", render: (item) => formatCurrency(item.revenue) },
        { key: "cost", label: "Est. Cost", align: "right", render: (item) => formatCurrency(item.cost) },
        { key: "profit", label: "Profit", align: "right", render: (item) => <span className="font-medium text-emerald-600">{formatCurrency(item.profit)}</span> },
        { key: "margin", label: "Margin", align: "right", render: (item) => `${item.margin.toFixed(2)}%` }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        revenue: formatCurrency(item.revenue),
        cost: formatCurrency(item.cost),
        profit: formatCurrency(item.profit),
        margin: `${item.margin.toFixed(2)}%`
      })}
    />
  );
}
