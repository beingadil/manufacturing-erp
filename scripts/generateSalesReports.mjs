import fs from 'fs';
import path from 'path';

const outDir = '/workspace/app-d0luni1anmkh/src/components/reports/sales';

const generateFile = (name, content) => {
  fs.writeFileSync(path.join(outDir, `${name}.tsx`), content);
};

generateFile('ProductSalesAnalysis', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Package, DollarSign, Activity } from 'lucide-react';

export function ProductSalesAnalysis() {
  const { sales, products } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = sales.filter(s => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(s.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        if (d < start || d > end) return false;
      }
      return true;
    });

    const productMap = new Map();
    filtered.forEach(s => {
      const product = products.find(p => p.id === s.productId);
      const productName = product?.name || 'Unknown';
      if (!productMap.has(productName)) {
        productMap.set(productName, { productName, count: 0, pcsSold: 0, totalAmount: 0, minPrice: s.pricePerPiece, maxPrice: s.pricePerPiece });
      }
      const c = productMap.get(productName);
      c.count += 1;
      c.pcsSold += s.pcsSold;
      c.totalAmount += s.totalAmount;
      if (s.pricePerPiece < c.minPrice) c.minPrice = s.pricePerPiece;
      if (s.pricePerPiece > c.maxPrice) c.maxPrice = s.pricePerPiece;
    });

    return Array.from(productMap.values()).map(m => ({
        ...m,
        avgPrice: m.totalAmount / (m.pcsSold || 1),
        variance: m.maxPrice - m.minPrice
    })).filter(p => !search || p.productName.toLowerCase().includes(search.toLowerCase()));
  }, [sales, products, dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.totalAmount, 0);

  return (
    <GenericReportTemplate
      title="Product Sales Analysis"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Products Sold", value: data.length, icon: Package },
        { title: "Transactions", value: data.reduce((sum, item) => sum + item.count, 0), icon: Activity },
        { title: "Total Revenue", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "productName", label: "Product Name" },
        { key: "pcsSold", label: "PCS Sold", align: "right", render: (item) => formatNumber(item.pcsSold) },
        { key: "avgPrice", label: "Avg Price", align: "right", render: (item) => formatCurrency(item.avgPrice) },
        { key: "variance", label: "Price Variance", align: "right", render: (item) => formatCurrency(item.variance) },
        { key: "totalAmount", label: "Total Revenue", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.totalAmount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        pcsSold: formatNumber(item.pcsSold),
        avgPrice: formatCurrency(item.avgPrice),
        variance: formatCurrency(item.variance),
        totalAmount: formatCurrency(item.totalAmount)
      })}
      summaryRows={[[{ productName: 'TOTAL', totalAmount: formatCurrency(totalAmount) }]]}
    />
  );
}
`);

generateFile('CustomerOutstanding', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Users, DollarSign, Activity, AlertCircle } from 'lucide-react';

export function CustomerOutstanding() {
  const { ledgerEntries, accounts, customers } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
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
      if (!account) return { customerName: customer.name, contact: customer.contact, balance: 0, status: 'Clear' };
      
      const entries = filteredEntries.filter(e => e.accountId === account.id);
      let balance = account.openingBalanceType === 'Debit' ? account.openingBalance : -account.openingBalance;
      
      entries.forEach(e => {
        if (e.type === 'Debit') balance += e.amount;
        if (e.type === 'Credit') balance -= e.amount;
      });

      return {
        customerName: customer.name,
        contact: customer.contact,
        balance,
        status: balance > 0 ? 'Receivable' : (balance < 0 ? 'Advance' : 'Clear')
      };
    }).filter(c => c.balance !== 0);

    if (search) {
      return balances.filter(c => c.customerName.toLowerCase().includes(search.toLowerCase()));
    }
    return balances.sort((a,b) => b.balance - a.balance);
  }, [ledgerEntries, accounts, customers, dateRange, search]);

  const totalReceivable = data.reduce((sum, item) => sum + (item.balance > 0 ? item.balance : 0), 0);

  return (
    <GenericReportTemplate
      title="Customer Outstanding Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Customers with Balance", value: data.length, icon: Users },
        { title: "Total Receivable", value: formatCurrency(totalReceivable), icon: DollarSign }
      ]}
      columns={[
        { key: "customerName", label: "Customer Name" },
        { key: "contact", label: "Contact Info" },
        { key: "status", label: "Status" },
        { key: "balance", label: "Outstanding Balance", align: "right", render: (item) => <span className={item.balance > 0 ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>{formatCurrency(Math.abs(item.balance))} {item.balance > 0 ? 'Dr' : 'Cr'}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        balance: \`\${formatCurrency(Math.abs(item.balance))} \${item.balance > 0 ? 'Dr' : 'Cr'}\`
      })}
      summaryRows={[[{ status: 'TOTAL RECEIVABLE', balance: formatCurrency(totalReceivable) }]]}
    />
  );
}
`);

generateFile('CustomerLedgerSummary', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Users, DollarSign, FileText } from 'lucide-react';

