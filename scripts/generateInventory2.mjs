import fs from 'fs';
import path from 'path';

const outDir = '/workspace/app-d0luni1anmkh/src/components/reports/inventory';

const generateFile = (name, content) => {
  fs.writeFileSync(path.join(outDir, `${name}.tsx`), content);
};

generateFile('RawMaterialStock', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { PackageSearch, Database } from 'lucide-react';

export function RawMaterialStock() {
  const { materials, inventoryMovements } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    // Only current stock for materials. Date range could be 'as of date', but for simplicity we show current.
    return materials.map(m => {
        const moves = inventoryMovements.filter(mov => mov.materialId === m.id);
        let qty = 0;
        moves.forEach(mov => {
            if (mov.type.startsWith('IN')) qty += mov.quantity;
            if (mov.type.startsWith('OUT')) qty -= mov.quantity;
        });
        return {
            ...m,
            currentStock: qty
        };
    }).filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  }, [materials, inventoryMovements, search]); // ignoring dateRange since stock is absolute

  const totalStock = data.reduce((sum, item) => sum + item.currentStock, 0);

  return (
    <GenericReportTemplate
      title="Raw Material Stock"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Material Types", value: data.length, icon: Database },
        { title: "Total Units in Stock", value: formatNumber(totalStock), icon: PackageSearch }
      ]}
      columns={[
        { key: "name", label: "Material Name" },
        { key: "unit", label: "Unit" },
        { key: "minStockLevel", label: "Min Level", align: "right", render: (item) => formatNumber(item.minStockLevel) },
        { key: "currentStock", label: "Current Stock", align: "right", render: (item) => <span className={item.currentStock <= item.minStockLevel ? "text-rose-600 font-medium" : "text-emerald-600 font-medium"}>{formatNumber(item.currentStock)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentStock: formatNumber(item.currentStock)
      })}
    />
  );
}
`);

generateFile('FinishedGoodsStock', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Package, Database } from 'lucide-react';

export function FinishedGoodsStock() {
  const { products, inventoryMovements } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    return products.map(p => {
        const moves = inventoryMovements.filter(mov => mov.productId === p.id);
        let qty = 0;
        moves.forEach(mov => {
            if (mov.type.startsWith('IN')) qty += mov.quantity;
            if (mov.type.startsWith('OUT')) qty -= mov.quantity;
        });
        return {
            ...p,
            currentStock: qty
        };
    }).filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  }, [products, inventoryMovements, search]);

  const totalStock = data.reduce((sum, item) => sum + item.currentStock, 0);

  return (
    <GenericReportTemplate
      title="Finished Goods Stock"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Product Types", value: data.length, icon: Database },
        { title: "Total PCS in Stock", value: formatNumber(totalStock), icon: Package }
      ]}
      columns={[
        { key: "name", label: "Product Name" },
        { key: "category", label: "Category" },
        { key: "currentStock", label: "Current Stock", align: "right", render: (item) => <span className="font-medium">{formatNumber(item.currentStock)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentStock: formatNumber(item.currentStock)
      })}
    />
  );
}
`);

