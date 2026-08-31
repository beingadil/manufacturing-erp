import { Clock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function InventoryAging() {
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getInventoryAgingData(search), [search]);

  return (
    <GenericReportTemplate
      title="Inventory Aging Report"
      data={data}
      onSearch={setSearch}
      showDateRange={false}
      kpis={[
        { title: "Active Batches", value: data.length, icon: Clock }
      ]}
      columns={[
        { key: "batchNo", label: "Batch/Lot" },
        { key: "materialName", label: "Material" },
        { key: "remainingPcs", label: "Remaining PCS", align: "right", render: (item) => formatNumber(item.remainingPcs) },
        { key: "daysOld", label: "Age (Days)", align: "right", render: (item) => <span className={item.daysOld > 90 ? "text-destructive font-medium" : ""}>{item.daysOld}</span> },
        { key: "bracket", label: "Aging Bracket" }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        remainingPcs: formatNumber(item.remainingPcs)
      })}
    />
  );
}
