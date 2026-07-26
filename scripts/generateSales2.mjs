import fs from 'fs';
import path from 'path';

const outDir = '/workspace/app-d0luni1anmkh/src/components/reports/sales';

const generateFile = (name, content) => {
  fs.writeFileSync(path.join(outDir, `${name}.tsx`), content);
};

generateFile('SalesTrend', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Activity, DollarSign, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export function SalesTrend() {
  const { sales } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = sales.filter(p => {
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
        dateMap.set(dateStr, { dateStr, count: 0, pcs: 0, amount: 0 });
      }
      const c = dateMap.get(dateStr);
      c.count += 1;
      c.pcs += p.pcsSold;
      c.amount += p.totalAmount;
    });

    return Array.from(dateMap.values())
        .sort((a,b) => a.dateStr.localeCompare(b.dateStr))
        .filter(p => !search || p.dateStr.includes(search));
  }, [sales, dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="Sales Trend Report"
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
        { key: "pcs", label: "PCS Sold", align: "right", render: (item) => formatNumber(item.pcs) },
        { key: "amount", label: "Amount", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        pcs: formatNumber(item.pcs),
        amount: formatCurrency(item.amount)
      })}
    />
  );
}
`);

generateFile('TopSellingProducts', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Package, DollarSign, Target } from 'lucide-react';

export function TopSellingProducts() {
  const { sales, products } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = sales.filter(p => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(p.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        if (d < start || d > end) return false;
      }
      return true;
    });

    const prodMap = new Map();
    filtered.forEach(p => {
      const prod = products.find(m => m.id === p.productId)?.name || 'Unknown';
      if (!prodMap.has(prod)) {
        prodMap.set(prod, { productName: prod, count: 0, pcs: 0, amount: 0 });
      }
      const c = prodMap.get(prod);
      c.count += 1;
      c.pcs += p.pcsSold;
      c.amount += p.totalAmount;
    });

    return Array.from(prodMap.values())
        .sort((a,b) => b.amount - a.amount)
        .filter(p => !search || p.productName.toLowerCase().includes(search.toLowerCase()));
  }, [sales, products, dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <GenericReportTemplate
      title="Top Selling Products"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Products Sold", value: data.length, icon: Package },
        { title: "Highest Sales", value: data.length > 0 ? data[0].productName : 'N/A', icon: Target },
        { title: "Total Revenue", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "productName", label: "Product" },
        { key: "count", label: "Transactions", align: "right" },
        { key: "pcs", label: "PCS Sold", align: "right", render: (item) => formatNumber(item.pcs) },
        { key: "amount", label: "Revenue", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        pcs: formatNumber(item.pcs),
        amount: formatCurrency(item.amount)
      })}
    />
  );
}
`);

