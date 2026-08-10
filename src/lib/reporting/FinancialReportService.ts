import { useERPStore } from '../../store/useERPStore';
import { ReportEngine } from './ReportEngine';
import { FinancialCalculationService } from '../business/FinancialCalculationService';

export class FinancialReportService {
  static getTrialBalance(dateRange: { start: string; end: string }, searchQuery: string) {
    const { journalEntries, vouchers, accounts } = useERPStore.getState();
    
    const mappedEntries = journalEntries.map(entry => {
      const voucher = vouchers.find(v => v.id === entry.voucherId);
      return {
          ...entry,
          date: voucher?.date || '',
          type: entry.debit > 0 ? 'Debit' : 'Credit',
          amount: entry.debit > 0 ? entry.debit : entry.credit
      };
    });

    const filteredEntries = ReportEngine.filterByDateRange(mappedEntries, 'date', dateRange);

    const accountsData = accounts.map(a => {
      let debit = a.openingBalanceType === 'Debit' ? a.openingBalance : 0;
      let credit = a.openingBalanceType === 'Credit' ? a.openingBalance : 0;

      filteredEntries.filter(e => e.accountId === a.id).forEach(e => {
        if (e.type === 'Debit') debit += e.amount;
        if (e.type === 'Credit') credit += e.amount;
      });

      const finalDebit = debit > credit ? debit - credit : 0;
      const finalCredit = credit > debit ? credit - debit : 0;

      return {
        code: a.code,
        name: a.name,
        type: a.type,
        debit: finalDebit,
        credit: finalCredit
      };
    }).filter(a => a.debit > 0 || a.credit > 0)
      .sort((a,b) => a.code.localeCompare(b.code));

    return ReportEngine.search(accountsData, searchQuery, ['name', 'code']);
  }

  static getGeneralLedger(dateRange: { start: string; end: string }, searchQuery: string) {
    const { journalEntries, vouchers, accounts, customers, suppliers, processors } = useERPStore.getState();

    const mappedEntries = journalEntries.map(entry => {
      const voucher = vouchers.find(v => v.id === entry.voucherId);
      const account = accounts.find(a => a.id === entry.accountId);
      
      let partyName = '-';
      if (account?.type === 'Assets') {
        const customer = customers.find(c => c.accountId === account.id);
        if (customer) partyName = customer.name;
      } else if (account?.type === 'Liabilities') {
        const supplier = suppliers.find(s => s.accountId === account.id);
        const processor = processors.find(p => p.accountId === account.id);
        if (supplier) partyName = supplier.name;
        if (processor) partyName = processor.name;
      }

      return {
        id: entry.id,
        voucherId: voucher?.id || '',
        date: voucher?.date || '',
        voucherNo: voucher?.voucherNo || '',
        accountCode: account?.code || '',
        accountName: account?.name || '',
        partyName,
        type: entry.debit > 0 ? 'Debit' : 'Credit',
        amount: entry.debit > 0 ? entry.debit : entry.credit,
        description: voucher?.narration || '-'
      };
    });

    const filteredEntries = ReportEngine.filterByDateRange(mappedEntries, 'date', dateRange);
    return ReportEngine.search(filteredEntries, searchQuery, ['accountName', 'voucherNo', 'partyName', 'description']);
  }


  static getAccountSummaryReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { journalEntries, vouchers, accounts } = state;
    let filteredEntries = journalEntries.map(entry => {
  const voucher = vouchers.find(v => v.id === entry.voucherId);
  return {
      ...entry,
      date: voucher?.date || '',
      voucherNo: voucher?.voucherNo || '',
      type: entry.debit > 0 ? 'Debit' : 'Credit',
      amount: entry.debit > 0 ? entry.debit : entry.credit
  };
}).filter(e => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(e.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
});

return accounts.map(a => {
  let debit = 0;
  let credit = 0;
  let netChange = 0;

  filteredEntries.filter(e => e.accountId === a.id).forEach(e => {
    if (e.type === 'Debit') { debit += e.amount; netChange += e.amount; }
    if (e.type === 'Credit') { credit += e.amount; netChange -= e.amount; }
  });

  return {
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    debit,
    credit,
    netChange
  };
}).filter(a => a.debit > 0 || a.credit > 0)
  .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
  .sort((a,b) => a.code.localeCompare(b.code));
  }


  static getBankBookReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { journalEntries, vouchers, accounts } = state;
    // Assets that have "Bank" in name
const bankAccounts = accounts.filter(a => a.type === 'Assets' && a.name.toLowerCase().includes('bank'));
const bankIds = bankAccounts.map(a => a.id);

