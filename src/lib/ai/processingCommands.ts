// src/lib/ai/processingCommands.ts
// Processing-module AI commands, following the exact confirm-gated registry
// pattern from commandRegistry.ts:
//   zod schema validates the LLM's extraction → describe() renders business
//   words for the confirmation panel → execute() calls the SAME store handlers
//   the UI uses, so the movement map, conservation law, worker-stage guard,
//   pending math, and duplicate-billing block all fire identically.
//
// Voice phrasing the tools are shaped for:
//   "send 400 pcs of brass to Ali"               → send_to_processor
//   "receive 250 pcs from Ali"                   → receive_from_processor
//   "record 10 pcs loss on Ali's dispatch"       → record_loss
//   "generate bill for Ali" / "bill Ali's work"  → generate_bill

import { z } from 'zod';
import { useERPStore } from '../../store/useERPStore';
import {
  batchAvailableAtSource,
  InventoryCalculationService,
} from '../business/InventoryCalculationService';
import type { Batch, ProcessingSend } from '../../types/erp';
import type { AiToolDef, CommandResult } from './types';
import { resolveEntity } from './entityResolver';

const fmtPcs = (n: number): string => new Intl.NumberFormat('en-US').format(n);
const fmtRs = (n: number): string =>
  'Rs ' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const today = (): string => new Date().toISOString().slice(0, 10);

// ── Shared store readers ─────────────────────────────────────────────────

/** Open (not fully received, not adjusted) dispatches, optionally for one processor. */
function openSends(processorName?: string): ProcessingSend[] {
  const s = useERPStore.getState();
  let sends = s.processingSends.filter(
    snd => snd.status === 'Pending' || snd.status === 'Partial'
  );
  if (processorName) {
    const proc = resolveEntity(s.processors, processorName, 'processor').party;
    if (proc) sends = sends.filter(snd => snd.processorId === proc.id);
  }
  // Newest first so "the dispatch" means the most recent open one.
  return [...sends].sort((a, b) => b.date.localeCompare(a.date) || b.dispatchNo.localeCompare(a.dispatchNo));
}

function pendingOf(send: ProcessingSend): number {
  return send.pcsSent - send.pcsReceived - (send.lossQuantity || 0);
}

/** Unbilled receipts, optionally for one processor (oldest first). */
function unbilledReceipts(processorName?: string) {
  const s = useERPStore.getState();
  let receipts = s.processingReceipts.filter(r => r.billedStatus !== 'Billed');
  if (processorName) {
    const proc = resolveEntity(s.processors, processorName, 'processor').party;
    if (proc) receipts = receipts.filter(r => r.processorId === proc.id);
  }
  return [...receipts].sort((a, b) => a.date.localeCompare(b.date));
}

/** Raw pcs sendable to stage 1 across a material's live batches. */
function rawAvailable(materialId: string): number {
  const s = useERPStore.getState();
  return (s.batches || [])
    .filter(b => b.materialId === materialId && b.status === 'Active')
    .reduce((sum, b) => sum + InventoryCalculationService.batchRawAvailable(b), 0);
}

// ═════════════════════════════════════════════════════════════════════════
// send_to_processor
// ═════════════════════════════════════════════════════════════════════════

const sendSchema = z.object({
  material_name: z.string().min(1).describe('Material name (partial match).'),
  processor_name: z.string().min(1).describe('Processor (worker) name (partial match).'),
  pcs: z.number().int().positive().describe('Pieces to send.'),
  stage_name: z.string().optional().describe('Stage name if the user said one; usually derived from the processor.'),
  remarks: z.string().optional(),
});

type SendArgs = z.infer<typeof sendSchema>;

const sendTool: AiToolDef = {
  type: 'function',
  function: {
    name: 'send_to_processor',
    description:
      'Dispatch pieces of a material to a processor (worker) for their processing stage. ' +
      'The engine picks the legal source bucket automatically (raw for the first stage, ' +
      'previous-stage output for later stages). Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        material_name: { type: 'string', description: 'Material name (partial match).' },
        processor_name: { type: 'string', description: 'Processor (worker) name (partial match).' },
        pcs: { type: 'integer', minimum: 1, description: 'Pieces to send.' },
        stage_name: { type: 'string', description: 'Stage name if the user said one; usually derived from the processor.' },
        remarks: { type: 'string', description: 'Optional remark stored on the dispatch.' },
      },
      required: ['material_name', 'processor_name', 'pcs'],
      additionalProperties: false,
    },
  },
};

