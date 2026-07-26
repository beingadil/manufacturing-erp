import React, { useMemo, useState } from 'react';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { AlertOctagon } from 'lucide-react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";

export function OutOfStock() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
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
        { key: "currentStock", label: "Current Stock", align: "right", render: (item) => <span className="text-rose-600 font-medium">0</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentStock: '0'
      })}
    />
  );
}
