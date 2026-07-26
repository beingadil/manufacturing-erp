import React, { useMemo, useState } from 'react';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Factory, AlertCircle } from 'lucide-react';
import { ProcessingReportService } from "../../../lib/reporting/ProcessingReportService";

export function PendingPCSReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => ProcessingReportService.getPendingPCSReportData(search), [search]);

  const totalPending = data.reduce((sum, item) => sum + item.pendingPcs, 0);

  return (
    <GenericReportTemplate
      title="Pending PCS Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Pending Orders", value: data.length, icon: Factory },
        { title: "Total Pending PCS", value: formatNumber(totalPending), icon: AlertCircle }
      ]}
      columns={[
        { key: "dispatchNo", label: "Dispatch No" },
        { key: "processorName", label: "Processor" },
        { key: "materialName", label: "Material" },
        { key: "sentPcs", label: "Sent PCS", align: "right", render: (item) => formatNumber(item.sentPcs) },
        { key: "pendingPcs", label: "Pending PCS", align: "right", render: (item) => <span className="font-medium text-rose-600">{formatNumber(item.pendingPcs)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        sentPcs: formatNumber(item.sentPcs),
        pendingPcs: formatNumber(item.pendingPcs)
      })}
    />
  );
}
