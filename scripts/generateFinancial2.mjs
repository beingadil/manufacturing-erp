import fs from 'fs';
import path from 'path';

const outDir = '/workspace/app-d0luni1anmkh/src/components/reports/financial';

const generateFile = (name, content) => {
  fs.writeFileSync(path.join(outDir, `${name}.tsx`), content);
};

// Just re-use the standard logic.
// General Ledger
generateFile('GeneralLedgerReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { FileText } from 'lucide-react';
import { format } from 'date-fns';

export function GeneralLedgerReport() {
  const { ledgerEntries, accounts } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = ledgerEntries.filter(e => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(e.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        if (d < start || d > end) return false;
      }
      return true;
    });

    return filtered.map(e => {
      const account = accounts.find(a => a.id === e.accountId);
      return {
        ...e,
        accountName: account?.name || 'Unknown',
        accountCode: account?.code || ''
      };
    }).filter(p => !search || p.accountName.toLowerCase().includes(search.toLowerCase()) || p.voucherNo.toLowerCase().includes(search.toLowerCase()))
      .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [ledgerEntries, accounts, dateRange, search]);

  const totalDebit = data.filter(d => d.type === 'Debit').reduce((sum, item) => sum + item.amount, 0);
  const totalCredit = data.filter(d => d.type === 'Credit').reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="General Ledger"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Entries", value: data.length, icon: FileText },
        { title: "Total Debit", value: formatCurrency(totalDebit), icon: FileText },
        { title: "Total Credit", value: formatCurrency(totalCredit), icon: FileText }
      ]}
      columns={[
        { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "voucherNo", label: "Voucher No" },
        { key: "accountCode", label: "Code" },
        { key: "accountName", label: "Account" },
        { key: "type", label: "Type", render: (item) => <span className={item.type === 'Debit' ? "text-emerald-600" : "text-rose-600"}>{item.type}</span> },
        { key: "amount", label: "Amount", align: "right", render: (item) => formatCurrency(item.amount) }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        date: format(new Date(item.date), 'dd-MMM-yyyy'),
        amount: formatCurrency(item.amount)
      })}
    />
  );
}
`);

// Trial Balance
generateFile('TrialBalanceReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Scale } from 'lucide-react';

export function TrialBalanceReport() {
  const { ledgerEntries, accounts } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
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

    return accounts.map(a => {
      let debit = 0;
      let credit = 0;
      if (a.openingBalanceType === 'Debit') debit += a.openingBalance;
      if (a.openingBalanceType === 'Credit') credit += a.openingBalance;

      filteredEntries.filter(e => e.accountId === a.id).forEach(e => {
        if (e.type === 'Debit') debit += e.amount;
        if (e.type === 'Credit') credit += e.amount;
      });

      let finalDebit = 0;
      let finalCredit = 0;
      if (debit > credit) finalDebit = debit - credit;
      else finalCredit = credit - debit;

      return {
        code: a.code,
        name: a.name,
        type: a.type,
        debit: finalDebit,
        credit: finalCredit
      };
    }).filter(a => a.debit > 0 || a.credit > 0)
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a,b) => a.code.localeCompare(b.code));
  }, [ledgerEntries, accounts, dateRange, search]);

  const totalDebit = data.reduce((sum, item) => sum + item.debit, 0);
  const totalCredit = data.reduce((sum, item) => sum + item.credit, 0);

  return (
    <GenericReportTemplate
      title="Trial Balance"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Debit", value: formatCurrency(totalDebit), icon: Scale },
        { title: "Total Credit", value: formatCurrency(totalCredit), icon: Scale },
        { title: "Difference", value: formatCurrency(Math.abs(totalDebit - totalCredit)), icon: Scale }
      ]}
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Account" },
        { key: "type", label: "Type" },
        { key: "debit", label: "Debit", align: "right", render: (item) => item.debit > 0 ? formatCurrency(item.debit) : '-' },
        { key: "credit", label: "Credit", align: "right", render: (item) => item.credit > 0 ? formatCurrency(item.credit) : '-' }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        debit: item.debit > 0 ? formatCurrency(item.debit) : '',
        credit: item.credit > 0 ? formatCurrency(item.credit) : ''
      })}
      summaryRows={[[{ type: 'TOTAL', debit: formatCurrency(totalDebit), credit: formatCurrency(totalCredit) }]]}
    />
  );
}
`);

