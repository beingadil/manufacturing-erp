import { Activity, } from 'lucide-react';
import { useMemo, useState } from 'react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function InventoryTurnover() {
  const [_dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getInventoryTurnoverData(search), [search]);

  return (
    <GenericReportTemplate
      title="Inventory Turnover"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Products Analyzed", value: data.length, icon: Activity }
      ]}
      columns={[
        { key: "name", label: "Product Name" },
        { key: "totalOut", label: "Units Sold/Dispatched", align: "right", render: (item) => formatNumber(item.totalOut) },
        { key: "currentQty", label: "Current Stock", align: "right", render: (item) => formatNumber(item.currentQty) },
        { key: "turnoverRate", label: "Turnover Ratio", align: "right", render: (item) => <span className="font-medium text-emerald-600">{item.turnoverRate.toFixed(2)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        totalOut: formatNumber(item.totalOut),
        currentQty: formatNumber(item.currentQty),
        turnoverRate: item.turnoverRate.toFixed(2)
      })}
    />
  );
}
