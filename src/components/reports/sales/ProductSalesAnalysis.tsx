import React, { useMemo, useState } from 'react';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Package, DollarSign, Activity } from 'lucide-react';
import { SalesReportService } from "../../../lib/reporting/SalesReportService";

export function ProductSalesAnalysis() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => SalesReportService.getProductSalesAnalysisData(dateRange, search), [dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.totalAmount, 0);

  return (
    <GenericReportTemplate
      title="Product Sales Analysis"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Products Sold", value: data.length, icon: Package },
        { title: "Transactions", value: data.reduce((sum, item) => sum + item.count, 0), icon: Activity },
        { title: "Total Revenue", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "productName", label: "Product Name" },
        { key: "pcsSold", label: "PCS Sold", align: "right", render: (item) => formatNumber(item.pcsSold) },
        { key: "avgPrice", label: "Avg Price", align: "right", render: (item) => formatCurrency(item.avgPrice) },
        { key: "variance", label: "Price Variance", align: "right", render: (item) => formatCurrency(item.variance) },
        { key: "totalAmount", label: "Total Revenue", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.totalAmount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        pcsSold: formatNumber(item.pcsSold),
        avgPrice: formatCurrency(item.avgPrice),
        variance: formatCurrency(item.variance),
        totalAmount: formatCurrency(item.totalAmount)
      })}
      summaryRows={[[{ productName: 'TOTAL', totalAmount: formatCurrency(totalAmount) }]]}
    />
  );
}
