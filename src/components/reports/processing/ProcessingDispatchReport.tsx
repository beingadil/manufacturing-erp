import React, { useMemo, useState } from 'react';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { DataTable, Column } from '../../DataTable';
import { ReportKPICard } from '../common/ReportKPICard';
import { Factory, Send, Hash } from 'lucide-react';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { exportToExcel, exportToCSV } from '../../../lib/exportUtils';
import { format } from 'date-fns';
import { ProcessingReportService } from "../../../lib/reporting/ProcessingReportService";

export function ProcessingDispatchReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => ProcessingReportService.getProcessingDispatchReportData(dateRange, search), [dateRange, search]);

  const totalDispatches = data.length;
  const totalPcs = data.reduce((sum, p) => sum + p.pcsSent, 0);

  const columns: Column<typeof data[0]>[] = [
    { key: "date", label: "Date", sortable: true, render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
    { key: "dispatchNo", label: "Dispatch No", sortable: true },
    { key: "processorName", label: "Processor", sortable: true },
    { key: "materialName", label: "Material", sortable: true },
    { key: "pcsSent", label: "PCS Dispatched", align: "right", render: (item) => formatNumber(item.pcsSent) },
    { key: "ratePerPiece", label: "Rate", align: "right", render: (item) => formatCurrency(item.ratePerPiece) },
    { key: "status", label: "Status", render: (item) => (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
        item.status === 'Closed' ? 'bg-success/20 text-success' :
        item.status === 'Partial' ? 'bg-warning/20 text-warning' :
        'bg-info/20 text-blue-700'
      }`}>
        {item.status}
      </span>
    )}
  ];

  const exportColumns = [
    { header: 'Date', dataKey: 'date' },
    { header: 'Dispatch No', dataKey: 'dispatchNo' },
    { header: 'Processor', dataKey: 'processorName' },
    { header: 'Material', dataKey: 'materialName' },
    { header: 'PCS Dispatched', dataKey: 'pcsSent' },
    { header: 'Rate', dataKey: 'ratePerPiece' },
    { header: 'Status', dataKey: 'status' }
  ];

  const exportData = data.map(d => ({
    ...d,
    date: format(new Date(d.date), 'dd-MMM-yyyy'),
    pcsSent: formatNumber(d.pcsSent),
    ratePerPiece: formatCurrency(d.ratePerPiece)
  }));

  const handleExportPDF = () => generateEnterpriseDocument({
    title: 'Processing Dispatch Report', filters: [{ label: 'Date Range', value: dateRange.label }],
    tables: [{
      columns: exportColumns.map(c => ({ header: c.header, dataKey: c.dataKey, align: ['pcsSent','ratePerPiece'].includes(c.dataKey) ? 'right' : 'left' })),
      rows: exportData,
      summaryRows: [[{ materialName: 'TOTAL', pcsSent: formatNumber(totalPcs) }]]
    }]
  });

  return (
    <div className="space-y-6">
      <ReportFilterBar 
        onSearch={setSearch} onDateRangeChange={setDateRange}
        onExportPDF={handleExportPDF}
        onExportExcel={() => exportToExcel({ filename: 'Processing_Dispatch.xlsx', data: exportData, columns: exportColumns })}
        onExportCSV={() => exportToCSV({ filename: 'Processing_Dispatch.csv', data: exportData, columns: exportColumns })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ReportKPICard title="Total Dispatches" value={totalDispatches.toString()} icon={Send} />
        <ReportKPICard title="Processors" value={new Set(data.map(d => d.processorId)).size.toString()} icon={Factory} />
        <ReportKPICard title="Total PCS Dispatched" value={formatNumber(totalPcs)} icon={Hash} />
      </div>
      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
        <DataTable data={data} columns={columns} />
      </div>
    </div>
  );
}
