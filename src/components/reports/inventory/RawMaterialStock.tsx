import { useMemo, useState } from 'react';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { PackageSearch, Database } from 'lucide-react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";

export function RawMaterialStock() {
  const [_dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getRawMaterialStockData(search), [search]); // ignoring dateRange since stock is absolute

  const totalStock = data.reduce((sum, item) => sum + item.currentStock, 0);

  return (
    <GenericReportTemplate
      title="Raw Material Stock"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Material Types", value: data.length, icon: Database },
        { title: "Total Units in Stock", value: formatNumber(totalStock), icon: PackageSearch }
      ]}
      columns={[
        { key: "name", label: "Material Name" },
        { key: "unit", label: "Unit" },
        { key: "minStockLevel", label: "Min Level", align: "right", render: (item) => formatNumber(((item as any).minStockLevel || 0)) },
        { key: "currentStock", label: "Current Stock", align: "right", render: (item) => <span className={item.currentStock <= ((item as any).minStockLevel || 0) ? "text-rose-600 font-medium" : "text-emerald-600 font-medium"}>{formatNumber(item.currentStock)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentStock: formatNumber(item.currentStock)
      })}
    />
  );
}
