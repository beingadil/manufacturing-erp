
import { CustomerLedgerSummary } from './CustomerLedgerSummary';
import { CustomerOutstanding } from './CustomerOutstanding';
import { CustomerSalesReport } from './CustomerSalesReport';
import { ProductSalesAnalysis } from './ProductSalesAnalysis';
import { ProductSalesReport } from './ProductSalesReport';
import { ProfitByProduct } from './ProfitByProduct';
import { SalesComparison } from './SalesComparison';
import { SalesRegister } from './SalesRegister';
import { SalesSummary } from './SalesSummary';
import { SalesTrend } from './SalesTrend';

export function SalesReports({ activeReport }: { activeReport: string }) {
  switch (activeReport) {
    case 'sales-register': return <SalesRegister />;
    case 'sales-summary': return <SalesSummary />;
    case 'customer-sales': return <CustomerSalesReport />;
    case 'product-sales': return <ProductSalesReport />;
    case 'sales-trend': return <SalesTrend />;
    case 'product-sales-analysis': return <ProductSalesAnalysis />;
    case 'customer-outstanding': return <CustomerOutstanding />;
    case 'customer-ledger': return <CustomerLedgerSummary />;
    case 'sales-comparison': return <SalesComparison />;
    case 'profit-by-product': return <ProfitByProduct />;
    default: return null;
  }
}
