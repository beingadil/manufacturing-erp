import { generateLedgerStatementPDF } from '../../lib/documentGenerators';
import { formatDate } from '../../lib/utils';

export interface LedgerStatementExportRow {
  /** Voucher date (YYYY-MM-DD). */
  date: string;
  voucherNo: string;
  narration: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface LedgerStatementExportOptions {
  accountName: string;
  accountCode?: string;
  /** Statement period label, e.g. "This Month" or "All Time". */
  periodLabel?: string;
  /** Omit to leave the opening row out of the PDF. */
  openingBalance?: number;
  closingBalance: number;
  rows: LedgerStatementExportRow[];
}

/**
 * The one PDF every ledger surface exports.
 *
 * The Ledgers page and the General Ledger module render the same statement
 * from the same engine, so they must also export the same document: opening
 * balance brought forward, the rows in chronological order, the period totals
 * and the closing balance. Keeping the mapping here means a fix to the
 * statement lands in both exports at once.
 */
export function exportLedgerStatementPdf({
  accountName,
  accountCode,
  periodLabel,
  openingBalance,
  closingBalance,
  rows,
}: LedgerStatementExportOptions): void {
  const transactions = [
    ...(openingBalance !== undefined
      ? [{
          date: '',
          referenceNo: 'OPENING',
          description: 'Balance brought forward',
          debit: 0,
          credit: 0,
          balance: openingBalance,
        }]
      : []),
    ...rows.map(row => ({
      date: row.date ? formatDate(row.date) : '-',
      referenceNo: row.voucherNo || '-',
      description: row.narration || '-',
      debit: row.debit,
      credit: row.credit,
      balance: row.runningBalance,
    })),
  ];

  generateLedgerStatementPDF(accountName, 'Account', transactions, closingBalance, {
    title: 'GENERAL LEDGER STATEMENT',
    periodLabel,
    accountCode,
  });
}
