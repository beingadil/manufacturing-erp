import fs from 'fs';
import path from 'path';

const outDir = '/workspace/app-d0luni1anmkh/src/components/reports/purchase';

// We'll write the components directly into PurchaseReports.tsx to save files, or write individual files.
// Let's write them as individual files.

const generateFile = (name, content) => {
  fs.writeFileSync(path.join(outDir, `${name}.tsx`), content);
};

// PurchaseOrderReport.tsx
generateFile('PurchaseOrderReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { ShoppingCart, Scale, DollarSign, Activity } from 'lucide-react';
import { format } from 'date-fns';

export function PurchaseOrderReport() {
  const { purchases, suppliers, materials } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    return purchases.filter(p => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(p.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        if (d < start || d > end) return false;
      }
      return true;
    }).map(p => {
      const supplier = suppliers.find(s => s.id === p.supplierId);
      const material = materials.find(m => m.id === p.materialId);
      return {
        ...p,
        supplierName: supplier?.name || 'Unknown',
        materialName: material?.name || 'Unknown',
      };
    }).filter(p => {
      if (!search) return true;
      const q = search.toLowerCase();
      return p.purchaseNo.toLowerCase().includes(q) || 
             p.supplierName.toLowerCase().includes(q) || 
             p.materialName.toLowerCase().includes(q);
    });
  }, [purchases, suppliers, materials, dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
  const totalWeight = data.reduce((sum, item) => sum + item.weight, 0);

  return (
    <GenericReportTemplate
      title="Purchase Order Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Orders", value: data.length, icon: ShoppingCart },
        { title: "Total Weight", value: \`\${formatNumber(totalWeight)} KGs\`, icon: Scale },
        { title: "Avg Order Value", value: formatCurrency(data.length ? totalAmount/data.length : 0), icon: Activity },
        { title: "Total Amount", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "purchaseNo", label: "PO Number" },
        { key: "supplierName", label: "Supplier" },
        { key: "materialName", label: "Material" },
        { key: "weight", label: "Weight", align: "right", render: (item) => formatNumber(item.weight) },
        { key: "amount", label: "Amount", align: "right", render: (item) => <span className="font-medium">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        date: format(new Date(item.date), 'dd-MMM-yyyy'),
        weight: formatNumber(item.weight),
        amount: formatCurrency(item.amount)
      })}
      summaryRows={[[{ materialName: 'TOTAL', weight: formatNumber(totalWeight), amount: formatCurrency(totalAmount) }]]}
    />
  );
}
`);

// SupplierOutstandingReport.tsx
generateFile('SupplierOutstandingReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Users, DollarSign, Activity, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export function SupplierOutstandingReport() {
  const { ledgerEntries, accounts, suppliers } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    // Get all supplier accounts
    const supplierAccounts = accounts.filter(a => a.type === 'Liabilities' && suppliers.some(s => s.name === a.name));
    
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

    const supplierBalances = suppliers.map(supplier => {
      const account = supplierAccounts.find(a => a.name === supplier.name);
      if (!account) return { supplierName: supplier.name, contact: supplier.contact, balance: 0, status: 'Clear' };
      
      const entries = filteredEntries.filter(e => e.accountId === account.id);
      let balance = account.openingBalanceType === 'Credit' ? account.openingBalance : -account.openingBalance;
      
      entries.forEach(e => {
        if (e.type === 'Credit') balance += e.amount;
        if (e.type === 'Debit') balance -= e.amount;
      });

      return {
        supplierName: supplier.name,
        contact: supplier.contact,
        balance,
        status: balance > 0 ? 'Payable' : (balance < 0 ? 'Advance' : 'Clear')
      };
    }).filter(s => s.balance !== 0);

    if (search) {
      return supplierBalances.filter(s => s.supplierName.toLowerCase().includes(search.toLowerCase()));
    }
    return supplierBalances.sort((a,b) => b.balance - a.balance);
  }, [ledgerEntries, accounts, suppliers, dateRange, search]);

  const totalOutstanding = data.reduce((sum, item) => sum + (item.balance > 0 ? item.balance : 0), 0);
  const totalAdvances = data.reduce((sum, item) => sum + (item.balance < 0 ? Math.abs(item.balance) : 0), 0);

  return (
    <GenericReportTemplate
      title="Supplier Outstanding Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Suppliers with Balance", value: data.length, icon: Users },
        { title: "Total Payable", value: formatCurrency(totalOutstanding), icon: DollarSign },
        { title: "Total Advances", value: formatCurrency(totalAdvances), icon: Activity },
        { title: "Net Outstanding", value: formatCurrency(totalOutstanding - totalAdvances), icon: AlertCircle }
      ]}
      columns={[
        { key: "supplierName", label: "Supplier Name" },
        { key: "contact", label: "Contact Info" },
        { key: "status", label: "Status" },
        { key: "balance", label: "Outstanding Balance", align: "right", render: (item) => <span className={item.balance > 0 ? "text-rose-600 font-medium" : "text-emerald-600 font-medium"}>{formatCurrency(Math.abs(item.balance))} {item.balance > 0 ? 'Cr' : 'Dr'}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        balance: \`\${formatCurrency(Math.abs(item.balance))} \${item.balance > 0 ? 'Cr' : 'Dr'}\`
      })}
      summaryRows={[[{ status: 'TOTAL PAYABLE', balance: formatCurrency(totalOutstanding) }]]}
    />
  );
}
`);

// SupplierLedgerSummary.tsx
generateFile('SupplierLedgerSummary', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Users, DollarSign, FileText } from 'lucide-react';
import { format } from 'date-fns';

export function SupplierLedgerSummary() {
  const { ledgerEntries, accounts, suppliers } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    const supplierAccounts = accounts.filter(a => a.type === 'Liabilities' && suppliers.some(s => s.name === a.name));
    
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

    const summary = supplierAccounts.map(account => {
      const entries = filteredEntries.filter(e => e.accountId === account.id);
      let totalDebit = 0;
      let totalCredit = 0;
      
      entries.forEach(e => {
        if (e.type === 'Debit') totalDebit += e.amount;
        if (e.type === 'Credit') totalCredit += e.amount;
      });

      return {
        supplierName: account.name,
        transactions: entries.length,
        totalDebit,
        totalCredit,
        netChange: totalCredit - totalDebit
      };
    }).filter(s => s.transactions > 0);

    if (search) {
      return summary.filter(s => s.supplierName.toLowerCase().includes(search.toLowerCase()));
    }
    return summary.sort((a,b) => b.transactions - a.transactions);
  }, [ledgerEntries, accounts, suppliers, dateRange, search]);

  const grandDebit = data.reduce((sum, item) => sum + item.totalDebit, 0);
  const grandCredit = data.reduce((sum, item) => sum + item.totalCredit, 0);

  return (
    <GenericReportTemplate
      title="Supplier Ledger Summary"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Active Suppliers", value: data.length, icon: Users },
        { title: "Total Payments (Dr)", value: formatCurrency(grandDebit), icon: DollarSign },
        { title: "Total Purchases (Cr)", value: formatCurrency(grandCredit), icon: DollarSign },
        { title: "Total Transactions", value: data.reduce((sum, i) => sum + i.transactions, 0), icon: FileText }
      ]}
      columns={[
        { key: "supplierName", label: "Supplier Name" },
        { key: "transactions", label: "Transactions", align: "right" },
        { key: "totalDebit", label: "Total Debit (Payments)", align: "right", render: (item) => formatCurrency(item.totalDebit) },
        { key: "totalCredit", label: "Total Credit (Purchases)", align: "right", render: (item) => formatCurrency(item.totalCredit) },
        { key: "netChange", label: "Net Change", align: "right", render: (item) => <span className={item.netChange > 0 ? "text-rose-600 font-medium" : "text-emerald-600 font-medium"}>{formatCurrency(Math.abs(item.netChange))} {item.netChange > 0 ? 'Cr' : 'Dr'}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        totalDebit: formatCurrency(item.totalDebit),
        totalCredit: formatCurrency(item.totalCredit),
        netChange: \`\${formatCurrency(Math.abs(item.netChange))} \${item.netChange > 0 ? 'Cr' : 'Dr'}\`
      })}
      summaryRows={[[{ transactions: 'TOTAL', totalDebit: formatCurrency(grandDebit), totalCredit: formatCurrency(grandCredit) }]]}
    />
  );
}
`);

// PurchaseComparisonReport.tsx
generateFile('PurchaseComparisonReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Scale, DollarSign, Activity, Percent } from 'lucide-react';
import { format } from 'date-fns';

export function PurchaseComparisonReport() {
  const { purchases, materials } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    // Current period
    let currentPurchases = purchases.filter(p => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(p.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        return d >= start && d <= end;
      }
      return true;
    });

    // Previous period (same length)
    let prevPurchases = [];
    if (dateRange.start && dateRange.end) {
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const diff = end.getTime() - start.getTime();
        const prevEnd = new Date(start.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - diff);
        prevPurchases = purchases.filter(p => {
            const d = new Date(p.date);
            return d >= prevStart && d <= prevEnd;
        });
    }

    const materialMap = new Map();
    
    currentPurchases.forEach(p => {
      const mat = materials.find(m => m.id === p.materialId)?.name || 'Unknown';
      if (!materialMap.has(mat)) {
        materialMap.set(mat, { materialName: mat, currentAmount: 0, prevAmount: 0, currentWeight: 0, prevWeight: 0 });
      }
      const m = materialMap.get(mat);
      m.currentAmount += p.amount;
      m.currentWeight += p.weight;
    });

    prevPurchases.forEach(p => {
      const mat = materials.find(m => m.id === p.materialId)?.name || 'Unknown';
      if (!materialMap.has(mat)) {
        materialMap.set(mat, { materialName: mat, currentAmount: 0, prevAmount: 0, currentWeight: 0, prevWeight: 0 });
      }
      const m = materialMap.get(mat);
      m.prevAmount += p.amount;
      m.prevWeight += p.weight;
    });

    return Array.from(materialMap.values()).map(m => {
        const growth = m.prevAmount > 0 ? ((m.currentAmount - m.prevAmount) / m.prevAmount) * 100 : 100;
        return { ...m, growth };
    }).filter(p => !search || p.materialName.toLowerCase().includes(search.toLowerCase()));

  }, [purchases, materials, dateRange, search]);

  const totalCurrent = data.reduce((sum, item) => sum + item.currentAmount, 0);
  const totalPrev = data.reduce((sum, item) => sum + item.prevAmount, 0);
  const totalGrowth = totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : 0;

  return (
    <GenericReportTemplate
      title="Purchase Comparison (Current vs Previous Period)"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Current Period Purchases", value: formatCurrency(totalCurrent), icon: DollarSign },
        { title: "Previous Period Purchases", value: formatCurrency(totalPrev), icon: DollarSign },
        { title: "Growth %", value: \`\${totalGrowth.toFixed(2)}%\`, icon: Percent },
        { title: "Materials Compared", value: data.length, icon: Activity }
      ]}
      columns={[
        { key: "materialName", label: "Material Name" },
        { key: "currentWeight", label: "Current Weight", align: "right", render: (item) => formatNumber(item.currentWeight) },
        { key: "prevWeight", label: "Prev Weight", align: "right", render: (item) => formatNumber(item.prevWeight) },
        { key: "currentAmount", label: "Current Amount", align: "right", render: (item) => formatCurrency(item.currentAmount) },
        { key: "prevAmount", label: "Prev Amount", align: "right", render: (item) => formatCurrency(item.prevAmount) },
        { key: "growth", label: "Growth", align: "right", render: (item) => <span className={item.growth > 0 ? "text-emerald-600" : "text-rose-600"}>{item.growth > 0 ? '+' : ''}{item.growth.toFixed(2)}%</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentWeight: formatNumber(item.currentWeight),
        prevWeight: formatNumber(item.prevWeight),
        currentAmount: formatCurrency(item.currentAmount),
        prevAmount: formatCurrency(item.prevAmount),
        growth: \`\${item.growth > 0 ? '+' : ''}\${item.growth.toFixed(2)}%\`
      })}
      summaryRows={[[{ materialName: 'TOTAL', currentAmount: formatCurrency(totalCurrent), prevAmount: formatCurrency(totalPrev), growth: \`\${totalGrowth > 0 ? '+' : ''}\${totalGrowth.toFixed(2)}%\` }]]}
    />
  );
}
`);

