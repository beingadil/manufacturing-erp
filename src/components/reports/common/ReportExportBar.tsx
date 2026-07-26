import React from 'react';
import { Download, Printer, Copy, FileText, FileSpreadsheet } from 'lucide-react';

interface ReportExportBarProps {
  onPrint?: () => void;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  onExportCSV?: () => void;
}

export function ReportExportBar({ onPrint, onExportPDF, onExportExcel, onExportCSV }: ReportExportBarProps) {
  return (
    <div className="flex items-center gap-2">
      {onPrint && (
        <button onClick={onPrint} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <Printer className="h-4 w-4" />
          <span className="hidden sm:inline">Print</span>
        </button>
      )}
      {onExportPDF && (
        <button onClick={onExportPDF} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <FileText className="h-4 w-4 text-destructive/70" />
          <span className="hidden sm:inline">PDF</span>
        </button>
      )}
      {onExportExcel && (
        <button onClick={onExportExcel} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <FileSpreadsheet className="h-4 w-4 text-emerald-500/70" />
          <span className="hidden sm:inline">Excel</span>
        </button>
      )}
      {onExportCSV && (
        <button onClick={onExportCSV} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">CSV</span>
        </button>
      )}
    </div>
  );
}
