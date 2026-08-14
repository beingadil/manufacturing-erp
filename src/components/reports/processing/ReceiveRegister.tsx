import { useMemo } from 'react';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { ReportKPICard } from '../common/ReportKPICard';
import { DataTable, Column } from '../../DataTable';
import { Factory, Download, DollarSign } from 'lucide-react';
import { ProcessingReportService } from "../../../lib/reporting/ProcessingReportService";
import { useERPStore } from "../../../store/useERPStore";

export function ReceiveRegister() {
  const { processingReceipts } = useERPStore();
  const totalReceipts = processingReceipts.length;
  const totalReceivedPCS = processingReceipts.reduce((sum, r) => sum + r.pcsReceived, 0);
  const totalProcessingCharges = processingReceipts.reduce((sum, r) => sum + r.billAmount, 0);

  const data = useMemo(() => ProcessingReportService.getReceiveRegisterData(), []);

  const columns: Column<typeof data[0]>[] = [
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "processorName", label: "Processor", sortable: true },
    { key: "pcsReceived", label: "PCS Received", align: "right", sortable: true, render: (item) => formatNumber(item.pcsReceived) },
    { key: "billAmount", label: "Processing Fee", align: "right", sortable: true, render: (item) => <span className="font-bold text-foreground">{formatCurrency(item.billAmount)}</span> }
  ];

  return (
    <div className="space-y-6">
      <ReportFilterBar />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ReportKPICard title="Total Receipts" value={formatNumber(totalReceipts)} icon={Download} />
        <ReportKPICard title="Total PCS Received" value={formatNumber(totalReceivedPCS)} icon={Factory} />
        <ReportKPICard title="Total Processing Charges" value={formatCurrency(totalProcessingCharges)} icon={DollarSign} />
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <DataTable
          data={data}
          columns={columns}
          searchKeys={["processorName"]}
          searchPlaceholder="Search receipts..."
          persistKey="reports-processing-receive"
          defaultSortKey="date"
        />
      </div>
    </div>
  );
}
