import type {
  Account,
  AccountSubtype,
  Batch,
  Customer,
  JournalEntry,
  Processor,
  Purchase,
  RawMaterial,
  Sale,
  Supplier,
  Voucher,
} from '../../types/erp';
import { AccountingEngine } from '../accounting/AccountingEngine';
import { getCashAccounts, getBankAccounts } from '../accounting/accountClassification';

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

export interface InventoryValuation {
  rawMaterials: number;
  processedStock: number;
  finishedGoods: number;
  total: number;
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
   * Raw-material inventory value from the batch cost basis:
   * for every active batch, remainingPcs × (amount / initialPcs).
   * This is the cost already recorded at purchase time — no selling-price math.
   */
  private static valueRawMaterials(batches: Batch[]): {
    rawMaterials: number;
    weightedCosts: Map<string, number>;
  } {
    const weightedCosts = new Map<string, number>();
    const remainingByMaterial = new Map<string, number>();
    let rawMaterials = 0;

    for (const b of batches) {
      if (b.status !== 'Active' || b.remainingPcs <= 0 || b.initialPcs <= 0) continue;
      const costPerPiece = b.amount / b.initialPcs;
      const remainingValue = costPerPiece * b.remainingPcs;
      rawMaterials += remainingValue;
      weightedCosts.set(b.materialId, (weightedCosts.get(b.materialId) || 0) + remainingValue);
      remainingByMaterial.set(b.materialId, (remainingByMaterial.get(b.materialId) || 0) + b.remainingPcs);
    }

    // Weighted-average cost per piece per material (total remaining value / total remaining pcs)
    const avgCostPerPiece = new Map<string, number>();
    for (const [materialId, value] of weightedCosts) {
      const remaining = remainingByMaterial.get(materialId) || 0;
      avgCostPerPiece.set(materialId, remaining > 0 ? value / remaining : 0);
    }
    return { rawMaterials, weightedCosts: avgCostPerPiece };
  }

  /**
   * Processed stock is valued at the source material's weighted-average cost
   * per piece (from the batches it was purchased in), times processedStockPcs.
   */
  private static valueProcessedStock(
    materials: RawMaterial[],
    avgCostPerPiece: Map<string, number>
  ): number {
    return materials.reduce((sum, m) => {
      const cost = avgCostPerPiece.get(m.id) || 0;
      return sum + cost * (m.processedStockPcs || 0);
    }, 0);
  }

  static getSummary(state: DashboardSummaryState, options: DashboardSummaryOptions): DashboardSummary {
    const { accounts, accountSubtypes, journalEntries, vouchers, batches, materials, customers, suppliers, processors, sales, purchases } = state;
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

    // ── Inventory valuation (batch cost basis) ───────────────────────────────
    const { rawMaterials, weightedCosts } = this.valueRawMaterials(batches);
    const processedStock = this.valueProcessedStock(materials, weightedCosts);
    const finishedGoods = 0; // finished goods have no stock quantity/cost tracked in inventory
    const inventory = {
      rawMaterials,
      processedStock,
      finishedGoods,
      total: rawMaterials + processedStock + finishedGoods,
    };

    // ── Balance-sheet position (mirrors the Balance Sheet report) ────────────
    let totalAssets = 0;
    let totalLiabilities = 0;
    let equity = 0;
    for (const account of accounts) {
      const bal = balances.get(account.id) || 0;
      if (account.type === 'Assets') totalAssets += Math.max(0, bal);
      else if (account.type === 'Liabilities') totalLiabilities += Math.max(0, bal);
      else if (account.type === 'Equity') equity += Math.max(0, bal);
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
      netWorkingCapital,
    };
  }
}
