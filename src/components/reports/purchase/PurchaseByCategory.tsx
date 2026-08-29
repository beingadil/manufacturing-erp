import { Activity, DollarSign, Package } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PurchaseReportService } from "../../../lib/reporting/PurchaseReportService";
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function PurchaseByCategory() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => PurchaseReportService.getPurchaseByCategoryData(dateRange, search), [dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="Purchase by Category"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Categories Active", value: data.length, icon: Package },
        { title: "Transactions", value: data.reduce((sum, item) => sum + item.count, 0), icon: Activity },
        { title: "Total Value", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "categoryName", label: "Category" },
        { key: "count", label: "Transactions", align: "right" },
        { key: "weight", label: "Total Weight", align: "right", render: (item) => formatNumber(item.weight) },
        { key: "amount", label: "Total Value", align: "right", render: (item) => <span className="font-medium">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        weight: formatNumber(item.weight),
        amount: formatCurrency(item.amount)
      })}
      summaryRows={[[{ categoryName: 'TOTAL', count: data.reduce((s,i)=>s+i.count,0).toString(), amount: formatCurrency(totalAmount) }]]}
    />
  );
}
