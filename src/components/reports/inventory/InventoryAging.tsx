import { useMemo, useState } from 'react';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Clock } from 'lucide-react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";

export function InventoryAging() {
  const [_dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getInventoryAgingData(search), [search]);

  return (
    <GenericReportTemplate
      title="Inventory Aging Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Active Batches", value: data.length, icon: Clock }
      ]}
      columns={[
        { key: "batchNo", label: "Batch/Lot" },
        { key: "materialName", label: "Material" },
        { key: "remainingPcs", label: "Remaining PCS", align: "right", render: (item) => formatNumber(item.remainingPcs) },
        { key: "daysOld", label: "Age (Days)", align: "right", render: (item) => <span className={item.daysOld > 90 ? "text-rose-600 font-medium" : ""}>{item.daysOld}</span> },
        { key: "bracket", label: "Aging Bracket" }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        remainingPcs: formatNumber(item.remainingPcs)
      })}
    />
  );
}
