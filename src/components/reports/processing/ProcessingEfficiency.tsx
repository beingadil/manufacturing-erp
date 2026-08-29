import { Factory, Percent, } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ProcessingReportService } from "../../../lib/reporting/ProcessingReportService";
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function ProcessingEfficiency() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => ProcessingReportService.getProcessingEfficiencyData(dateRange, search), [dateRange, search]);

  const totalSent = data.reduce((sum, item) => sum + item.sentPcs, 0);
  const totalReceived = data.reduce((sum, item) => sum + item.receivedPcs, 0);

  return (
    <GenericReportTemplate
      title="Processing Efficiency"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Processors Tracked", value: data.length, icon: Factory },
        { title: "Overall Efficiency", value: `${totalSent ? ((totalReceived / totalSent)*100).toFixed(2) : 0}%`, icon: Percent }
      ]}
      columns={[
        { key: "processorName", label: "Processor" },
        { key: "sentPcs", label: "Sent PCS", align: "right", render: (item) => formatNumber(item.sentPcs) },
        { key: "receivedPcs", label: "Received PCS", align: "right", render: (item) => formatNumber(item.receivedPcs) },
        { key: "efficiency", label: "Efficiency", align: "right", render: (item) => <span className={item.efficiency < 95 ? "text-rose-600" : "text-emerald-600"}>{item.efficiency.toFixed(2)}%</span> },
        { key: "avgTurnaround", label: "Avg Turnaround", align: "right", render: (item) => `${item.avgTurnaround.toFixed(1)} Days` }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        sentPcs: formatNumber(item.sentPcs),
        receivedPcs: formatNumber(item.receivedPcs),
        efficiency: `${item.efficiency.toFixed(2)}%`,
        avgTurnaround: `${item.avgTurnaround.toFixed(1)} Days`
      })}
    />
  );
}
