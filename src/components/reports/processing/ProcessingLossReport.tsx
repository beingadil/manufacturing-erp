import { AlertCircle, Factory, } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ProcessingReportService } from "../../../lib/reporting/ProcessingReportService";
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function ProcessingLossReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => ProcessingReportService.getProcessingLossReportData(dateRange, search), [dateRange, search]);

  const totalLoss = data.reduce((sum, item) => sum + item.lossPcs, 0);

  return (
    <GenericReportTemplate
      title="Processing Loss / Wastage"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Processors", value: data.length, icon: Factory },
        { title: "Total Loss (PCS)", value: formatNumber(totalLoss), icon: AlertCircle }
      ]}
      columns={[
        { key: "processorName", label: "Processor Name" },
        { key: "stageName", label: "Stage" },
        { key: "sentPcs", label: "Sent (PCS)", align: "right", render: (item) => formatNumber(item.sentPcs) },
        { key: "receivedPcs", label: "Received (PCS)", align: "right", render: (item) => formatNumber(item.receivedPcs) },
        { key: "lossPcs", label: "Loss (PCS)", align: "right", render: (item) => <span className="text-rose-600 font-medium">{formatNumber(item.lossPcs)}</span> },
        { key: "pendingPcs", label: "Pending (PCS)", align: "right", render: (item) => formatNumber(item.pendingPcs || 0) },
        { key: "lossPercentage", label: "Loss %", align: "right", render: (item) => `${item.lossPercentage.toFixed(2)}%` }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        sentPcs: formatNumber(item.sentPcs),
        receivedPcs: formatNumber(item.receivedPcs),
        lossPcs: formatNumber(item.lossPcs),
        pendingPcs: formatNumber(item.pendingPcs || 0),
        lossPercentage: `${item.lossPercentage.toFixed(2)}%`
      })}
    />
  );
}
