// src/lib/ai/contextBuilder.ts
// Builds the compact system context the LLM needs to map speech to entities.
// Never dumps the whole store — small, purpose-built summaries derived from
// live state (materials, parties, products) so the model resolves names to
// what actually exists.

import { useERPStore } from '../../store/useERPStore';

export function buildEntityContext(): string {
  const s = useERPStore.getState();

  const materials = s.materials
    .slice(0, 40)
    .map(m => {
      const total = (m.stockPcs || 0) + (m.atProcessorPcs || 0) + (m.processedStockPcs || 0);
      return m.name + ' (' + total + ' pcs: ' + (m.stockPcs || 0) + ' raw, ' +
        (m.atProcessorPcs || 0) + ' in processing, ' + (m.processedStockPcs || 0) + ' finished)';
    })
    .join('; ');

  const stages = [...s.processingStages]
    .sort((a, b) => a.sequence - b.sequence)
    .map(st => st.name + (st.isFinalStage ? ' (final)' : ''))
    .join(' -> ');

  const processors = s.processors
    .slice(0, 30)
    .map(p => p.name + (p.stageId ? ' [' + (s.processingStages.find(st => st.id === p.stageId)?.name || '?') + ']' : ' [general]'))
    .join('; ');

  const customers = s.customers.slice(0, 30).map(c => c.name).join('; ');
  const suppliers = s.suppliers.slice(0, 30).map(sp => sp.name).join('; ');
  const products = s.products.slice(0, 30).map(p => p.name + (p.materialId ? ' (from ' + (s.materials.find(m => m.id === p.materialId)?.name || '?') + ')' : '')).join('; ');

  return [
    'Today: ' + new Date().toISOString().slice(0, 10),
    stages ? 'Processing stages: ' + stages : '',
    materials ? 'Materials: ' + materials : '',
    products ? 'Products: ' + products : '',
    processors ? 'Processors: ' + processors : '',
    customers ? 'Customers: ' + customers : '',
    suppliers ? 'Suppliers: ' + suppliers : '',
  ].filter(Boolean).join('\n');
}

export const SYSTEM_PROMPT = [
  'You are the voice assistant of a manufacturing ERP for a metal utensils business.',
  'The user speaks commands like "how many pcs of brass sheet are in stock",',
  '"sell 300 pcs of plate to Ahmed at 60 per piece", "send 400 pcs of brass to Ali",',
  '"receive 250 from Ali", "record 10 pcs loss on Ali", or "bill Ali".',
  '',
  'Rules:',
  '1. Choose exactly ONE tool per user command and fill its arguments from the utterance.',
  '2. Resolve names against the entity lists in the context. Use the closest match;',
  '   never invent names, quantities, or prices that the user did not say.',
  '3. Prices are in PKR. Quantities are integer pieces (pcs).',
  '4. If the utterance contains more than one operation, return one tool call for',
  '   EACH operation in the order they were spoken (the caller executes them sequentially).',
  '5. If nothing matches a tool, reply with a short plain sentence (no tool call)',
  '   explaining what you can do.',
  '6. Never fabricate tool arguments: if a required value is missing from the',
  '   utterance, reply asking for it instead of guessing.',
].join('\n');
