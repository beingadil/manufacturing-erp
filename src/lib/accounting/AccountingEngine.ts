import { useERPStore } from '../../store/useERPStore';
import { VoucherValidator, ValidationEngine, VoucherDTO } from '../validation';
import { BusinessWorkflowEngine } from '../business/BusinessWorkflowEngine';
import { isDebitNormalAccount, isReceivableAccount, isPayableAccount } from './accountClassification';
import type { Account, AccountSubtype, JournalEntry, SourceModule, Voucher, VoucherType } from '../../types/erp';

export interface VoucherLine {
  accountId: string;
  debit: number;
  credit: number;
  narration?: string;
}

/**
 * ONE authoritative double-entry accounting engine (spec §17, §24).
 * Every user transaction resolves to a balanced Voucher + JournalEntries;
 * all reports, ledgers, cash book and party balances derive from here.
 */
export class AccountingEngine {
  // ── Posting ────────────────────────────────────────────────────────────────

  static createVoucher(
    data: { date: string; type: VoucherType; referenceNo?: string; sourceModule: SourceModule; narration?: string },
    entries: VoucherLine[]
  ): string | undefined {
    return BusinessWorkflowEngine.executeWorkflow('Voucher Creation', () => {
      const voucherData: VoucherDTO = { ...data, entries };
      ValidationEngine.validate(new VoucherValidator(), voucherData, 'Voucher Creation');
      const state = useERPStore.getState();
      const id = state.addVoucher(
        {
          ...data,
          totalDebit: entries.reduce((s, e) => s + (e.debit || 0), 0),
          totalCredit: entries.reduce((s, e) => s + (e.credit || 0), 0),
          status: 'Posted' as const,
          narration: data.narration || '',
        },
        entries as any
      );
      AccountingEngine.recomputePartyBalances();
      return id;
    }, 'Voucher created');
  }

  static updateVoucher(
    id: string,
    data: Partial<Omit<VoucherDTO, 'entries' | 'id'>>,
    entries: VoucherLine[]
  ): void {
    BusinessWorkflowEngine.executeWorkflow('Voucher Update', () => {
      const state = useERPStore.getState();
      const existing = state.vouchers.find(v => v.id === id);
      if (!existing) throw new Error('Voucher not found');
      const merged = { ...existing, ...data } as any;
      ValidationEngine.validate(
        new VoucherValidator(),
        { id, date: merged.date, type: merged.type, referenceNo: merged.referenceNo, sourceModule: merged.sourceModule, narration: merged.narration, entries },
        'Voucher Update'
      );
      state.updateVoucher(id, data as any, entries as any);
      AccountingEngine.recomputePartyBalances();
    }, 'Voucher updated');
  }

  /** Permanent delete — removes the voucher + its entries and recomputes balances. */
  static deleteVoucher(id: string): void {
    BusinessWorkflowEngine.executeWorkflow('Voucher Deletion', () => {
      useERPStore.getState().deleteVoucher(id);
      AccountingEngine.recomputePartyBalances();
    }, 'Voucher deleted');
  }

  /** Cancel/Void — preserves the record but excludes it from all reports. */
  static cancelVoucher(id: string, reason?: string): void {
    BusinessWorkflowEngine.executeWorkflow('Voucher Cancellation', () => {
      useERPStore.getState().cancelVoucher(id, reason);
      AccountingEngine.recomputePartyBalances();
    }, 'Voucher cancelled');
  }

  // ── Balances ───────────────────────────────────────────────────────────────

  static isBalanced(entries: { debit?: number; credit?: number }[]): boolean {
    const dr = entries.reduce((s, e) => s + (e.debit || 0), 0);
    const cr = entries.reduce((s, e) => s + (e.credit || 0), 0);
    return Math.abs(dr - cr) < 0.01;
  }

