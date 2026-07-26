import React, { useMemo, useState } from 'react';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { AlertCircle } from 'lucide-react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";

export function LowStock() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getLowStockData(search), [search]);

  return (
    <GenericReportTemplate
      title="Low Stock Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Low Stock Items", value: data.length, icon: AlertCircle }
      ]}
      columns={[
        { key: "name", label: "Material Name" },
        { key: "minStockLevel", label: "Min Level", align: "right" },
        { key: "currentStock", label: "Current Stock", align: "right", render: (item) => <span className="text-amber-600 font-medium">{formatNumber(item.currentStock)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentStock: formatNumber(item.currentStock)
      })}
    />
  );
}