generateFile('LowStock', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { AlertCircle } from 'lucide-react';

export function LowStock() {
  const { materials, inventoryMovements } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    return materials.map(m => {
        const moves = inventoryMovements.filter(mov => mov.materialId === m.id);
        let qty = 0;
        moves.forEach(mov => {
            if (mov.type.startsWith('IN')) qty += mov.quantity;
            if (mov.type.startsWith('OUT')) qty -= mov.quantity;
        });
        return {
            ...m,
            currentStock: qty
        };
    }).filter(p => p.currentStock <= p.minStockLevel && p.currentStock > 0)
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  }, [materials, inventoryMovements, search]);

  return (
    <GenericReportTemplate
      title="Low Stock Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Low Stock Items", value: data.length, icon: AlertCircle }
      ]}
      columns={[
        { key: "name", label: "Material Name" },
        { key: "minStockLevel", label: "Min Level", align: "right" },
        { key: "currentStock", label: "Current Stock", align: "right", render: (item) => <span className="text-amber-600 font-medium">{formatNumber(item.currentStock)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentStock: formatNumber(item.currentStock)
      })}
    />
  );
}
`);

generateFile('LowStockReport', `import React from 'react';\nimport { LowStock } from './LowStock';\nexport function LowStockReport() { return <LowStock />; }`);

generateFile('OutOfStock', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { AlertOctagon } from 'lucide-react';

export function OutOfStock() {
  const { materials, products, inventoryMovements } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    const outOfStockItems = [];
    
    materials.forEach(m => {
        let qty = 0;
        inventoryMovements.filter(mov => mov.materialId === m.id).forEach(mov => {
            if (mov.type.startsWith('IN')) qty += mov.quantity;
            if (mov.type.startsWith('OUT')) qty -= mov.quantity;
        });
        if (qty <= 0) outOfStockItems.push({ type: 'Material', name: m.name, currentStock: qty });
    });

    products.forEach(p => {
        let qty = 0;
        inventoryMovements.filter(mov => mov.productId === p.id).forEach(mov => {
            if (mov.type.startsWith('IN')) qty += mov.quantity;
            if (mov.type.startsWith('OUT')) qty -= mov.quantity;
        });
        if (qty <= 0) outOfStockItems.push({ type: 'Product', name: p.name, currentStock: qty });
    });

    return outOfStockItems.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  }, [materials, products, inventoryMovements, search]);

  return (
    <GenericReportTemplate
      title="Out of Stock Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Out of Stock Items", value: data.length, icon: AlertOctagon }
      ]}
      columns={[
        { key: "type", label: "Item Type" },
        { key: "name", label: "Item Name" },
        { key: "currentStock", label: "Current Stock", align: "right", render: (item) => <span className="text-rose-600 font-medium">0</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentStock: '0'
      })}
    />
  );
}
`);

generateFile('InventoryValuation', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Database, DollarSign } from 'lucide-react';

export function InventoryValuation() {
  const { materials, products, inventoryMovements } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    const valuation = [];
    
    materials.forEach(m => {
        let qty = 0;
        inventoryMovements.filter(mov => mov.materialId === m.id).forEach(mov => {
            if (mov.type.startsWith('IN')) qty += mov.quantity;
            if (mov.type.startsWith('OUT')) qty -= mov.quantity;
        });
        if (qty > 0) {
            // Approximation: normally derived from weighted average cost. For this demo, random or 0.
            const cost = 150; // Mock cost per unit
            valuation.push({ type: 'Material', name: m.name, qty, cost, totalValue: qty * cost });
        }
    });

    products.forEach(p => {
        let qty = 0;
        inventoryMovements.filter(mov => mov.productId === p.id).forEach(mov => {
            if (mov.type.startsWith('IN')) qty += mov.quantity;
            if (mov.type.startsWith('OUT')) qty -= mov.quantity;
        });
        if (qty > 0) {
            const cost = p.price || 500; // Mock cost for product
            valuation.push({ type: 'Product', name: p.name, qty, cost, totalValue: qty * cost });
        }
    });

    return valuation.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  }, [materials, products, inventoryMovements, search]);

  const totalValue = data.reduce((sum, item) => sum + item.totalValue, 0);

  return (
    <GenericReportTemplate
      title="Inventory Valuation"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Valued Items", value: data.length, icon: Database },
        { title: "Total Value", value: formatCurrency(totalValue), icon: DollarSign }
      ]}
      columns={[
        { key: "type", label: "Item Type" },
        { key: "name", label: "Item Name" },
        { key: "qty", label: "Qty in Stock", align: "right", render: (item) => formatNumber(item.qty) },
        { key: "cost", label: "Est. Cost/Unit", align: "right", render: (item) => formatCurrency(item.cost) },
        { key: "totalValue", label: "Total Value", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.totalValue)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        qty: formatNumber(item.qty),
        cost: formatCurrency(item.cost),
        totalValue: formatCurrency(item.totalValue)
      })}
      summaryRows={[[{ name: 'TOTAL VALUATION', totalValue: formatCurrency(totalValue) }]]}
    />
  );
}
`);

generateFile('InventoryTurnover', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Activity, RefreshCcw } from 'lucide-react';

export function InventoryTurnover() {
  const { products, inventoryMovements } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    return products.map(p => {
        let totalOut = 0;
        let currentQty = 0;

        inventoryMovements.filter(mov => mov.productId === p.id).forEach(mov => {
            if (mov.type.startsWith('OUT')) totalOut += mov.quantity;
            if (mov.type.startsWith('IN')) currentQty += mov.quantity;
            if (mov.type.startsWith('OUT')) currentQty -= mov.quantity;
        });

        // Turnover Ratio = COGS (Total Out) / Avg Inventory (using Current for simplicity)
        const avgInv = currentQty || 1; 
        const turnoverRate = totalOut / avgInv;

        return {
            name: p.name,
            totalOut,
            currentQty,
            turnoverRate
        };
    }).filter(p => p.totalOut > 0)
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a,b) => b.turnoverRate - a.turnoverRate);
  }, [products, inventoryMovements, search]);

  return (
    <GenericReportTemplate
      title="Inventory Turnover"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Products Analyzed", value: data.length, icon: Activity }
      ]}
      columns={[
        { key: "name", label: "Product Name" },
        { key: "totalOut", label: "Units Sold/Dispatched", align: "right", render: (item) => formatNumber(item.totalOut) },
        { key: "currentQty", label: "Current Stock", align: "right", render: (item) => formatNumber(item.currentQty) },
        { key: "turnoverRate", label: "Turnover Ratio", align: "right", render: (item) => <span className="font-medium text-emerald-600">{item.turnoverRate.toFixed(2)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        totalOut: formatNumber(item.totalOut),
        currentQty: formatNumber(item.currentQty),
        turnoverRate: item.turnoverRate.toFixed(2)
      })}
    />
  );
}
`);

