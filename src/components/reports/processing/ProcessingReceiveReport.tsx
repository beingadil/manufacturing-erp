import { format } from 'date-fns';
import { Factory, Hash, Package } from 'lucide-react';
import { useMemo, useState } from 'react';
import { exportToCSV, exportToExcel } from '../../../lib/exportUtils';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { ProcessingReportService } from "../../../lib/reporting/ProcessingReportService";
import { formatNumber } from '../../../lib/utils';
import { Column, DataTable } from '../../DataTable';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { ReportKPICard } from '../common/ReportKPICard';

export function ProcessingReceiveReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => ProcessingReportService.getProcessingReceiveReportData(dateRange, search), [dateRange, search]);

  const totalReceipts = data.length;
  const totalPcs = data.reduce((sum, p) => sum + p.pcsReceived, 0);

  const columns: Column<typeof data[0]>[] = [
    { key: "date", label: "Date", sortable: true, render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
    { key: "receiveNo", label: "Receipt No", sortable: true },
    { key: "dispatchNo", label: "Dispatch No", sortable: true },
    { key: "processorName", label: "Processor", sortable: true },
    { key: "materialName", label: "Material", sortable: true },
    { key: "pcsReceived", label: "PCS Received", align: "right", render: (item) => formatNumber(item.pcsReceived) }
  ];

  const exportColumns = [
    { header: 'Date', dataKey: 'date' },
    { header: 'Receipt No', dataKey: 'receiveNo' },
    { header: 'Dispatch No', dataKey: 'dispatchNo' },
    { header: 'Processor', dataKey: 'processorName' },
    { header: 'Material', dataKey: 'materialName' },
    { header: 'PCS Received', dataKey: 'pcsReceived' }
  ];

  const exportData = data.map(d => ({
    ...d,
    date: format(new Date(d.date), 'dd-MMM-yyyy'),
    pcsReceived: formatNumber(d.pcsReceived)
  }));

  const handleExportPDF = () => generateEnterpriseDocument({
    title: 'Processing Receive Report', filters: [{ label: 'Date Range', value: dateRange.label }],
    tables: [{
      columns: exportColumns.map(c => ({ header: c.header, dataKey: c.dataKey, align: ['pcsReceived'].includes(c.dataKey) ? 'right' : 'left' })),
      rows: exportData,
      summaryRows: [[{ materialName: 'TOTAL', pcsReceived: formatNumber(totalPcs) }]]
    }]
  });

  return (
    <div className="space-y-6">
      <ReportFilterBar 
        onSearch={setSearch} onDateRangeChange={setDateRange}
        onExportPDF={handleExportPDF}
        onExportExcel={() => exportToExcel({ filename: 'Processing_Receive.xlsx', data: exportData, columns: exportColumns })}
        onExportCSV={() => exportToCSV({ filename: 'Processing_Receive.csv', data: exportData, columns: exportColumns })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ReportKPICard title="Total Receipts" value={totalReceipts.toString()} icon={Package} />
        <ReportKPICard title="Processors" value={new Set(data.map(d => d.processorName)).size.toString()} icon={Factory} />
        <ReportKPICard title="Total PCS Received" value={formatNumber(totalPcs)} icon={Hash} />
      </div>
      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
        <DataTable data={data} columns={columns} />
      </div>
    </div>
  );
}
