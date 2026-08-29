import { AlertCircle, CheckCircle2, Factory, Send } from 'lucide-react';
import { useMemo } from 'react';
import { ProcessingReportService } from "../../../lib/reporting/ProcessingReportService";
import { cn, formatCurrency, formatNumber } from '../../../lib/utils';
import { useERPStore } from "../../../store/useERPStore";
import { Column, DataTable } from '../../DataTable';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { ReportKPICard } from '../common/ReportKPICard';

export function DispatchRegister() {
  const { processingSends } = useERPStore();
  const totalDispatches = processingSends.length;
  const totalSentPCS = processingSends.reduce((sum, s) => sum + s.pcsSent, 0);
  const pendingPCS = processingSends.reduce((sum, s) => sum + (s.pcsSent - s.pcsReceived), 0);
  const completedDispatches = processingSends.filter(s => s.status === 'Closed' || s.status === 'Adjusted').length;

  const data = useMemo(() => ProcessingReportService.getDispatchRegisterData(), []);

  const columns: Column<typeof data[0]>[] = [
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "processorName", label: "Processor", sortable: true },
    { key: "materialName", label: "Material", sortable: true },
    { key: "pcsSent", label: "PCS Sent", align: "right", sortable: true, render: (item) => formatNumber(item.pcsSent) },
    { key: "pcsReceived", label: "PCS Received", align: "right", sortable: true, render: (item) => formatNumber(item.pcsReceived) },
    { key: "ratePerPiece", label: "Rate", align: "right", sortable: true, render: (item) => formatCurrency(item.ratePerPiece) },
    { 
      key: "status", 
      label: "Status", 
      sortable: true, 
      render: (item) => (
        <span className={cn(
          "px-2 py-1 text-xs font-medium rounded-md",
          item.status === 'Pending' ? "bg-warning/10 text-amber-600" :
          item.status === 'Partial' ? "bg-info/100/10 text-info" :
          item.status === 'Closed' ? "bg-success/10 text-emerald-600" :
          "bg-purple-500/10 text-purple-600"
        )}>
          {item.status}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <ReportFilterBar />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ReportKPICard title="Total Dispatches" value={formatNumber(totalDispatches)} icon={Send} />
        <ReportKPICard title="Total PCS Sent" value={formatNumber(totalSentPCS)} icon={Factory} />
        <ReportKPICard title="Pending PCS" value={formatNumber(pendingPCS)} icon={AlertCircle} />
        <ReportKPICard title="Completed" value={formatNumber(completedDispatches)} icon={CheckCircle2} />
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <DataTable
          data={data}
          columns={columns}
          searchKeys={["processorName", "materialName"]}
          searchPlaceholder="Search dispatches..."
          persistKey="reports-processing-dispatch"
          defaultSortKey="date"
        />
      </div>
    </div>
  );
}
