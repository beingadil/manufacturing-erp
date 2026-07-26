import { useERPStore } from '../../store/useERPStore';
import { ReportEngine } from './ReportEngine';
import { differenceInDays } from 'date-fns';
import { InventoryCalculationService } from '../business/InventoryCalculationService';

export class InventoryReportService {
  static getCurrentStock(searchQuery: string) {
    const { materials, products, categories, processingReceipts, sales } = useERPStore.getState();

    const rawMaterials = materials.map((m: any) => {
      const category = categories.find((c: any) => c.id === m.categoryId);
      return {
        id: m.id,
        type: 'Raw Material',
        name: m.name,
        categoryName: category?.name || 'Unknown',
        stockPcs: m.stockPcs || 0,
        status: (m.stockPcs || 0) === 0 ? 'Out of Stock' : (m.stockPcs || 0) < 500 ? 'Low Stock' : 'In Stock'
      };
    });

    const finishedGoods = products.map((p: any) => {
      const stock = InventoryCalculationService.calculateFinishedProductStock(p.materialId, processingReceipts, sales);
      return {
        id: p.id,
        type: 'Finished Good',
        name: p.name,
        categoryName: 'Product',
        stockPcs: stock,
        status: stock === 0 ? 'Out of Stock' : stock < 50 ? 'Low Stock' : 'In Stock'
      };
    });

    const allStock = [...rawMaterials, ...finishedGoods];
    return ReportEngine.search(allStock, searchQuery, ['name', 'categoryName', 'type']);
  }


  static getCurrentStockReportData() {
    const state = useERPStore.getState();
    const { materials, purchases } = state;
    return materials.map((m: any) => {
const recentPurchase = purchases.find(p => p.materialId === m.id);
const costPerPc = recentPurchase ? (recentPurchase.amount / recentPurchase.calculatedPcs) : 0;
const value = (m.stockPcs + m.processedStockPcs + (m.atProcessorPcs || 0)) * costPerPc;
const category = useERPStore.getState().categories.find((c: any) => c.id === m.categoryId)?.name || 'Unknown';

return {
  ...m,
  categoryName: category,
  costPerPc,
  value
};
})
  }


  static getFinishedGoodsStockData(search: any) {
    const state = useERPStore.getState();
    const { products, inventoryMovements } = state;
    return products.map(p => {
    const moves = inventoryMovements.filter(mov => (mov as any).productId === p.id);
    let qty = 0;
    moves.forEach(mov => {
        if (mov.transactionType.startsWith('IN')) qty += mov.quantity;
        if (mov.transactionType.startsWith('OUT')) qty -= mov.quantity;
    });
    return {
        ...p,
        currentStock: qty
    };
}).filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  }


