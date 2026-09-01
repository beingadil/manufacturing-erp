import { AccountSummaryReport } from '../financial/AccountSummaryReport';

import { BalanceSheetReport } from '../financial/BalanceSheetReport';
import { BankBookReport } from '../financial/BankBookReport';
import { CashbookReport } from '../financial/CashbookReport';
import { ExpenseAnalysis } from '../financial/ExpenseAnalysis';
import { GeneralLedgerReport } from '../financial/GeneralLedgerReport';
import { PayableAgingReport } from '../financial/PayableAgingReport';
import { ProfitLossReport } from '../financial/ProfitLossReport';
import { ReceivableAgingReport } from '../financial/ReceivableAgingReport';
import { RevenueAnalysis } from '../financial/RevenueAnalysis';
import { TrialBalanceReport } from '../financial/TrialBalanceReport';
import { CurrentStockReport } from '../inventory/CurrentStockReport';
import { FinishedGoodsStock } from '../inventory/FinishedGoodsStock';
import { InventoryAging } from '../inventory/InventoryAging';
import { InventoryTurnover } from '../inventory/InventoryTurnover';
import { InventoryValuation } from '../inventory/InventoryValuation';
import { LotHistory } from '../inventory/LotHistory';
import { LowStock } from '../inventory/LowStock';
import { OutOfStock } from '../inventory/OutOfStock';
import { RawMaterialStock } from '../inventory/RawMaterialStock';
import { StockAdjustmentReport } from '../inventory/StockAdjustmentReport';
import { StockLedger } from '../inventory/StockLedger';
import { StockMovement } from '../inventory/StockMovement';
import { PendingPCSReport } from '../processing/PendingPCSReport';
import { ProcessingChargesReport } from '../processing/ProcessingChargesReport';
import { ProcessingDispatchReport } from '../processing/ProcessingDispatchReport';
import { ProcessingEfficiency } from '../processing/ProcessingEfficiency';
import { ProcessingLossReport } from '../processing/ProcessingLossReport';
import { ProcessingReceiveReport } from '../processing/ProcessingReceiveReport';
import { ProcessorBillingReport } from '../processing/ProcessorBillingReport';
import { ProcessorLedgerReport } from '../processing/ProcessorLedgerReport';
import { ProcessorPerformance } from '../processing/ProcessorPerformance';
import { MaterialPurchaseReport } from '../purchase/MaterialPurchaseReport';
import { PurchaseByCategory } from '../purchase/PurchaseByCategory';
import { PurchaseComparisonReport } from '../purchase/PurchaseComparisonReport';
import { PurchaseCostAnalysis } from '../purchase/PurchaseCostAnalysis';
import { PurchaseOrderReport } from '../purchase/PurchaseOrderReport';
import { PurchaseRegister } from '../purchase/PurchaseRegister';
import { PurchaseSummary } from '../purchase/PurchaseSummary';
import { PurchaseTrend } from '../purchase/PurchaseTrend';
import { SupplierLedgerSummary } from '../purchase/SupplierLedgerSummary';
import { SupplierOutstandingReport } from '../purchase/SupplierOutstandingReport';
import { SupplierPurchaseReport } from '../purchase/SupplierPurchaseReport';
import { CustomerLedgerSummary } from '../sales/CustomerLedgerSummary';
import { CustomerOutstanding } from '../sales/CustomerOutstanding';
import { ProductSalesAnalysis } from '../sales/ProductSalesAnalysis';
import { ProductSalesReport } from '../sales/ProductSalesReport';
import { ProfitByProduct } from '../sales/ProfitByProduct';
import { SalesComparison } from '../sales/SalesComparison';
import { SalesRegister } from '../sales/SalesRegister';
import { SalesSummary } from '../sales/SalesSummary';
import { SalesTrend } from '../sales/SalesTrend';
import type { ReportCategoryId, ReportDefinition } from './reportTypes';
import { pointInTimeReports, reportDescriptions, reportIcons, reportTags } from './reportMetadata';

const categoryLabels: Record<ReportCategoryId, string> = {
  purchase: 'Purchase Reports', sales: 'Sales Reports', processing: 'Processing Reports',
  inventory: 'Inventory Reports', financial: 'Financial Reports',
};

