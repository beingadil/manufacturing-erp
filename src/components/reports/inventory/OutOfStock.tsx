import { AlertOctagon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function OutOfStock() {
  const [_dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getOutOfStockData(search), [search]);

  return (
    <GenericReportTemplate
      title="Out of Stock Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Out of Stock Items", value: data.length, icon: AlertOctagon }
      ]}
      columns={[
        { key: "type", label: "Item Type" },
        { key: "name", label: "Item Name" },
        { key: "currentStock", label: "Current Stock", align: "right", render: () => <span className="text-rose-600 font-medium">0</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentStock: '0'
      })}
    />
  );
}