  /**
   * Net balance per account as of an optional date, including opening balance.
   * Debit-normal accounts: opening + debits − credits. Credit-normal: inverse.
   */
  static getAccountBalances(
    accounts: Account[],
    entries: JournalEntry[],
    vouchers: Voucher[],
    asOfDate?: string
  ): Map<string, number> {
    const activeEntries = entries.filter(je => {
      const v = vouchers.find(x => x.id === je.voucherId);
      if (!v || v.status === 'Cancelled' || v.status === 'Deleted') return false;
      if (asOfDate && v.date > asOfDate) return false;
      return true;
    });

    const balances = new Map<string, number>();
    for (const acc of accounts) {
      let balance = acc.openingBalance || 0;
      const isDebitNormal = isDebitNormalAccount(acc);
      if (acc.openingBalanceType === 'Credit' && isDebitNormal) balance = -balance;
      else if (acc.openingBalanceType === 'Debit' && !isDebitNormal) balance = -balance;

      for (const je of activeEntries) {
        if (je.accountId !== acc.id) continue;
        const delta = (je.debit || 0) - (je.credit || 0);
        balance += isDebitNormal ? delta : -delta;
      }
      balances.set(acc.id, balance);
    }
    return balances;
  }

  /** One account's ledger rows with running balance (for General Ledger drill-down). */
  static getLedger(
    accountId: string,
    accounts: Account[],
    entries: JournalEntry[],
    vouchers: Voucher[],
    dateFrom?: string,
    dateTo?: string
  ): { rows: (JournalEntry & { voucher?: Voucher; runningBalance: number })[]; openingBalance: number } {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return { rows: [], openingBalance: 0 };

    const active = entries
      .filter(je => je.accountId === accountId)
      .map(je => ({ je, v: vouchers.find(x => x.id === je.voucherId) }))
      .filter(({ v }) => v && v.status !== 'Cancelled' && v.status !== 'Deleted')
      .filter(({ v }) => (!dateFrom || (v!.date >= dateFrom)) && (!dateTo || (v!.date <= dateTo)))
      .sort((a, b) => a.v!.date.localeCompare(b.v!.date));

    const isDebitNormal = isDebitNormalAccount(account);
    let opening = account.openingBalance || 0;
    if (account.openingBalanceType === 'Credit' && isDebitNormal) opening = -opening;
    else if (account.openingBalanceType === 'Debit' && !isDebitNormal) opening = -opening;

    // Entries before dateFrom contribute to the displayed opening balance
    if (dateFrom) {
      const prior = entries
        .filter(je => je.accountId === accountId)
        .map(je => ({ je, v: vouchers.find(x => x.id === je.voucherId) }))
        .filter(({ v }) => v && v.status !== 'Cancelled' && v.status !== 'Deleted' && v.date < dateFrom);
      for (const { je, v } of prior) {
        if (v!.date >= dateFrom) continue;
        const delta = (je.debit || 0) - (je.credit || 0);
        opening += isDebitNormal ? delta : -delta;
      }
    }

    let running = opening;
    const rows = active.map(({ je, v }) => {
      const delta = (je.debit || 0) - (je.credit || 0);
      running += isDebitNormal ? delta : -delta;
      return { ...je, voucher: v, runningBalance: running };
    });

    return { rows, openingBalance: opening };
  }

  // ── Sub-ledgers / control accounts (spec §15) ──────────────────────────────

