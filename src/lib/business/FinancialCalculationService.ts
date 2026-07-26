import { JournalEntry, Account, Voucher } from '../../types/erp';

export class FinancialCalculationService {
  /**
   * Calculates the exact running balance of an account considering opening balances and journal entries.
   * Debit increases Assets/Expenses. Credit increases Liabilities/Equity/Income.
   */
  static calculateAccountBalance(account: Account, entries: JournalEntry[], upToDate?: string, vouchers: Voucher[] = []): number {
    let balance = account.openingBalance || 0;
    // Standardize opening balance sign based on account type
    const isDebitNormal = ['Assets', 'Expenses', 'Cost of Goods Sold'].includes(account.type);
    
    if (account.openingBalanceType) {
      if (isDebitNormal && account.openingBalanceType === 'Credit') {
        balance = -balance;
      } else if (!isDebitNormal && account.openingBalanceType === 'Debit') {
        balance = -balance;
      }
    }

    const relevantEntries = upToDate && vouchers.length > 0
      ? entries.filter(e => {
          if (e.accountId !== account.id) return false;
          const voucher = vouchers.find(v => v.id === e.voucherId);
          return voucher && (!voucher.date || voucher.date <= upToDate);
        })
      : entries.filter(e => e.accountId === account.id);

    relevantEntries.forEach(entry => {
      const amount = (entry.debit || 0) - (entry.credit || 0);
      if (isDebitNormal) {
        balance += amount;
      } else {
        balance -= amount; // Credit increases normal credit accounts
      }
    });

    return balance;
  }

  /**
   * Validate that a voucher's debits equal its credits.
   */
  static isVoucherBalanced(entries: { debit?: number, credit?: number }[]): boolean {
    const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0), 0);
    const totalCredit = entries.reduce((sum, e) => sum + (e.credit || 0), 0);
    return Math.abs(totalDebit - totalCredit) < 0.01;
  }
}
