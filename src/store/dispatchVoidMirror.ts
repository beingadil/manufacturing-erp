import { v4 as uuidv4 } from 'uuid';
import { buildProcessingLoss } from '../lib/accounting/manufacturingPosting';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import type { ProcessingLossRecord, ProcessingSend, Voucher, JournalEntry, Batch, AccountSubtype, Account } from '../types/erp';
import { createVoucher } from './erpVoucher';

/**
 * Shared mirror implementation used in TWO places:
 *   1. deleteProcessingSend — a dispatch deleted mid-pipeline with pcs still
 *      out at the processor is written off as an unaccounted loss + voucher
 *      (Dispatch void — N PCS unaccounted for). A phantom send is returned
 *      to the replay so the stage chain deletes those pcs from the right
 *      bucket at the right stage.
 *   2. erpMigration — existing v1.1.0 state where dispatches with
 *      outstanding pcs are sitting silently in raw->dispatched-->wip attr.
 *      attr, i.e. each of those dispatches is absorbed exactly the same way
 *      so old installs migrate to clean books without user action.
 *
 * The mirror never returns pcs to raw stock — pcs and that's the point.
 */
export interface VoidMirrorResult {
  /** Phantom send to include in the replay. Outstanding pcs are wastage. */
  replaySend: ProcessingSend | null;
  /** The just-created loss record, or null if outstanding was 0. */
  lossRecord: ProcessingLossRecord | null;
  /** Voucher + journal entries appended, following the store's pattern. */
  voucherEntries: JournalEntry[];
  voucher: Voucher | null;
}

export function buildVoidMirror(
  send: ProcessingSend,
  accounts: Account[],
  accountSubtypes: AccountSubtype[],
  batches: Batch[],
  existingVouchers: Voucher[],
  dateLabel: string,
  createdBy?: string,
): VoidMirrorResult {
  const outstanding = Math.max(0, send.pcsSent - send.pcsReceived - (send.lossQuantity || 0));
  if (outstanding <= 0) {
    return { replaySend: null, lossRecord: null, voucherEntries: [], voucher: null };
  }

  const originBatch = (batches || []).find(b => b.id === send.batchId);
  const costPerPiece = originBatch ? InventoryCalculationService.getBatchCostPerPiece(originBatch) : 0;
  const cost = Math.round(outstanding * costPerPiece * 100) / 100;
  const mirrorId = uuidv4();
  const narration = `Dispatch void — ${outstanding} PCS unaccounted for (${send.dispatchNo})`;

  let voucher: Voucher | null = null;
  let voucherEntries: JournalEntry[] = [];
  const posting = buildProcessingLoss(accounts, accountSubtypes, cost, narration);
  if (posting.length > 0) {
    const built = createVoucher(existingVouchers, {
      date: dateLabel,
      type: 'Journal Voucher',
      referenceNo: send.dispatchNo,
      sourceModule: 'Processing',
      sourceId: mirrorId,
      narration,
      lines: posting,
      createdBy,
    });
    if (built) {
      voucher = built.voucher;
      voucherEntries = built.entries;
    }
  }

  const lossRecord: ProcessingLossRecord = {
    id: mirrorId,
    sendId: send.id,
    materialId: send.materialId,
    date: dateLabel,
    pcsLost: outstanding,
    cost,
    voucherId: voucher?.id,
    remarks: narration,
  };

  return {
    replaySend: { ...send, lossQuantity: (send.lossQuantity || 0) + outstanding, status: 'Pending' as const },
    lossRecord,
    voucherEntries,
    voucher,
  };
}