  /**
   * Party accounts are nested under AR/AP control accounts via parentId.
   * Sum of children must reconcile with the control account's own net balance.
   */
  static getSubLedger(
    controlAccountId: string,
    accounts: Account[],
    entries: JournalEntry[],
    vouchers: Voucher[],
    asOfDate?: string
  ): { controlBalance: number; children: { account: Account; balance: number }[]; reconciled: boolean } {
    const balances = AccountingEngine.getAccountBalances(accounts, entries, vouchers, asOfDate);
    const children = accounts
      .filter(a => a.parentId === controlAccountId)
      .map(account => ({ account, balance: balances.get(account.id) || 0 }));

    // Control account's own posted balance (children roll up into it)
    const posted = entries
      .filter(je => je.accountId === controlAccountId)
      .map(je => ({ je, v: vouchers.find(x => x.id === je.voucherId) }))
      .filter(({ v }) => v && v.status !== 'Cancelled' && v.status !== 'Deleted')
      .filter(({ v }) => !asOfDate || v!.date <= asOfDate)
      .reduce((s, { je }) => s + (je.debit || 0) - (je.credit || 0), 0);

    const account = accounts.find(a => a.id === controlAccountId);
    let opening = account?.openingBalance || 0;
    if (account) {
      const isDebitNormal = isDebitNormalAccount(account);
      if (account.openingBalanceType === 'Credit' && isDebitNormal) opening = -opening;
      else if (account.openingBalanceType === 'Debit' && !isDebitNormal) opening = -opening;
    }
    const controlBalance = opening + posted;
    const childrenSum = children.reduce((s, c) => s + c.balance, 0);
    return { controlBalance, children, reconciled: Math.abs(controlBalance - childrenSum) < 0.01 };
  }

  // ── Party balances (derived cache, single source of truth) ─────────────────

  /**
   * Recompute Supplier/Customer/Processor stored balances from their linked
   * account's posted journal entries. Called after every voucher mutation so
   * the stored fields can never drift from the ledger (spec §14, §17).
   */
  static recomputePartyBalances(): void {
    const state = useERPStore.getState();
    const { accounts, accountSubtypes, suppliers, customers, processors, journalEntries, vouchers } = state;

    const balances = AccountingEngine.getAccountBalances(accounts, journalEntries, vouchers);

    const nextSuppliers = suppliers.map(sup => {
      const acc = accounts.find(a => a.linkedEntityId === sup.id);
      const balance = acc ? balances.get(acc.id) || 0 : 0;
      // Payables accounts are credit-normal: positive balance = owed to supplier
      return { ...sup, balancePayable: Math.max(0, balance) };
    });

    const nextCustomers = customers.map(cus => {
      const acc = accounts.find(a => a.linkedEntityId === cus.id);
      const balance = acc ? balances.get(acc.id) || 0 : 0;
      // Receivables are debit-normal: positive balance = owed by customer
      return { ...cus, balanceReceivable: Math.max(0, balance) };
    });

    const nextProcessors = processors.map(proc => {
      const acc = accounts.find(a => a.linkedEntityId === proc.id);
      const balance = acc ? balances.get(acc.id) || 0 : 0;
      return { ...proc, balancePayable: Math.max(0, balance) };
    });

    const { updateSupplier, updateCustomer, updateProcessor } = state;
    nextSuppliers.forEach((sup, i) => {
      if (suppliers[i]?.balancePayable !== sup.balancePayable) updateSupplier(sup.id, { balancePayable: sup.balancePayable });
    });
    nextCustomers.forEach((cus, i) => {
      if (customers[i]?.balanceReceivable !== cus.balanceReceivable) updateCustomer(cus.id, { balanceReceivable: cus.balanceReceivable });
    });
    nextProcessors.forEach((proc, i) => {
      if (processors[i]?.balancePayable !== proc.balancePayable) updateProcessor(proc.id, { balancePayable: proc.balancePayable });
    });
  }

  /** Trial balance from the engine — must balance (spec §19). */
  static getTrialBalance(
    accounts: Account[],
    subtypes: AccountSubtype[],
    entries: JournalEntry[],
    vouchers: Voucher[],
    asOfDate?: string
  ): { rows: { account: Account; debit: number; credit: number }[]; totalDebit: number; totalCredit: number; balanced: boolean } {
    const balances = AccountingEngine.getAccountBalances(accounts, entries, vouchers, asOfDate);
    const rows = accounts.map(account => {
      const bal = balances.get(account.id) || 0;
      // Assets/Expenses have debit-normal balance; everything else credit-normal
      return {
        account,
        debit: isDebitNormalAccount(account) ? Math.max(0, bal) : Math.max(0, -bal),
        credit: isDebitNormalAccount(account) ? Math.max(0, -bal) : Math.max(0, bal),
      };
    }).filter(r => r.debit > 0 || r.credit > 0);

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    return { rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  }
}
