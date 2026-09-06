import type {
  Account,
  AccountSubtype,
  Batch,
  Customer,
  JournalEntry,
  ProcessingReceipt,
  ProcessingSend,
  ProcessingStage,
  Processor,
  ProcessorBill,
  Purchase,
  RawMaterial,
  Sale,
  Supplier,
  Voucher,
} from '../../types/erp';
import { AccountingEngine } from '../accounting/AccountingEngine';
import { getBankAccounts, getCashAccounts } from '../accounting/accountClassification';
import { batchAvailableTotal, InventoryCalculationService } from '../business/InventoryCalculationService';

/**
 * Dashboard Financial & Inventory Position — a READ-ONLY presentation layer
 * over the authoritative accounting engine (spec §16, §19).
 *
 * Every balance figure comes from AccountingEngine.getAccountBalances()
 * (as-of-date, Posted-only, opening-balance aware). Inventory is valued from
 * the batch cost basis already stored in the ERP. Nothing here maintains a
 * separate balance — the Dashboard can never become the source of truth.
 */

export interface BankBalance {
  id: string;
  name: string;
  balance: number;
}

export interface StageWipBreakdown {
  stageId: string;
  name: string;
  sequence: number;
  pcs: number;
  value: number;
}

export interface InventoryValuation {
  /** Value of raw stock on hand — batch cost basis. */
  rawMaterials: number;
  /** Value of processed/finished stock at weighted-average material cost. */
  processedStock: number;
  /** Value of stock currently at processors (operational — not ledger-posted). */
  atProcessor: number;
  /** Same as processedStock — in this equals the finished goods. */
  finishedGoods: number;
  /** Total valued inventory = raw + at-processor + finished. */
  total: number;
  /** Operational quantities (PCS). */
  rawPcs: number;
  wipPcs: number;
  finishedPcs: number;
  /** Per-stage WIP breakdown (derived from movement history — the same WIP
   *  pcs are never counted twice; each stage shows its own held quantity). */
  stageWip: StageWipBreakdown[];
  /** True when the batch-basis total equals the per-material rollup (batch/stock state reconcile). */
  reconciled: boolean;
}

export interface ReceivablesSummary {
  total: number;
  customersOutstanding: number;
}

export interface PayablesSummary {
  total: number;
  suppliersOutstanding: number;
}

export interface ProfitSummary {
  revenue: number;
  expenses: number;
  net: number;
}

export interface DashboardSummaryOptions {
  /** Balance-type figures (cash, bank, receivables, payables, assets…) are valued as of end of this day. */
  asOfDate: string;
  /** Period start (inclusive) for activity figures (profit, sales, purchases, cash receipts/payments). */
  periodStart: string;
  /** Period end (inclusive) for activity figures. */
  periodEnd: string;
}

export interface DashboardSummary {
  asOfDate: string;
  periodStart: string;
  periodEnd: string;
  cashInHand: number;
  bankTotal: number;
  bankAccounts: BankBalance[];
  periodCashReceipts: number;
  periodCashPayments: number;
  inventory: InventoryValuation;
  receivables: ReceivablesSummary;
  payables: PayablesSummary;
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  profit: ProfitSummary;
  periodSales: number;
  periodPurchases: number;
  periodProcessing: number;
  netWorkingCapital: number;
}

export interface DashboardSummaryState {
  accounts: Account[];
  accountSubtypes: AccountSubtype[];
  journalEntries: JournalEntry[];
  vouchers: Voucher[];
  batches: Batch[];
  materials: RawMaterial[];
  customers: Customer[];
  suppliers: Supplier[];
  processors: Processor[];
  sales: Sale[];
  purchases: Purchase[];
  processorBills: ProcessorBill[];
  processingSends: ProcessingSend[];
  processingReceipts: ProcessingReceipt[];
  processingStages: ProcessingStage[];
}

export class DashboardSummaryService {
  /** Journal entries whose voucher is Posted and falls inside the period window. */
  private static periodEntries(
    entries: JournalEntry[],
    vouchers: Voucher[],
    start: string,
    end: string
  ): JournalEntry[] {
    const dateById = new Map<string, string>();
    for (const v of vouchers) {
      if (v.status === 'Posted') dateById.set(v.id, v.date);
    }
    return entries.filter(je => {
      const d = dateById.get(je.voucherId);
      return !!d && d >= start && d <= end;
    });
  }

