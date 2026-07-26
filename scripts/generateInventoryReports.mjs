import fs from 'fs';
import path from 'path';

const outDir = '/workspace/app-d0luni1anmkh/src/components/reports/inventory';

const generateFile = (name, content) => {
  fs.writeFileSync(path.join(outDir, `${name}.tsx`), content);
};

generateFile('LotHistory', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { PackageSearch, Activity } from 'lucide-react';
import { format } from 'date-fns';

export function LotHistory() {
  const { batches, materials, suppliers } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = batches.filter(b => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(b.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        return d >= start && d <= end;
      }
      return true;
    });

    return filtered.map(b => {
      const materialName = materials.find(m => m.id === b.materialId)?.name || 'Unknown';
      const supplierName = suppliers.find(s => s.id === b.supplierId)?.name || 'Unknown';
      return {
        ...b,
        materialName,
        supplierName
      };
    }).filter(p => !search || p.batchNumber.toLowerCase().includes(search.toLowerCase()) || p.materialName.toLowerCase().includes(search.toLowerCase()));
  }, [batches, materials, suppliers, dateRange, search]);

  return (
    <GenericReportTemplate
      title="Lot / Batch History"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Lots", value: data.length, icon: PackageSearch },
        { title: "Active Lots", value: data.filter(d => d.status === 'Active').length, icon: Activity }
      ]}
      columns={[
        { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "batchNumber", label: "Lot Number" },
        { key: "materialName", label: "Material" },
        { key: "supplierName", label: "Supplier" },
        { key: "initialPcs", label: "Initial PCS", align: "right", render: (item) => formatNumber(item.initialPcs) },
        { key: "remainingPcs", label: "Remaining PCS", align: "right", render: (item) => formatNumber(item.remainingPcs) },
        { key: "status", label: "Status" }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        date: format(new Date(item.date), 'dd-MMM-yyyy'),
        initialPcs: formatNumber(item.initialPcs),
        remainingPcs: formatNumber(item.remainingPcs)
      })}
    />
  );
}
`);

generateFile('StockAdjustmentReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Activity, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export function StockAdjustmentReport() {
  const { inventoryMovements, materials, products } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    // Look for manual adjustments if we supported them, or just use OUT-wastage or IN-adjustment
    let filtered = inventoryMovements.filter(m => {
      // In this system, maybe adjustments are not explicitly defined, but we can filter by certain types if they existed.
      // Let's assume there's a type 'Adjustment'
      if (m.type !== 'Adjustment') return false;

      if (dateRange.start && dateRange.end) {
        const d = new Date(m.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        return d >= start && d <= end;
      }
      return true;
    });

    return filtered.map(m => {
      let itemName = 'Unknown';
      if (m.materialId) itemName = materials.find(x => x.id === m.materialId)?.name || 'Unknown';
      if (m.productId) itemName = products.find(x => x.id === m.productId)?.name || 'Unknown';
      return {
        ...m,
        itemName
      };
    }).filter(p => !search || p.itemName.toLowerCase().includes(search.toLowerCase()) || p.referenceNo.toLowerCase().includes(search.toLowerCase()));
  }, [inventoryMovements, materials, products, dateRange, search]);

  return (
    <GenericReportTemplate
      title="Stock Adjustment Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Adjustments", value: data.length, icon: Activity },
        { title: "Items Affected", value: new Set(data.map(d => d.itemName)).size, icon: AlertCircle }
      ]}
      columns={[
        { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "referenceNo", label: "Ref No" },
        { key: "itemName", label: "Item" },
        { key: "quantity", label: "Qty Adjusted", align: "right", render: (item) => formatNumber(item.quantity) },
        { key: "remarks", label: "Reason" }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        date: format(new Date(item.date), 'dd-MMM-yyyy'),
        quantity: formatNumber(item.quantity)
      })}
    />
  );
}
`);

