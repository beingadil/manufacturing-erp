import { format } from 'date-fns';
import { Activity, DollarSign } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ProcessingReportService } from "../../../lib/reporting/ProcessingReportService";
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function ProcessorBillingReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => ProcessingReportService.getProcessorBillingReportData(dateRange, search), [dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.billAmount, 0);

  return (
    <GenericReportTemplate
      title="Processor Billing Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Bills", value: data.length, icon: Activity },
        { title: "Total Amount", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "receiveNo", label: "Receipt No" },
        { key: "processorName", label: "Processor" },
        { key: "pcsReceived", label: "PCS", align: "right", render: (item) => formatNumber(item.pcsReceived) },
        { key: "billAmount", label: "Bill Amount", align: "right", render: (item) => formatCurrency(item.billAmount) }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        date: format(new Date(item.date), 'dd-MMM-yyyy'),
        pcsReceived: formatNumber(item.pcsReceived),
        billAmount: formatCurrency(item.billAmount)
      })}
    />
  );
}
