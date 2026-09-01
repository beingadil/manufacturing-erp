import { Calculator, ChevronDown, ChevronRight, Clock, DollarSign, Factory, FileBarChart2,
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
  // Track which categories the USER has explicitly opened/closed. Categories
  // start collapsed; the active category stays expanded unless explicitly
  // closed by the user.
  const [userToggled, setUserToggled] = useState<Record<string, boolean>>({});
  const { favorites, recents, toggleFavorite, isFavorite, pushRecent } = useReportFavorites();

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

  const currentDefinition = getReportDefinition(activeReport);

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
    // Jumping to a category should reveal its reports (undo an explicit close).
    if (userToggled[catId] === false) {
      setUserToggled((prev) => ({ ...prev, [catId]: true }));
    }
  };

  const selectSearchResult = (result: SearchResult) => {
    selectReport(result.categoryId, result.id);
    setSearchTerm('');
  };

  // A category is expanded only when the user explicitly opened it, or when
  // it is the active category and the user has not explicitly closed it.
  const isCategoryOpen = (categoryId: string) =>
    categoryId === activeCategory ? userToggled[categoryId] !== false : userToggled[categoryId] === true;

  const toggleCategory = (categoryId: string) => {
    setUserToggled((prev) => ({
      ...prev,
      [categoryId]: !(prev[categoryId] === true || (categoryId === activeCategory && prev[categoryId] !== false)),
    }));
  };

  const renderContent = () => {
    if (!currentDefinition) return <div>Report not found</div>;
    const ReportComponent = currentDefinition.component;
    return <ReportShell definition={currentDefinition}><ReportComponent /></ReportShell>;
  };

  return (
    <DrillDownProvider>
      <div className="flex h-[calc(100vh-64px)] -m-4 sm:-m-6 lg:-m-8 relative">
      {/* Sidebar */}
      <div className="w-64 lg:w-72 border-r border-border bg-card overflow-y-auto hidden md:block shrink-0">
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
                    <span className="block text-[10px] text-muted-foreground/80 mt-0.5">
                      {reportDefinitions[result.id]?.description || result.categoryLabel}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : (
            /* ---- Category groups ---- */
            <div className="space-y-2">
              {/* Favorites */}
              {favorites.length > 0 && (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-2">
                  <div className="px-1 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                    Favorites
                  </div>
                  <div className="space-y-0.5">
                    {favorites.map((id) => {
                      const def = reportDefinitions[id];
                      if (!def) return null;
                      const isActive = activeReport === id;
                      return (
                        <div key={id} className="flex items-center group">
                          <button
                            onClick={() => selectReport(def.category, id)}
                            className={cn(
                              "flex-1 text-left px-2 py-1.5 text-sm rounded-lg transition-colors truncate",
                              isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            {def.title}
                          </button>
                          <button
                            onClick={() => toggleFavorite(id)}
                            aria-label={`Remove ${def.title} from favorites`}
                            className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent */}
              {recents.length > 0 && (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-2">
                  <div className="px-1 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Recent
                  </div>
                  <div className="space-y-0.5">
                    {recents.map((id) => {
                      const def = reportDefinitions[id];
                      if (!def) return null;
                      const isActive = activeReport === id;
                      return (
                        <button
                          key={id}
                          onClick={() => selectReport(def.category, id)}
                          className={cn(
                            "w-full text-left px-2 py-1.5 text-sm rounded-lg transition-colors truncate",
                            isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          {def.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {REPORT_CATEGORIES.map((category) => {
                const isOpen = isCategoryOpen(category.id);
                const isCategoryActive = activeCategory === category.id;
                return (
                  <div key={category.id} className={cn(
                    "rounded-xl border transition-colors",
                    isCategoryActive ? "border-primary/30 bg-primary/5" : "border-transparent hover:border-border/60"
                  )}>
                    <button
                      onClick={() => toggleCategory(category.id)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors"
                    >
                      <span className={cn(
                        "flex items-center gap-2 text-xs font-semibold uppercase tracking-wider",
                        isCategoryActive ? "text-primary" : "text-muted-foreground"
                      )}>
                        <category.icon className={cn("h-3.5 w-3.5", isCategoryActive ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                        {category.label}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          isCategoryActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {category.reports.length}
                        </span>
                        <ChevronDown className={cn(
                          "h-3.5 w-3.5 text-muted-foreground/70 transition-transform duration-200",
                          isOpen && "rotate-180"
                        )} aria-hidden="true" />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-0.5 ml-3 border-l border-border/50 pl-2 mt-0.5 pb-1">
                        {category.reports.map((report) => {
                          const isActive = activeCategory === category.id && activeReport === report.id;
                          const fav = isFavorite(report.id);
                          return (
                            <div key={report.id} className="flex items-center group">
                              <button
                                onClick={() => selectReport(category.id, report.id)}
                                className={cn(
                                  "flex-1 text-left px-3 py-1.5 text-sm rounded-lg transition-colors",
                                  isActive
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                              >
                                {report.label}
                              </button>
                              <button
                                onClick={() => toggleFavorite(report.id)}
                                aria-label={fav ? `Unfavorite ${report.label}` : `Favorite ${report.label}`}
                                aria-pressed={fav}
                                className={cn(
                                  "p-1 rounded-md transition-all shrink-0",
                                  fav
                                    ? "text-amber-400 opacity-100"
                                    : "text-muted-foreground/40 hover:text-amber-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                )}
                              >
                                <Star className={cn("h-3.5 w-3.5", fav && "fill-amber-400")} aria-hidden="true" />
                              </button>
                            </div>
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
          <input
            type="text"
            aria-label="Search reports"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search reports..."
            className="w-full h-9 pl-9 pr-8 bg-muted/40 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary focus:outline-none"
          />
          {searchActive && (
            <button
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {searchActive ? (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
              {filteredResults.length > 0 ? `${filteredResults.length} result${filteredResults.length === 1 ? '' : 's'}` : 'No results'}
            </div>
            {filteredResults.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">No reports match</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">Try a different keyword</p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {filteredResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => selectSearchResult(result)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg transition-colors",
                      activeReport === result.id && activeCategory === result.categoryId
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span className="text-sm font-medium flex items-center gap-2">{result.label}</span>
                    <span className="block text-[10px] text-muted-foreground/80 mt-0.5">{result.categoryLabel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <select
            value={`${activeCategory}:${activeReport}`}
            onChange={(e) => {
              const [cat, rep] = e.target.value.split(':');
              setActiveCategory(cat);
              setActiveReport(rep);
            }}
            aria-label="Select report"
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
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background pt-28 md:pt-0">
        <div className="p-4 sm:p-6 lg:p-8 flex-1">
                    {/* Report Content Component */}
          {renderContent()}
        </div>
      </div>
    </div>
    </DrillDownProvider>
  );
}