// The remaining: BatchHistory (duplicate of LotHistory), InventoryAging, StockMovement
generateFile('BatchHistory', `import React from 'react';\nimport { LotHistory } from './LotHistory';\nexport function BatchHistory() { return <LotHistory />; }`);

generateFile('InventoryAging', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Clock } from 'lucide-react';
import { differenceInDays } from 'date-fns';

export function InventoryAging() {
  const { batches, materials } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    const today = new Date();
    return batches.filter(b => b.remainingPcs > 0).map(b => {
      const materialName = materials.find(m => m.id === b.materialId)?.name || 'Unknown';
      const daysOld = differenceInDays(today, new Date(b.date));
      let bracket = '0-30 Days';
      if (daysOld > 90) bracket = '> 90 Days';
      else if (daysOld > 60) bracket = '61-90 Days';
      else if (daysOld > 30) bracket = '31-60 Days';

      return {
        ...b,
        materialName,
        daysOld,
        bracket
      };
    }).filter(p => !search || p.batchNumber.toLowerCase().includes(search.toLowerCase()) || p.materialName.toLowerCase().includes(search.toLowerCase()))
      .sort((a,b) => b.daysOld - a.daysOld);
  }, [batches, materials, search]);

  return (
    <GenericReportTemplate
      title="Inventory Aging Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Active Batches", value: data.length, icon: Clock }
      ]}
      columns={[
        { key: "batchNumber", label: "Batch/Lot" },
        { key: "materialName", label: "Material" },
        { key: "remainingPcs", label: "Remaining PCS", align: "right", render: (item) => formatNumber(item.remainingPcs) },
        { key: "daysOld", label: "Age (Days)", align: "right", render: (item) => <span className={item.daysOld > 90 ? "text-rose-600 font-medium" : ""}>{item.daysOld}</span> },
        { key: "bracket", label: "Aging Bracket" }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        remainingPcs: formatNumber(item.remainingPcs)
      })}
    />
  );
}
`);

generateFile('StockMovement', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Activity } from 'lucide-react';
import { format } from 'date-fns';

export function StockMovement() {
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

    return filtered.map(m => {
      let itemName = 'Unknown';
      if (m.materialId) itemName = materials.find(x => x.id === m.materialId)?.name || 'Unknown';
      if (m.productId) itemName = products.find(x => x.id === m.productId)?.name || 'Unknown';
      
      return {
        ...m,
        itemName
      };
    }).filter(p => !search || p.itemName.toLowerCase().includes(search.toLowerCase()) || p.referenceNo.toLowerCase().includes(search.toLowerCase()))
      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inventoryMovements, materials, products, dateRange, search]);

  return (
    <GenericReportTemplate
      title="Stock Movement Log"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Movements", value: data.length, icon: Activity }
      ]}
      columns={[
        { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "type", label: "Type", render: (item) => <span className={item.type.startsWith('IN') ? "text-emerald-600" : "text-rose-600"}>{item.type}</span> },
        { key: "itemName", label: "Item Name" },
        { key: "referenceNo", label: "Reference" },
        { key: "quantity", label: "Quantity", align: "right", render: (item) => formatNumber(item.quantity) }
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

