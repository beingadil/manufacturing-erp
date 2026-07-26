import type { AccountType } from '../types/erp';

export interface SeedActions {
  addAccountSubtype: (data: { name: string; type: AccountType; description?: string; isSystem?: boolean }) => string;
  addAccount: (data: {
    name: string;
    type: AccountType;
    subtypeId: string;
    openingBalance?: number;
    openingBalanceType?: 'Debit' | 'Credit';
    status?: 'Active' | 'Inactive';
    isSystem?: boolean;
    description?: string;
  }) => string;
}

interface SeedState {
  accounts: { id: string }[];
}

const subtypes: { name: string; type: AccountType }[] = [
  { name: 'Cash', type: 'Assets' },
  { name: 'Bank', type: 'Assets' },
  { name: 'Accounts Receivable', type: 'Assets' },
  { name: 'Inventory', type: 'Assets' },
  { name: 'Fixed Assets', type: 'Assets' },
  { name: 'Accumulated Depreciation', type: 'Assets' },
  { name: 'Accounts Payable', type: 'Liabilities' },
  { name: 'Short-term Loans', type: 'Liabilities' },
  { name: 'Taxes Payable', type: 'Liabilities' },
  { name: 'Long-term Loans', type: 'Liabilities' },
  { name: 'Capital', type: 'Equity' },
  { name: 'Retained Earnings', type: 'Equity' },
  { name: 'Sales', type: 'Revenue' },
  { name: 'Service Revenue', type: 'Revenue' },
  { name: 'Other Income', type: 'Other Income' },
  { name: 'Purchases', type: 'Cost of Goods Sold' },
  { name: 'Processing Expense', type: 'Expenses' },
  { name: 'Operating Expenses', type: 'Expenses' },
  { name: 'Administrative Expenses', type: 'Expenses' },
  { name: 'Financial Expenses', type: 'Expenses' },
];

const accounts: { name: string; type: AccountType; subtype: string; isSystem?: boolean }[] = [
  // Assets
  { name: 'Cash in Hand', type: 'Assets', subtype: 'Cash', isSystem: true },
  { name: 'Petty Cash', type: 'Assets', subtype: 'Cash', isSystem: true },
  { name: 'Bank - Primary', type: 'Assets', subtype: 'Bank', isSystem: true },
  { name: 'Bank - Secondary', type: 'Assets', subtype: 'Bank', isSystem: true },
  { name: 'Accounts Receivable', type: 'Assets', subtype: 'Accounts Receivable', isSystem: true },
  { name: 'Raw Material Inventory', type: 'Assets', subtype: 'Inventory', isSystem: true },
  { name: 'Work in Progress Inventory', type: 'Assets', subtype: 'Inventory', isSystem: true },
  { name: 'Finished Goods Inventory', type: 'Assets', subtype: 'Inventory', isSystem: true },
  { name: 'Land', type: 'Assets', subtype: 'Fixed Assets' },
  { name: 'Buildings', type: 'Assets', subtype: 'Fixed Assets' },
  { name: 'Machinery', type: 'Assets', subtype: 'Fixed Assets' },
  { name: 'Equipment', type: 'Assets', subtype: 'Fixed Assets' },
  { name: 'Vehicles', type: 'Assets', subtype: 'Fixed Assets' },
  { name: 'Accumulated Depreciation', type: 'Assets', subtype: 'Accumulated Depreciation' },
  { name: 'Prepaid Expenses', type: 'Assets', subtype: 'Fixed Assets' },
  // Liabilities
  { name: 'Accounts Payable', type: 'Liabilities', subtype: 'Accounts Payable', isSystem: true },
  { name: 'Short-term Loans', type: 'Liabilities', subtype: 'Short-term Loans' },
  { name: 'Accrued Expenses', type: 'Liabilities', subtype: 'Accounts Payable' },
  { name: 'Taxes Payable', type: 'Liabilities', subtype: 'Taxes Payable' },
  { name: 'Long-term Loans', type: 'Liabilities', subtype: 'Long-term Loans' },
  { name: 'Bonds Payable', type: 'Liabilities', subtype: 'Long-term Loans' },
  // Equity
  { name: 'Owner\'s Capital', type: 'Equity', subtype: 'Capital', isSystem: true },
  { name: 'Retained Earnings', type: 'Equity', subtype: 'Retained Earnings', isSystem: true },
  { name: 'Current Year Earnings', type: 'Equity', subtype: 'Retained Earnings' },
  // Revenue
  { name: 'Sales Revenue', type: 'Revenue', subtype: 'Sales', isSystem: true },
  { name: 'Service Revenue', type: 'Revenue', subtype: 'Service Revenue' },
  { name: 'Discount Received', type: 'Revenue', subtype: 'Sales' },
  { name: 'Other Income', type: 'Other Income', subtype: 'Other Income', isSystem: true },
  { name: 'Interest Income', type: 'Other Income', subtype: 'Other Income' },
  // Cost of Goods Sold
  { name: 'Purchases', type: 'Cost of Goods Sold', subtype: 'Purchases', isSystem: true },
  { name: 'Purchase Returns', type: 'Cost of Goods Sold', subtype: 'Purchases' },
  { name: 'Direct Labor', type: 'Cost of Goods Sold', subtype: 'Purchases' },
  { name: 'Manufacturing Overhead', type: 'Cost of Goods Sold', subtype: 'Purchases' },
  // Expenses
  { name: 'Processing Expense', type: 'Expenses', subtype: 'Processing Expense', isSystem: true },
  { name: 'Salaries Expense', type: 'Expenses', subtype: 'Administrative Expenses', isSystem: true },
  { name: 'Rent Expense', type: 'Expenses', subtype: 'Operating Expenses', isSystem: true },
  { name: 'Utilities Expense', type: 'Expenses', subtype: 'Operating Expenses', isSystem: true },
  { name: 'Marketing Expense', type: 'Expenses', subtype: 'Operating Expenses' },
  { name: 'Depreciation Expense', type: 'Expenses', subtype: 'Operating Expenses' },
  { name: 'Office Supplies', type: 'Expenses', subtype: 'Administrative Expenses' },
  { name: 'Professional Fees', type: 'Expenses', subtype: 'Administrative Expenses' },
  { name: 'Interest Expense', type: 'Expenses', subtype: 'Financial Expenses' },
  { name: 'Bank Charges', type: 'Expenses', subtype: 'Financial Expenses' },
];

export function seedDefaultChartOfAccounts(
  getState: () => SeedState,
  actions: SeedActions
): { created: number; skipped: boolean } {
  const state = getState();
  if (state.accounts.length > 0) {
    return { created: 0, skipped: true };
  }

  const subtypeIds: Record<string, string> = {};
  subtypes.forEach((s) => {
    subtypeIds[s.name] = actions.addAccountSubtype({
      ...s,
      description: `${s.name} account subtype`,
      isSystem: true,
    });
  });

  let created = 0;
  accounts.forEach((a) => {
    actions.addAccount({
      name: a.name,
      type: a.type,
      subtypeId: subtypeIds[a.subtype],
      openingBalance: 0,
      openingBalanceType: 'Debit',
      status: 'Active',
      isSystem: a.isSystem ?? true,
      description: `${a.name} account`,
    });
    created += 1;
  });

  return { created, skipped: false };
}