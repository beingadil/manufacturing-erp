import { useMemo, useState } from 'react';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Activity, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";

export function StockAdjustmentReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getStockAdjustmentReportData(dateRange, search), [dateRange, search]);

  return (
    <GenericReportTemplate
      title="Stock Adjustment Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Adjustments", value: data.length, icon: Activity },
        { title: "Items Affected", value: new Set(data.map(d => d.itemName)).size, icon: AlertCircle }
      ]}
      columns={[
        { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "referenceNo", label: "Ref No" },
        { key: "itemName", label: "Item" },
        { key: "quantity", label: "Qty Adjusted", align: "right", render: (item) => formatNumber(item.quantity) },
        { key: "remarks", label: "Reason" }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        date: format(new Date(item.date), 'dd-MMM-yyyy'),
        quantity: formatNumber(item.quantity)
      })}
    />
  );
}
