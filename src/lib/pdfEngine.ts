import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Desktop } from './desktop/DesktopInterop';
import { formatPrintCurrency, formatPrintDate, formatPrintNumber, getPrintSettings } from './print/printSettings';
import {
  normalizeSummaryRows,
  type PrintColumn,
  type PrintDocument,
  type PrintTable,
  type PrintValueFormat,
} from './print/documentSpec';

export type { PrintColumn, PrintDocument, PrintTable, PrintValueFormat };

/** @deprecated Use PrintColumn from ./print/documentSpec — the format field is new. */
export interface PDFTableColumn extends PrintColumn {}
/** @deprecated Use PrintTable from ./print/documentSpec. */
export interface PDFTableConfig extends PrintTable {}
/** @deprecated Use PrintDocument from ./print/documentSpec. */
export interface PDFDocumentConfig extends PrintDocument {}

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

  // The document title is right-aligned. Its width is reserved FIRST so the
  // company identity block can never grow into it — measured, not guessed.
  const isCenter = logoPosition === 'center';
  const titleX = logoPosition === 'left' ? pageWidth - margins.right : pageWidth / 2;
  const titleAlign = logoPosition === 'left' ? 'right' : 'center';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  const titleWidth = doc.getTextWidth(title.toUpperCase());
  const titleReserve = titleAlign === 'right' ? titleWidth + 16 : 0;

  let companyX = margins.left;
  let companyMaxW = Math.max(120, fullWidth - titleReserve);
  if (logoDrawn && logoPosition === 'left') {
    companyX = logoSize + margins.left + 12;
    companyMaxW = Math.max(120, fullWidth - titleReserve - logoSize - 12);
  } else if (logoDrawn && logoPosition === 'right') {
    companyMaxW = Math.max(120, fullWidth - titleReserve - logoSize - 12);
  }
  const textAlignX = isCenter ? pageWidth / 2 : companyX;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...accentRgb);
  doc.text(company.name, textAlignX, currentY + (isCenter ? logoSize + 12 : 0), {
    align: isCenter ? 'center' : 'left',
    maxWidth: companyMaxW,
  });

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
      doc.text(line, textAlignX, identityY + i * 10, { align: isCenter ? 'center' : 'left', maxWidth: companyMaxW });
    });
    identityY += lines.length * 10 + 8;
  }

  // Document title. Placement follows the logo column layout.
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

    // A column's value is formatted by its declared format, so the document
    // obeys the Print & PDF output settings (currency, decimals, locale, date
    // format) instead of every generator pre-formatting with its own
    // hardcoded formatter. Columns with no format keep their raw text.
    const renderCell = (row: Record<string, unknown>, column: PrintColumn): string => {
      const val = row[column.dataKey];
      if (val === undefined || val === null || val === '') return '';
      const format: PrintValueFormat | undefined =
        column.format ??
        // Legacy columns carry no format: fall back to the old heuristic so
        // documents that pre-format their own numbers keep working.
        (typeof val === 'number' && isCurrencyKey(column.dataKey) ? 'currency' : undefined);
      if (format === 'currency' && typeof val === 'number') return formatPrintCurrency(val);
      if (format === 'number' && typeof val === 'number') return formatPrintNumber(val);
      if (format === 'date') return formatPrintDate(val as string | Date);
      return String(val);
    };

    const body = tableConfig.rows.map((row) => tableConfig.columns.map((c) => renderCell(row, c)));

    // The totals block. normalizeSummaryRows accepts the legacy nested shape
    // ([[{...}]]) that every report used to pass — which made the TOTAL row
    // render blank because row[dataKey] was read off an array.
    const normalizedSummary = normalizeSummaryRows(tableConfig.summaryRows);
    const foot = normalizedSummary
      ? normalizedSummary.map((row) => tableConfig.columns.map((c) => renderCell(row as Record<string, unknown>, c)))
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
  //
  // Three items share one baseline: who printed it (left), the disclaimer
  // (centre) and the page number (right). Placing them by eye made the
  // left and centre items print on top of each other — "Printed By: … on
  // 12-Nov-2026" ran 20pt into the disclaimer on A4 portrait and the text
  // was unreadable. So every item is MEASURED first, then placed, and the
  // disclaimer moves onto its own line when it cannot fit beside the
  // printed-by text without touching it.
  const pageCount = (doc.internal as any).getNumberOfPages();
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);

  const printedByText = `Printed By: ${printedBy.name} on ${formatPrintDate(new Date())}`;
  const disclaimerText = document.showSignatureDisclaimer ? document.footerText : '';

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margins.left, pageHeight - margins.bottom + 10, pageWidth - margins.right, pageHeight - margins.bottom + 10);

    const footerY = pageHeight - margins.bottom + 25;
    const pageLabel = `Page ${i} of ${pageCount}`;

    const printedByWidth = doc.getTextWidth(printedByText);
    const disclaimerWidth = disclaimerText ? doc.getTextWidth(disclaimerText) : 0;
    const pageWidthPt = doc.getTextWidth(pageLabel);

    const printedByEnd = margins.left + printedByWidth;
    const pageStart = pageWidth - margins.right - pageWidthPt;
    const disclaimerStart = pageWidth / 2 - disclaimerWidth / 2;

    // The disclaimer fits on the shared baseline only if there is clear air
    // on BOTH sides of it. Otherwise it gets a line of its own underneath.
    const fitsOnBaseline =
      !!disclaimerText &&
      printedByEnd + 12 <= disclaimerStart &&
      disclaimerStart + disclaimerWidth + 12 <= pageStart;

    // Left: who printed it, and when.
    doc.text(printedByText, margins.left, footerY);

    // Right: the page number.
    doc.text(pageLabel, pageWidth - margins.right, footerY, { align: 'right' });

    if (disclaimerText) {
      if (fitsOnBaseline) {
        doc.text(disclaimerText, pageWidth / 2, footerY, { align: 'center' });
      } else {
        // Its own line, below the baseline, centred and allowed to wrap.
        const lines = doc.splitTextToSize(disclaimerText, pageWidth - margins.left - margins.right);
        lines.forEach((line: string, lineIndex: number) => {
          doc.text(line, pageWidth / 2, footerY + 11 + lineIndex * 10, { align: 'center' });
        });
      }
    }
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

/**
 * Legacy currency heuristic for columns that pre-date the `format` field.
 * New code declares `format: 'currency'` explicitly.
 */
const CURRENCY_KEY_PARTS = ['amount', 'total', 'balance', 'debit', 'credit', 'rate', 'value', 'pcs', 'price'];

function isCurrencyKey(dataKey: string): boolean {
  const lower = dataKey.toLowerCase();
  return CURRENCY_KEY_PARTS.some(part => lower.includes(part));
}
