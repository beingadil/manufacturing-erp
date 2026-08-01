import { Account, Voucher, JournalEntry } from '../../types/erp';

export interface CashBookRow {
  date: string;
  voucherId: string;
  voucherNo: string;
  voucherType: string;
  particular: string;
  receipt: number;
  payment: number;
  balance: number;
}

export interface DailySummary {
  date: string;
  openingCash: number;
  receipts: CashBookRow[];
  totalReceipts: number;
  payments: CashBookRow[];
  totalPayments: number;
  closingCash: number;
}

export interface CashPosition {
  cashInHand: number;
  todayReceipts: number;
  todayPayments: number;
  todayClosing: number;
}

export class CashBookEngine {
  /**
   * Identify cash/bank account IDs from the accounts list.
   */
  static getCashBankAccountIds(accounts: Account[]): string[] {
    return accounts
      .filter(a => {
        const name = a.name.toLowerCase();
        return name.includes('cash') || name.includes('bank');
      })
      .map(a => a.id);
  }

  /**
   * Identify cash/bank accounts from the accounts list.
   */
  static getCashBankAccounts(accounts: Account[]): Account[] {
    return accounts.filter(a => {
      const name = a.name.toLowerCase();
      return name.includes('cash') || name.includes('bank');
    });
  }

  /**
   * Calculate the opening balance for a set of cash/bank accounts
   * as of a specific date (before any transactions on that date).
   */
  static calculateOpeningBalance(
    cashAccountIds: string[],
    accounts: Account[],
    journalEntries: JournalEntry[],
    vouchers: Voucher[],
    asOfDate?: string
  ): number {
    let balance = 0;

    // Start with account opening balances
    cashAccountIds.forEach(cashId => {
      const account = accounts.find(a => a.id === cashId);
      if (!account) return;
      if (account.openingBalanceType === 'Debit') {
        balance += account.openingBalance;
      } else {
        balance -= account.openingBalance;
      }
    });

    // Add all journal entries for these accounts before the asOfDate
    const relevantEntries = asOfDate
      ? journalEntries.filter(je => {
          const voucher = vouchers.find(v => v.id === je.voucherId);
          return cashAccountIds.includes(je.accountId) && voucher && voucher.date < asOfDate;
        })
      : journalEntries.filter(je => cashAccountIds.includes(je.accountId));

    relevantEntries.forEach(je => {
      balance += je.debit - je.credit;
    });

    return balance;
  }

  /**
   * Build the cash book rows sorted by date with running balance.
   */
  static getCashBook(
    cashAccountIds: string[],
    accounts: Account[],
    journalEntries: JournalEntry[],
    vouchers: Voucher[],
    dateFrom?: string,
    dateTo?: string
  ): { openingBalance: number; rows: CashBookRow[] } {
    // Calculate opening balance before dateFrom
    const openingBalance = this.calculateOpeningBalance(
      cashAccountIds, accounts, journalEntries, vouchers, dateFrom
    );

    // Filter entries in date range
    let entries = journalEntries.filter(je => cashAccountIds.includes(je.accountId));

    if (dateFrom) {
      entries = entries.filter(je => {
        const v = vouchers.find(v => v.id === je.voucherId);
        return v && v.date >= dateFrom;
      });
    }
    if (dateTo) {
      entries = entries.filter(je => {
        const v = vouchers.find(v => v.id === je.voucherId);
        return v && v.date <= dateTo;
      });
    }

    // Map to rows with counterparty info
    const rows: CashBookRow[] = entries
      .map(je => {
        const voucher = vouchers.find(v => v.id === je.voucherId);
        if (!voucher) return null;

        // Find the counterparty entry (the other side of the double entry)
        const counterpartyEntries = journalEntries.filter(
          e => e.voucherId === je.voucherId && e.accountId !== je.accountId
        );
        const counterpartyAccount = counterpartyEntries.length > 0
          ? accounts.find(a => a.id === counterpartyEntries[0].accountId)
          : null;

        const isReceipt = je.debit > 0; // Cash debited = money coming in

        return {
          date: voucher.date,
          voucherId: je.voucherId,
          voucherNo: voucher.voucherNo,
          voucherType: voucher.type,
          particular: counterpartyAccount?.name || voucher.narration || '-',
          receipt: isReceipt ? je.debit : 0,
          payment: !isReceipt ? je.credit : 0,
          balance: 0, // calculated below
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance
    let runningBalance = openingBalance;
    rows.forEach(row => {
      runningBalance += row.receipt - row.payment;
      row.balance = runningBalance;
    });

    return { openingBalance, rows };
  }

  /**
   * Build a daily summary for a specific date.
   */
  static getDailySummary(
    date: string,
    cashAccountIds: string[],
    accounts: Account[],
    journalEntries: JournalEntry[],
    vouchers: Voucher[]
  ): DailySummary {
    const { openingBalance, rows } = this.getCashBook(
      cashAccountIds, accounts, journalEntries, vouchers, date, date
    );

    const receipts = rows.filter(r => r.receipt > 0);
    const payments = rows.filter(r => r.payment > 0);
    const totalReceipts = receipts.reduce((s, r) => s + r.receipt, 0);
    const totalPayments = payments.reduce((s, r) => s + r.payment, 0);
    const closingCash = openingBalance + totalReceipts - totalPayments;

    return {
      date,
      openingCash: openingBalance,
      receipts,
      totalReceipts,
      payments,
      totalPayments,
      closingCash,
    };
  }

  /**
   * Get the cash position for the dashboard (today's data).
   */
  static getCashPosition(
    accounts: Account[],
    journalEntries: JournalEntry[],
    vouchers: Voucher[]
  ): CashPosition {
    const cashAccountIds = this.getCashBankAccountIds(accounts);
    const today = new Date().toISOString().split('T')[0];
    const summary = this.getDailySummary(
      today, cashAccountIds, accounts, journalEntries, vouchers
    );

    return {
      cashInHand: summary.closingCash,
      todayReceipts: summary.totalReceipts,
      todayPayments: summary.totalPayments,
      todayClosing: summary.closingCash,
    };
  }
}
