// src/lib/ai/commandRegistry.ts
// ─────────────────────────────────────────────────────────────────────────────
// The command registry — the single contract between natural language and the
// ERP engine. Every command is a typed, self-describing object with:
//   1. a zod schema   → validates what the LLM extracted (hallucinated args die here)
//   2. a Groq tool def → generated from the schema, so parsing and validation
//                        can never drift apart
//   3. describe(args) → human-readable one-liner for the confirmation panel
//   4. execute(args)  → runs through the SAME store actions the UI uses, so
//                        every engine guard (Three Laws, conservation, stock
//                        checks, auto-vouchers) applies to AI commands as-is.
//
// Writes (readOnly: false) ALWAYS require explicit user confirmation in the UI
// before execute() is ever called — the assistant never mutates on its own.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { getMaterialBatchProgress } from '../processing/stageProgress';
import { useERPStore } from '../../store/useERPStore';
import type { AiToolDef, CommandResult } from './types';
import { PROCESSING_COMMANDS } from './processingCommands';
import { resolveEntity } from './entityResolver';

// ── Formatting helpers (match the app's shared conventions) ──────────────

const fmtPcs = (n: number): string => new Intl.NumberFormat('en-US').format(n);
const fmtRs = (n: number): string =>
  'Rs ' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// ── query_stock ──────────────────────────────────────────────────────────

const queryStockSchema = z.object({
  material_name: z.string().min(1).describe('Material name to look up (partial match allowed, e.g. "brass").'),
});

type QueryStockArgs = z.infer<typeof queryStockSchema>;

const queryStockTool: AiToolDef = {
  type: 'function',
  function: {
    name: 'query_stock',
    description:
      'Look up stock of a raw material by name: total pieces on hand and where they are ' +
      '(raw, at which processor stage, waiting for next stage, finished, sold). Read-only.',
    parameters: {
      type: 'object',
      properties: {
        material_name: { type: 'string', description: 'Material name to look up (partial match allowed, e.g. "brass").' },
      },
      required: ['material_name'],
      additionalProperties: false,
    },
  },
};

function describeQueryStock(args: QueryStockArgs): string {
  return 'Look up stock for material "' + args.material_name + '"';
}

function executeQueryStock(args: QueryStockArgs): CommandResult {
  const s = useERPStore.getState();
  const stages = s.processingStages;
  const needle = args.material_name.trim().toLowerCase();

  const matches = s.materials.filter(m => m.name.toLowerCase().includes(needle));
  if (matches.length === 0) {
    return { ok: false, message: 'No material found matching "' + args.material_name + '".' };
  }
  if (matches.length > 1) {
    const names = matches.map(m => '"' + m.name + '"').join(', ');
    return { ok: false, message: 'Multiple materials match: ' + names + '. Please be more specific.' };
  }

  const material = matches[0];
  const progress = getMaterialBatchProgress(material.id, s.batches, stages);
  // Sold is the residue: purchased total (initial pcs of live batches) minus
  // everything still attributed to live buckets. Bucket fields are disjoint,
  // so this arithmetic is exact.
  const purchased = s.batches
    .filter(b => b.materialId === material.id && b.status === 'Active')
    .reduce((sum, b) => sum + (b.initialPcs || 0), 0);
  const soldPcs = Math.max(0, purchased - (
    material.stockPcs
    + progress.reduce((sum, p) => sum + p.inTransitPcs + p.availablePcs, 0)
    + material.processedStockPcs
  ));

  const rows = [
    { bucket: 'Raw (not yet sent)', pcs: material.stockPcs },
    ...progress
      .filter(p => p.inTransitPcs > 0 && p.currentStage)
      .map(p => ({ bucket: 'At ' + p.currentStage!.name + ' (processor has them)', pcs: p.inTransitPcs })),
    ...progress
      .filter(p => p.availablePcs > 0)
      .map(p => ({ bucket: 'Waiting for next stage', pcs: p.availablePcs })),
    { bucket: 'Finished (ready to sell)', pcs: material.processedStockPcs },
    { bucket: 'Sold', pcs: soldPcs },
  ].filter(r => r.pcs > 0);

  // WIP comes from the batch-scoped progress (defaults 0 per batch), never
  // from the legacy material.atProcessorPcs roll-up — that field is optional
  // and undefined on real data, which produced "NaN pcs on hand".
  const wipPcs = progress.reduce((sum, p) => sum + p.inTransitPcs, 0);
  const headline = material.name + ': ' + fmtPcs(
    material.stockPcs + material.processedStockPcs + wipPcs
  ) + ' pcs on hand';

  return {
    ok: true,
    message: headline + '. ' + rows.map(r => r.bucket + ': ' + fmtPcs(r.pcs)).join(' · '),
    data: { material: material.name, rows },
  };
}

// ── create_sale ──────────────────────────────────────────────────────────

const createSaleSchema = z.object({
  customer_name: z.string().min(1).describe('Customer name (partial match allowed).'),
  product_name: z.string().min(1).describe('Finished product name (partial match allowed).'),
  pcs: z.number().int().positive().describe('Number of pieces to sell.'),
  price_per_piece: z.number().positive().describe('Selling price per piece in PKR.'),
});

type CreateSaleArgs = z.infer<typeof createSaleSchema>;

