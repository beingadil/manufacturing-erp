import fs from 'fs';
import path from 'path';

const outDir = '/workspace/app-d0luni1anmkh/src/components/reports/purchase';

const generateFile = (name, content) => {
  fs.writeFileSync(path.join(outDir, `${name}.tsx`), content);
};

// PurchaseSummary.tsx
generateFile('PurchaseSummary', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { ShoppingCart, Scale, Hash, DollarSign } from 'lucide-react';

export function PurchaseSummary() {
  const { purchases, suppliers } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = purchases.filter(p => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(p.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        if (d < start || d > end) return false;
      }
      return true;
    });

    const supplierMap = new Map();
    filtered.forEach(p => {
      const supplierName = suppliers.find(s => s.id === p.supplierId)?.name || 'Unknown';
      if (!supplierMap.has(supplierName)) {
        supplierMap.set(supplierName, { supplierName, count: 0, weight: 0, calculatedPcs: 0, amount: 0 });
      }
      const s = supplierMap.get(supplierName);
      s.count += 1;
      s.weight += p.weight;
      s.calculatedPcs += p.calculatedPcs;
      s.amount += p.amount;
    });

    return Array.from(supplierMap.values()).filter(p => !search || p.supplierName.toLowerCase().includes(search.toLowerCase()));
  }, [purchases, suppliers, dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
  const totalWeight = data.reduce((sum, item) => sum + item.weight, 0);

  return (
    <GenericReportTemplate
      title="Purchase Summary"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Suppliers", value: data.length, icon: ShoppingCart },
        { title: "Total Weight", value: \`\${formatNumber(totalWeight)} KGs\`, icon: Scale },
        { title: "Total PCS", value: formatNumber(data.reduce((sum, item) => sum + item.calculatedPcs, 0)), icon: Hash },
        { title: "Total Amount", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "supplierName", label: "Supplier" },
        { key: "count", label: "Purchase Count", align: "right" },
        { key: "weight", label: "Total Weight (KGs)", align: "right", render: (item) => formatNumber(item.weight) },
        { key: "calculatedPcs", label: "Total PCS", align: "right", render: (item) => formatNumber(item.calculatedPcs) },
        { key: "amount", label: "Total Amount", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        weight: formatNumber(item.weight),
        calculatedPcs: formatNumber(item.calculatedPcs),
        amount: formatCurrency(item.amount)
      })}
      summaryRows={[[{ supplierName: 'TOTAL', count: data.reduce((s,i)=>s+i.count,0).toString(), weight: formatNumber(totalWeight), amount: formatCurrency(totalAmount) }]]}
    />
  );
}
`);

// PurchaseByCategory.tsx
generateFile('PurchaseByCategory', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Package, Activity, DollarSign } from 'lucide-react';

export function PurchaseByCategory() {
  const { purchases, materials, categories } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = purchases.filter(p => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(p.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        if (d < start || d > end) return false;
      }
      return true;
    });

    const categoryMap = new Map();
    filtered.forEach(p => {
      const material = materials.find(m => m.id === p.materialId);
      const categoryName = categories.find(c => c.id === material?.categoryId)?.name || 'Unknown';
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, { categoryName, count: 0, weight: 0, amount: 0 });
      }
      const c = categoryMap.get(categoryName);
      c.count += 1;
      c.weight += p.weight;
      c.amount += p.amount;
    });

    return Array.from(categoryMap.values()).filter(p => !search || p.categoryName.toLowerCase().includes(search.toLowerCase()));
  }, [purchases, materials, categories, dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="Purchase by Category"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Categories Active", value: data.length, icon: Package },
        { title: "Transactions", value: data.reduce((sum, item) => sum + item.count, 0), icon: Activity },
        { title: "Total Value", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "categoryName", label: "Category" },
        { key: "count", label: "Transactions", align: "right" },
        { key: "weight", label: "Total Weight", align: "right", render: (item) => formatNumber(item.weight) },
        { key: "amount", label: "Total Value", align: "right", render: (item) => <span className="font-medium">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        weight: formatNumber(item.weight),
        amount: formatCurrency(item.amount)
      })}
      summaryRows={[[{ categoryName: 'TOTAL', count: data.reduce((s,i)=>s+i.count,0).toString(), amount: formatCurrency(totalAmount) }]]}
    />
  );
}
`);

// PurchaseCostAnalysis.tsx
generateFile('PurchaseCostAnalysis', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Activity, DollarSign, Target } from 'lucide-react';

export function PurchaseCostAnalysis() {
  const { purchases, materials } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = purchases.filter(p => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(p.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        if (d < start || d > end) return false;
      }
      return true;
    });

    const materialMap = new Map();
    filtered.forEach(p => {
      const materialName = materials.find(m => m.id === p.materialId)?.name || 'Unknown';
      if (!materialMap.has(materialName)) {
        materialMap.set(materialName, { materialName, count: 0, weight: 0, amount: 0, minRate: p.ratePerUnit, maxRate: p.ratePerUnit });
      }
      const c = materialMap.get(materialName);
      c.count += 1;
      c.weight += p.weight;
      c.amount += p.amount;
      if (p.ratePerUnit < c.minRate) c.minRate = p.ratePerUnit;
      if (p.ratePerUnit > c.maxRate) c.maxRate = p.ratePerUnit;
    });

    return Array.from(materialMap.values()).map(m => ({
        ...m,
        avgRate: m.amount / (m.weight || 1),
        variance: m.maxRate - m.minRate
    })).filter(p => !search || p.materialName.toLowerCase().includes(search.toLowerCase()));
  }, [purchases, materials, dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="Purchase Cost Analysis"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Materials Analyzed", value: data.length, icon: Target },
        { title: "Total Transactions", value: data.reduce((sum, item) => sum + item.count, 0), icon: Activity },
        { title: "Total Value Analyzed", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "materialName", label: "Material Name" },
        { key: "minRate", label: "Min Rate", align: "right", render: (item) => formatCurrency(item.minRate) },
        { key: "maxRate", label: "Max Rate", align: "right", render: (item) => formatCurrency(item.maxRate) },
        { key: "avgRate", label: "Avg Rate", align: "right", render: (item) => formatCurrency(item.avgRate) },
        { key: "variance", label: "Variance", align: "right", render: (item) => <span className={item.variance > 0 ? "text-rose-600 font-medium" : ""}>{formatCurrency(item.variance)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        minRate: formatCurrency(item.minRate),
        maxRate: formatCurrency(item.maxRate),
        avgRate: formatCurrency(item.avgRate),
        variance: formatCurrency(item.variance)
      })}
    />
  );
}
`);

