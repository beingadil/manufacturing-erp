/**
 * Journal entry narration rules — the single source of truth for what each
 * ledger line carries.
 *
 * Each entry keeps ONLY the narration the user typed on that line. An empty
 * line stays empty — we never copy the first non-empty narration into the
 * other lines. The voucher's own summary narration (first non-empty line
 * narration) is used ONLY for the voucher header/list/search, never written
 * into individual entries.
 */

export interface JournalLine {
  accountId: string;
  debit?: number | string;
  credit?: number | string;
  narration?: string;
}

/** Trim + preserve exactly what the user typed per line. Empty stays empty. */
export function buildJournalEntries(lines: JournalLine[]): {
  accountId: string;
  debit: number;
  credit: number;
  narration: string;
}[] {
  return lines.map(line => ({
    accountId: line.accountId,
    debit: Number(line.debit) || 0,
    credit: Number(line.credit) || 0,
    narration: (line.narration ?? '').trim(),
  }));
}

/** Voucher-level summary narration — the first non-empty line's text. */
export function voucherNarrationOf(lines: { narration?: string }[]): string {
  for (const line of lines) {
    const trimmed = (line.narration ?? '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}
