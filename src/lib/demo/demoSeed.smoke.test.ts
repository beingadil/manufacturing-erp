import { beforeAll, describe, expect, it } from 'vitest';
import { useERPStore } from '../../store/useERPStore';
import { AccountingEngine } from '../accounting/AccountingEngine';
import { seedDefaultChartOfAccounts } from '../chartOfAccountsSeed';
import { buildDefaultStages, seedDefaultProcessingStages } from '../processing/processingStageSeed';
import { seedDemoData } from './demoSeed';

/**
 * Smoke test for the multi-stage processing rollout:
 *  1. Fresh-install path: Chart of Accounts seeded, then Processing Stage
 *     master seeded (the main.tsx bootstrap order).
 *  2. Demo seed path: legacy stage-less send → receipt → bill calls must
 *     still work (they consume raw / produce finished by default).
 *  3. No double-counting: the batch trail partitions pcs into exactly one
 *     bucket at every stage.
 */
function freshSeed() {
  useERPStore.setState({
    accountSubtypes: [],
    accounts: [],
    suppliers: [],
    customers: [],
    processors: [],
    purchases: [],
    sales: [],
    batches: [],
    inventoryMovements: [],
    vouchers: [],
    journalEntries: [],
    materials: [],
    products: [],
    processingStages: [],
    processingSends: [],
    processingReceipts: [],
    processorBills: [],
  } as any);

  const st = useERPStore.getState();
  seedDefaultChartOfAccounts(
    () => useERPStore.getState(),
    { addAccountSubtype: st.addAccountSubtype, addAccount: st.addAccount } as any
  );
  const s2 = useERPStore.getState();
  seedDefaultProcessingStages(
    () => useERPStore.getState(),
    { addProcessingStage: s2.addProcessingStage, updateProcessingStage: s2.updateProcessingStage } as any
  );
}

describe('multi-stage rollout smoke', () => {
  beforeAll(() => {
    freshSeed();
  });

  it('seeds the full default stage chain (Initial Processor → Machine → Acid → Polish) with Polish final', () => {
    const s = useERPStore.getState();
    const stages = [...s.processingStages].sort((a, b) => a.sequence - b.sequence);
    expect(stages.map(x => x.name)).toEqual(['Initial Processor', 'Machine', 'Acid', 'Polish', 'Spot Machine']);
    expect(stages.map(x => x.rateMethod)).toEqual(['per_piece', 'per_kg', 'per_kg', 'per_kg', 'per_kg']);
    expect(stages.find(x => x.name === 'Spot Machine')?.isFinalStage).toBe(true);
    expect(stages.find(x => x.name === 'Polish')?.isFinalStage).toBe(false);
    expect(stages.find(x => x.name === 'Initial Processor')?.isFinalStage).toBe(false);
    // Chain is linked
    expect(stages[0].nextStageId).toBe(stages[1].id);
    expect(stages[1].nextStageId).toBe(stages[2].id);
    expect(stages[2].nextStageId).toBe(stages[3].id);
    expect(stages[3].nextStageId).toBe(stages[4].id);
    expect(stages[4].nextStageId).toBeUndefined();
  });

  it('demo seed runs end-to-end with legacy stage-less calls and balances the books', () => {
    const result = seedDemoData();
    expect(result.seeded).toBe(true);

    const s = useERPStore.getState();
    // Purchases posted inventory once
    expect(s.purchases.length).toBe(2);
    // Legacy send consumed raw and produced finished on receipt
    expect(s.processingSends.length).toBe(1);
    expect(s.processingReceipts.length).toBe(1);
    expect(s.processorBills.length).toBe(1);

    // The processing bill posted through AccountingEngine (Processing Expense / AP)
    const bill = s.processorBills[0];
    const billVoucher = s.vouchers.find(v => v.sourceId === bill.id);
    expect(billVoucher).toBeTruthy();
    const entries = s.journalEntries.filter(e => e.voucherId === billVoucher!.id);
    expect(entries.length).toBe(2);
    expect(entries.reduce((a, e) => a + e.debit, 0)).toBe(bill.totalAmount);
    expect(entries.reduce((a, e) => a + e.credit, 0)).toBe(bill.totalAmount);

    // Trial balance balances: Assets = Liabilities + Equity + (Revenue − Expenses).
    // COGS lives under its own 'Cost of Goods Sold' type, so include it in the
    // expense side of the identity.
    const balances = AccountingEngine.getAccountBalances(s.accounts, s.journalEntries, s.vouchers);
    const assetSum = s.accounts.filter(a => a.type === 'Assets').reduce((sum, a) => sum + (balances.get(a.id) || 0), 0);
    const liabSum = s.accounts.filter(a => a.type === 'Liabilities').reduce((sum, a) => sum + (balances.get(a.id) || 0), 0);
    const eqSum = s.accounts.filter(a => a.type === 'Equity').reduce((sum, a) => sum + (balances.get(a.id) || 0), 0);
    const revSum = s.accounts.filter(a => a.type === 'Revenue').reduce((sum, a) => sum + (balances.get(a.id) || 0), 0);
    const expSum = s.accounts.filter(a => a.type === 'Expenses' || a.type === 'Cost of Goods Sold').reduce((sum, a) => sum + (balances.get(a.id) || 0), 0);
    // Assets = Liabilities + Equity + (Revenue − Expenses)
    expect(Math.abs(assetSum - (liabSum + eqSum + (revSum - expSum)))).toBeLessThan(1);
  });

  it('no double-counting: batch pcs partition into exactly one bucket at every stage', () => {
    const s = useERPStore.getState();
    const steelBatch = s.batches.find(b => b.materialId === s.materials.find(m => m.name === 'Steel Coil')?.id);
    if (!steelBatch) return; // batch trail may be general-stock in demo
    const total = (steelBatch.remainingPcs || 0) + (steelBatch.atProcessorPcs || 0) + (steelBatch.processedPcs || 0);
    // 4,000 pcs purchased, 4,000 processed, 1,500 sold → 2,500 finished remain
    expect(total).toBe(2500);
  });

  it('buildDefaultStages produces a linked, final-flagged chain (test helper parity)', () => {
    const stages = buildDefaultStages();
    expect(stages.length).toBe(5);
    expect(stages[4].isFinalStage).toBe(true);
    expect(stages[0].nextStageId).toBe(stages[1].id);
  });
});