// PurchaseTrend.tsx
generateFile('PurchaseTrend', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Activity, DollarSign, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export function PurchaseTrend() {
  const { purchases } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = purchases.filter(p => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(p.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        if (d < start || d > end) return false;
      }
      return true;
    });

    const dateMap = new Map();
    filtered.forEach(p => {
      const dateStr = format(new Date(p.date), 'yyyy-MM-dd');
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { dateStr, count: 0, weight: 0, amount: 0 });
      }
      const c = dateMap.get(dateStr);
      c.count += 1;
      c.weight += p.weight;
      c.amount += p.amount;
    });

    return Array.from(dateMap.values())
        .sort((a,b) => a.dateStr.localeCompare(b.dateStr))
        .filter(p => !search || p.dateStr.includes(search));
  }, [purchases, dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="Purchase Trend Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Active Days", value: data.length, icon: Calendar },
        { title: "Total Transactions", value: data.reduce((sum, item) => sum + item.count, 0), icon: Activity },
        { title: "Total Volume", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "dateStr", label: "Date" },
        { key: "count", label: "Transactions", align: "right" },
        { key: "weight", label: "Weight", align: "right", render: (item) => formatNumber(item.weight) },
        { key: "amount", label: "Amount", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        weight: formatNumber(item.weight),
        amount: formatCurrency(item.amount)
      })}
      summaryRows={[[{ dateStr: 'TOTAL', count: data.reduce((s,i)=>s+i.count,0).toString(), amount: formatCurrency(totalAmount) }]]}
    />
  );
}
`);

// SupplierPurchaseReport and MaterialPurchaseReport should exist, let's just make sure they use the GenericTemplate or we can overwrite them to be clean.
generateFile('SupplierPurchaseReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Users, DollarSign, Activity } from 'lucide-react';

export function SupplierPurchaseReport() {
  const { purchases, suppliers } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = purchases.filter(p => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(p.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        if (d < start || d > end) return false;
      }
      return true;
    });

    const supplierMap = new Map();
    filtered.forEach(p => {
      const supplierName = suppliers.find(s => s.id === p.supplierId)?.name || 'Unknown';
      if (!supplierMap.has(supplierName)) {
        supplierMap.set(supplierName, { supplierName, count: 0, weight: 0, amount: 0 });
      }
      const c = supplierMap.get(supplierName);
      c.count += 1;
      c.weight += p.weight;
      c.amount += p.amount;
    });

    return Array.from(supplierMap.values()).filter(p => !search || p.supplierName.toLowerCase().includes(search.toLowerCase()));
  }, [purchases, suppliers, dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="Purchase by Supplier"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Suppliers", value: data.length, icon: Users },
        { title: "Transactions", value: data.reduce((sum, item) => sum + item.count, 0), icon: Activity },
        { title: "Total Amount", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "supplierName", label: "Supplier" },
        { key: "count", label: "Transactions", align: "right" },
        { key: "weight", label: "Total Weight", align: "right", render: (item) => formatNumber(item.weight) },
        { key: "amount", label: "Total Amount", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        weight: formatNumber(item.weight),
        amount: formatCurrency(item.amount)
      })}
      summaryRows={[[{ supplierName: 'TOTAL', count: data.reduce((s,i)=>s+i.count,0).toString(), amount: formatCurrency(totalAmount) }]]}
    />
  );
}
`);

