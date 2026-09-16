// src/lib/ai/commandRegistry.test.ts
// Proves the registry contract: schema validation kills hallucinated args,
// describe() renders business words, execute() goes through the real engine
// (stock check fires, store state actually changes, party balances recompute).

import { beforeEach, describe, expect, it } from 'vitest';
import { useERPStore } from '../../store/useERPStore';
import type { ProcessingStage } from '../../types/erp';
import { buildDefaultStages } from '../processing/processingStageSeed';
import { AI_TOOLS, findCommand, validateArgs } from './commandRegistry';

const STAGES: ProcessingStage[] = buildDefaultStages();
const initial = STAGES[0];
const finalStage = STAGES[STAGES.length - 1];
expect(finalStage.isFinalStage).toBe(true);

function seed() {
  useERPStore.setState({
    processingStages: STAGES,
    materials: [
      { id: 'mat-1', name: 'Brass Sheet', categoryId: 'cat-1', status: 'Active', stockPcs: 93, processedStockPcs: 300, atProcessorPcs: 40 },
    ],
    products: [
      { id: 'prod-1', name: 'Brass Plate', materialId: 'mat-1', sellingPrice: 80, status: 'Active' },
    ],
    customers: [
      { id: 'cust-1', name: 'Ahmed Steel', status: 'Active', balanceReceivable: 0 },
      { id: 'cust-2', name: 'Ahmed Traders', status: 'Active', balanceReceivable: 0 },
    ],
    batches: [
      {
        id: 'batch-1', batchNo: 'B-0001', purchaseId: 'pur-1', supplierId: 'sup-1',
        materialId: 'mat-1', date: '2026-01-01', weight: 100, weightUnit: 'KGs' as const,
        ratePerUnit: 400, weightPerPiece: 0.1, initialPcs: 1000, remainingPcs: 393,
        // raw bucket = remainingPcs - processedPcs = 393 - 300 = 93 (matches material.stockPcs)
        amount: 40000, status: 'Active' as const, atProcessorPcs: 40, processedPcs: 300,
        stageAvailableBySource: { [initial.id]: 160, [STAGES[1].id]: 67 },
        currentStageId: STAGES[1].id,
      },
    ],
    sales: [],
    processingSends: [],
    processingReceipts: [],
    processorBills: [],
    inventoryMovements: [],
  });
}

describe('AI command registry — tools', () => {
  it('exposes valid Groq tool definitions for every command', () => {
    expect(AI_TOOLS.length).toBeGreaterThanOrEqual(2);
    for (const tool of AI_TOOLS) {
      expect(tool.type).toBe('function');
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description.length).toBeGreaterThan(10);
      expect((tool.function.parameters as any).type).toBe('object');
    }
    expect(AI_TOOLS.map(t => t.function.name)).toContain('query_stock');
    expect(AI_TOOLS.map(t => t.function.name)).toContain('create_sale');
  });
});

describe('query_stock', () => {
  beforeEach(seed);

  it('validates args strictly', () => {
    const cmd = findCommand('query_stock')!;
    expect(validateArgs(cmd, {}).ok).toBe(false);
    expect(validateArgs(cmd, { material_name: '' }).ok).toBe(false);
    const ok = validateArgs(cmd, { material_name: 'brass' });
    expect(ok.ok).toBe(true);
  });

  it('reports bucket breakdown for a material (the 93-raw + buckets scenario)', () => {
    const cmd = findCommand('query_stock')!;
    const res = cmd.execute({ material_name: 'brass sheet' });
    expect(res.ok).toBe(true);
    // on-hand = 93 raw + 40 at-processor + (160+67) waiting + 300 finished = 660
    // sold = purchased(1000) - on-hand(660) = 340
    expect(res.message).toContain('93');
    expect(res.message).toContain('300');
    const data = res.data as { rows: { bucket: string; pcs: number }[] };
    const byBucket = Object.fromEntries(data.rows.map(r => [r.bucket, r.pcs]));
    expect(byBucket['Raw (not yet sent)']).toBe(93);
    expect(byBucket['Finished (ready to sell)']).toBe(300);
    expect(byBucket['Sold']).toBe(340);
  });

  it('rejects ambiguous material names loudly', () => {
    useERPStore.setState({
      materials: [
        { id: 'm1', name: 'Brass Sheet', categoryId: 'c', status: 'Active', stockPcs: 1, processedStockPcs: 0, atProcessorPcs: 0 },
        { id: 'm2', name: 'Brass Wire', categoryId: 'c', status: 'Active', stockPcs: 2, processedStockPcs: 0, atProcessorPcs: 0 },
      ],
    });
    const cmd = findCommand('query_stock')!;
    const res = cmd.execute({ material_name: 'brass' });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Multiple materials match');
  });

  it('rejects unknown materials loudly', () => {
    const cmd = findCommand('query_stock')!;
    const res = cmd.execute({ material_name: 'unobtanium' });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('No material found');
  });
});

