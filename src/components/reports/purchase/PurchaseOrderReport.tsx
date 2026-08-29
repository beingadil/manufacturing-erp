import { format } from 'date-fns';
import { Activity, DollarSign, Scale, ShoppingCart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PurchaseReportService } from "../../../lib/reporting/PurchaseReportService";
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function PurchaseOrderReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => PurchaseReportService.getPurchaseOrderReportData(dateRange, search), [dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
  const totalWeight = data.reduce((sum, item) => sum + item.weight, 0);

  return (
    <GenericReportTemplate
      title="Purchase Order Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Orders", value: data.length, icon: ShoppingCart },
        { title: "Total Weight", value: `${formatNumber(totalWeight)} KGs`, icon: Scale },
        { title: "Avg Order Value", value: formatCurrency(data.length ? totalAmount/data.length : 0), icon: Activity },
        { title: "Total Amount", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "purchaseNo", label: "PO Number" },
        { key: "supplierName", label: "Supplier" },
        { key: "materialName", label: "Material" },
        { key: "weight", label: "Weight", align: "right", render: (item) => formatNumber(item.weight) },
        { key: "amount", label: "Amount", align: "right", render: (item) => <span className="font-medium">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        date: format(new Date(item.date), 'dd-MMM-yyyy'),
        weight: formatNumber(item.weight),
        amount: formatCurrency(item.amount)
      })}
      summaryRows={[[{ materialName: 'TOTAL', weight: formatNumber(totalWeight), amount: formatCurrency(totalAmount) }]]}
    />
  );
}