const createSaleTool: AiToolDef = {
  type: 'function',
  function: {
    name: 'create_sale',
    description:
      'Record a sale of finished goods: customer, product, pieces and price per piece (PKR). ' +
      'The user must confirm before this executes. Requires enough finished stock.',
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Customer name (partial match allowed).' },
        product_name: { type: 'string', description: 'Finished product name (partial match allowed).' },
        pcs: { type: 'integer', minimum: 1, description: 'Number of pieces to sell.' },
        price_per_piece: { type: 'number', exclusiveMinimum: 0, description: 'Selling price per piece in PKR.' },
      },
      required: ['customer_name', 'product_name', 'pcs', 'price_per_piece'],
      additionalProperties: false,
    },
  },
};

/** Resolve a party by fuzzy name; returns an error string when ambiguous/missing. */
function resolveParty<T extends { id: string; name: string }>(
  list: T[],
  needle: string,
  what: string
): { party?: T; error?: string } {
  return resolveEntity(list, needle, what);
}

function describeCreateSale(args: CreateSaleArgs): string {
  const s = useERPStore.getState();
  const customer = resolveParty(s.customers, args.customer_name, 'customer').party;
  const product = resolveParty(s.products, args.product_name, 'product').party;
  const amount = args.pcs * args.price_per_piece;
  const who = customer ? customer.name : args.customer_name;
  const what = product ? product.name : args.product_name;
  return 'Sell ' + fmtPcs(args.pcs) + ' pcs of ' + what + ' to ' + who + ' at ' + fmtRs(args.price_per_piece) + '/pc (total ' + fmtRs(amount) + ')';
}

function executeCreateSale(args: CreateSaleArgs): CommandResult {
  const s = useERPStore.getState();

  const customer = resolveParty(s.customers, args.customer_name, 'customer');
  if (customer.error || !customer.party) return { ok: false, message: customer.error! };

  const product = resolveParty(s.products, args.product_name, 'product');
  if (product.error || !product.party) return { ok: false, message: product.error! };

  const material = product.party.materialId
    ? s.materials.find(m => m.id === product.party!.materialId)
    : undefined;

  const available = material ? material.processedStockPcs : 0;
  if (!material) {
    return { ok: false, message: 'Product "' + product.party.name + '" is not linked to a raw material, so finished stock cannot be checked. Create the sale from the Sales page instead.' };
  }
  if (available < args.pcs) {
    return { ok: false, message: 'Only ' + fmtPcs(available) + ' finished pcs of ' + material.name + ' are available — cannot sell ' + fmtPcs(args.pcs) + '.' };
  }

  try {
    s.addSale({
      customerId: customer.party.id,
      productId: product.party.id,
      date: new Date().toISOString().slice(0, 10),
      pcsSold: args.pcs,
      pricePerPiece: args.price_per_piece,
    });
  } catch (e) {
    return { ok: false, message: 'Sale rejected: ' + (e instanceof Error ? e.message : String(e)) };
  }

  const total = args.pcs * args.price_per_piece;
  return {
    ok: true,
    message: 'Sale recorded: ' + fmtPcs(args.pcs) + ' pcs of ' + product.party.name + ' to ' + customer.party.name + ' for ' + fmtRs(total) + '.',
  };
}

// ── Registry ─────────────────────────────────────────────────────────────

export interface AiCommand<TArgs = Record<string, unknown>> {
  id: string;
  readOnly: boolean;
  /** Zod schema — validates LLM-extracted args before describe/execute run. */
  schema: z.ZodType<TArgs>;
  tool: AiToolDef;
  describe: (args: TArgs) => string;
  execute: (args: TArgs) => CommandResult;
}

function defineCommand<TArgs>(cmd: AiCommand<TArgs>): AiCommand<Record<string, unknown>> {
  return cmd as unknown as AiCommand<Record<string, unknown>>;
}

export const AI_COMMANDS: AiCommand<Record<string, unknown>>[] = [
  defineCommand<QueryStockArgs>({
    id: 'query_stock',
    readOnly: true,
    schema: queryStockSchema,
    tool: queryStockTool,
    describe: describeQueryStock,
    execute: executeQueryStock,
  }),
  defineCommand<CreateSaleArgs>({
    id: 'create_sale',
    readOnly: false,
    schema: createSaleSchema,
    tool: createSaleTool,
    describe: describeCreateSale,
    execute: executeCreateSale,
  }),
  ...PROCESSING_COMMANDS,
];

export const AI_TOOLS: AiToolDef[] = AI_COMMANDS.map(c => c.tool);

export function findCommand(id: string): AiCommand<Record<string, unknown>> | undefined {
  return AI_COMMANDS.find(c => c.tool.function.name === id);
}

/**
 * Validate raw LLM arguments against a command's schema.
 * Returns typed args or a business-worded error.
 */
export function validateArgs(
  cmd: AiCommand<Record<string, unknown>>,
  rawArgs: unknown
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  const parsed = cmd.schema.safeParse(rawArgs);
  if (parsed.success) return { ok: true, args: parsed.data as Record<string, unknown> };
  const issue = parsed.error.issues[0];
  const field = issue?.path?.join('.') || 'arguments';
  return { ok: false, error: 'Invalid ' + field + ': ' + (issue?.message || 'validation failed') };
}
