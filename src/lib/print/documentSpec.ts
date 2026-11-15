/**
 * The one document spec.
 *
 * Every PDF in the app — a ledger statement, an invoice, a processing bill, a
 * report — is described by this shape and rendered by one engine
 * (`src/lib/pdfEngine.ts`). A new printed document is therefore a SPEC, not a
 * new file: fill in the fields and the shared engine gives it the same
 * header, footer, page furniture and Print & PDF settings as everything else.
 *
 * The three rules this file exists to enforce:
 *
 *  1. `summaryRows` is a FLAT array of row objects — `[{ [dataKey]: value }]`.
 *     A nested `[[{ ... }]]` silently produced a blank TOTAL row in every
 *     report (the engine read `row[dataKey]` off an array). The engine now
 *     normalises either shape, but new code must pass the flat one.
 *
 *  2. Column values carry RAW data and declare their `format`. The engine
 *     formats them, so the document's dates follow the configured date format
 *     and its money follows the configured currency — instead of every
 *     generator pre-formatting with its own hardcoded formatter and the
 *     Print & PDF settings being ignored.
 *
 *  3. `align` is a property of the column, so the header and the cells
 *     beneath it always agree.
 */

/** How a column's raw value should be rendered. */
export type PrintValueFormat = 'text' | 'currency' | 'number' | 'date';

export interface PrintColumn {
  /** The text shown in the header. */
  header: string;
  /** The key this column reads from each row object. */
  dataKey: string;
  /** Header and cells share this alignment. Defaults to 'left'. */
  align?: 'left' | 'center' | 'right';
  /** Fixed column width in PDF points, when the column must not flex. */
  width?: number;
  /**
   * How to render the raw value. 'currency' and 'number' honour the Print &
   * PDF output settings; 'date' honours the configured date format. Omit for
   * plain text.
   */
  format?: PrintValueFormat;
}

/** One row of a totals block. Keys are the column `dataKey`s. */
export type PrintSummaryRow = Record<string, string | number | null | undefined>;

export interface PrintTable {
  columns: PrintColumn[];
  rows: Array<Record<string, unknown>>;
  /** Totals / closing rows. FLAT array of row objects preferred — see rule 1.
   *  The legacy nested `[[{...}]]` shape is still accepted at the type level
   *  because every report in the app used to pass it; the engine normalises
   *  either shape at render time. New code must pass the flat one. */
  summaryRows?: Array<PrintSummaryRow | PrintSummaryRow[]> | null;
  theme?: 'striped' | 'grid' | 'plain';
}

export interface PrintDocument {
  /** The document's own title, printed top-right. */
  title: string;
  /** The document's own number, printed under the title. */
  documentNo?: string;
  /** A line under the header, e.g. "Statement for: Cash in Hand". */
  subtitle?: string;
  /** Label/value pairs printed as a one-line strip under the subtitle. */
  filters?: { label: string; value: string }[];
  /** Label/value blocks printed in two columns. */
  infoBlock?: { label: string; value: string }[][];
  tables: PrintTable[];
  /** Overrides the Print & PDF default orientation for this document only. */
  orientation?: 'portrait' | 'landscape';
  /** 'download' saves the file, 'print' opens the print dialog, 'blob' returns it. */
  action?: 'download' | 'print' | 'blob';
  /** Overrides the generated file name. */
  filename?: string;
}

/**
 * Accepts either the flat shape (`[{...}]`) or the legacy nested shape
 * (`[[{...}]]`) and always returns the flat one. The nested shape was what
 * every report passed, and it is what made the TOTAL row blank.
 */
export function normalizeSummaryRows(
  summaryRows?: Array<PrintSummaryRow | PrintSummaryRow[]> | null,
): PrintSummaryRow[] | undefined {
  if (!summaryRows || summaryRows.length === 0) return undefined;
  const flat: PrintSummaryRow[] = [];
  for (const row of summaryRows) {
    if (Array.isArray(row)) {
      // Legacy nested shape: each member is a list whose first element is the
      // actual row object.
      for (const inner of row) flat.push(inner);
    } else {
      flat.push(row);
    }
  }
  return flat.length > 0 ? flat : undefined;
}