function describeSend(args: SendArgs): string {
  const s = useERPStore.getState();
  const material = resolveEntity(s.materials, args.material_name, 'material').party;
  const processor = resolveEntity(s.processors, args.processor_name, 'processor').party;
  const stageName = processor?.stageId
    ? s.processingStages.find(st => st.id === processor.stageId)?.name
    : args.stage_name;
  const who = processor?.name || args.processor_name;
  const what = material?.name || args.material_name;
  return 'Send ' + fmtPcs(args.pcs) + ' pcs of ' + what + ' to ' + who + (stageName ? ' (' + stageName + ')' : '');
}

function executeSend(args: SendArgs): CommandResult {
  const s = useERPStore.getState();

  const material = resolveEntity(s.materials, args.material_name, 'material');
  if (material.error || !material.party) return { ok: false, message: material.error! };

  const processor = resolveEntity(s.processors, args.processor_name, 'processor');
  if (processor.error || !processor.party) return { ok: false, message: processor.error! };

  const materialId = material.party.id;
  const stages = s.processingStages;
  const stageId = processor.party.stageId
    || (args.stage_name
      ? stages.find(st => st.name.toLowerCase().includes(args.stage_name!.trim().toLowerCase()))?.id
      : undefined);

  if (!stageId) {
    return { ok: false, message: 'Processor "' + processor.party.name + '" has no stage assigned and no stage name was given. Assign a stage to the processor first.' };
  }

  const consumesRaw = InventoryCalculationService.sendConsumesRaw(stageId, stages);

  // Pre-flight readability: report the source-bucket balance before the engine
  // rejects (the engine's own error is the authoritative one — this just makes
  // the AI error message match what the form would show).
  if (consumesRaw && rawAvailable(materialId) < args.pcs) {
    return { ok: false, message: 'Only ' + fmtPcs(rawAvailable(materialId)) + ' pcs of ' + material.party.name + ' are available in raw stock.' };
  }
  if (!consumesRaw) {
    const sourceStageId = InventoryCalculationService.requiredSourceForTarget(stageId, stages);
    const avail = (s.batches || [])
      .filter(b => b.materialId === materialId && b.status === 'Active')
      .reduce((sum, b) => sum + batchAvailableAtSource(b, sourceStageId), 0);
    if (avail < args.pcs) {
      const srcName = stages.find(st => st.id === sourceStageId)?.name || 'the previous stage';
      return { ok: false, message: 'Only ' + fmtPcs(avail) + ' pcs of ' + material.party.name + ' are available from ' + srcName + '.' };
    }
  }

  try {
    s.addProcessingSend({
      processorId: processor.party.id,
      materialId,
      date: today(),
      pcsSent: args.pcs,
      ratePerPiece: 0,
      stageId,
      remarks: args.remarks,
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Dispatch failed.' };
  }

  const stageName = stages.find(st => st.id === stageId)?.name || '';
  return {
    ok: true,
    message: 'Dispatched ' + fmtPcs(args.pcs) + ' pcs of ' + material.party.name + ' to ' + processor.party.name + (stageName ? ' for ' + stageName : '') + '.',
  };
}

// ═════════════════════════════════════════════════════════════════════════
// receive_from_processor
// ═════════════════════════════════════════════════════════════════════════

const receiveSchema = z.object({
  processor_name: z.string().min(1).describe('Processor name the pcs are received from (partial match).'),
  pcs: z.number().int().positive().describe('Pieces received back.'),
  all: z.boolean().optional().describe('True when the user said "all" — receives the full pending quantity.'),
  remarks: z.string().optional(),
});

type ReceiveArgs = z.infer<typeof receiveSchema>;

const receiveTool: AiToolDef = {
  type: 'function',
  function: {
    name: 'receive_from_processor',
    description:
      'Receive pieces back from a processor against their open dispatch. Partial receives are ' +
      'allowed; the pending quantity is computed automatically. If the processor has several open ' +
      'dispatches the newest one is used and the summary says which. Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        processor_name: { type: 'string', description: 'Processor name the pcs are received from (partial match).' },
        pcs: { type: 'integer', minimum: 1, description: 'Pieces received back.' },
        all: { type: 'boolean', description: 'True when the user said "all" — receives the full pending quantity.' },
        remarks: { type: 'string', description: 'Optional remark stored on the receipt.' },
      },
      required: ['processor_name', 'pcs'],
      additionalProperties: false,
    },
  },
};

