import { format } from 'date-fns';
import { DollarSign, Hash, Scale, ShoppingCart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PurchaseReportService } from '../../../lib/reporting/PurchaseReportService';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function PurchaseRegister() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    return PurchaseReportService.getPurchaseRegister(dateRange, search);
  }, [dateRange, search]);

  const totalPurchases = data.length;
  const totalWeight = data.reduce((sum, p) => sum + p.weight, 0);
  const totalPcs = data.reduce((sum, p) => sum + p.calculatedPcs, 0);
  const totalAmount = data.reduce((sum, p) => sum + p.amount, 0);

  return (
    <GenericReportTemplate
      title="Purchase Register"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Purchases", value: totalPurchases.toString(), icon: ShoppingCart },
        { title: "Total Weight", value: `${formatNumber(totalWeight)} KGs`, icon: Scale },
        { title: "Total PCS", value: formatNumber(totalPcs), icon: Hash },
        { title: "Total Amount", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "date", label: "Date", sortable: true, render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "purchaseNo", label: "Purchase No", sortable: true },
        { key: "supplierName", label: "Supplier", sortable: true },
        { key: "materialName", label: "Material", sortable: true },
        { key: "weight", label: "Weight", align: "right", render: (item) => `${formatNumber(item.weight)} ${item.weightUnit || 'KGs'}` },
        { key: "calculatedPcs", label: "PCS", align: "right", render: (item) => formatNumber(item.calculatedPcs) },
        { key: "ratePerUnit", label: "Rate", align: "right", render: (item) => formatCurrency(item.ratePerUnit) },
        { key: "amount", label: "Amount", align: "right", render: (item) => formatCurrency(item.amount) }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        date: item.date,
        weight: `${formatNumber(item.weight)} ${item.weightUnit || 'KGs'}`,
        calculatedPcs: formatNumber(item.calculatedPcs),
        ratePerUnit: formatCurrency(item.ratePerUnit),
        amount: formatCurrency(item.amount)
      })}
      summaryRows={[[{ amount: 'TOTAL', ratePerUnit: formatCurrency(totalAmount) }]]}
      tableSummaryRow={[
        'TOTAL', '', '', '',
        `${formatNumber(totalWeight)} KGs`,
        formatNumber(totalPcs),
        '',
        formatCurrency(totalAmount)
      ]}
    />
  );
}
