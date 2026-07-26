import React from 'react';
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
