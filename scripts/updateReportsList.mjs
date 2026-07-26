import fs from 'fs';
import path from 'path';

const reportsPath = '/workspace/app-d0luni1anmkh/src/pages/Reports.tsx';

const content = `import React, { useState } from 'react';
import { 
  ShoppingCart, DollarSign, Factory, 
  PackageSearch, Calculator, ChevronRight 
} from "lucide-react";
import { cn } from "../lib/utils";

import { PurchaseReports } from '../components/reports/purchase/PurchaseReports';
import { SalesReports } from '../components/reports/sales/SalesReports';
import { ProcessingReports } from '../components/reports/processing/ProcessingReports';
import { InventoryReports } from '../components/reports/inventory/InventoryReports';
import { FinancialReports } from '../components/reports/financial/FinancialReports';

const REPORT_CATEGORIES = [
  {
    id: 'purchase',
    label: 'Purchase Reports',
    icon: ShoppingCart,
    reports: [
      { id: 'purchase-register', label: 'Purchase Register' },
      { id: 'purchase-summary', label: 'Purchase Summary' },
      { id: 'purchase-order', label: 'Purchase Order Report' },
      { id: 'supplier-purchase', label: 'Purchase by Supplier' },
      { id: 'material-purchase', label: 'Purchase by Raw Material' },
      { id: 'purchase-category', label: 'Purchase by Category' },
      { id: 'purchase-cost', label: 'Purchase Cost Analysis' },
      { id: 'purchase-trend', label: 'Purchase Trend Report' },
      { id: 'purchase-comparison', label: 'Purchase Comparison Report' },
      { id: 'supplier-outstanding', label: 'Supplier Outstanding Report' },
      { id: 'supplier-ledger', label: 'Supplier Ledger Summary' }
    ]
  },
  {
    id: 'sales',
    label: 'Sales Reports',
    icon: DollarSign,
    reports: [
      { id: 'sales-register', label: 'Sales Register' },
      { id: 'sales-summary', label: 'Sales Summary' },
      { id: 'customer-sales', label: 'Sales by Customer' },
      { id: 'product-sales', label: 'Sales by Product' },
      { id: 'sales-trend', label: 'Sales Trend' },
      { id: 'product-sales-analysis', label: 'Product Sales Analysis' },
      { id: 'customer-outstanding', label: 'Customer Outstanding' },
      { id: 'customer-ledger', label: 'Customer Ledger Summary' },
      { id: 'sales-comparison', label: 'Sales Comparison' },
      { id: 'profit-by-product', label: 'Profit by Product' }
    ]
  },
  {
    id: 'processing',
    label: 'Processing Reports',
    icon: Factory,
    reports: [
      { id: 'processing-dispatch', label: 'Dispatch Register' },
      { id: 'processing-receive', label: 'Receive Register' },
      { id: 'pending-processing', label: 'Pending Processing' },
      { id: 'processor-billing', label: 'Processing Billing' },
      { id: 'processor-ledger', label: 'Processor Ledger' },
      { id: 'processing-charges', label: 'Processing Charges' },
      { id: 'processing-efficiency', label: 'Processing Efficiency' },
      { id: 'processing-loss', label: 'Processing Loss/Wastage' },
      { id: 'processor-performance', label: 'Processor Performance' },
      { id: 'pending-pcs', label: 'Pending PCS Report' }
    ]
  },
  {
    id: 'inventory',
    label: 'Inventory Reports',
    icon: PackageSearch,
    reports: [
      { id: 'current-stock', label: 'Current Stock' },
      { id: 'stock-movement', label: 'Stock Movement' },
      { id: 'material-stock', label: 'Raw Material Stock' },
      { id: 'finished-stock', label: 'Finished Goods Stock' },
      { id: 'low-stock', label: 'Low Stock' },
      { id: 'out-of-stock', label: 'Out of Stock' },
      { id: 'inventory-valuation', label: 'Inventory Valuation' },
      { id: 'batch-history', label: 'Batch History' },
      { id: 'lot-history', label: 'Lot History' },
      { id: 'inventory-aging', label: 'Inventory Aging' },
      { id: 'inventory-turnover', label: 'Inventory Turnover' },
      { id: 'stock-adjustment', label: 'Stock Adjustment Report' },
      { id: 'stock-ledger', label: 'Stock Ledger' }
    ]
  },
  {
    id: 'financial',
    label: 'Financial Reports',
    icon: Calculator,
    reports: [
      { id: 'general-ledger', label: 'General Ledger' },
      { id: 'cashbook', label: 'Cashbook' },
      { id: 'bank-book', label: 'Bank Book' },
      { id: 'trial-balance', label: 'Trial Balance' },
      { id: 'profit-loss', label: 'Profit & Loss' },
      { id: 'balance-sheet', label: 'Balance Sheet' },
      { id: 'cash-flow', label: 'Cash Flow Statement' },
      { id: 'journal-register', label: 'Journal Register' },
      { id: 'voucher-register', label: 'Voucher Register' },
      { id: 'account-summary', label: 'Account Summary' },
      { id: 'receivable-aging', label: 'Accounts Receivable Aging' },
      { id: 'payable-aging', label: 'Accounts Payable Aging' },
      { id: 'expense-analysis', label: 'Expense Analysis' },
      { id: 'revenue-analysis', label: 'Revenue Analysis' }
    ]
  }
];

export function Reports() {
  const [activeCategory, setActiveCategory] = useState('purchase');
  const [activeReport, setActiveReport] = useState('purchase-register');

  const currentCategory = REPORT_CATEGORIES.find(c => c.id === activeCategory);
  const currentReportName = currentCategory?.reports.find(r => r.id === activeReport)?.label || '';

  const renderContent = () => {
    switch (activeCategory) {
      case 'purchase': return <PurchaseReports activeReport={activeReport} />;
      case 'sales': return <SalesReports activeReport={activeReport} />;
      case 'processing': return <ProcessingReports activeReport={activeReport} />;
      case 'inventory': return <InventoryReports activeReport={activeReport} />;
      case 'financial': return <FinancialReports activeReport={activeReport} />;
      default: return <div>Report not found</div>;
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] -m-4 sm:-m-6 lg:-m-8">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card overflow-y-auto hidden md:block">
        <div className="p-4 border-b border-border/50 sticky top-0 bg-card z-10">
          <h2 className="text-lg font-bold tracking-tight">Report Center</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Enterprise Analytics</p>
        </div>
        <div className="p-3 space-y-6">
          {REPORT_CATEGORIES.map((category) => (
            <div key={category.id} className="space-y-1">
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <category.icon className="h-3.5 w-3.5" />
                {category.label}
              </div>
              <div className="space-y-0.5 ml-1 border-l border-border/50 pl-2">
                {category.reports.map((report) => (
                  <button
                    key={report.id}
                    onClick={() => {
                      setActiveCategory(category.id);
                      setActiveReport(report.id);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors",
                      activeCategory === category.id && activeReport === report.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {report.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile Category Select */}
      <div className="md:hidden w-full border-b border-border bg-card p-4 absolute top-16 left-0 right-0 z-20">
        <select
          value={\`\${activeCategory}:\${activeReport}\`}
          onChange={(e) => {
            const [cat, rep] = e.target.value.split(':');
            setActiveCategory(cat);
            setActiveReport(rep);
          }}
          className="w-full bg-muted border-none rounded-xl text-sm font-medium py-2 px-3 focus:ring-2 focus:ring-primary"
        >
          {REPORT_CATEGORIES.map(cat => (
            <optgroup key={cat.id} label={cat.label}>
              {cat.reports.map(rep => (
                <option key={rep.id} value={\`\${cat.id}:\${rep.id}\`}>{rep.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#F8F9FB] dark:bg-background pt-16 md:pt-0">
        <div className="p-4 sm:p-6 lg:p-8 flex-1 overflow-y-auto">
          {/* Breadcrumb & Header */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <span>{currentCategory?.label}</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{currentReportName}</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{currentReportName}</h1>
            </div>
          </div>

          {/* Report Content Component */}
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(reportsPath, content);
