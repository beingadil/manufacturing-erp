
import { MaterialPurchaseReport } from './MaterialPurchaseReport';
import { PurchaseByCategory } from './PurchaseByCategory';
import { PurchaseComparisonReport } from './PurchaseComparisonReport';
import { PurchaseCostAnalysis } from './PurchaseCostAnalysis';
import { PurchaseOrderReport } from './PurchaseOrderReport';
import { PurchaseRegister } from './PurchaseRegister';
import { PurchaseSummary } from './PurchaseSummary';
import { PurchaseTrend } from './PurchaseTrend';
import { SupplierLedgerSummary } from './SupplierLedgerSummary';
import { SupplierOutstandingReport } from './SupplierOutstandingReport';
import { SupplierPurchaseReport } from './SupplierPurchaseReport';

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
    default: return null;
  }
}