const entries: Array<[string, ReportCategoryId, string, ReportDefinition['component']]> = [
  ['purchase-register','purchase','Purchase Register',PurchaseRegister],['purchase-summary','purchase','Purchase Summary',PurchaseSummary],['purchase-order','purchase','Purchase Order Report',PurchaseOrderReport],['supplier-purchase','purchase','Purchase by Supplier',SupplierPurchaseReport],['material-purchase','purchase','Purchase by Raw Material',MaterialPurchaseReport],['purchase-category','purchase','Purchase by Category',PurchaseByCategory],['purchase-cost','purchase','Purchase Cost Analysis',PurchaseCostAnalysis],['purchase-trend','purchase','Purchase Trend Report',PurchaseTrend],['purchase-comparison','purchase','Purchase Comparison Report',PurchaseComparisonReport],['supplier-outstanding','purchase','Supplier Outstanding Report',SupplierOutstandingReport],['supplier-ledger','purchase','Supplier Ledger Summary',SupplierLedgerSummary],
  ['sales-register','sales','Sales Register',SalesRegister],['sales-summary','sales','Sales Summary',SalesSummary],['product-sales','sales','Sales by Product',ProductSalesReport],['sales-trend','sales','Sales Trend',SalesTrend],['product-sales-analysis','sales','Product Sales Analysis',ProductSalesAnalysis],['customer-outstanding','sales','Customer Outstanding',CustomerOutstanding],['customer-ledger','sales','Customer Ledger Summary',CustomerLedgerSummary],['sales-comparison','sales','Sales Comparison',SalesComparison],['profit-by-product','sales','Profit by Product',ProfitByProduct],
  ['processing-dispatch','processing','Dispatch Register',ProcessingDispatchReport],['processing-receive','processing','Receive Register',ProcessingReceiveReport],['pending-pcs','processing','Pending PCS Report',PendingPCSReport],['processor-billing','processing','Processing Billing',ProcessorBillingReport],['processor-ledger','processing','Processor Ledger',ProcessorLedgerReport],['processing-charges','processing','Processing Charges',ProcessingChargesReport],['processing-efficiency','processing','Processing Efficiency',ProcessingEfficiency],['processing-loss','processing','Processing Loss/Wastage',ProcessingLossReport],['processor-performance','processing','Processor Performance',ProcessorPerformance],
  ['current-stock','inventory','Current Stock',CurrentStockReport],['stock-movement','inventory','Stock Movement',StockMovement],['material-stock','inventory','Raw Material Stock',RawMaterialStock],['finished-stock','inventory','Finished Goods Stock',FinishedGoodsStock],['low-stock','inventory','Low Stock',LowStock],['out-of-stock','inventory','Out of Stock',OutOfStock],['inventory-valuation','inventory','Inventory Valuation',InventoryValuation],['lot-history','inventory','Lot / Batch History',LotHistory],['inventory-aging','inventory','Inventory Aging',InventoryAging],['inventory-turnover','inventory','Inventory Turnover',InventoryTurnover],['stock-adjustment','inventory','Stock Adjustment Report',StockAdjustmentReport],['stock-ledger','inventory','Stock Ledger',StockLedger],
  ['general-ledger','financial','General Ledger',GeneralLedgerReport],['cashbook','financial','Cashbook',CashbookReport],['bank-book','financial','Bank Book',BankBookReport],['trial-balance','financial','Trial Balance',TrialBalanceReport],['profit-loss','financial','Profit & Loss',ProfitLossReport],['balance-sheet','financial','Balance Sheet',BalanceSheetReport],['account-summary','financial','Account Summary',AccountSummaryReport],['receivable-aging','financial','Accounts Receivable Aging',ReceivableAgingReport],['payable-aging','financial','Accounts Payable Aging',PayableAgingReport],['expense-analysis','financial','Expense Analysis',ExpenseAnalysis],['revenue-analysis','financial','Revenue Analysis',RevenueAnalysis],
];

export const reportDefinitions: Record<string, ReportDefinition> = Object.fromEntries(entries.map(([id, category, title, component]) => [id, {
  id, category, categoryLabel: categoryLabels[category], title, component,
  icon: reportIcons[id],
  description: reportDescriptions[id],
  isPointInTime: pointInTimeReports.has(id),
  tags: reportTags[id],
}]));
export function getReportDefinition(id: string) { return reportDefinitions[id]; }
export function getReportsByCategory(category: ReportCategoryId) { return entries.filter((entry) => entry[1] === category).map(([id]) => reportDefinitions[id]); }
export { categoryLabels };
