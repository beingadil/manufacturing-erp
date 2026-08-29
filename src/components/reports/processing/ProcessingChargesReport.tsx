import { DollarSign, Factory } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ProcessingReportService } from "../../../lib/reporting/ProcessingReportService";
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function ProcessingChargesReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => ProcessingReportService.getProcessingChargesReportData(dateRange, search), [dateRange, search]);

  const totalCharges = data.reduce((sum, item) => sum + item.totalCharges, 0);

  return (
    <GenericReportTemplate
      title="Processing Charges Analysis"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Processors Tracked", value: data.length, icon: Factory },
        { title: "Total Charges", value: formatCurrency(totalCharges), icon: DollarSign }
      ]}
      columns={[
        { key: "processorName", label: "Processor" },
        { key: "totalPcs", label: "Total PCS", align: "right", render: (item) => formatNumber(item.totalPcs) },
        { key: "totalCharges", label: "Total Charges", align: "right", render: (item) => formatCurrency(item.totalCharges) },
        { key: "avgChargePerPc", label: "Avg / PC", align: "right", render: (item) => formatCurrency(item.avgChargePerPc) }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        totalPcs: formatNumber(item.totalPcs),
        totalCharges: formatCurrency(item.totalCharges),
        avgChargePerPc: formatCurrency(item.avgChargePerPc)
      })}
    />
  );
}