  /**
   * Per-material inventory value at ACTUAL purchase cost, split by stage.
   *
   * raw        = Σ batch remainingPcs × batch rate  (what you paid for the raw you hold)
   * atProcessor= Σ batch atProcessorPcs × batch rate (the exact batch dispatched)
   * finished   = Σ batch processedPcs × batch rate   (the exact batch that produced it)
   *
   * The BATCH TRAIL is the single source of truth. A batch's pcs are partitioned
   * into exactly one stage (remaining + atProcessor + processed + sold =
   * initialPcs), so moving stock between stages never changes total value — it
   * only relocates it (raw → WIP → finished → COGS on sale). Material counters
   * are reconciled against the batch trail; any drift is FLAGGED (reconciled =
   * false) instead of being silently valued on top of the batch value — that
   * silent addition was the double-counting bug (raw counted from batches PLUS
   * WIP/finished counted from material counters).
   */
  private static valueInventory(
    batches: Batch[],
    materials: RawMaterial[],
    processingSends: ProcessingSend[],
    processingReceipts: ProcessingReceipt[],
    processingStages: ProcessingStage[]
  ): InventoryValuation {
    let rawMaterials = 0;
    let atProcessor = 0;
    let finishedGoods = 0;
    let reconciled = true;

    const materialIds = new Set(materials.map(m => m.id));
    const active = batches.filter(b => b.status === 'Active');

    const attrRaw = new Map<string, number>();
    const attrWip = new Map<string, number>();
    const attrFin = new Map<string, number>();
    for (const b of active) {
      if (!materialIds.has(b.materialId)) continue;
      const cost = b.initialPcs > 0 ? b.amount / b.initialPcs : 0;
      const raw = b.remainingPcs || 0;
      // WIP = pcs in the processing pipeline: at a processor now OR received
      // back waiting for the next stage (per-source availability buckets).
      // Buckets are disjoint, so the sum is the true pipeline count.
      const wip = (b.atProcessorPcs || 0) + batchAvailableTotal(b);
      const fin = b.processedPcs || 0;
      attrRaw.set(b.materialId, (attrRaw.get(b.materialId) || 0) + raw);
      attrWip.set(b.materialId, (attrWip.get(b.materialId) || 0) + wip);
      attrFin.set(b.materialId, (attrFin.get(b.materialId) || 0) + fin);
      rawMaterials += raw * cost;
      atProcessor += wip * cost;
      finishedGoods += fin * cost;
    }

    // Operational quantities (material counters) for the UI cards.
    const rawPcs = materials.reduce((s, m) => s + (m.stockPcs || 0), 0);
    const wipPcs = materials.reduce((s, m) => s + (m.atProcessorPcs || 0), 0);
    const finishedPcs = materials.reduce((s, m) => s + (m.processedStockPcs || 0), 0);

    // Reconciliation guard: material counters must equal the batch trail. If
    // they diverge, flag it — never value the same pcs twice.
    for (const m of materials) {
      const batchRaw = attrRaw.get(m.id) || 0;
      const batchWip = attrWip.get(m.id) || 0;
      const batchFin = attrFin.get(m.id) || 0;
      const tol = 0.01;
      if (Math.abs((m.stockPcs || 0) - batchRaw) > tol) reconciled = false;
      if (Math.abs((m.atProcessorPcs || 0) - batchWip) > tol) reconciled = false;
      if (Math.abs((m.processedStockPcs || 0) - batchFin) > tol) reconciled = false;
    }

    // Per-stage WIP breakdown — a pure derivation over the movement history.
    // Each stage's pcs come from Σ sent − Σ received − Σ loss for that stage;
    // the batch's single atProcessorPcs bucket is the sum across stages, so the
    // same economic pcs are never counted in two stages simultaneously.
    const stageWip: StageWipBreakdown[] = [...processingStages]
      .sort((a, b) => a.sequence - b.sequence)
      .filter(s => !s.isFinalStage)
      .map(stage => {
        const pcs = InventoryCalculationService.getStageWIP(stage.id, processingSends, processingReceipts);
        // Value the stage at the weighted-average purchase cost of the pcs in
        // WIP (batch basis) — same basis as the atProcessor total.
        const value = atProcessor > 0 && wipPcs > 0 ? (atProcessor * pcs) / wipPcs : 0;
        return { stageId: stage.id, name: stage.name, sequence: stage.sequence, pcs, value };
      });

    const total = rawMaterials + atProcessor + finishedGoods;
    return {
      rawMaterials,
      processedStock: finishedGoods,
      finishedGoods,
      atProcessor,
      total,
      rawPcs,
      wipPcs,
      finishedPcs,
      stageWip,
      reconciled,
    };
  }

