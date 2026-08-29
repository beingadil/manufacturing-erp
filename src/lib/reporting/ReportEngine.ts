import { ExportConfig, exportToCSV, exportToExcel } from '../exportUtils';
import { generateEnterpriseDocument, PDFDocumentConfig } from '../pdfEngine';

export interface ReportContext {
  title: string;
  dateRange: { start: string; end: string; label: string };
  searchQuery: string;
  filters: Record<string, any>;
}

export class ReportEngine {
  /**
   * Universal Date Filtering
   */
  static filterByDateRange<T>(data: T[], dateKey: keyof T, dateRange: { start: string; end: string }): T[] {
    if (!dateRange.start || !dateRange.end) return data;
    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);

    return data.filter(item => {
      const d = new Date(item[dateKey] as any);
      return d >= start && d <= end;
    });
  }

  /**
   * Universal Search Engine
   */
  static search<T>(data: T[], query: string, searchKeys: (keyof T)[]): T[] {
    if (!query) return data;
    const q = query.toLowerCase();
    return data.filter(item => 
      searchKeys.some(key => {
        const val = item[key];
        return val !== undefined && val !== null && String(val).toLowerCase().includes(q);
      })
    );
  }

  /**
   * PDF Document Generation
   */
  static generatePDF(config: PDFDocumentConfig) {
    return generateEnterpriseDocument(config);
  }

  /**
   * Universal Print Engine
   */
  static print(config: PDFDocumentConfig) {
    return generateEnterpriseDocument({ ...config, action: 'print' });
  }

  /**
   * Universal Export Engine
   */
  static exportData(format: 'excel' | 'csv', config: ExportConfig) {
    if (format === 'excel') {
      exportToExcel(config);
    } else {
      exportToCSV(config);
    }
  }
}
