import { AlertCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function LowStock() {
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getLowStockData(search), [search]);

  return (
    <GenericReportTemplate
      title="Low Stock Report"
      data={data}
      onSearch={setSearch}
      showDateRange={false}
      kpis={[
        { title: "Low Stock Items", value: data.length, icon: AlertCircle }
      ]}
      columns={[
        { key: "name", label: "Material Name" },
        { key: "minStockLevel", label: "Min Level", align: "right" },
        { key: "currentStock", label: "Current Stock", align: "right", render: (item) => <span className="text-warning font-medium">{formatNumber(item.currentStock)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentStock: formatNumber(item.currentStock)
      })}
    />
  );
}
