import { Calculator, ChevronRight, Clock, DollarSign, Factory, FileBarChart2,
  PackageSearch, Search, ShoppingCart, Star, X
} from "lucide-react";
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getReportDefinition, reportDefinitions } from '../components/reports/registry/reportDefinitions';
import { useReportFavorites } from '../components/reports/registry/useReportFavorites';
import { ReportShell } from '../components/reports/shell';
import { DrillDownProvider } from '../contexts/DrillDownContext';
import { cn } from "../lib/utils";

const REPORT_CATEGORIES = [
  {
    id: 'purchase',
    label: 'Purchase Reports',
    shortLabel: 'Purchase',
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
    shortLabel: 'Sales',
    icon: DollarSign,
    reports: [
      { id: 'sales-register', label: 'Sales Register' },
      { id: 'sales-summary', label: 'Sales Summary' },
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
    shortLabel: 'Processing',
    icon: Factory,
    reports: [
      { id: 'processing-dispatch', label: 'Dispatch Register' },
      { id: 'processing-receive', label: 'Receive Register' },
      { id: 'pending-pcs', label: 'Pending PCS Report' },
      { id: 'processor-billing', label: 'Processing Billing' },
      { id: 'processor-ledger', label: 'Processor Ledger' },
      { id: 'processing-charges', label: 'Processing Charges' },
      { id: 'processing-efficiency', label: 'Processing Efficiency' },
      { id: 'processing-loss', label: 'Processing Loss/Wastage' },
      { id: 'processor-performance', label: 'Processor Performance' }
    ]
  },
  {
    id: 'inventory',
    label: 'Inventory Reports',
    shortLabel: 'Inventory',
    icon: PackageSearch,
    reports: [
      { id: 'current-stock', label: 'Current Stock' },
      { id: 'stock-movement', label: 'Stock Movement' },
      { id: 'material-stock', label: 'Raw Material Stock' },
      { id: 'finished-stock', label: 'Finished Goods Stock' },
      { id: 'low-stock', label: 'Low Stock' },
      { id: 'out-of-stock', label: 'Out of Stock' },
      { id: 'inventory-valuation', label: 'Inventory Valuation' },
      { id: 'lot-history', label: 'Lot / Batch History' },
      { id: 'inventory-aging', label: 'Inventory Aging' },
      { id: 'inventory-turnover', label: 'Inventory Turnover' },
      { id: 'stock-adjustment', label: 'Stock Adjustment Report' },
      { id: 'stock-ledger', label: 'Stock Ledger' }
    ]
  },
  {
    id: 'financial',
    label: 'Financial Reports',
    shortLabel: 'Financial',
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeCategory, setActiveCategory] = useState(() => searchParams.get('cat') || 'purchase');
  const [activeReport, setActiveReport] = useState(() => searchParams.get('rep') || 'purchase-register');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const { favorites, recents, toggleFavorite, isFavorite, pushRecent } = useReportFavorites();

  const currentCategory = REPORT_CATEGORIES.find(c => c.id === activeCategory) || REPORT_CATEGORIES[0];
  const currentDefinition = getReportDefinition(activeReport);

  // Record the active report as recently viewed.
  useEffect(() => {
    if (getReportDefinition(activeReport)) pushRecent(activeReport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport]);

  // Keep the active report/category synced to the URL (?cat=&rep=) so refresh,
  // back/forward and deep links preserve position.
  useEffect(() => {
    const current = searchParams.get('cat');
    const rep = searchParams.get('rep');
    if (current !== activeCategory || rep !== activeReport) {
      const params = new URLSearchParams(searchParams);
      params.set('cat', activeCategory);
      params.set('rep', activeReport);
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, activeReport]);

  const searchActive = searchTerm.trim().length > 0;

  const filteredResults = useMemo<SearchResult[]>(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    const results: SearchResult[] = [];
    REPORT_CATEGORIES.forEach((cat) => {
      cat.reports.forEach((r) => {
        const def = reportDefinitions[r.id];
        const haystack = [
          r.label.toLowerCase(),
          def?.description?.toLowerCase() || '',
          ...(def?.tags || []).map((t) => t.toLowerCase()),
        ];
        if (haystack.some((h) => h.includes(term))) {
          results.push({ id: r.id, label: r.label, categoryId: cat.id, categoryLabel: cat.label });
        }
      });
    });
    return results;
  }, [searchTerm]);

  const selectReport = (catId: string, repId: string) => {
    setActiveCategory(catId);
    setActiveReport(repId);
  };

  const selectCategory = (catId: string) => {
    setActiveCategory(catId);
    // Land on the category's first report.
    const cat = REPORT_CATEGORIES.find(c => c.id === catId);
    if (cat && cat.reports.length > 0) {
      setActiveReport(cat.reports[0].id);
    }
  };

  const selectSearchResult = (result: SearchResult) => {
    selectReport(result.categoryId, result.id);
    setSearchTerm('');
    setSearchFocused(false);
  };

  const renderContent = () => {
    if (!currentDefinition) return <div>Report not found</div>;
    const ReportComponent = currentDefinition.component;
    return <ReportShell definition={currentDefinition}><ReportComponent /></ReportShell>;
  };

  const SearchResultsPanel = searchActive ? (
    <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
      <div className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
        {filteredResults.length > 0 ? `${filteredResults.length} result${filteredResults.length === 1 ? '' : 's'}` : 'No results'}
      </div>
      {filteredResults.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <FileBarChart2 className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No reports match</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">Try a different keyword</p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filteredResults.map((result) => (
            <button
              key={result.id}
              onClick={() => selectSearchResult(result)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg transition-colors group",
                activeReport === result.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span className="text-sm font-medium flex items-center gap-2">
                {result.label}
                <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
              </span>
              <span className="block text-[10px] text-muted-foreground/80 mt-0.5">
                {reportDefinitions[result.id]?.description || result.categoryLabel}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <DrillDownProvider>
      <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-64px)] bg-background">
        {/* ── Sticky header: title, search, favorites/recent ── */}
        <div className="sticky top-16 z-30 bg-background/95 backdrop-blur border-b border-border">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 pt-4 pb-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileBarChart2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight text-foreground">Report Center</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">{TOTAL_REPORTS} reports · 5 categories</p>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {/* Recent (compact) */}
                {recents.length > 0 && (
                  <div className="hidden md:flex items-center gap-1.5 rounded-full bg-muted/50 border border-border/60 px-3 py-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                    <div className="flex items-center gap-1 overflow-hidden">
                      {recents.slice(0, 3).map((id) => {
                        const def = reportDefinitions[id];
                        if (!def) return null;
                        return (
                          <button
                            key={id}
                            onClick={() => selectReport(def.category, id)}
                            className={cn(
                              "text-xs rounded-full px-2 py-0.5 transition-colors whitespace-nowrap",
                              activeReport === id ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            {def.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Favorites (compact) */}
                {favorites.length > 0 && (
                  <div className="hidden md:flex items-center gap-1.5 rounded-full bg-muted/50 border border-border/60 px-3 py-1.5">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" aria-hidden="true" />
                    <div className="flex items-center gap-1 overflow-hidden">
                      {favorites.slice(0, 3).map((id) => {
                        const def = reportDefinitions[id];
                        if (!def) return null;
                        return (
                          <button
                            key={id}
                            onClick={() => selectReport(def.category, id)}
                            className={cn(
                              "text-xs rounded-full px-2 py-0.5 transition-colors whitespace-nowrap",
                              activeReport === id ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            {def.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Search */}
                <div className="relative w-full sm:w-72 md:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    placeholder="Search reports…"
                    aria-label="Search reports"
                    className="w-full h-9 pl-9 pr-8 bg-muted/40 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-colors"
                  />
                  {searchActive && (
                    <button
                      onClick={() => setSearchTerm('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  {searchFocused && SearchResultsPanel}
                </div>
              </div>
            </div>

            {/* ── Category tabs ── */}
            <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Report categories">
              {REPORT_CATEGORIES.map((category) => {
                const isActive = activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => selectCategory(category.id)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                      isActive
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                    )}
                  >
                    <category.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                    {category.shortLabel}
                    <span className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      {category.reports.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Report pills for the active category ── */}
          <div className="bg-card/60 border-t border-border/50">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-2 overflow-x-auto py-2" aria-label={`${currentCategory.label} reports`}>
                {currentCategory.reports.map((report) => {
                  const isActive = activeReport === report.id;
                  const fav = isFavorite(report.id);
                  return (
                    <div key={report.id} className="flex items-center shrink-0 group">
                      <button
                        onClick={() => selectReport(currentCategory.id, report.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          "text-xs sm:text-sm px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap",
                          isActive
                            ? "bg-primary text-primary-foreground border-primary font-medium shadow-sm"
                            : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                        )}
                      >
                        {report.label}
                      </button>
                      <button
                        onClick={() => toggleFavorite(report.id)}
                        aria-label={fav ? `Unfavorite ${report.label}` : `Favorite ${report.label}`}
                        aria-pressed={fav}
                        className={cn(
                          "ml-0.5 p-1 rounded-full transition-all shrink-0",
                          fav
                            ? "text-amber-400 opacity-100"
                            : "text-muted-foreground/40 hover:text-amber-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        )}
                      >
                        <Star className={cn("h-3 w-3", fav && "fill-amber-400")} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Report content ── */}
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {renderContent()}
        </div>
      </div>
    </DrillDownProvider>
  );
}
