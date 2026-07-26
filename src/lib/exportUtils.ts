import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export interface ExportConfig {
  filename?: string;
  data: any[];
  columns: { header: string; dataKey: string; format?: (val: any) => string }[];
}

export function exportToCSV(config: ExportConfig) {
  const { filename = `export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`, data, columns } = config;

  const headerRow = columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(',');
  
  const rows = data.map(item => {
    return columns.map(col => {
      let val = item[col.dataKey];
      if (col.format && val !== undefined) {
        val = col.format(val);
      }
      val = val !== undefined && val !== null ? String(val).replace(/"/g, '""') : '';
      return `"${val}"`;
    }).join(',');
  });

  const csvContent = [headerRow, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function exportToExcel(config: ExportConfig) {
  const { filename = `export_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`, data, columns } = config;

  // Prepare data for Excel
  const excelData = data.map(item => {
    const row: any = {};
    columns.forEach(col => {
      let val = item[col.dataKey];
      if (col.format && val !== undefined) {
        val = col.format(val);
      }
      row[col.header] = val;
    });
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');

  // Auto-size columns roughly based on content
  const colWidths = columns.map(col => ({
    wch: Math.max(
      col.header.length,
      ...excelData.map((row: any) => String(row[col.header] || '').length)
    ) + 2
  }));
  worksheet['!cols'] = colWidths;

  XLSX.writeFile(workbook, filename);
}