  static getInventoryAgingData(search: any) {
    const state = useERPStore.getState();
    const { batches, materials } = state;
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
}).filter(p => !search || p.batchNo.toLowerCase().includes(search.toLowerCase()) || p.materialName.toLowerCase().includes(search.toLowerCase()))
  .sort((a,b) => b.daysOld - a.daysOld);
  }


  static getInventoryTurnoverData(search: any) {
    const state = useERPStore.getState();
    const { products, inventoryMovements } = state;
    return products.map(p => {
    let totalOut = 0;
    let currentQty = 0;

    inventoryMovements.filter(mov => (mov as any).productId === p.id).forEach(mov => {
        if (mov.transactionType.startsWith('OUT')) totalOut += mov.quantity;
        if (mov.transactionType.startsWith('IN')) currentQty += mov.quantity;
        if (mov.transactionType.startsWith('OUT')) currentQty -= mov.quantity;
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
  }


  static getInventoryValuationData(search: any) {
    const state = useERPStore.getState();
    const { materials, products, inventoryMovements } = state;
    const valuation: any[] = [];

materials.forEach(m => {
    let qty = 0;
    inventoryMovements.filter(mov => mov.materialId === m.id).forEach(mov => {
        if (mov.transactionType.startsWith('IN')) qty += mov.quantity;
        if (mov.transactionType.startsWith('OUT')) qty -= mov.quantity;
    });
    if (qty > 0) {
        // Approximation: normally derived from weighted average cost. For this demo, random or 0.
        const cost = 150; // Mock cost per unit
        valuation.push({ type: 'Material', name: m.name, qty, cost, totalValue: qty * cost });
    }
});

products.forEach(p => {
    let qty = 0;
    inventoryMovements.filter(mov => (mov as any).productId === p.id).forEach(mov => {
        if (mov.transactionType.startsWith('IN')) qty += mov.quantity;
        if (mov.transactionType.startsWith('OUT')) qty -= mov.quantity;
    });
    if (qty > 0) {
        const cost = (p as any).price || 500; // Mock cost for product
        valuation.push({ type: 'Product', name: p.name, qty, cost, totalValue: qty * cost });
    }
});

return valuation.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  }


  static getLotHistoryData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { batches, materials, suppliers } = state;
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
}).filter(p => !search || p.batchNo.toLowerCase().includes(search.toLowerCase()) || p.materialName.toLowerCase().includes(search.toLowerCase()));
  }


  static getLowStockData(search: any) {
    const state = useERPStore.getState();
    const { materials, inventoryMovements } = state;
    return materials.map(m => {
    const moves = inventoryMovements.filter(mov => mov.materialId === m.id);
    let qty = 0;
    moves.forEach(mov => {
        if (mov.transactionType.startsWith('IN')) qty += mov.quantity;
        if (mov.transactionType.startsWith('OUT')) qty -= mov.quantity;
    });
    return {
        ...m,
        currentStock: qty
    };
}).filter(p => p.currentStock <= ((p as any).minStockLevel || 0) && p.currentStock > 0)
  .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  }


  static getOutOfStockData(search: any) {
    const state = useERPStore.getState();
    const { materials, products, inventoryMovements } = state;
    const outOfStockItems: any[] = [];

materials.forEach(m => {
    let qty = 0;
    inventoryMovements.filter(mov => mov.materialId === m.id).forEach(mov => {
        if (mov.transactionType.startsWith('IN')) qty += mov.quantity;
        if (mov.transactionType.startsWith('OUT')) qty -= mov.quantity;
    });
    if (qty <= 0) outOfStockItems.push({ type: 'Material', name: m.name, currentStock: qty });
});

products.forEach(p => {
    let qty = 0;
    inventoryMovements.filter(mov => (mov as any).productId === p.id).forEach(mov => {
        if (mov.transactionType.startsWith('IN')) qty += mov.quantity;
        if (mov.transactionType.startsWith('OUT')) qty -= mov.quantity;
    });
    if (qty <= 0) outOfStockItems.push({ type: 'Product', name: p.name, currentStock: qty });
});

return outOfStockItems.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  }


  static getRawMaterialStockData(search: any) {
    const state = useERPStore.getState();
    const { materials, inventoryMovements } = state;
    // Only current stock for materials. Date range could be 'as of date', but for simplicity we show current.
return materials.map(m => {
    const moves = inventoryMovements.filter(mov => mov.materialId === m.id);
    let qty = 0;
    moves.forEach(mov => {
        if (mov.transactionType.startsWith('IN')) qty += mov.quantity;
        if (mov.transactionType.startsWith('OUT')) qty -= mov.quantity;
    });
    return {
        ...m,
        currentStock: qty
    };
}).filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  }


  static getStockAdjustmentReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { inventoryMovements, materials, products } = state;
    // Look for manual adjustments if we supported them, or just use OUT-wastage or IN-adjustment
let filtered = inventoryMovements.filter(m => {
  // In this system, maybe adjustments are not explicitly defined, but we can filter by certain types if they existed.
  // Let's assume there's a type 'Adjustment'
  if (m.module !== 'Adjustment') return false;

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
  if ((m as any).productId) itemName = products.find(x => x.id === (m as any).productId)?.name || 'Unknown';
  return {
    ...m,
    itemName
  };
}).filter(p => !search || p.itemName.toLowerCase().includes(search.toLowerCase()) || p.referenceNo.toLowerCase().includes(search.toLowerCase()));
  }


  static getStockLedgerData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { inventoryMovements, materials, products } = state;
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
  if ((m as any).productId) itemName = products.find(x => x.id === (m as any).productId)?.name || 'Unknown';
  
  if (!itemMap.has(itemName)) {
    itemMap.set(itemName, { itemName, inQty: 0, outQty: 0, transactions: 0 });
  }
  const i = itemMap.get(itemName);
  if (m.transactionType.startsWith('IN')) i.inQty += m.quantity;
  if (m.transactionType.startsWith('OUT')) i.outQty += m.quantity;
  i.transactions += 1;
});

return Array.from(itemMap.values()).map(i => ({
    ...i,
    netChange: i.inQty - i.outQty
})).filter(p => !search || p.itemName.toLowerCase().includes(search.toLowerCase()))
   .sort((a,b) => b.transactions - a.transactions);
  }


  static getStockMovementData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { inventoryMovements, materials, products } = state;
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
  if ((m as any).productId) itemName = products.find(x => x.id === (m as any).productId)?.name || 'Unknown';
  
  return {
    ...m,
    itemName
  };
}).filter(p => !search || p.itemName.toLowerCase().includes(search.toLowerCase()) || p.referenceNo.toLowerCase().includes(search.toLowerCase()))
  .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

}