function pickSend(args: ReceiveArgs): { send?: ProcessingSend; error?: string } {
  const sends = openSends(args.processor_name);
  if (sends.length === 0) {
    return { error: 'No open dispatch found for that processor — nothing is pending to receive.' };
  }
  // "all" tolerates exactly one open dispatch; with several, disambiguate.
  if (sends.length > 1) {
    const pendingList = sends.map(sn => sn.dispatchNo + ' (' + fmtPcs(pendingOf(sn)) + ' pending)').join(', ');
    if (args.all === true) {
      return { error: 'Multiple open dispatches: ' + pendingList + '. Say which one, e.g. "receive all from the older dispatch".' };
    }
    // Default: newest dispatch — the summary shows which, and the user confirms.
  }
  return { send: sends[0] };
}

function describeReceive(args: ReceiveArgs): string {
  const pick = pickSend(args);
  if (pick.error || !pick.send) return 'Receive ' + fmtPcs(args.pcs) + ' pcs from ' + args.processor_name;
  const send = pick.send;
  const qty = args.all === true ? pendingOf(send) : args.pcs;
  return 'Receive ' + fmtPcs(qty) + ' pcs against dispatch ' + send.dispatchNo + ' from ' + args.processor_name;
}

function executeReceive(args: ReceiveArgs): CommandResult {
  const s = useERPStore.getState();

  const processor = resolveEntity(s.processors, args.processor_name, 'processor');
  if (processor.error || !processor.party) return { ok: false, message: processor.error! };

  const pick = pickSend(args);
  if (pick.error || !pick.send) return { ok: false, message: pick.error! };
  const send = pick.send;

  const pending = pendingOf(send);
  const qty = args.all === true ? pending : args.pcs;
  if (qty <= 0) return { ok: false, message: 'Quantity must be a positive number of pcs.' };
  if (qty > pending) {
    return { ok: false, message: 'Only ' + fmtPcs(pending) + ' pcs are pending on dispatch ' + send.dispatchNo + '.' };
  }

  try {
    s.addProcessingReceipt({
      sendId: send.id,
      processorId: processor.party.id,
      materialId: send.materialId,
      date: today(),
      pcsReceived: qty,
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Receive failed.' };
  }

  const material = s.materials.find(m => m.id === send.materialId);
  const stage = s.processingStages.find(st => st.id === send.stageId);
  const finishedNote = stage?.isFinalStage ? ' Moved to finished stock.' : '';
  return {
    ok: true,
    message: 'Received ' + fmtPcs(qty) + ' of ' + fmtPcs(send.pcsSent) + ' pcs on dispatch ' + send.dispatchNo +
      (material ? ' (' + material.name + ')' : '') + '.' + finishedNote,
  };
}

// ═════════════════════════════════════════════════════════════════════════
// record_loss
// ═════════════════════════════════════════════════════════════════════════

const lossSchema = z.object({
  processor_name: z.string().min(1).describe('Processor whose dispatch the loss is on (partial match).'),
  pcs: z.number().int().positive().describe('Pieces lost.'),
  remarks: z.string().optional(),
});

type LossArgs = z.infer<typeof lossSchema>;

const lossTool: AiToolDef = {
  type: 'function',
  function: {
    name: 'record_loss',
    description:
      'Record loss/wastage pcs against a processor\'s open dispatch (shrinkage, damage). ' +
      'Loss is explicit only — never automatic. Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        processor_name: { type: 'string', description: 'Processor whose dispatch the loss is on (partial match).' },
        pcs: { type: 'integer', minimum: 1, description: 'Pieces lost.' },
        remarks: { type: 'string', description: 'Reason for the loss, stored in the movement ledger.' },
      },
      required: ['processor_name', 'pcs'],
      additionalProperties: false,
    },
  },
};

function describeLoss(args: LossArgs): string {
  const sends = openSends(args.processor_name);
  const ref = sends[0]?.dispatchNo;
  return 'Record ' + fmtPcs(args.pcs) + ' pcs loss' + (ref ? ' on dispatch ' + ref : '') + ' (' + args.processor_name + ')';
}