  static getSummary(state: DashboardSummaryState, options: DashboardSummaryOptions): DashboardSummary {
    const { accounts, accountSubtypes, journalEntries, vouchers, batches, materials, customers, suppliers, processors, sales, purchases, processorBills, processingSends, processingReceipts, processingStages } = state;
    const { asOfDate, periodStart, periodEnd } = options;

    // ── Balances as of the period end — single authoritative engine ─────────
    const balances = AccountingEngine.getAccountBalances(accounts, journalEntries, vouchers, asOfDate);

    const cashAccounts = getCashAccounts(accounts, accountSubtypes);
    const bankAccounts = getBankAccounts(accounts, accountSubtypes);

    const cashInHand = cashAccounts.reduce((s, a) => s + Math.max(0, balances.get(a.id) || 0), 0);
    const bankList: BankBalance[] = bankAccounts
      .map(a => ({ id: a.id, name: a.name, balance: Math.max(0, balances.get(a.id) || 0) }))
      .filter(b => b.balance !== 0 || bankAccounts.length === 1)
      .sort((a, b) => b.balance - a.balance);
    const bankTotal = bankList.reduce((s, b) => s + b.balance, 0);

    // ── Receivables / payables from linked party sub-ledger accounts ────────
    const customerIds = new Set(customers.map(c => c.id));
    const supplierIds = new Set(suppliers.map(s => s.id));
    const processorIds = new Set(processors.map(p => p.id));

    let receivablesTotal = 0;
    let customersOutstanding = 0;
    let payablesTotal = 0;
    let suppliersOutstanding = 0;

    for (const account of accounts) {
      if (!account.linkedEntityId) continue;
      const balance = balances.get(account.id) || 0;
      if (customerIds.has(account.linkedEntityId)) {
        if (balance > 0) {
          receivablesTotal += balance;
          customersOutstanding += 1;
        }
      } else if (supplierIds.has(account.linkedEntityId) || processorIds.has(account.linkedEntityId)) {
        if (balance > 0) {
          payablesTotal += balance;
          suppliersOutstanding += 1;
        }
      }
    }

    // ── Inventory valuation — ACTUAL purchase cost, per stage ────────────────
    // raw / atProcessor / finished each = Σ pcs × that batch's purchase rate.
    const inventory = this.valueInventory(batches, materials, processingSends || [], processingReceipts || [], processingStages || []);

    // ── Balance-sheet position — mirrors the Balance Sheet report EXACTLY ────
    // Raw balances, no clamping: if an asset account is negative (e.g. the
    // under-posted Finished Goods line) the Dashboard must show the same total
    // the report shows, or the two would never reconcile (Phase 7).
    let totalAssets = 0;
    let totalLiabilities = 0;
    let equity = 0;
    for (const account of accounts) {
      const bal = balances.get(account.id) || 0;
      if (account.type === 'Assets') totalAssets += bal;
      else if (account.type === 'Liabilities') totalLiabilities += bal;
      else if (account.type === 'Equity') equity += bal;
    }

    // ── Period profit from posted entries only (no opening balances) ─────────
    const active = this.periodEntries(journalEntries, vouchers, periodStart, periodEnd);
    let revenue = 0;
    let expenses = 0;
    for (const je of active) {
      const account = accounts.find(a => a.id === je.accountId);
      if (!account) continue;
      if (account.type === 'Revenue' || account.type === 'Other Income') revenue += je.credit || 0;
      else if (account.type === 'Expenses' || account.type === 'Cost of Goods Sold' || account.type === 'Other Expenses') expenses += je.debit || 0;
    }
    const profit = { revenue, expenses, net: revenue - expenses };

    // ── Period cash activity (cash accounts only, in window) ─────────────────
    const cashIds = new Set(cashAccounts.map(a => a.id));
    let periodCashReceipts = 0;
    let periodCashPayments = 0;
    for (const je of active) {
      if (!cashIds.has(je.accountId)) continue;
      periodCashReceipts += je.debit || 0;
      periodCashPayments += je.credit || 0;
    }

    // ── Period module activity (sales/purchases already security-filtered) ───
    const inPeriod = (date: string) => date >= periodStart && date <= periodEnd;
    const periodSales = sales.filter(s => inPeriod(s.date)).reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const periodPurchases = purchases.filter(p => inPeriod(p.date)).reduce((sum, p) => sum + (p.amount || 0), 0);
    const periodProcessing = processorBills.filter(b => inPeriod(b.date)).reduce((sum, b) => sum + (b.totalAmount || 0), 0);

    // ── Net working capital: (cash + bank + receivables + inventory) − payables
    const netWorkingCapital = cashInHand + bankTotal + receivablesTotal + inventory.total - payablesTotal;

    return {
      asOfDate,
      periodStart,
      periodEnd,
      cashInHand,
      bankTotal,
      bankAccounts: bankList,
      periodCashReceipts,
      periodCashPayments,
      inventory,
      receivables: { total: receivablesTotal, customersOutstanding },
      payables: { total: payablesTotal, suppliersOutstanding },
      totalAssets,
      totalLiabilities,
      equity,
      profit,
      periodSales,
      periodPurchases,
      periodProcessing,
      netWorkingCapital,
    };
  }
}
