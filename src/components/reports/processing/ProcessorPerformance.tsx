import { DollarSign, Factory, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ProcessingReportService } from "../../../lib/reporting/ProcessingReportService";
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function ProcessorPerformance() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => ProcessingReportService.getProcessorPerformanceData(dateRange, search), [dateRange, search]);

  const totalVolume = data.reduce((sum, item) => sum + item.totalVolume, 0);

  return (
    <GenericReportTemplate
      title="Processor Performance"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Processors Tracked", value: data.length, icon: Factory },
        { title: "Total Processing Volume", value: formatNumber(totalVolume), icon: Target },
        { title: "Total Value Generated", value: formatCurrency(data.reduce((sum, item) => sum + item.totalValue, 0)), icon: DollarSign }
      ]}
      columns={[
        { key: "processorName", label: "Processor Name" },
        { key: "jobs", label: "Completed Jobs", align: "right" },
        { key: "totalVolume", label: "Total Volume (PCS)", align: "right", render: (item) => formatNumber(item.totalVolume) },
        { key: "totalValue", label: "Total Value Generated", align: "right", render: (item) => formatCurrency(item.totalValue) },
        { key: "avgJobValue", label: "Avg Job Value", align: "right", render: (item) => formatCurrency(item.avgJobValue) }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        totalVolume: formatNumber(item.totalVolume),
        totalValue: formatCurrency(item.totalValue),
        avgJobValue: formatCurrency(item.avgJobValue)
      })}
    />
  );
}
