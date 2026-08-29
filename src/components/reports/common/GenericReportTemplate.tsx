import { format } from 'date-fns';
import { useState } from 'react';
import { exportToCSV, exportToExcel } from '../../../lib/exportUtils';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { Column, DataTable } from '../../DataTable';
import { ReportFilterBar } from './ReportFilterBar';
import { ReportKPICard } from './ReportKPICard';

export interface KPI {
  title: string;
  value: string | number;
  icon: any;
}

export interface GenericReportTemplateProps<T extends Record<string, any>> {
  title: string;
  data: T[];
  columns: Column<T>[];
  kpis: KPI[];
  onDateRangeChange: (range: { start: string; end: string; label: string }) => void;
  onSearch: (q: string) => void;
  exportColumns?: { header: string; dataKey: string }[];
  exportDataMapping?: (item: T) => any;
  summaryRows?: any[][];
}

export function GenericReportTemplate<T extends Record<string, any>>({
  title,
  data,
  columns,
  kpis,
  onDateRangeChange,
  onSearch,
  exportColumns,
  exportDataMapping,
  summaryRows
}: GenericReportTemplateProps<T>) {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });

  const handleDateChange = (range: any) => {
    setDateRange(range);
    onDateRangeChange(range);
  };

  const expCols = exportColumns || columns.map(c => ({ header: c.label, dataKey: c.key as string }));
  const expData = exportDataMapping ? data.map(exportDataMapping) : data;

  const handleExportPDF = () => generateEnterpriseDocument({
    title,
    filters: [{ label: 'Date Range', value: dateRange.label }],
    tables: [{
      columns: expCols.map(c => ({ 
        header: c.header, 
        dataKey: c.dataKey, 
        align: ['amount', 'total', 'weight', 'pcs', 'balance', 'debit', 'credit'].some(k => c.dataKey.toLowerCase().includes(k)) ? 'right' : 'left' 
      })),
      rows: expData,
      summaryRows
    }]
  });

  return (
    <div className="space-y-6">
      <ReportFilterBar 
        onSearch={onSearch} 
        onDateRangeChange={handleDateChange}
        onExportPDF={handleExportPDF}
        onPrint={() => generateEnterpriseDocument({
          title, action: 'print', filters: [{ label: 'Date Range', value: dateRange.label }],
          tables: [{
            columns: expCols.map(c => ({ 
              header: c.header, 
              dataKey: c.dataKey, 
              align: ['amount', 'total', 'weight', 'pcs', 'balance', 'debit', 'credit'].some(k => c.dataKey.toLowerCase().includes(k)) ? 'right' : 'left' 
            })),
            rows: expData,
            summaryRows
          }]
        })}
        onExportExcel={() => exportToExcel({ filename: `${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`, data: expData, columns: expCols })}
        onExportCSV={() => exportToCSV({ filename: `${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.csv`, data: expData, columns: expCols })}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <ReportKPICard key={i} title={kpi.title} value={kpi.value.toString()} icon={kpi.icon} />
        ))}
      </div>

      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-muted/10">
          <h3 className="text-base font-semibold text-foreground">Detailed Report</h3>
        </div>
        <DataTable data={data} columns={columns} />
      </div>
    </div>
  );
}
