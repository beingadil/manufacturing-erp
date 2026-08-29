import { Activity, DollarSign, Package } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PurchaseReportService } from "../../../lib/reporting/PurchaseReportService";
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function MaterialPurchaseReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => PurchaseReportService.getMaterialPurchaseReportData(dateRange, search), [dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="Purchase by Raw Material"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Materials Active", value: data.length, icon: Package },
        { title: "Transactions", value: data.reduce((sum, item) => sum + item.count, 0), icon: Activity },
        { title: "Total Amount", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "materialName", label: "Material Name" },
        { key: "count", label: "Transactions", align: "right" },
        { key: "weight", label: "Total Weight", align: "right", render: (item) => formatNumber(item.weight) },
        { key: "amount", label: "Total Amount", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        weight: formatNumber(item.weight),
        amount: formatCurrency(item.amount)
      })}
      summaryRows={[[{ materialName: 'TOTAL', count: data.reduce((s,i)=>s+i.count,0).toString(), amount: formatCurrency(totalAmount) }]]}
    />
  );
}
