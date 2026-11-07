import { useERPStore } from '../../store/useERPStore';
import {
  isManufacturingEnabled,
  lotAverageCost,
  lotStockForProduct,
} from '../business/ManufacturingService';
import { InventoryCalculationService } from '../business/InventoryCalculationService';
import { isAssembled, perUnitRequirement, roundQty } from '../business/ProductAssemblyService';

/**
 * Manufacturing reports read the immutable production trail:
 *   MO → consumptions (batch draws) → finished-goods lot → sale allocations.
 * Nothing here is derived from the legacy material stock model, so a report can
 * never disagree with the ledger or the lot balances.
 */

function inRange(date: string | undefined, range: { start?: string; end?: string } | null | undefined): boolean {
  if (!range?.start || !range?.end) return true;
  if (!date) return false;
  const d = new Date(date);
  const start = new Date(range.start);
  const end = new Date(range.end);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return d >= start && d <= end;
}

export class ManufacturingReportService {
  /** Finished-goods stock per product, valued at the lots' produced cost. */
  static getFinishedGoodsStockData(search: string) {
    const state = useERPStore.getState();
    const { products, finishedGoodsLots, manufacturingOrders } = state;
    const lots = finishedGoodsLots || [];
    return products
      .map(product => {
        const productLots = lots.filter(l => l.productId === product.id && l.status === 'Active');
        const pcs = lotStockForProduct(lots, product.id);
        const avgCost = lotAverageCost(lots, product.id);
        return {
          ...product,
          lotCount: productLots.length,
          currentStock: pcs,
          avgCost,
          stockValue: roundQty(pcs * avgCost),
          orderCount: (manufacturingOrders || []).filter(
            o => o.productId === product.id && o.status === 'Completed',
          ).length,
        };
      })
      .filter(product => !search || product.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.stockValue - a.stockValue || a.name.localeCompare(b.name));
  }

  /** Every component draw made by a completed manufacturing order. */
  static getComponentConsumptionData(dateRange: any, search: string) {
    const state = useERPStore.getState();
    if (!isManufacturingEnabled(state)) return [];
    const { manufacturingOrders, materials, batches, products } = state;
    const rows: Array<Record<string, any>> = [];

    for (const order of manufacturingOrders || []) {
      if (order.status !== 'Completed') continue;
      const lot = (state.finishedGoodsLots || []).find(l => l.id === order.lotId);
      const date = lot?.date || order.date;
      if (!inRange(date, dateRange)) continue;
      const productName = products.find(p => p.id === order.productId)?.name ?? 'Unknown product';

      for (const draw of order.consumptions || []) {
        const material = materials.find(m => m.id === draw.materialId);
        const batch = (batches || []).find(b => b.id === draw.batchId);
        rows.push({
          id: `${order.id}-${draw.batchId}-${draw.materialId}`,
          date,
          orderNo: order.orderNo,
          productName,
          materialName: material?.name ?? 'Unknown material',
          materialCode: material?.code ?? '',
          batchNo: batch?.batchNo ?? '—',
          pcs: draw.pcs,
          costPerPiece: draw.costPerPiece,
          cost: draw.cost,
        });
      }
    }

    return rows
      .filter(row =>
        !search ||
        row.orderNo.toLowerCase().includes(search.toLowerCase()) ||
        row.productName.toLowerCase().includes(search.toLowerCase()) ||
        row.materialName.toLowerCase().includes(search.toLowerCase()) ||
        row.batchNo.toLowerCase().includes(search.toLowerCase()),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.orderNo.localeCompare(a.orderNo));
  }

  /** Cost build-up of every completed manufacturing order. */
  static getProductCostBreakdownData(dateRange: any, search: string) {
    const state = useERPStore.getState();
    if (!isManufacturingEnabled(state)) return [];
    const { manufacturingOrders, products } = state;

    return (manufacturingOrders || [])
      .filter(order => order.status === 'Completed')
      .map(order => {
        const lot = (state.finishedGoodsLots || []).find(l => l.id === order.lotId);
        const date = lot?.date || order.date;
        return {
          ...order,
          date,
          productName: products.find(p => p.id === order.productId)?.name ?? 'Unknown product',
          shortfall: Math.max(0, order.plannedQty - (order.finishedQty || 0)),
          materialCost: order.materialCost || 0,
          productionCost: order.productionCost || 0,
          totalCost: order.totalCost || 0,
          costPerPiece: order.costPerPiece || 0,
        };
      })
      .filter(order => inRange(order.date, dateRange))
      .filter(order => !search || order.orderNo.toLowerCase().includes(search.toLowerCase()) || order.productName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date) || b.orderNo.localeCompare(a.orderNo));
  }

  /**
   * Revenue vs cost per product. Manufacturing sales carry their exact FIFO
   * COGS; pre-v4 sales fall back to the current weighted material cost so the
   * report still covers historical rows without inventing a lot.
   */
  static getProductProfitabilityData(dateRange: any, search: string) {
    const state = useERPStore.getState();
    const { products, sales, batches } = state;
    const map = new Map<string, {
      productId: string;
      productName: string;
      saleCount: number;
      pcsSold: number;
      revenue: number;
      cogs: number;
    }>();

    const legacyCogs = (sale: any, product: any): number => {
      const perUnit = isAssembled(product)
        ? perUnitRequirement(product)
        : new Map<string, number>(product.materialId ? [[product.materialId, 1]] : []);
      let unitCost = 0;
      for (const [materialId, qty] of perUnit) {
        unitCost += qty * InventoryCalculationService.getWeightedAverageCostPerPiece(materialId, batches || []);
      }
      return roundQty(unitCost * (sale.pcsSold || 0));
    };

    for (const sale of sales || []) {
      if (!inRange(sale.date, dateRange)) continue;
      const product = products.find(p => p.id === sale.productId);
      if (!product) continue;
      if (!map.has(product.id)) {
        map.set(product.id, {
          productId: product.id,
          productName: product.name,
          saleCount: 0,
          pcsSold: 0,
          revenue: 0,
          cogs: 0,
        });
      }
      const row = map.get(product.id)!;
      row.saleCount += 1;
      row.pcsSold += sale.pcsSold || 0;
      row.revenue += sale.totalAmount || 0;
      row.cogs += sale.cogsAmount != null ? sale.cogsAmount : legacyCogs(sale, product);
    }

    return [...map.values()]
      .map(row => ({
        ...row,
        profit: roundQty(row.revenue - row.cogs),
        margin: row.revenue > 0 ? (row.revenue - row.cogs) / row.revenue : 0,
      }))
      .filter(row => !search || row.productName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.revenue - a.revenue);
  }
}
