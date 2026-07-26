import fs from 'fs';
import path from 'path';

const outDir = '/workspace/app-d0luni1anmkh/src/components/reports/financial';

const generateFile = (name, content) => {
  fs.writeFileSync(path.join(outDir, `${name}.tsx`), content);
};

generateFile('ExpenseAnalysis', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Calculator, DollarSign, Percent } from 'lucide-react';

export function ExpenseAnalysis() {
  const { ledgerEntries, accounts } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    const expenseAccounts = accounts.filter(a => a.type === 'Expenses');
    
    let filteredEntries = ledgerEntries.filter(e => {
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
  }, [ledgerEntries, accounts, dateRange, search]);

  const grandTotal = data.reduce((sum, item) => sum + item.balance, 0);

  return (
    <GenericReportTemplate
      title="Expense Analysis"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Expense Categories", value: data.length, icon: Calculator },
        { title: "Total Expenses", value: formatCurrency(grandTotal), icon: DollarSign },
        { title: "Highest Expense", value: data.length > 0 ? data[0].accountName : 'N/A', icon: DollarSign }
      ]}
      columns={[
        { key: "code", label: "Account Code" },
        { key: "accountName", label: "Expense Account" },
        { key: "balance", label: "Amount", align: "right", render: (item) => formatCurrency(item.balance) },
        { key: "percentage", label: "% of Total", align: "right", render: (item) => \`\${item.percentage.toFixed(2)}%\` }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        balance: formatCurrency(item.balance),
        percentage: \`\${item.percentage.toFixed(2)}%\`
      })}
      summaryRows={[[{ accountName: 'TOTAL EXPENSES', balance: formatCurrency(grandTotal), percentage: '100.00%' }]]}
    />
  );
}
`);

generateFile('RevenueAnalysis', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Calculator, DollarSign, Activity } from 'lucide-react';

export function RevenueAnalysis() {
  const { ledgerEntries, accounts } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    const revenueAccounts = accounts.filter(a => a.type === 'Revenue');
    
    let filteredEntries = ledgerEntries.filter(e => {
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
  }, [ledgerEntries, accounts, dateRange, search]);

  const grandTotal = data.reduce((sum, item) => sum + item.balance, 0);

  return (
    <GenericReportTemplate
      title="Revenue Analysis"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Revenue Streams", value: data.length, icon: Activity },
        { title: "Total Revenue", value: formatCurrency(grandTotal), icon: DollarSign },
        { title: "Primary Stream", value: data.length > 0 ? data[0].accountName : 'N/A', icon: DollarSign }
      ]}
      columns={[
        { key: "code", label: "Account Code" },
        { key: "accountName", label: "Revenue Stream" },
        { key: "balance", label: "Amount", align: "right", render: (item) => formatCurrency(item.balance) },
        { key: "percentage", label: "% of Total", align: "right", render: (item) => \`\${item.percentage.toFixed(2)}%\` }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        balance: formatCurrency(item.balance),
        percentage: \`\${item.percentage.toFixed(2)}%\`
      })}
      summaryRows={[[{ accountName: 'TOTAL REVENUE', balance: formatCurrency(grandTotal), percentage: '100.00%' }]]}
    />
  );
}
`);

const reportsIndex = `import React from 'react';
import { GeneralLedgerReport } from './GeneralLedgerReport';
import { CashbookReport } from './CashbookReport';
import { BankBookReport } from './BankBookReport';
import { TrialBalanceReport } from './TrialBalanceReport';
import { ProfitLossReport } from './ProfitLossReport';
import { BalanceSheetReport } from './BalanceSheetReport';
import { CashFlowReport } from './CashFlowReport';
import { JournalRegisterReport } from './JournalRegisterReport';
import { VoucherRegisterReport } from './VoucherRegisterReport';
import { AccountSummaryReport } from './AccountSummaryReport';
import { ReceivableAgingReport } from './ReceivableAgingReport';
import { PayableAgingReport } from './PayableAgingReport';
import { ExpenseAnalysis } from './ExpenseAnalysis';
import { RevenueAnalysis } from './RevenueAnalysis';

const Placeholder = ({ name }: {name:string}) => <div className="p-8 text-center text-muted-foreground">{name} Report will be implemented here.</div>;

export function FinancialReports({ activeReport }: { activeReport: string }) {
  switch (activeReport) {
    case 'general-ledger': return <GeneralLedgerReport />;
    case 'cashbook': return <CashbookReport />;
    case 'bank-book': return <BankBookReport />;
    case 'trial-balance': return <TrialBalanceReport />;
    case 'profit-loss': return <ProfitLossReport />;
    case 'balance-sheet': return <BalanceSheetReport />;
    case 'cash-flow': return <CashFlowReport />;
    case 'journal-register': return <JournalRegisterReport />;
    case 'voucher-register': return <VoucherRegisterReport />;
    case 'account-summary': return <AccountSummaryReport />;
    case 'receivable-aging': return <ReceivableAgingReport />;
    case 'payable-aging': return <PayableAgingReport />;
    case 'expense-analysis': return <ExpenseAnalysis />;
    case 'revenue-analysis': return <RevenueAnalysis />;
    default: return <Placeholder name={activeReport} />;
  }
}
`;
fs.writeFileSync(path.join(outDir, 'FinancialReports.tsx'), reportsIndex);

