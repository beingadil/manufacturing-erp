import { generateReport } from './generateReports.mjs';
import fs from 'fs';
import path from 'path';

const outDir = '/workspace/app-d0luni1anmkh/src/components/reports/purchase';

// Common data aggregation logic for Purchase Reports
const commonBaseData = `
    let filtered = purchases.filter(p => {
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
      const category = categories.find(c => c.id === material?.categoryId);
      return {
        ...p,
        supplierName: supplier?.name || 'Unknown',
        materialName: material?.name || 'Unknown',
        categoryName: category?.name || 'Unknown',
      };
    }).filter(p => {
      if (!search) return true;
      const q = search.toLowerCase();
      return p.purchaseNo.toLowerCase().includes(q) || 
             p.supplierName.toLowerCase().includes(q) || 
             p.materialName.toLowerCase().includes(q) ||
             p.categoryName.toLowerCase().includes(q);
    });
`;

generateReport(path.join(outDir, 'PurchaseSummary.tsx'), 'PurchaseSummary', {
  hooks: ['purchases', 'suppliers', 'materials', 'categories'],
  dataAggregation: `
    ${commonBaseData}
    
    // Group by supplier
    const supplierMap = new Map();
    filtered.forEach(p => {
      if (!supplierMap.has(p.supplierName)) {
        supplierMap.set(p.supplierName, { 
          id: p.supplierId, supplierName: p.supplierName,
          count: 0, weight: 0, calculatedPcs: 0, amount: 0 
        });
      }
      const s = supplierMap.get(p.supplierName);
      s.count += 1;
      s.weight += p.weight;
      s.calculatedPcs += p.calculatedPcs;
      s.amount += p.amount;
    });

    return Array.from(supplierMap.values());
  `,
  kpiCards: {
    logic: `
  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
  const totalWeight = data.reduce((sum, item) => sum + item.weight, 0);
  const totalPcs = data.reduce((sum, item) => sum + item.calculatedPcs, 0);
  const totalPurchases = data.reduce((sum, item) => sum + item.count, 0);
    `,
    render: `
        <ReportKPICard title="Total Suppliers" value={data.length.toString()} icon={Users} />
        <ReportKPICard title="Total Purchases" value={totalPurchases.toString()} icon={ShoppingCart} />
        <ReportKPICard title="Total Weight" value={\`\${formatNumber(totalWeight)} KGs\`} icon={Scale} />
        <ReportKPICard title="Total Amount" value={formatCurrency(totalAmount)} icon={DollarSign} />
    `
  },
  columns: [
    { key: "supplierName", label: "Supplier" },
    { key: "count", label: "Purchase Count", align: "right" },
    { key: "weight", label: "Total Weight (KGs)", align: "right", render: "(item) => formatNumber(item.weight)" },
    { key: "calculatedPcs", label: "Total PCS", align: "right", render: "(item) => formatNumber(item.calculatedPcs)" },
    { key: "amount", label: "Total Amount", align: "right", render: "(item) => <span className=\\"font-medium text-foreground\\">{formatCurrency(item.amount)}</span>" }
  ],
  exportColumns: [
    { header: 'Supplier', dataKey: 'supplierName' },
    { header: 'Purchase Count', dataKey: 'count' },
    { header: 'Total Weight', dataKey: 'weight' },
    { header: 'Total PCS', dataKey: 'calculatedPcs' },
    { header: 'Total Amount', dataKey: 'amount' }
  ],
  exportDataMapping: `
    weight: formatNumber(d.weight),
    calculatedPcs: formatNumber(d.calculatedPcs),
    amount: formatCurrency(d.amount)
  `,
  summaryRows: `[[
    { supplierName: 'TOTAL', count: totalPurchases.toString(), weight: formatNumber(totalWeight), calculatedPcs: formatNumber(totalPcs), amount: formatCurrency(totalAmount) }
  ]]`
});

