import React, { useMemo, useState } from 'react';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Package, DollarSign, Target } from 'lucide-react';
import { SalesReportService } from "../../../lib/reporting/SalesReportService";

export function TopSellingProducts() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => SalesReportService.getTopSellingProductsData(dateRange, search), [dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="Top Selling Products"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Products Sold", value: data.length, icon: Package },
        { title: "Highest Sales", value: data.length > 0 ? data[0].productName : 'N/A', icon: Target },
        { title: "Total Revenue", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "productName", label: "Product" },
        { key: "count", label: "Transactions", align: "right" },
        { key: "pcs", label: "PCS Sold", align: "right", render: (item) => formatNumber(item.pcs) },
        { key: "amount", label: "Revenue", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        pcs: formatNumber(item.pcs),
        amount: formatCurrency(item.amount)
      })}
    />
  );
}