generateFile('StockLedger', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { PackageSearch, Activity } from 'lucide-react';
import { format } from 'date-fns';

export function StockLedger() {
  const { inventoryMovements, materials, products } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = inventoryMovements.filter(m => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(m.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        return d >= start && d <= end;
      }
      return true;
    });

    // Grouping by item to show ledger summary
    const itemMap = new Map();
    filtered.forEach(m => {
      let itemName = 'Unknown';
      if (m.materialId) itemName = materials.find(x => x.id === m.materialId)?.name || 'Unknown';
      if (m.productId) itemName = products.find(x => x.id === m.productId)?.name || 'Unknown';
      
      if (!itemMap.has(itemName)) {
        itemMap.set(itemName, { itemName, inQty: 0, outQty: 0, transactions: 0 });
      }
      const i = itemMap.get(itemName);
      if (m.type.startsWith('IN')) i.inQty += m.quantity;
      if (m.type.startsWith('OUT')) i.outQty += m.quantity;
      i.transactions += 1;
    });

    return Array.from(itemMap.values()).map(i => ({
        ...i,
        netChange: i.inQty - i.outQty
    })).filter(p => !search || p.itemName.toLowerCase().includes(search.toLowerCase()))
       .sort((a,b) => b.transactions - a.transactions);
  }, [inventoryMovements, materials, products, dateRange, search]);

  return (
    <GenericReportTemplate
      title="Stock Ledger Summary"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Items Active", value: data.length, icon: PackageSearch },
        { title: "Total Transactions", value: data.reduce((sum, item) => sum + item.transactions, 0), icon: Activity }
      ]}
      columns={[
        { key: "itemName", label: "Item Name" },
        { key: "transactions", label: "Transactions", align: "right" },
        { key: "inQty", label: "Total In", align: "right", render: (item) => formatNumber(item.inQty) },
        { key: "outQty", label: "Total Out", align: "right", render: (item) => formatNumber(item.outQty) },
        { key: "netChange", label: "Net Change", align: "right", render: (item) => <span className={item.netChange > 0 ? "text-emerald-600" : (item.netChange < 0 ? "text-rose-600" : "")}>{item.netChange > 0 ? '+' : ''}{formatNumber(item.netChange)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        inQty: formatNumber(item.inQty),
        outQty: formatNumber(item.outQty),
        netChange: \`\${item.netChange > 0 ? '+' : ''}\${formatNumber(item.netChange)}\`
      })}
    />
  );
}
`);


const reportsIndex = `import React from 'react';
import { CurrentStockReport } from './CurrentStockReport';
import { StockMovement } from './StockMovement';
import { RawMaterialStock } from './RawMaterialStock';
import { FinishedGoodsStock } from './FinishedGoodsStock';
import { LowStockReport } from './LowStockReport';
import { OutOfStock } from './OutOfStock';
import { InventoryValuation } from './InventoryValuation';
import { BatchHistory } from './BatchHistory';
import { LotHistory } from './LotHistory';
import { InventoryAging } from './InventoryAging';
import { InventoryTurnover } from './InventoryTurnover';
import { StockAdjustmentReport } from './StockAdjustmentReport';
import { StockLedger } from './StockLedger';

const Placeholder = ({ name }: {name:string}) => <div className="p-8 text-center text-muted-foreground">{name} Report will be implemented here.</div>;

export function InventoryReports({ activeReport }: { activeReport: string }) {
  switch (activeReport) {
    case 'current-stock': return <CurrentStockReport />;
    case 'stock-movement': return <StockMovement />;
    case 'material-stock': return <RawMaterialStock />;
    case 'finished-stock': return <FinishedGoodsStock />;
    case 'low-stock': return <LowStockReport />;
    case 'out-of-stock': return <OutOfStock />;
    case 'inventory-valuation': return <InventoryValuation />;
    case 'batch-history': return <BatchHistory />;
    case 'lot-history': return <LotHistory />;
    case 'inventory-aging': return <InventoryAging />;
    case 'inventory-turnover': return <InventoryTurnover />;
    case 'stock-adjustment': return <StockAdjustmentReport />;
    case 'stock-ledger': return <StockLedger />;
    default: return <Placeholder name={activeReport} />;
  }
}
`;
fs.writeFileSync(path.join(outDir, 'InventoryReports.tsx'), reportsIndex);

