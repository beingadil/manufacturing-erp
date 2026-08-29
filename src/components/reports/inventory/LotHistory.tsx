import { format } from 'date-fns';
import { Activity, PackageSearch } from 'lucide-react';
import { useMemo, useState } from 'react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function LotHistory() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getLotHistoryData(dateRange, search), [dateRange, search]);

  return (
    <GenericReportTemplate
      title="Lot / Batch History"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Lots", value: data.length, icon: PackageSearch },
        { title: "Active Lots", value: data.filter(d => d.status === 'Active').length, icon: Activity }
      ]}
      columns={[
        { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "batchNo", label: "Lot Number" },
        { key: "materialName", label: "Material" },
        { key: "supplierName", label: "Supplier" },
        { key: "initialPcs", label: "Initial PCS", align: "right", render: (item) => formatNumber(item.initialPcs) },
        { key: "remainingPcs", label: "Remaining PCS", align: "right", render: (item) => formatNumber(item.remainingPcs) },
        { key: "status", label: "Status" }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        date: format(new Date(item.date), 'dd-MMM-yyyy'),
        initialPcs: formatNumber(item.initialPcs),
        remainingPcs: formatNumber(item.remainingPcs)
      })}
    />
  );
}