generateFile('MaterialPurchaseReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Package, DollarSign, Activity } from 'lucide-react';

export function MaterialPurchaseReport() {
  const { purchases, materials } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = purchases.filter(p => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(p.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        if (d < start || d > end) return false;
      }
      return true;
    });

    const materialMap = new Map();
    filtered.forEach(p => {
      const materialName = materials.find(m => m.id === p.materialId)?.name || 'Unknown';
      if (!materialMap.has(materialName)) {
        materialMap.set(materialName, { materialName, count: 0, weight: 0, amount: 0 });
      }
      const c = materialMap.get(materialName);
      c.count += 1;
      c.weight += p.weight;
      c.amount += p.amount;
    });

    return Array.from(materialMap.values()).filter(p => !search || p.materialName.toLowerCase().includes(search.toLowerCase()));
  }, [purchases, materials, dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="Purchase by Raw Material"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Materials Active", value: data.length, icon: Package },
        { title: "Transactions", value: data.reduce((sum, item) => sum + item.count, 0), icon: Activity },
        { title: "Total Amount", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "materialName", label: "Material Name" },
        { key: "count", label: "Transactions", align: "right" },
        { key: "weight", label: "Total Weight", align: "right", render: (item) => formatNumber(item.weight) },
        { key: "amount", label: "Total Amount", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        weight: formatNumber(item.weight),
        amount: formatCurrency(item.amount)
      })}
      summaryRows={[[{ materialName: 'TOTAL', count: data.reduce((s,i)=>s+i.count,0).toString(), amount: formatCurrency(totalAmount) }]]}
    />
  );
}
`);

// Write PurchaseReports.tsx (container)
const reportsIndex = `import React from 'react';
import { PurchaseRegister } from './PurchaseRegister';
import { PurchaseSummary } from './PurchaseSummary';
import { PurchaseOrderReport } from './PurchaseOrderReport';
import { SupplierPurchaseReport } from './SupplierPurchaseReport';
import { MaterialPurchaseReport } from './MaterialPurchaseReport';
import { PurchaseByCategory } from './PurchaseByCategory';
import { PurchaseCostAnalysis } from './PurchaseCostAnalysis';
import { PurchaseTrend } from './PurchaseTrend';
import { PurchaseComparisonReport } from './PurchaseComparisonReport';
import { SupplierOutstandingReport } from './SupplierOutstandingReport';
import { SupplierLedgerSummary } from './SupplierLedgerSummary';

const Placeholder = ({ name }: {name:string}) => <div className="p-8 text-center text-muted-foreground">{name} Report will be implemented here.</div>;

export function PurchaseReports({ activeReport }: { activeReport: string }) {
  switch (activeReport) {
    case 'purchase-register': return <PurchaseRegister />;
    case 'purchase-summary': return <PurchaseSummary />;
    case 'purchase-order': return <PurchaseOrderReport />;
    case 'supplier-purchase': return <SupplierPurchaseReport />;
    case 'material-purchase': return <MaterialPurchaseReport />;
    case 'purchase-category': return <PurchaseByCategory />;
    case 'purchase-cost': return <PurchaseCostAnalysis />;
    case 'purchase-trend': return <PurchaseTrend />;
    case 'purchase-comparison': return <PurchaseComparisonReport />;
    case 'supplier-outstanding': return <SupplierOutstandingReport />;
    case 'supplier-ledger': return <SupplierLedgerSummary />;
    default: return <Placeholder name={activeReport} />;
  }
}
`;
fs.writeFileSync(path.join(outDir, 'PurchaseReports.tsx'), reportsIndex);

