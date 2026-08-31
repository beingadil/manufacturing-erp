import { Activity, } from 'lucide-react';
import { useMemo, useState } from 'react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function InventoryTurnover() {
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getInventoryTurnoverData(search), [search]);

  return (
    <GenericReportTemplate
      title="Inventory Turnover"
      data={data}
      onSearch={setSearch}
      showDateRange={false}
      kpis={[
        { title: "Products Analyzed", value: data.length, icon: Activity }
      ]}
      columns={[
        { key: "name", label: "Product Name" },
        { key: "totalOut", label: "Units Sold/Dispatched", align: "right", render: (item) => formatNumber(item.totalOut) },
        { key: "currentQty", label: "Current Stock", align: "right", render: (item) => formatNumber(item.currentQty) },
        { key: "turnoverRate", label: "Turnover Ratio", align: "right", render: (item) => <span className="font-medium text-success">{item.turnoverRate.toFixed(2)}</span> }
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