function executeLoss(args: LossArgs): CommandResult {
  const s = useERPStore.getState();

  const processor = resolveEntity(s.processors, args.processor_name, 'processor');
  if (processor.error || !processor.party) return { ok: false, message: processor.error! };

  const sends = openSends(args.processor_name);
  if (sends.length === 0) {
    return { ok: false, message: 'No open dispatch found for ' + processor.party.name + ' — loss must be recorded against an open dispatch.' };
  }
  const send = sends[0];
  const pending = pendingOf(send);
  if (args.pcs > pending) {
    return { ok: false, message: 'Only ' + fmtPcs(pending) + ' pcs are pending on dispatch ' + send.dispatchNo + ' — cannot record ' + fmtPcs(args.pcs) + ' as loss.' };
  }

  try {
    s.recordProcessingLoss(send.id, args.pcs, today(), args.remarks);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Loss recording failed.' };
  }

  return {
    ok: true,
    message: 'Recorded ' + fmtPcs(args.pcs) + ' pcs loss on dispatch ' + send.dispatchNo + ' (' + processor.party.name + ').',
  };
}

// ═════════════════════════════════════════════════════════════════════════
// generate_bill
// ═════════════════════════════════════════════════════════════════════════

const billSchema = z.object({
  processor_name: z.string().min(1).describe('Processor to bill (partial match).'),
});

type BillArgs = z.infer<typeof billSchema>;

const billTool: AiToolDef = {
  type: 'function',
  function: {
    name: 'generate_bill',
    description:
      'Generate the processor bill covering all unbilled receipts of one processor, at the ' +
      'computed per-receipt amounts. Posting creates the expense/AP voucher automatically. ' +
      'Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        processor_name: { type: 'string', description: 'Processor to bill (partial match).' },
      },
      required: ['processor_name'],
      additionalProperties: false,
    },
  },
};

function describeBill(args: BillArgs): string {
  const receipts = unbilledReceipts(args.processor_name);
  const total = receipts.reduce((sum, r) => sum + (r.billAmount || 0), 0);
  return 'Generate bill for ' + args.processor_name + ': ' + receipts.length + ' receipt' + (receipts.length === 1 ? '' : 's') + ', ' + fmtRs(total) +
    (receipts.length > 0 ? ' — will post expense/AP voucher' : '');
}

function executeBill(args: BillArgs): CommandResult {
  const s = useERPStore.getState();

  const processor = resolveEntity(s.processors, args.processor_name, 'processor');
  if (processor.error || !processor.party) return { ok: false, message: processor.error! };

  const receipts = unbilledReceipts(args.processor_name);
  if (receipts.length === 0) {
    return { ok: false, message: 'No unbilled receipts for ' + processor.party.name + ' — receive pcs before billing.' };
  }

  const total = receipts.reduce((sum, r) => sum + (r.billAmount || 0), 0);
  try {
    s.addProcessorBill({
      processorId: processor.party.id,
      date: today(),
      receiptIds: receipts.map(r => r.id),
      stageId: receipts[0].stageId,
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Billing failed.' };
  }

  return {
    ok: true,
    message: 'Bill generated for ' + processor.party.name + ': ' + receipts.length + ' receipt' + (receipts.length === 1 ? '' : 's') + ', ' + fmtRs(total) + ' posted to their account.',
  };
}

// ═════════════════════════════════════════════════════════════════════════
// Registry export — same shape as commandRegistry.ts entries
// ═════════════════════════════════════════════════════════════════════════

export interface AiCommand<TArgs = Record<string, unknown>> {
  id: string;
  readOnly: boolean;
  schema: z.ZodType<TArgs>;
  tool: AiToolDef;
  describe: (args: TArgs) => string;
  execute: (args: TArgs) => CommandResult;
}

function defineCommand<TArgs>(cmd: AiCommand<TArgs>): AiCommand<Record<string, unknown>> {
  return cmd as unknown as AiCommand<Record<string, unknown>>;
}

export const PROCESSING_COMMANDS: AiCommand<Record<string, unknown>>[] = [
  defineCommand<SendArgs>({ id: 'send_to_processor', readOnly: false, schema: sendSchema, tool: sendTool, describe: describeSend, execute: executeSend }),
  defineCommand<ReceiveArgs>({ id: 'receive_from_processor', readOnly: false, schema: receiveSchema, tool: receiveTool, describe: describeReceive, execute: executeReceive }),
  defineCommand<LossArgs>({ id: 'record_loss', readOnly: false, schema: lossSchema, tool: lossTool, describe: describeLoss, execute: executeLoss }),
  defineCommand<BillArgs>({ id: 'generate_bill', readOnly: false, schema: billSchema, tool: billTool, describe: describeBill, execute: executeBill }),
];

/** Batch-typed helper re-exported for tests. */
export type { Batch, ProcessingSend };
