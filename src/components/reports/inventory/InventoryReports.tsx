
import { BatchHistory } from './BatchHistory';
import { CurrentStockReport } from './CurrentStockReport';
import { FinishedGoodsStock } from './FinishedGoodsStock';
import { InventoryAging } from './InventoryAging';
import { InventoryTurnover } from './InventoryTurnover';
import { InventoryValuation } from './InventoryValuation';
import { LotHistory } from './LotHistory';
import { LowStockReport } from './LowStockReport';
import { OutOfStock } from './OutOfStock';
import { RawMaterialStock } from './RawMaterialStock';
import { StockAdjustmentReport } from './StockAdjustmentReport';
import { StockLedger } from './StockLedger';
import { StockMovement } from './StockMovement';

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
    default: return null;
  }
}
