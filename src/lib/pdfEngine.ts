import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { useERPStore } from '../store/useERPStore';
import { Desktop } from './desktop/DesktopInterop';

export interface PDFTableColumn {
  header: string;
  dataKey: string;
  align?: 'left' | 'center' | 'right';
  width?: number;
}

export interface PDFTableConfig {
  columns: PDFTableColumn[];
  rows: any[];
  summaryRows?: any[];
  theme?: 'striped' | 'grid' | 'plain';
}

export interface PDFDocumentConfig {
  title: string;
  documentNo?: string;
  subtitle?: string;
  filters?: { label: string; value: string }[];
  tables: PDFTableConfig[];
  orientation?: 'portrait' | 'landscape';
  action?: 'download' | 'print' | 'blob';
  filename?: string;
  infoBlock?: { label: string; value: string }[][];
}

export async function generateEnterpriseDocument(config: PDFDocumentConfig) {
  const {
    title,
    documentNo,
    subtitle,
    filters = [],
    tables,
    orientation = 'portrait',
    action = 'download',
    filename = `${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`,
    infoBlock = []
  } = config;

  // Retrieve company and document settings from store
  const state = useERPStore.getState();
  const company = state.companySettings;
  const docSettings = state.documentSettings;
  const currentUser = state.currentUser?.name || 'System';

  // Initialize PDF
  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margins = { top: 40, bottom: 60, left: 40, right: 40 };

  let currentY = margins.top;

  // --- HEADER SECTION ---
  
  // Title & Document No
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(title.toUpperCase(), pageWidth - margins.right, currentY, { align: 'right' });
  
  if (documentNo) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    currentY += 14;
    doc.text(`Doc #: ${documentNo}`, pageWidth - margins.right, currentY, { align: 'right' });
  }

  // Company Info
  let leftY = margins.top;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(company.name, margins.left, leftY);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  leftY += 14;
  doc.text(company.address, margins.left, leftY);
  
  if (company.phone || company.email) {
    leftY += 12;
    doc.text(`${company.phone ? 'Tel: ' + company.phone : ''} ${company.email ? ' | Email: ' + company.email : ''}`, margins.left, leftY);
  }
  
  if (company.taxNumber) {
    leftY += 12;
    doc.text(`NTN/Tax #: ${company.taxNumber}`, margins.left, leftY);
  }

  currentY = Math.max(currentY, leftY) + 20;

  // Horizontal Line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(1);
  doc.line(margins.left, currentY, pageWidth - margins.right, currentY);
  currentY += 15;

  // --- SUBTITLE & FILTERS ---
  if (subtitle) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text(subtitle, margins.left, currentY);
    currentY += 15;
  }

  if (filters.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    
    // Layout filters in a grid or inline
    let filterText = 'Filters Applied: ';
    filters.forEach((f, idx) => {
      filterText += `${f.label}: ${f.value}${idx < filters.length - 1 ? '  |  ' : ''}`;
    });
    
    const splitFilters = doc.splitTextToSize(filterText, pageWidth - margins.left - margins.right);
    doc.text(splitFilters, margins.left, currentY);
    currentY += (splitFilters.length * 12) + 10;
  }

  // --- INFO BLOCKS (For Invoices/Vouchers) ---
  if (infoBlock.length > 0) {
    doc.setFontSize(9);
    
    const colWidth = (pageWidth - margins.left - margins.right) / 2;
    let maxBlockY = currentY;
    
    infoBlock.forEach((blockCol, colIdx) => {
      let blockY = currentY;
      blockCol.forEach(info => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text(`${info.label}:`, margins.left + (colIdx * colWidth), blockY);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text(info.value, margins.left + (colIdx * colWidth) + 70, blockY);
        
        blockY += 14;
      });
      maxBlockY = Math.max(maxBlockY, blockY);
    });
    
    currentY = maxBlockY + 15;
  }

  // --- TABLES SECTION ---
  tables.forEach((tableConfig, idx) => {
    // Spacer between tables
    if (idx > 0) currentY += 20;

    const head = [tableConfig.columns.map(c => c.header)];
    const body = tableConfig.rows.map(row => 
      tableConfig.columns.map(c => {
        const val = row[c.dataKey];
        return val !== undefined && val !== null ? String(val) : '';
      })
    );

    const foot = tableConfig.summaryRows ? tableConfig.summaryRows.map(row => 
      tableConfig.columns.map(c => {
        const val = row[c.dataKey];
        return val !== undefined && val !== null ? String(val) : '';
      })
    ) : undefined;

    // Map column alignments
    const columnStyles: any = {};
    tableConfig.columns.forEach((c, cIdx) => {
      columnStyles[cIdx] = { halign: c.align || 'left' };
      if (c.width) {
        columnStyles[cIdx].cellWidth = c.width;
      }
    });

    autoTable(doc, {
      startY: currentY,
      head: head,
      body: body,
      foot: foot,
      theme: tableConfig.theme || 'striped',
      styles: {
        fontSize: 8,
        font: 'helvetica',
        cellPadding: 4,
        lineColor: [220, 220, 220],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [240, 244, 248],
        textColor: [40, 40, 40],
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [248, 250, 252],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
      },
      columnStyles: columnStyles,
      margin: { left: margins.left, right: margins.right },
      didDrawPage: (data) => {
        // Only update currentY on the last page of the table
        currentY = data.cursor ? data.cursor.y : currentY;
      }
    });
  });

  // --- FOOTER (All Pages) ---
  const pageCount = (doc.internal as any).getNumberOfPages();
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Top border of footer
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margins.left, pageHeight - margins.bottom + 10, pageWidth - margins.right, pageHeight - margins.bottom + 10);
    
    const footerY = pageHeight - margins.bottom + 25;
    
    // Left: Printed By & Date
    doc.text(`Printed By: ${currentUser} on ${format(new Date(), 'dd-MMM-yyyy HH:mm')}`, margins.left, footerY);
    
    // Center: Disclaimer
    if (docSettings.showSignatureDisclaimer) {
      doc.text(docSettings.footerText, pageWidth / 2, footerY, { align: 'center' });
    }
    
    // Right: Page Number
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margins.right, footerY, { align: 'right' });
  }

  // --- ACTION ---
  if (action === 'print') {
    const blob = doc.output('blob');
    if (Desktop.platform.isDesktop()) {
      await Desktop.print.printToPDF({ silent: false }); // Future electron handler could intercept the blob
    } else {
      doc.autoPrint();
      window.open(URL.createObjectURL(blob), '_blank');
    }
  } else if (action === 'blob') {
    return doc.output('blob');
  } else {
    const blob = doc.output('blob');
    await Desktop.file.saveFile(blob, filename, {
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
    });
  }
}
