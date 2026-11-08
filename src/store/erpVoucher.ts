import { v4 as uuidv4 } from 'uuid';
import { PostingLine } from '../lib/accounting/manufacturingPosting';
import { DocumentNumberingService } from '../lib/business/DocumentNumberingService';
import type { JournalEntry, Voucher } from '../types/erp';

/**
 * Voucher factory used by the store: builds the voucher + journal entry pair
 * from a posting list. Callers pass the vouchers they have accumulated so far,
 * so a multi-line document gets gap-free sequential voucher numbers.
 */
export function createVoucher(
  existingVouchers: Voucher[],
  opts: {
    date: string;
    type: Voucher['type'];
    referenceNo: string;
    sourceModule: Voucher['sourceModule'];
    sourceId: string;
    narration: string;
    lines: PostingLine[];
    createdBy?: string;
  },
): { voucher: Voucher; entries: JournalEntry[] } | null {
  const lines = opts.lines.filter(l => Math.abs(l.debit) > 0.0001 || Math.abs(l.credit) > 0.0001);
  if (lines.length === 0) return null;
  const total = Math.round(lines.reduce((sum, l) => sum + l.debit, 0) * 100) / 100;
  const voucherId = uuidv4();
  const voucher: Voucher = {
    id: voucherId,
    voucherNo: DocumentNumberingService.nextVoucherNumber(existingVouchers, opts.type, opts.date),
    date: opts.date,
    type: opts.type,
    referenceNo: opts.referenceNo,
    sourceModule: opts.sourceModule,
    sourceId: opts.sourceId,
    narration: opts.narration,
    totalDebit: total,
    totalCredit: total,
    createdBy: opts.createdBy,
    createdAt: new Date().toISOString(),
    status: 'Posted',
    versionHistory: [{
      id: uuidv4(),
      modifiedAt: new Date().toISOString(),
      action: 'Created',
      reason: 'Auto-generated',
    }],
  };
  const entries: JournalEntry[] = lines.map(l => ({
    id: uuidv4(),
    voucherId,
    date: opts.date,
    accountId: l.accountId,
    debit: l.debit,
    credit: l.credit,
    narration: l.narration,
    createdAt: new Date().toISOString(),
    sourceModule: opts.sourceModule,
  }));
  return { voucher, entries };
}
