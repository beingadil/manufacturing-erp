import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Desktop } from './desktop/DesktopInterop';
import { formatPrintCurrency, formatPrintDate, getPrintSettings } from './print/printSettings';

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
    orientation: configOrientation,
    action = 'download',
    filename,
    infoBlock = []
  } = config;

  // ── Single source of truth for everything printed ──
  const settings = getPrintSettings();
  const { company, branding, document, printedBy } = settings;

  // Honour Settings → Print & PDF `Default Orientation` when callers don't pass one.
  const orientation = configOrientation ?? (document.orientation === 'Landscape' ? 'landscape' : 'portrait');

  const isLandscape = orientation === 'landscape';
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  // PDF metadata
  doc.setProperties({
    title: documentNo ? `${title} — ${documentNo}` : title,
    author: company.name,
    subject: document.footerText ?? '',
    creator: 'W-RAW ERP',
    keywords: documentNo ?? '',
  });

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margins = { top: isLandscape ? 55 : 70, bottom: 70, left: 40, right: 40 };

  // Accent color token (brand primary)
  const accent = branding.primaryColor;
  const accentRgb = hexToRgb(accent);

  let currentY = margins.top;

  // ── HEADER ──
  // Two-tier: logo + company identity block + document title on its own line.
  // Logo placement follows "Print & PDF" → logo position: left / center / right.
  const logoSize = 30;
  const logoPosition = branding.logoPosition;
  let logoDrawn = false;

  const drawLogo = (x: number, y: number) => {
    try {
      doc.addImage(branding.logoDataUrl as string, 'PNG', x, y, logoSize, logoSize);
      logoDrawn = true;
    } catch (_e) {
      // ignore bad image data
    }
  };

  if (branding.logoDataUrl && logoPosition === 'left') drawLogo(margins.left, currentY);
  else if (branding.logoDataUrl && logoPosition === 'center') drawLogo((pageWidth - logoSize) / 2, currentY);
  else if (branding.logoDataUrl && logoPosition === 'right') drawLogo(pageWidth - margins.right - logoSize, currentY);

  const fullWidth = pageWidth - margins.left - margins.right;

  let companyX = margins.left;
  let companyMaxW = fullWidth;
  if (logoDrawn && logoPosition === 'left') {
    companyX = logoSize + margins.left + 12;
    companyMaxW = fullWidth - logoSize - 12;
  } else if (logoDrawn && logoPosition === 'right') {
    companyMaxW = fullWidth - logoSize - 12;
  }
  const isCenter = logoPosition === 'center';
  const companyAlign = isCenter ? 'center' : 'left';
  const textAlignX = isCenter ? pageWidth / 2 : companyX;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...accentRgb);
  doc.text(company.name, textAlignX, currentY + (isCenter ? logoSize + 12 : 0), { align: companyAlign, maxWidth: companyMaxW });

  // Address lines under the company name
  let identityY = currentY + (isCenter ? logoSize + 22 : 12);
  if (company.address || company.phone || company.email || company.website || company.taxNumber) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    const lines: string[] = [];
    const addrParts = [company.address, company.phone ? `Tel: ${company.phone}` : '', company.email ? `Email: ${company.email}` : '']
      .filter(Boolean);
    if (addrParts.length) lines.push(addrParts.join('  |  '));
    const webTax = [company.website ? `Web: ${company.website}` : '', company.taxNumber ? `NTN: ${company.taxNumber}` : '']
      .filter(Boolean);
    if (webTax.length) lines.push(webTax.join('  |  '));
    lines.forEach((line, i) => {
      doc.text(line, textAlignX, identityY + i * 10, { align: companyAlign, maxWidth: companyMaxW });
    });
    identityY += lines.length * 10 + 8;
  }

  // Document title. Placement follows the logo column layout.
  const titleX = logoPosition === 'left' ? pageWidth - margins.right : pageWidth / 2;
  const titleAlign = logoPosition === 'left' ? 'right' : 'center';
  const titleTop = isCenter ? currentY + logoSize + 12 : currentY;
  const titleY = logoDrawn && !isCenter ? currentY + logoSize + 14 : titleTop + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(30, 30, 30);
  doc.text(title.toUpperCase(), titleX, titleY, { align: titleAlign });

  if (documentNo) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`Doc #: ${documentNo}`, titleX, titleY + 11, { align: titleAlign });
  }

  currentY = Math.max(identityY, titleY + (documentNo ? 22 : 12)) + 16;

  // Horizontal rule
  doc.setDrawColor(...accentRgb);
  doc.setLineWidth(1.2);
  doc.line(margins.left, currentY, pageWidth - margins.right, currentY);
  currentY += 16;

  // ── SUBTITLE & FILTERS ──
  if (subtitle) {
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    doc.text(subtitle, margins.left, currentY);
    currentY += 14;
  }

  if (filters.length > 0) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(110, 110, 110);
    const filterText = 'Filters Applied: ' + filters.map(f => `${f.label}: ${f.value}`).join('  |  ');
    const splitFilters = doc.splitTextToSize(filterText, pageWidth - margins.left - margins.right);
    doc.text(splitFilters, margins.left, currentY);
    currentY += splitFilters.length * 11 + 10;
  }

  // ── INFO BLOCKS (two-column, label + value with measured gap) ──
  if (infoBlock.length > 0) {
    doc.setFontSize(8.5);
    const colWidth = (pageWidth - margins.left - margins.right) / 2;
    const labelGap = 6;
    let maxBlockY = currentY;

    infoBlock.forEach((blockCol, colIdx) => {
      let blockY = currentY;
      blockCol.forEach((info) => {
        const labelText = `${info.label}:`;
        const labelW = doc.getTextWidth(labelText);
        const valueX = margins.left + colIdx * colWidth + labelW + labelGap;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(70, 70, 70);
        doc.text(labelText, margins.left + colIdx * colWidth, blockY);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        doc.text(String(info.value), valueX, blockY, { maxWidth: colWidth - labelW - labelGap - 4 });

        blockY += 13;
      });
      maxBlockY = Math.max(maxBlockY, blockY);
    });

    currentY = maxBlockY + 16;
  }

  // ── TABLES ──
  tables.forEach((tableConfig, idx) => {
    if (idx > 0) currentY += 18;

    const head = [tableConfig.columns.map(c => c.header)];
    const body = tableConfig.rows.map((row) =>
      tableConfig.columns.map((c) => {
        const val = row[c.dataKey];
        if (val === undefined || val === null) return '';
        // Currency columns: always 2 decimals
        const lowerKey = c.dataKey.toLowerCase();
        const isCurrency = ['amount', 'total', 'balance', 'debit', 'credit', 'rate', 'value', 'pcs', 'price'].some(
          (k) => lowerKey.includes(k)
        );
        if (isCurrency && typeof val === 'number') return formatPrintCurrency(val);
        return String(val);
      })
    );
    const foot = tableConfig.summaryRows
      ? tableConfig.summaryRows.map((row) =>
          tableConfig.columns.map((c) => {
            const val = row[c.dataKey];
            if (val === undefined || val === null) return '';
            const lowerKey = c.dataKey.toLowerCase();
            const isCurrency = ['amount', 'total', 'balance', 'debit', 'credit', 'rate', 'value', 'pcs', 'price'].some(
              (k) => lowerKey.includes(k)
            );
            if (isCurrency && typeof val === 'number') return formatPrintCurrency(val);
            return String(val);
          })
        )
      : undefined;

    const columnStyles: Record<number, any> = {};
    tableConfig.columns.forEach((c, cIdx) => {
      columnStyles[cIdx] = { halign: c.align || 'left' };
      if (c.width) columnStyles[cIdx].cellWidth = c.width;
    });

    autoTable(doc, {
      startY: currentY,
      head,
      body,
      foot,
      theme: tableConfig.theme || 'striped',
      styles: {
        fontSize: 8,
        font: 'helvetica',
        cellPadding: 4,
        lineColor: [220, 220, 220],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: accentRgb,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [248, 250, 252],
        textColor: [30, 30, 30],
        fontStyle: 'bold',
      },
      // TOTAL / CLOSING BALANCE ROWS: print ONLY on the last page
      showFoot: 'lastPage',
      columnStyles,
      margin: { left: margins.left, right: margins.right, bottom: margins.bottom + 20 },
      didDrawPage: (data) => {
        currentY = data.cursor ? data.cursor.y : currentY;
      },
    });
  });

  // ── FOOTER (all pages) ──
  const pageCount = (doc.internal as any).getNumberOfPages();
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margins.left, pageHeight - margins.bottom + 10, pageWidth - margins.right, pageHeight - margins.bottom + 10);

    const footerY = pageHeight - margins.bottom + 25;

    // Left: Printed by real user + date
    doc.text(`Printed By: ${printedBy.name} on ${formatPrintDate(new Date())}`, margins.left, footerY);

    // Center: disclaimer
    if (document.showSignatureDisclaimer && document.footerText) {
      doc.text(document.footerText, pageWidth / 2, footerY, { align: 'center' });
    }

    // Right: Page number
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margins.right, footerY, { align: 'right' });
  }

  // ── ACTION ──
  const safeFilename =
    filename || `${(documentNo || title).replace(/\s+/g, '_').replace(/[&/\\#,+()$~%.'":*?<>{}]/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;

  if (action === 'blob') {
    return doc.output('blob');
  }

  const blob = doc.output('blob');

  if (action === 'print') {
    // Browser print path: open a fresh tab so Ctrl+P works. Electron has no
    // silent print handler wired yet — do not call the dead stub.
    doc.autoPrint();
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      // Popup blocked — fall back to download so the user isn't left with nothing
      await Desktop.file.saveFile(blob, safeFilename, {
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
      });
    }
  } else {
    await Desktop.file.saveFile(blob, safeFilename, {
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const bigint = parseInt(h, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}
