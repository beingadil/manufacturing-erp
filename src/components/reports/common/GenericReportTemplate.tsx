import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';
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
  onDateRangeChange?: (range: { start: string; end: string; label: string }) => void;
  onSearch: (q: string) => void;
  exportColumns?: { header: string; dataKey: string }[];
  exportDataMapping?: (item: T) => any;
  summaryRows?: any[][];
  /** Hide the date-range filter when the report is point-in-time (e.g. stock levels). */
  showDateRange?: boolean;
  /** Title shown above the table card; defaults to "Detailed Report". */
  tableTitle?: string;
  /** Optional on-screen totals row aligned to the table columns (column count must match). */
  tableSummaryRow?: React.ReactNode[];
  /** Searchable columns (adds an in-table search box). */
  searchKeys?: (keyof T)[];
  /** Placeholder for the in-table search box. */
  searchPlaceholder?: string;
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
  summaryRows,
  showDateRange = true,
  tableTitle = 'Detailed Report',
  tableSummaryRow,
  searchKeys,
  searchPlaceholder
}: GenericReportTemplateProps<T>) {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });

  const handleDateChange = (range: any) => {
    setDateRange(range);
    onDateRangeChange?.(range);
  };

  const expCols = exportColumns || columns.map(c => ({ header: c.label, dataKey: c.key as string }));
  const expData = exportDataMapping ? data.map(exportDataMapping) : data;

  // Only stamp the filter into exports when the report actually consumes it.
  const exportFilters = showDateRange
    ? [{ label: 'Date Range', value: dateRange.label }]
    : [{ label: 'Date', value: 'All time' }];

  const handleExportPDF = () => {
    try {
      generateEnterpriseDocument({
        title,
        filters: exportFilters,
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
      toast.success(`${title} PDF generated`);
    } catch {
      toast.error('PDF export failed', { description: `Could not generate ${title} PDF.` });
    }
  };

  const kpiCols = kpis.length === 4 ? 'lg:grid-cols-4' : kpis.length === 3 ? 'lg:grid-cols-3' : 'sm:grid-cols-2';

  return (
    <div className="space-y-6">
      <ReportFilterBar 
        onSearch={onSearch} 
        onDateRangeChange={handleDateChange}
        showDateRange={showDateRange}
        onExportPDF={handleExportPDF}
        onPrint={() => {
          try {
            generateEnterpriseDocument({
              title, action: 'print', filters: exportFilters,
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
          } catch {
            toast.error('Print failed', { description: `Could not print ${title}.` });
          }
        }}
        onExportExcel={() => {
          try {
            exportToExcel({ filename: `${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`, data: expData, columns: expCols });
            toast.success(`${title} exported to Excel`);
          } catch {
            toast.error('Excel export failed', { description: `Could not export ${title}.` });
          }
        }}
        onExportCSV={() => {
          try {
            exportToCSV({ filename: `${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.csv`, data: expData, columns: expCols });
            toast.success(`${title} exported to CSV`);
          } catch {
            toast.error('CSV export failed', { description: `Could not export ${title}.` });
          }
        }}
      />

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${kpiCols} gap-4`}>
        {kpis.map((kpi, i) => (
          <ReportKPICard key={i} title={kpi.title} value={kpi.value.toString()} icon={kpi.icon} />
        ))}
      </div>

      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-muted/10">
          <h3 className="text-base font-semibold text-foreground">{tableTitle}</h3>
        </div>
        <DataTable data={data} columns={columns} embedded summaryRow={tableSummaryRow} searchKeys={searchKeys} searchPlaceholder={searchPlaceholder} />
      </div>
    </div>
  );
}