generateReport(path.join(outDir, 'PurchaseOrderReport.tsx'), 'PurchaseOrderReport', {
  hooks: ['purchases', 'suppliers', 'materials', 'categories'],
  dataAggregation: `${commonBaseData}\nreturn filtered;`,
  kpiCards: {
    logic: `
  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
  const totalWeight = data.reduce((sum, item) => sum + item.weight, 0);
    `,
    render: `
        <ReportKPICard title="Total Orders" value={data.length.toString()} icon={ShoppingCart} />
        <ReportKPICard title="Total Weight" value={\`\${formatNumber(totalWeight)} KGs\`} icon={Scale} />
        <ReportKPICard title="Average Order Value" value={formatCurrency(data.length ? totalAmount/data.length : 0)} icon={DollarSign} />
        <ReportKPICard title="Total Amount" value={formatCurrency(totalAmount)} icon={DollarSign} />
    `
  },
  columns: [
    { key: "date", label: "Date", render: "(item) => format(new Date(item.date), 'dd-MMM-yyyy')" },
    { key: "purchaseNo", label: "PO Number" },
    { key: "supplierName", label: "Supplier" },
    { key: "materialName", label: "Material" },
    { key: "weight", label: "Weight", align: "right", render: "(item) => formatNumber(item.weight)" },
    { key: "amount", label: "Amount", align: "right", render: "(item) => <span className=\\"font-medium text-foreground\\">{formatCurrency(item.amount)}</span>" }
  ],
  exportColumns: [
    { header: 'Date', dataKey: 'date' },
    { header: 'PO Number', dataKey: 'purchaseNo' },
    { header: 'Supplier', dataKey: 'supplierName' },
    { header: 'Material', dataKey: 'materialName' },
    { header: 'Weight', dataKey: 'weight' },
    { header: 'Amount', dataKey: 'amount' }
  ],
  exportDataMapping: `
    date: format(new Date(d.date), 'dd-MMM-yyyy'),
    weight: formatNumber(d.weight),
    amount: formatCurrency(d.amount)
  `,
  summaryRows: `[[
    { materialName: 'TOTAL', weight: formatNumber(totalWeight), amount: formatCurrency(totalAmount) }
  ]]`
});

generateReport(path.join(outDir, 'PurchaseByCategory.tsx'), 'PurchaseByCategory', {
  hooks: ['purchases', 'suppliers', 'materials', 'categories'],
  dataAggregation: `
    ${commonBaseData}
    const categoryMap = new Map();
    filtered.forEach(p => {
      if (!categoryMap.has(p.categoryName)) {
        categoryMap.set(p.categoryName, { 
          categoryName: p.categoryName,
          count: 0, weight: 0, amount: 0 
        });
      }
      const c = categoryMap.get(p.categoryName);
      c.count += 1;
      c.weight += p.weight;
      c.amount += p.amount;
    });
    return Array.from(categoryMap.values()).sort((a,b) => b.amount - a.amount);
  `,
  kpiCards: {
    logic: `
  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
  const topCategory = data.length > 0 ? data[0].categoryName : 'N/A';
    `,
    render: `
        <ReportKPICard title="Categories Active" value={data.length.toString()} icon={Package} />
        <ReportKPICard title="Top Category" value={topCategory} icon={ArrowUpRight} />
        <ReportKPICard title="Total Transactions" value={data.reduce((sum, item) => sum + item.count, 0).toString()} icon={Activity} />
        <ReportKPICard title="Total Value" value={formatCurrency(totalAmount)} icon={DollarSign} />
    `
  },
  columns: [
    { key: "categoryName", label: "Category" },
    { key: "count", label: "Transactions", align: "right" },
    { key: "weight", label: "Total Weight", align: "right", render: "(item) => formatNumber(item.weight)" },
    { key: "amount", label: "Total Value", align: "right", render: "(item) => <span className=\\"font-medium text-foreground\\">{formatCurrency(item.amount)}</span>" }
  ],
  exportColumns: [
    { header: 'Category', dataKey: 'categoryName' },
    { header: 'Transactions', dataKey: 'count' },
    { header: 'Total Weight', dataKey: 'weight' },
    { header: 'Total Value', dataKey: 'amount' }
  ],
  exportDataMapping: `
    weight: formatNumber(d.weight),
    amount: formatCurrency(d.amount)
  `,
  summaryRows: `[[
    { categoryName: 'TOTAL', count: data.reduce((sum, item) => sum + item.count, 0).toString(), weight: formatNumber(data.reduce((sum, item) => sum + item.weight, 0)), amount: formatCurrency(totalAmount) }
  ]]`
});

// Write PurchaseReports index
const reportsIndex = `import React from 'react';
import { PurchaseRegister } from './PurchaseRegister';
import { PurchaseSummary } from './PurchaseSummary';
import { PurchaseOrderReport } from './PurchaseOrderReport';
import { PurchaseByCategory } from './PurchaseByCategory';

// Fallbacks for those not generated yet
const Placeholder = ({ name }: {name:string}) => <div className="p-8 text-center text-muted-foreground">{name} Report will be implemented here.</div>;

export function PurchaseReports({ activeReport }: { activeReport: string }) {
  switch (activeReport) {
    case 'purchase-register': return <PurchaseRegister />;
    case 'purchase-summary': return <PurchaseSummary />;
    case 'purchase-order': return <PurchaseOrderReport />;
    case 'purchase-category': return <PurchaseByCategory />;
    default: return <Placeholder name={activeReport} />;
  }
}
`;
fs.writeFileSync(path.join(outDir, 'PurchaseReports.tsx'), reportsIndex);

