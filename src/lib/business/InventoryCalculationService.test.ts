import { describe, expect, it } from 'vitest';
import type { Batch, ProcessingReceipt, ProcessingSend, Product, Sale } from '../../types/erp';
import { InventoryCalculationService } from './InventoryCalculationService';

function batch(over: Partial<Batch>): Batch {
  return {
    id: 'b',
    batchNo: 'B',
    purchaseId: 'p',
    supplierId: 's',
    materialId: 'm1',
    date: '2026-01-01',
    weight: 0,
    weightUnit: 'KGs',
    ratePerUnit: 0,
    weightPerPiece: 1,
    initialPcs: 1000,
    remainingPcs: 1000,
    amount: 0,
    status: 'Active',
    ...over,
  };
}

describe('InventoryCalculationService per-batch valuation', () => {
  it('values each stage at that batch’s own purchase rate, not a blended average', () => {
    const batches: Batch[] = [
      // Batch A bought at 75/pc
      batch({ id: 'bA', initialPcs: 4000, remainingPcs: 2000, amount: 300000, atProcessorPcs: 2000, processedPcs: 0 }),
      // Batch B bought at 100/pc
      batch({ id: 'bB', initialPcs: 4000, remainingPcs: 4000, amount: 400000, atProcessorPcs: 0, processedPcs: 0 }),
    ];

    const stages = InventoryCalculationService.getMaterialStageValues('m1', batches);
    // Raw: 2000×75 + 4000×100 = 550,000. WIP: 2000×75 = 150,000 (batch A rate, NOT blended ~91.7)
    expect(stages.raw.value).toBe(550000);
    expect(stages.atProcessor.value).toBe(150000);
    expect(stages.atProcessor.pcs).toBe(2000);
    expect(stages.finished.value).toBe(0);
  });

  it('values finished goods at the producing batch’s purchase rate', () => {
    const batches: Batch[] = [
      batch({ id: 'bA', initialPcs: 4000, remainingPcs: 2000, amount: 300000, atProcessorPcs: 0, processedPcs: 1000 }),
    ];
    const stages = InventoryCalculationService.getMaterialStageValues('m1', batches);
    expect(stages.finished.value).toBe(1000 * 75);
  });

  it('computes FIFO COGS at actual batch rates (oldest batch first)', () => {
    const batches: Batch[] = [
      batch({ id: 'bA', date: '2026-01-01', initialPcs: 1000, remainingPcs: 0, amount: 75000, processedPcs: 1000 }), // 75/pc
      batch({ id: 'bB', date: '2026-02-01', initialPcs: 1000, remainingPcs: 0, amount: 100000, processedPcs: 1000 }), // 100/pc
    ];
    // Sell 1,500 pcs → 1,000 @ 75 + 500 @ 100 = 75,000 + 50,000 = 125,000
    const { cogs, consumedPcs } = InventoryCalculationService.getFIFOCOGSForSale('m1', 1500, batches);
    expect(cogs).toBe(125000);
    expect(consumedPcs).toBe(1500);
  });

  it('falls back to weighted-average cost when finished pcs are unattributed (legacy)', () => {
    const batches: Batch[] = [
      batch({ id: 'bA', initialPcs: 1000, remainingPcs: 1000, amount: 100000, processedPcs: 0 }), // 100/pc raw only
    ];
    // Sell 100 pcs with no processed batch — should not produce zero COGS
    const { cogs } = InventoryCalculationService.getFIFOCOGSForSale('m1', 100, batches);
    expect(cogs).toBe(100 * 100);
  });

  it('consumeFinishedFIFO removes sold pcs from the oldest batches first', () => {
    const batches: Batch[] = [
      batch({ id: 'bA', date: '2026-01-01', initialPcs: 1000, remainingPcs: 0, amount: 75000, processedPcs: 1000 }),
      batch({ id: 'bB', date: '2026-02-01', initialPcs: 1000, remainingPcs: 0, amount: 100000, processedPcs: 1000 }),
    ];
    const after = InventoryCalculationService.consumeFinishedFIFO('m1', 1500, batches);
    expect(after.find(b => b.id === 'bA')?.processedPcs).toBe(0);
    expect(after.find(b => b.id === 'bB')?.processedPcs).toBe(500);
  });

  // ── Master-prompt acceptance tests: 300,000 purchase, no sale → total stays 300,000 ──
  it('TEST 1 — purchase only: inventory = 300,000, no WIP/finished', () => {
    const batches: Batch[] = [batch({ id: 'bA', initialPcs: 4000, remainingPcs: 4000, amount: 300000, atProcessorPcs: 0, processedPcs: 0 })];
    const stages = InventoryCalculationService.getMaterialStageValues('m1', batches);
    expect(stages.raw.value).toBe(300000);
    expect(stages.atProcessor.value).toBe(0);
    expect(stages.finished.value).toBe(0);
  });

  it('TEST 2 — dispatch ALL to processor: raw = 0, WIP = 300,000, total unchanged (no double count)', () => {
    const batches: Batch[] = [batch({ id: 'bA', initialPcs: 4000, remainingPcs: 4000, amount: 300000, atProcessorPcs: 0, processedPcs: 0 })];
    const { batches: afterDispatch } = InventoryCalculationService.attributeDispatchFIFO('m1', 4000, batches, undefined);
    expect(afterDispatch[0].remainingPcs).toBe(0);
    expect(afterDispatch[0].atProcessorPcs).toBe(4000);
    const stages = InventoryCalculationService.getMaterialStageValues('m1', afterDispatch);
    expect(stages.raw.value).toBe(0);
    expect(stages.atProcessor.value).toBe(300000);
    expect(stages.raw.value + stages.atProcessor.value + stages.finished.value).toBe(300000);
  });

  it('TEST 3 — receive ALL from processor: WIP = 0, finished = 300,000, total unchanged', () => {
    const batches: Batch[] = [batch({ id: 'bA', initialPcs: 4000, remainingPcs: 0, amount: 300000, atProcessorPcs: 4000, processedPcs: 0 })];
    const afterReceipt = InventoryCalculationService.attributeReceiptFIFO('m1', 4000, batches, 'bA');
    expect(afterReceipt[0].atProcessorPcs).toBe(0);
    expect(afterReceipt[0].processedPcs).toBe(4000);
    const stages = InventoryCalculationService.getMaterialStageValues('m1', afterReceipt);
    expect(stages.atProcessor.value).toBe(0);
    expect(stages.finished.value).toBe(300000);
    expect(stages.raw.value + stages.atProcessor.value + stages.finished.value).toBe(300000);
  });

  it('TEST 4 — sell NONE: COGS 0, finished stays 300,000', () => {
    const batches: Batch[] = [batch({ id: 'bA', initialPcs: 4000, remainingPcs: 0, amount: 300000, atProcessorPcs: 0, processedPcs: 4000 })];
    const { cogs } = InventoryCalculationService.getFIFOCOGSForSale('m1', 0, batches);
    expect(cogs).toBe(0);
    const stages = InventoryCalculationService.getMaterialStageValues('m1', batches);
    expect(stages.finished.value).toBe(300000);
  });

  it('TEST 5 — sell 50%: finished 150,000, COGS 150,000 at actual purchase rate', () => {
    const batches: Batch[] = [batch({ id: 'bA', initialPcs: 4000, remainingPcs: 0, amount: 300000, atProcessorPcs: 0, processedPcs: 4000 })];
    const { cogs } = InventoryCalculationService.getFIFOCOGSForSale('m1', 2000, batches);
    expect(cogs).toBe(150000);
    const afterSale = InventoryCalculationService.consumeFinishedFIFO('m1', 2000, batches);
    expect(afterSale[0].processedPcs).toBe(2000);
    const stages = InventoryCalculationService.getMaterialStageValues('m1', afterSale);
    expect(stages.finished.value).toBe(150000);
  });

  it('recomputeFinishedPcsForMaterial rebuilds per-batch finished pcs from receipts minus FIFO sales', () => {
    const batches: Batch[] = [
      batch({ id: 'bA', date: '2026-01-01', initialPcs: 1000, remainingPcs: 0, amount: 75000, processedPcs: 0 }),
      batch({ id: 'bB', date: '2026-02-01', initialPcs: 1000, remainingPcs: 0, amount: 100000, processedPcs: 0 }),
    ];
    const sends: ProcessingSend[] = [
      { id: 's1', dispatchNo: 'DSP-1', processorId: 'pr', materialId: 'm1', batchId: 'bA', date: '2026-01-05', pcsSent: 1000, pcsReceived: 1000, ratePerPiece: 5, status: 'Closed' },
      { id: 's2', dispatchNo: 'DSP-2', processorId: 'pr', materialId: 'm1', batchId: 'bB', date: '2026-02-05', pcsSent: 1000, pcsReceived: 1000, ratePerPiece: 5, status: 'Closed' },
    ];
    const receipts: ProcessingReceipt[] = [
      { id: 'r1', receiveNo: 'REC-1', sendId: 's1', processorId: 'pr', materialId: 'm1', date: '2026-01-10', pcsReceived: 1000, billAmount: 5000 },
      { id: 'r2', receiveNo: 'REC-2', sendId: 's2', processorId: 'pr', materialId: 'm1', date: '2026-02-10', pcsReceived: 1000, billAmount: 5000 },
    ];
    const products: Product[] = [{ id: 'p1', name: 'Prod', materialId: 'm1', sellingPrice: 150, status: 'Active' }];
    const sales: Sale[] = [
      // Sold 1,200 → 1,000 from bA + 200 from bB
      { id: 'sale1', invoiceNo: 'INV-1', customerId: 'c', productId: 'p1', date: '2026-03-01', pcsSold: 1200, pricePerPiece: 150, totalAmount: 180000 },
    ];

    const rebuilt = InventoryCalculationService.recomputeFinishedPcsForMaterial('m1', batches, receipts, sends, sales, products);
    expect(rebuilt.find(b => b.id === 'bA')?.processedPcs).toBe(0);
    expect(rebuilt.find(b => b.id === 'bB')?.processedPcs).toBe(800);
  });

  it('restores finished pcs on delete even when the send has no batchId (legacy Any Batch dispatch)', () => {
    // Mirrors the sale-delete flow: the dispatch was created with batchId:null
    // (legacy 'Any Batch / General Stock'), so the old recompute logic skipped
    // its receipt and wiped processedPcs to 0 on delete. The reconstruction
    // must FIFO-attribute the no-batch send/receipt so deletion restores the
    // finished trail instead of destroying it.
    const batches: Batch[] = [
      batch({ id: 'bA', date: '2026-01-01', initialPcs: 4000, remainingPcs: 0, amount: 300000, atProcessorPcs: 0, processedPcs: 1000 }),
    ];
    const sends: ProcessingSend[] = [
      { id: 's1', dispatchNo: 'DSP-1', processorId: 'pr', materialId: 'm1', batchId: null as any, date: '2026-01-05', pcsSent: 4000, pcsReceived: 4000, ratePerPiece: 5, status: 'Closed' },
    ];
    const receipts: ProcessingReceipt[] = [
      { id: 'r1', receiveNo: 'REC-1', sendId: 's1', processorId: 'pr', materialId: 'm1', date: '2026-01-10', pcsReceived: 4000, billAmount: 20000 },
    ];
    const products: Product[] = [{ id: 'p1', name: 'Prod', materialId: 'm1', sellingPrice: 150, status: 'Active' }];
    const sales: Sale[] = [
      { id: 'sale1', invoiceNo: 'INV-1', customerId: 'c', productId: 'p1', date: '2026-02-01', pcsSold: 3000, pricePerPiece: 150, totalAmount: 450000 },
    ];

    // deleteSale excludes the sale being deleted (excludeSaleId) — its 3,000 pcs
    // must come back onto the batch, NOT be wiped to 0.
    const afterDelete = InventoryCalculationService.recomputeFinishedPcsForMaterial('m1', batches, receipts, sends, sales, products, 'sale1');
    expect(afterDelete.find(b => b.id === 'bA')?.processedPcs).toBe(4000);

    // With the sale still present (normal recompute), the pcs it consumed stay off.
    const withSale = InventoryCalculationService.recomputeFinishedPcsForMaterial('m1', batches, receipts, sends, sales, products);
    expect(withSale.find(b => b.id === 'bA')?.processedPcs).toBe(1000);
  });
});
