import React from 'react';
import { SalesRegister } from './SalesRegister';
import { SalesSummary } from './SalesSummary';
import { CustomerSalesReport } from './CustomerSalesReport';
import { ProductSalesReport } from './ProductSalesReport';
import { SalesTrend } from './SalesTrend';
import { ProductSalesAnalysis } from './ProductSalesAnalysis';
import { CustomerOutstanding } from './CustomerOutstanding';
import { CustomerLedgerSummary } from './CustomerLedgerSummary';
import { SalesComparison } from './SalesComparison';
import { ProfitByProduct } from './ProfitByProduct';

const Placeholder = ({ name }: {name:string}) => <div className="p-8 text-center text-muted-foreground">{name} Report will be implemented here.</div>;

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
    default: return <Placeholder name={activeReport} />;
  }
}
