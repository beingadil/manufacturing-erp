import { Calculator, ChevronDown, ChevronRight, ChevronUp,DollarSign, Factory, FileBarChart2, 
  PackageSearch, 
  Search, 
  ShoppingCart, X 
} from "lucide-react";
import { useMemo, useState } from 'react';
import { FinancialReports } from '../components/reports/financial/FinancialReports';
import { InventoryReports } from '../components/reports/inventory/InventoryReports';
import { ProcessingReports } from '../components/reports/processing/ProcessingReports';
import { PurchaseReports } from '../components/reports/purchase/PurchaseReports';
import { SalesReports } from '../components/reports/sales/SalesReports';
import { DrillDownProvider } from '../contexts/DrillDownContext';
import { cn } from "../lib/utils";

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
      { id: 'account-summary', label: 'Account Summary' },
      { id: 'receivable-aging', label: 'Accounts Receivable Aging' },
      { id: 'payable-aging', label: 'Accounts Payable Aging' },
      { id: 'expense-analysis', label: 'Expense Analysis' },
      { id: 'revenue-analysis', label: 'Revenue Analysis' }
    ]
  }
];

const TOTAL_REPORTS = REPORT_CATEGORIES.reduce((sum, c) => sum + c.reports.length, 0);

interface SearchResult {
  id: string;
  label: string;
  categoryId: string;
  categoryLabel: string;
}

export function Reports() {
  const [activeCategory, setActiveCategory] = useState('purchase');
  const [activeReport, setActiveReport] = useState('purchase-register');
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const currentCategory = REPORT_CATEGORIES.find(c => c.id === activeCategory);
  const currentReportName = currentCategory?.reports.find(r => r.id === activeReport)?.label || '';

  const searchActive = searchTerm.trim().length > 0;

  const filteredResults = useMemo<SearchResult[]>(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    const results: SearchResult[] = [];
    REPORT_CATEGORIES.forEach((cat) => {
      cat.reports
        .filter(r => r.label.toLowerCase().includes(term))
        .forEach(r => results.push({ id: r.id, label: r.label, categoryId: cat.id, categoryLabel: cat.label }));
    });
    return results;
  }, [searchTerm]);

  const selectReport = (catId: string, repId: string) => {
    setActiveCategory(catId);
    setActiveReport(repId);
  };

  const selectSearchResult = (result: SearchResult) => {
    selectReport(result.categoryId, result.id);
    setSearchTerm('');
  };

  const toggleCollapsed = (catId: string) => {
    setCollapsed(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

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

  const CategoryIcon = currentCategory?.icon ?? FileBarChart2;

  return (
    <DrillDownProvider>
      <div className="flex h-[calc(100vh-64px)] -m-4 sm:-m-6 lg:-m-8 relative">
      {/* Sidebar */}
      <div className="w-72 border-r border-border bg-card overflow-y-auto hidden md:block shrink-0">
        <div className="p-4 border-b border-border/50 sticky top-0 bg-card z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Report Center</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{TOTAL_REPORTS} reports · 5 categories</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileBarChart2 className="h-5 w-5" />
            </div>
          </div>
          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search reports..."
              className="w-full h-9 pl-9 pr-8 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            />
            {searchActive && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="p-3">
          {searchActive ? (
            /* ---- Search results ---- */
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {filteredResults.length > 0 ? `${filteredResults.length} result${filteredResults.length === 1 ? '' : 's'}` : 'No results'}
              </div>
              {filteredResults.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <FileBarChart2 className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No reports match</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Try a different keyword</p>
                </div>
              ) : (
                filteredResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => selectSearchResult(result)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg transition-colors group",
                      activeReport === result.id && activeCategory === result.categoryId
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span className="text-sm font-medium flex items-center gap-2">
                      {result.label}
                      <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                    <span className="block text-[10px] text-muted-foreground/80 mt-0.5">{result.categoryLabel}</span>
                  </button>
                ))
              )}
            </div>
          ) : (
            /* ---- Category groups ---- */
            <div className="space-y-2">
              {REPORT_CATEGORIES.map((category) => {
                const isCollapsed = collapsed[category.id];
                return (
                  <div key={category.id} className="rounded-xl border border-transparent hover:border-border/60 transition-colors">
                    <button
                      onClick={() => toggleCollapsed(category.id)}
                      className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors"
                      title={isCollapsed ? 'Expand' : 'Collapse'}
                    >
                      <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <category.icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {category.label}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold">
                          {category.reports.length}
                        </span>
                        {isCollapsed ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" />
                        ) : (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/70" />
                        )}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-0.5 ml-3 border-l border-border/50 pl-2 mt-0.5 pb-1">
                        {category.reports.map((report) => {
                          const isActive = activeCategory === category.id && activeReport === report.id;
                          return (
                            <button
                              key={report.id}
                              onClick={() => selectReport(category.id, report.id)}
                              className={cn(
                                "w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors border-l-2",
                                isActive
                                  ? "bg-primary/10 text-primary font-medium border-primary"
                                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                              )}
                            >
                              {report.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Category Select */}
      <div className="md:hidden w-full border-b border-border bg-card p-3 absolute top-16 left-0 right-0 z-20 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search reports..."
            className="w-full h-9 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary focus:outline-none"
          />
        </div>
        <select
          value={`${activeCategory}:${activeReport}`}
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
                <option key={rep.id} value={`${cat.id}:${rep.id}`}>{rep.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background pt-28 md:pt-0">
        <div className="p-4 sm:p-6 lg:p-8 flex-1 overflow-y-auto">
          {/* Breadcrumb & Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <span>Reports</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>{currentCategory?.label}</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{currentReportName}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
                <CategoryIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{currentReportName}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {currentCategory?.label} · {currentCategory?.reports.length} reports in this category
                </p>
              </div>
            </div>
          </div>

          {/* Report Content Component */}
          {renderContent()}
        </div>
      </div>
    </div>
    </DrillDownProvider>
  );
}