let filtered = journalEntries.map(entry => {
  const voucher = vouchers.find(v => v.id === entry.voucherId);
  return {
      ...entry,
      date: voucher?.date || '',
      voucherNo: voucher?.voucherNo || '',
      type: entry.debit > 0 ? 'Debit' : 'Credit',
      amount: entry.debit > 0 ? entry.debit : entry.credit
  };
}).filter(e => {
  if (!bankIds.includes(e.accountId)) return false;
  if (dateRange.start && dateRange.end) {
    const d = new Date(e.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
});

let runningBalance = 0; // Ideally we should calc opening balance before date range

return filtered.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(e => {
  const accountName = accounts.find(a => a.id === e.accountId)?.name || '';
  if (e.type === 'Debit') runningBalance += e.amount;
  if (e.type === 'Credit') runningBalance -= e.amount;
  return {
    ...e,
    accountName,
    runningBalance
  };
}).filter(p => !search || p.voucherNo.toLowerCase().includes(search.toLowerCase()) || p.accountName.toLowerCase().includes(search.toLowerCase()));
  }


  static getCashbookReportData(cashBankAccounts: any, dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { accounts, journalEntries, vouchers } = state;
    const accountIds = new Set(cashBankAccounts.map((a: any) => a.id));
const entries = journalEntries.filter((je: any) => accountIds.has(je.accountId));

let runningBalance = cashBankAccounts.reduce((sum: number, a: any) => sum + (a.openingBalanceType === 'Debit' ? a.openingBalance : -a.openingBalance), 0);

const filtered = entries.filter(e => {
  const voucher = vouchers.find(v => v.id === e.voucherId);
  if (dateRange.start && dateRange.end) {
    const d = new Date(voucher?.date || '');
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    return d >= start && d <= end;
  }
  return true;
}).map(je => {
  const voucher = vouchers.find(v => v.id === je.voucherId);
  const account = accounts.find(a => a.id === je.accountId);
  
  const type = je.debit > 0 ? 'Debit' : 'Credit';
  const amount = je.debit > 0 ? je.debit : je.credit;
  
  if (type === 'Debit') {
    runningBalance += amount;
  } else {
    runningBalance -= amount;
  }

  return {
    ...je,
    date: voucher?.date || new Date().toISOString(),
    referenceNo: voucher?.referenceNo || voucher?.voucherNo || '-',
    description: je.narration || voucher?.narration || '-',
    accountName: account?.name || 'Unknown',
    type,
    amount,
    currentBal: runningBalance
  };
}).filter(e => {
  if (!search) return true;
  const q = search.toLowerCase();
  return e.description.toLowerCase().includes(q) || 
         e.referenceNo.toLowerCase().includes(q) || 
         e.accountName.toLowerCase().includes(q);
}).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

return filtered;
  }


  static getExpenseAnalysisData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { journalEntries, vouchers, accounts } = state;
    const expenseAccounts = accounts.filter(a => a.type === 'Expenses');

let filteredEntries = journalEntries.map(entry => {
  const voucher = vouchers.find(v => v.id === entry.voucherId);
  return {
      ...entry,
      date: voucher?.date || '',
      voucherNo: voucher?.voucherNo || '',
      type: entry.debit > 0 ? 'Debit' : 'Credit',
      amount: entry.debit > 0 ? entry.debit : entry.credit
  };
}).filter(e => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(e.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
});

const expenses = expenseAccounts.map(account => {
  const entries = filteredEntries.filter(e => e.accountId === account.id);
  let balance = 0;
  
  // Expenses increase with Debit
  entries.forEach(e => {
    if (e.type === 'Debit') balance += e.amount;
    if (e.type === 'Credit') balance -= e.amount;
  });

  return {
    accountName: account.name,
    code: account.code,
    balance
  };
}).filter(e => e.balance > 0);

const totalExpense = expenses.reduce((sum, item) => sum + item.balance, 0);

const withPercentage = expenses.map(e => ({
    ...e,
    percentage: totalExpense > 0 ? (e.balance / totalExpense) * 100 : 0
}));

if (search) {
  return withPercentage.filter(e => e.accountName.toLowerCase().includes(search.toLowerCase()) || e.code.includes(search));
}
return withPercentage.sort((a,b) => b.balance - a.balance);
  }


  /**
   * Profit & Loss from the authoritative accounting engine — posted vouchers
   * only, within the period. Revenue − Cost of Goods Sold = Gross Profit;
   * Gross Profit − Operating Expenses = Net Profit. Purchases are inventory
   * (an asset), never an expense at purchase time — COGS is recognized on sale.
   */
  static getProfitLossReportData(dateRange: any) {
    const { journalEntries, vouchers, accounts } = useERPStore.getState();

    const activeVouchers = vouchers.filter(v =>
      v.status === 'Posted'
      && (!dateRange?.start || v.date >= dateRange.start)
      && (!dateRange?.end || v.date <= dateRange.end)
    );
    const activeIds = new Set(activeVouchers.map(v => v.id));
    const entries = journalEntries.filter(je => activeIds.has(je.voucherId));

    const netByAccount = new Map<string, number>();
    entries.forEach(je => {
      netByAccount.set(je.accountId, (netByAccount.get(je.accountId) || 0) + (je.debit || 0) - (je.credit || 0));
    });

    const section = (types: string[], isDebitNormal: boolean) => accounts
      .filter(a => types.includes(a.type))
      .map(a => {
        const net = netByAccount.get(a.id) || 0;
        return { name: a.name, balance: isDebitNormal ? net : -net };
      })
      .filter(r => Math.abs(r.balance) > 0.01);

    const revenueAccounts = section(['Revenue', 'Other Income'], false);
    const cogsAccounts = section(['Cost of Goods Sold'], true);
    const expenseAccounts = section(['Expenses', 'Other Expenses'], true);

    const totalRevenue = revenueAccounts.reduce((s, r) => s + r.balance, 0);
    const totalCogs = cogsAccounts.reduce((s, r) => s + r.balance, 0);
    const totalExpenses = expenseAccounts.reduce((s, r) => s + r.balance, 0);
    const grossProfit = totalRevenue - totalCogs;
    const netProfit = grossProfit - totalExpenses;

    return { revenueAccounts, totalRevenue, cogsAccounts, totalCogs, grossProfit, expenseAccounts, totalExpenses, netProfit };
  }


  static getReceivableAgingReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { journalEntries, vouchers, accounts, customers } = state;
    // In a real app we'd look at invoice dates. Here we'll just mock aging based on customer balances
