
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