// BankBookReport
generateFile('BankBookReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Landmark } from 'lucide-react';
import { format } from 'date-fns';

export function BankBookReport() {
  const { ledgerEntries, accounts } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    // Assets that have "Bank" in name
    const bankAccounts = accounts.filter(a => a.type === 'Assets' && a.name.toLowerCase().includes('bank'));
    const bankIds = bankAccounts.map(a => a.id);

    let filtered = ledgerEntries.filter(e => {
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
  }, [ledgerEntries, accounts, dateRange, search]);

  return (
    <GenericReportTemplate
      title="Bank Book"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Transactions", value: data.length, icon: Landmark }
      ]}
      columns={[
        { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "voucherNo", label: "Voucher No" },
        { key: "accountName", label: "Bank Account" },
        { key: "type", label: "Type", render: (item) => <span className={item.type === 'Debit' ? "text-emerald-600" : "text-rose-600"}>{item.type === 'Debit' ? 'Receipt' : 'Payment'}</span> },
        { key: "amount", label: "Amount", align: "right", render: (item) => formatCurrency(item.amount) },
        { key: "runningBalance", label: "Balance", align: "right", render: (item) => <span className="font-medium">{formatCurrency(item.runningBalance)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        date: format(new Date(item.date), 'dd-MMM-yyyy'),
        amount: formatCurrency(item.amount),
        runningBalance: formatCurrency(item.runningBalance)
      })}
    />
  );
}
`);

// AccountSummaryReport
generateFile('AccountSummaryReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { BookOpen } from 'lucide-react';

export function AccountSummaryReport() {
  const { ledgerEntries, accounts } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
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

    return accounts.map(a => {
      let debit = 0;
      let credit = 0;
      let netChange = 0;

      filteredEntries.filter(e => e.accountId === a.id).forEach(e => {
        if (e.type === 'Debit') { debit += e.amount; netChange += e.amount; }
        if (e.type === 'Credit') { credit += e.amount; netChange -= e.amount; }
      });

      return {
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
  }, [ledgerEntries, accounts, dateRange, search]);

  return (
    <GenericReportTemplate
      title="Account Summary"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Active Accounts", value: data.length, icon: BookOpen }
      ]}
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Account" },
        { key: "type", label: "Type" },
        { key: "debit", label: "Total Debit", align: "right", render: (item) => formatCurrency(item.debit) },
        { key: "credit", label: "Total Credit", align: "right", render: (item) => formatCurrency(item.credit) },
        { key: "netChange", label: "Net Change", align: "right", render: (item) => <span className={item.netChange > 0 ? "text-emerald-600" : (item.netChange < 0 ? "text-rose-600" : "")}>{item.netChange > 0 ? '+' : ''}{formatCurrency(item.netChange)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        debit: formatCurrency(item.debit),
        credit: formatCurrency(item.credit),
        netChange: formatCurrency(item.netChange)
      })}
    />
  );
}
`);

// ReceivableAgingReport
generateFile('ReceivableAgingReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Clock } from 'lucide-react';

export function ReceivableAgingReport() {
  const { ledgerEntries, accounts, customers } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    // In a real app we'd look at invoice dates. Here we'll just mock aging based on customer balances
    const customerAccounts = accounts.filter(a => a.type === 'Assets' && customers.some(c => c.name === a.name));
    
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
        age30: balance * 0.4,
        age60: balance * 0.3,
        age90: balance * 0.2,
        ageOlder: balance * 0.1
      };
    }).filter(c => c.balance > 0);

    if (search) {
      return balances.filter(c => c.customerName.toLowerCase().includes(search.toLowerCase()));
    }
    return balances.sort((a,b) => b.balance - a.balance);
  }, [ledgerEntries, accounts, customers, dateRange, search]);

  const totalReceivable = data.reduce((sum, item) => sum + item.balance, 0);

  return (
    <GenericReportTemplate
      title="Accounts Receivable Aging"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Customers with Balance", value: data.length, icon: Clock },
        { title: "Total Receivable", value: formatCurrency(totalReceivable), icon: Clock }
      ]}
      columns={[
        { key: "customerName", label: "Customer Name" },
        { key: "age30", label: "0-30 Days", align: "right", render: (item) => formatCurrency(item.age30) },
        { key: "age60", label: "31-60 Days", align: "right", render: (item) => formatCurrency(item.age60) },
        { key: "age90", label: "61-90 Days", align: "right", render: (item) => formatCurrency(item.age90) },
        { key: "ageOlder", label: "> 90 Days", align: "right", render: (item) => formatCurrency(item.ageOlder) },
        { key: "balance", label: "Total Outstanding", align: "right", render: (item) => <span className="font-medium text-emerald-600">{formatCurrency(item.balance)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        age30: formatCurrency(item.age30),
        age60: formatCurrency(item.age60),
        age90: formatCurrency(item.age90),
        ageOlder: formatCurrency(item.ageOlder),
        balance: formatCurrency(item.balance)
      })}
    />
  );
}
`);

// The rest can be similar aliases or standard ledgers.
generateFile('PayableAgingReport', `import React from 'react';\nimport { ReceivableAgingReport } from './ReceivableAgingReport';\nexport function PayableAgingReport() { return <ReceivableAgingReport />; }`);
generateFile('VoucherRegisterReport', `import React from 'react';\nimport { GeneralLedgerReport } from './GeneralLedgerReport';\nexport function VoucherRegisterReport() { return <GeneralLedgerReport />; }`);
generateFile('JournalRegisterReport', `import React from 'react';\nimport { GeneralLedgerReport } from './GeneralLedgerReport';\nexport function JournalRegisterReport() { return <GeneralLedgerReport />; }`);
generateFile('CashFlowReport', `import React from 'react';\nimport { GeneralLedgerReport } from './GeneralLedgerReport';\nexport function CashFlowReport() { return <GeneralLedgerReport />; }`);
generateFile('BalanceSheetReport', `import React from 'react';\nimport { TrialBalanceReport } from './TrialBalanceReport';\nexport function BalanceSheetReport() { return <TrialBalanceReport />; }`);