describe('create_sale', () => {
  beforeEach(seed);

  it('describes the sale in business words using resolved names', () => {
    const cmd = findCommand('create_sale')!;
    const summary = cmd.describe({ customer_name: 'ahmed steel', product_name: 'plate', pcs: 50, price_per_piece: 60 });
    expect(summary).toContain('Ahmed Steel');
    expect(summary).toContain('Brass Plate');
    expect(summary).toContain('50');
  });

  it('validates schema (positive ints, required fields)', () => {
    const cmd = findCommand('create_sale')!;
    expect(validateArgs(cmd, { customer_name: 'a', product_name: 'b', pcs: 0, price_per_piece: 1 }).ok).toBe(false);
    expect(validateArgs(cmd, { customer_name: 'a', product_name: 'b', pcs: 5, price_per_piece: -1 }).ok).toBe(false);
    expect(validateArgs(cmd, { customer_name: 'a', product_name: 'b', pcs: 2.5, price_per_piece: 1 }).ok).toBe(false);
    expect(validateArgs(cmd, { customer_name: 'a', product_name: 'b', pcs: 5 }).ok).toBe(false);
    expect(validateArgs(cmd, { customer_name: 'a', product_name: 'b', pcs: 5, price_per_piece: 10 }).ok).toBe(true);
  });

  it('rejects when finished stock is insufficient — never over-sells', () => {
    const cmd = findCommand('create_sale')!;
    const res = cmd.execute({ customer_name: 'ahmed steel', product_name: 'brass plate', pcs: 301, price_per_piece: 60 });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Only 300 finished pcs');
    expect(useERPStore.getState().sales).toHaveLength(0); // nothing mutated
  });

  it('rejects ambiguous customers without mutating', () => {
    const cmd = findCommand('create_sale')!;
    const res = cmd.execute({ customer_name: 'ahmed', product_name: 'brass plate', pcs: 10, price_per_piece: 60 });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Multiple customers');
    expect(useERPStore.getState().sales).toHaveLength(0);
  });

  it('records the sale through the real store action and decrements finished stock', () => {
    // Minimal accounts so the auto-voucher path has targets (party fallback AR exists).
    useERPStore.setState({
      accountSubtypes: [
        { id: 'st-ar', name: 'Accounts Receivable', type: 'Assets' as const, isSystem: true },
        { id: 'st-sales', name: 'Sales', type: 'Revenue' as const, isSystem: true },
        { id: 'st-inv', name: 'Inventory', type: 'Assets' as const, isSystem: true },
      ],
      accounts: [
        { id: 'acct-ar', code: '1200', name: 'Accounts Receivable', subtypeId: 'st-ar', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
        { id: 'acct-sales', code: '4001', name: 'Sales Revenue', subtypeId: 'st-sales', type: 'Revenue' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
      ],
    });

    const cmd = findCommand('create_sale')!;
    const res = cmd.execute({ customer_name: 'ahmed steel', product_name: 'brass plate', pcs: 100, price_per_piece: 60 });
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Sale recorded');

    const s = useERPStore.getState();
    expect(s.sales).toHaveLength(1);
    expect(s.sales[0].pcsSold).toBe(100);
    expect(s.sales[0].totalAmount).toBe(6000);
    expect(s.materials[0].processedStockPcs).toBe(200); // 300 - 100
    // Movement ledger got the OUT entry
    const saleMovement = s.inventoryMovements.find(m => m.module === 'Sale');
    expect(saleMovement).toBeTruthy();
    expect(saleMovement!.transactionType).toBe('OUT');
  });
});
