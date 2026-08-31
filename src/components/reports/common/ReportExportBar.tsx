import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';

interface ReportExportBarProps {
  onPrint?: () => void;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  onExportCSV?: () => void;
}

const btnCls = "flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors";

export function ReportExportBar({ onPrint, onExportPDF, onExportExcel, onExportCSV }: ReportExportBarProps) {
  return (
    <div className="flex items-center gap-2">
      {onPrint && (
        <button onClick={onPrint} aria-label="Print report" className={btnCls}>
          <Printer className="h-4 w-4" />
          <span className="hidden sm:inline">Print</span>
        </button>
      )}
      {onExportPDF && (
        <button onClick={onExportPDF} aria-label="Export as PDF" className={btnCls}>
          <FileText className="h-4 w-4 text-destructive/70" />
          <span className="hidden sm:inline">PDF</span>
        </button>
      )}
      {onExportExcel && (
        <button onClick={onExportExcel} aria-label="Export as Excel" className={btnCls}>
          <FileSpreadsheet className="h-4 w-4 text-success/70" />
          <span className="hidden sm:inline">Excel</span>
        </button>
      )}
      {onExportCSV && (
        <button onClick={onExportCSV} aria-label="Export as CSV" className={btnCls}>
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">CSV</span>
        </button>
      )}
    </div>
  );
}
