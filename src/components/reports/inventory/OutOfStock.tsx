import { AlertOctagon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function OutOfStock() {
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getOutOfStockData(search), [search]);

  return (
    <GenericReportTemplate
      title="Out of Stock Report"
      data={data}
      onDateRangeChange={() => {}}      onSearch={setSearch}
      showDateRange={false}
      kpis={[
        { title: "Out of Stock Items", value: data.length, icon: AlertOctagon }
      ]}
      columns={[
        { key: "type", label: "Item Type" },
        { key: "name", label: "Item Name" },
        { key: "currentStock", label: "Current Stock", align: "right", render: (item) => <span className="text-destructive font-medium">{formatNumber(item.currentStock)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentStock: formatNumber(item.currentStock)
      })}
    />
  );
}