export function CustomerLedgerSummary() {
  const { ledgerEntries, accounts, customers } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
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

    const summary = customerAccounts.map(account => {
      const entries = filteredEntries.filter(e => e.accountId === account.id);
      let totalDebit = 0;
      let totalCredit = 0;
      
      entries.forEach(e => {
        if (e.type === 'Debit') totalDebit += e.amount;
        if (e.type === 'Credit') totalCredit += e.amount;
      });

      return {
        customerName: account.name,
        transactions: entries.length,
        totalDebit,
        totalCredit,
        netChange: totalDebit - totalCredit
      };
    }).filter(c => c.transactions > 0);

    if (search) {
      return summary.filter(c => c.customerName.toLowerCase().includes(search.toLowerCase()));
    }
    return summary.sort((a,b) => b.transactions - a.transactions);
  }, [ledgerEntries, accounts, customers, dateRange, search]);

  const grandDebit = data.reduce((sum, item) => sum + item.totalDebit, 0);
  const grandCredit = data.reduce((sum, item) => sum + item.totalCredit, 0);

  return (
    <GenericReportTemplate
      title="Customer Ledger Summary"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Active Customers", value: data.length, icon: Users },
        { title: "Total Sales (Dr)", value: formatCurrency(grandDebit), icon: DollarSign },
        { title: "Total Receipts (Cr)", value: formatCurrency(grandCredit), icon: DollarSign },
        { title: "Total Transactions", value: data.reduce((sum, i) => sum + i.transactions, 0), icon: FileText }
      ]}
      columns={[
        { key: "customerName", label: "Customer Name" },
        { key: "transactions", label: "Transactions", align: "right" },
        { key: "totalDebit", label: "Total Debit (Sales)", align: "right", render: (item) => formatCurrency(item.totalDebit) },
        { key: "totalCredit", label: "Total Credit (Receipts)", align: "right", render: (item) => formatCurrency(item.totalCredit) },
        { key: "netChange", label: "Net Change", align: "right", render: (item) => <span className={item.netChange > 0 ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>{formatCurrency(Math.abs(item.netChange))} {item.netChange > 0 ? 'Dr' : 'Cr'}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        totalDebit: formatCurrency(item.totalDebit),
        totalCredit: formatCurrency(item.totalCredit),
        netChange: \`\${formatCurrency(Math.abs(item.netChange))} \${item.netChange > 0 ? 'Dr' : 'Cr'}\`
      })}
      summaryRows={[[{ transactions: 'TOTAL', totalDebit: formatCurrency(grandDebit), totalCredit: formatCurrency(grandCredit) }]]}
    />
  );
}
`);

generateFile('SalesComparison', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Package, DollarSign, Percent } from 'lucide-react';

export function SalesComparison() {
  const { sales, products } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let currentSales = sales.filter(s => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(s.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        return d >= start && d <= end;
      }
      return true;
    });

    let prevSales = [];
    if (dateRange.start && dateRange.end) {
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const diff = end.getTime() - start.getTime();
        const prevEnd = new Date(start.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - diff);
        prevSales = sales.filter(s => {
            const d = new Date(s.date);
            return d >= prevStart && d <= prevEnd;
        });
    }

    const productMap = new Map();
    
    currentSales.forEach(s => {
      const prod = products.find(p => p.id === s.productId)?.name || 'Unknown';
      if (!productMap.has(prod)) productMap.set(prod, { productName: prod, currentAmount: 0, prevAmount: 0 });
      productMap.get(prod).currentAmount += s.totalAmount;
    });

    prevSales.forEach(s => {
      const prod = products.find(p => p.id === s.productId)?.name || 'Unknown';
      if (!productMap.has(prod)) productMap.set(prod, { productName: prod, currentAmount: 0, prevAmount: 0 });
      productMap.get(prod).prevAmount += s.totalAmount;
    });

    return Array.from(productMap.values()).map(p => ({
        ...p,
        growth: p.prevAmount > 0 ? ((p.currentAmount - p.prevAmount) / p.prevAmount) * 100 : 100
    })).filter(p => !search || p.productName.toLowerCase().includes(search.toLowerCase()));

  }, [sales, products, dateRange, search]);

  const totalCurrent = data.reduce((sum, item) => sum + item.currentAmount, 0);
  const totalPrev = data.reduce((sum, item) => sum + item.prevAmount, 0);
  const totalGrowth = totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : 0;

  return (
    <GenericReportTemplate
      title="Sales Comparison Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Current Revenue", value: formatCurrency(totalCurrent), icon: DollarSign },
        { title: "Previous Revenue", value: formatCurrency(totalPrev), icon: DollarSign },
        { title: "Growth %", value: \`\${totalGrowth.toFixed(2)}%\`, icon: Percent }
      ]}
      columns={[
        { key: "productName", label: "Product Name" },
        { key: "currentAmount", label: "Current Revenue", align: "right", render: (item) => formatCurrency(item.currentAmount) },
        { key: "prevAmount", label: "Prev Revenue", align: "right", render: (item) => formatCurrency(item.prevAmount) },
        { key: "growth", label: "Growth", align: "right", render: (item) => <span className={item.growth > 0 ? "text-emerald-600" : "text-rose-600"}>{item.growth > 0 ? '+' : ''}{item.growth.toFixed(2)}%</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentAmount: formatCurrency(item.currentAmount),
        prevAmount: formatCurrency(item.prevAmount),
        growth: \`\${item.growth > 0 ? '+' : ''}\${item.growth.toFixed(2)}%\`
      })}
    />
  );
}
`);

generateFile('ProfitByProduct', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Package, DollarSign, Activity } from 'lucide-react';

export function ProfitByProduct() {
  const { sales, products, purchases } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filteredSales = sales.filter(s => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(s.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        return d >= start && d <= end;
      }
      return true;
    });

    // Approximate cost by finding raw material avg purchase rate
    const avgMaterialCost = new Map();
    purchases.forEach(p => {
        if (!avgMaterialCost.has(p.materialId)) avgMaterialCost.set(p.materialId, { amount: 0, weight: 0 });
        const c = avgMaterialCost.get(p.materialId);
        c.amount += p.amount;
        c.weight += p.weight;
    });

    const productMap = new Map();
    filteredSales.forEach(s => {
      const product = products.find(p => p.id === s.productId);
      const productName = product?.name || 'Unknown';
      if (!productMap.has(productName)) {
        // Calculate approx cost if material is linked
        let costPerPiece = 0;
        if (product && product.materialId && avgMaterialCost.has(product.materialId)) {
            const mc = avgMaterialCost.get(product.materialId);
            const ratePerKg = mc.amount / (mc.weight || 1);
            // Rough estimation
            costPerPiece = (ratePerKg / 1000) * 100; // Assume 100g per piece
        }
        productMap.set(productName, { productName, revenue: 0, cost: 0, pcs: 0, costPerPiece });
      }
      const c = productMap.get(productName);
      c.pcs += s.pcsSold;
      c.revenue += s.totalAmount;
      c.cost += (s.pcsSold * c.costPerPiece);
    });

    return Array.from(productMap.values()).map(p => ({
        ...p,
        profit: p.revenue - p.cost,
        margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0
    })).filter(p => !search || p.productName.toLowerCase().includes(search.toLowerCase()))
       .sort((a,b) => b.profit - a.profit);
  }, [sales, products, purchases, dateRange, search]);

  const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0);
  const totalProfit = data.reduce((sum, item) => sum + item.profit, 0);

  return (
    <GenericReportTemplate
      title="Profit by Product (Estimate)"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Products Sold", value: data.length, icon: Package },
        { title: "Total Revenue", value: formatCurrency(totalRevenue), icon: DollarSign },
        { title: "Total Est. Profit", value: formatCurrency(totalProfit), icon: Activity }
      ]}
      columns={[
        { key: "productName", label: "Product Name" },
        { key: "revenue", label: "Revenue", align: "right", render: (item) => formatCurrency(item.revenue) },
        { key: "cost", label: "Est. Cost", align: "right", render: (item) => formatCurrency(item.cost) },
        { key: "profit", label: "Profit", align: "right", render: (item) => <span className="font-medium text-emerald-600">{formatCurrency(item.profit)}</span> },
        { key: "margin", label: "Margin", align: "right", render: (item) => \`\${item.margin.toFixed(2)}%\` }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        revenue: formatCurrency(item.revenue),
        cost: formatCurrency(item.cost),
        profit: formatCurrency(item.profit),
        margin: \`\${item.margin.toFixed(2)}%\`
      })}
    />
  );
}
`);


const reportsIndex = `import React from 'react';
import { SalesRegister } from './SalesRegister';
import { SalesSummary } from './SalesSummary';
import { CustomerSalesReport } from './CustomerSalesReport';
import { ProductSalesReport } from './ProductSalesReport';
import { SalesTrend } from './SalesTrend';
import { ProductSalesAnalysis } from './ProductSalesAnalysis';
import { CustomerOutstanding } from './CustomerOutstanding';
import { CustomerLedgerSummary } from './CustomerLedgerSummary';
import { SalesComparison } from './SalesComparison';
import { ProfitByProduct } from './ProfitByProduct';

const Placeholder = ({ name }: {name:string}) => <div className="p-8 text-center text-muted-foreground">{name} Report will be implemented here.</div>;

export function SalesReports({ activeReport }: { activeReport: string }) {
  switch (activeReport) {
    case 'sales-register': return <SalesRegister />;
    case 'sales-summary': return <SalesSummary />;
    case 'customer-sales': return <CustomerSalesReport />;
    case 'product-sales': return <ProductSalesReport />;
    case 'sales-trend': return <SalesTrend />;
    case 'product-sales-analysis': return <ProductSalesAnalysis />;
    case 'customer-outstanding': return <CustomerOutstanding />;
    case 'customer-ledger': return <CustomerLedgerSummary />;
    case 'sales-comparison': return <SalesComparison />;
    case 'profit-by-product': return <ProfitByProduct />;
    default: return <Placeholder name={activeReport} />;
  }
}
`;
fs.writeFileSync(path.join(outDir, 'SalesReports.tsx'), reportsIndex);