const customerAccounts = accounts.filter(a => a.type === 'Assets' && customers.some(c => c.name === a.name));

let filteredEntries = journalEntries.map(entry => {
  const voucher = vouchers.find(v => v.id === entry.voucherId);
  return {
      ...entry,
      date: voucher?.date || '',
      voucherNo: voucher?.voucherNo || '',
      type: entry.debit > 0 ? 'Debit' : 'Credit',
      amount: entry.debit > 0 ? entry.debit : entry.credit
  };
}).filter(e => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(e.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
});

const balances = customers.map(customer => {
  const account = customerAccounts.find(a => a.name === customer.name);
  if (!account) return { customerName: customer.name, balance: 0 };
  
  const entries = filteredEntries.filter(e => e.accountId === account.id);
  let balance = account.openingBalanceType === 'Debit' ? account.openingBalance : -account.openingBalance;
  
  entries.forEach(e => {
    if (e.type === 'Debit') balance += e.amount;
    if (e.type === 'Credit') balance -= e.amount;
  });

  return {
    customerName: customer.name,
    balance,
    // Mock aging
    age30: balance * 0.4 || 0,
    age60: balance * 0.3 || 0,
    age90: balance * 0.2 || 0,
    ageOlder: balance * 0.1 || 0
  };
}).filter(c => c.balance > 0);

if (search) {
  return balances.filter(c => c.customerName.toLowerCase().includes(search.toLowerCase()));
}
return balances.sort((a,b) => b.balance - a.balance);
  }


  static getRevenueAnalysisData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { journalEntries, vouchers, accounts } = state;
    const revenueAccounts = accounts.filter(a => a.type === 'Revenue');

let filteredEntries = journalEntries.map(entry => {
  const voucher = vouchers.find(v => v.id === entry.voucherId);
  return {
      ...entry,
      date: voucher?.date || '',
      voucherNo: voucher?.voucherNo || '',
      type: entry.debit > 0 ? 'Debit' : 'Credit',
      amount: entry.debit > 0 ? entry.debit : entry.credit
  };
}).filter(e => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(e.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
});

const revenues = revenueAccounts.map(account => {
  const entries = filteredEntries.filter(e => e.accountId === account.id);
  let balance = 0;
  
  // Revenue increases with Credit
  entries.forEach(e => {
    if (e.type === 'Credit') balance += e.amount;
    if (e.type === 'Debit') balance -= e.amount;
  });

  return {
    accountName: account.name,
    code: account.code,
    balance
  };
}).filter(e => e.balance > 0);

const totalRevenue = revenues.reduce((sum, item) => sum + item.balance, 0);

const withPercentage = revenues.map(e => ({
    ...e,
    percentage: totalRevenue > 0 ? (e.balance / totalRevenue) * 100 : 0
}));

if (search) {
  return withPercentage.filter(e => e.accountName.toLowerCase().includes(search.toLowerCase()) || e.code.includes(search));
}
return withPercentage.sort((a,b) => b.balance - a.balance);
  }

}