import { DollarSign, Hash, Scale, ShoppingCart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PurchaseReportService } from "../../../lib/reporting/PurchaseReportService";
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function PurchaseSummary() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => PurchaseReportService.getPurchaseSummaryData(dateRange, search), [dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
  const totalWeight = data.reduce((sum, item) => sum + item.weight, 0);

  return (
    <GenericReportTemplate
      title="Purchase Summary"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Suppliers", value: data.length, icon: ShoppingCart },
        { title: "Total Weight", value: `${formatNumber(totalWeight)} KGs`, icon: Scale },
        { title: "Total PCS", value: formatNumber(data.reduce((sum, item) => sum + item.calculatedPcs, 0)), icon: Hash },
        { title: "Total Amount", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "supplierName", label: "Supplier" },
        { key: "count", label: "Purchase Count", align: "right" },
        { key: "weight", label: "Total Weight (KGs)", align: "right", render: (item) => formatNumber(item.weight) },
        { key: "calculatedPcs", label: "Total PCS", align: "right", render: (item) => formatNumber(item.calculatedPcs) },
        { key: "amount", label: "Total Amount", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        weight: formatNumber(item.weight),
        calculatedPcs: formatNumber(item.calculatedPcs),
        amount: formatCurrency(item.amount)
      })}
      summaryRows={[[{ supplierName: 'TOTAL', count: data.reduce((s,i)=>s+i.count,0).toString(), weight: formatNumber(totalWeight), amount: formatCurrency(totalAmount) }]]}
    />
  );
}
