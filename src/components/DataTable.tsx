import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  FileText,
  Search,
  X
} from "lucide-react";
import React, { memo, useEffect, useMemo, useState } from "react";
import { cn } from "../lib/utils";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchKeys?: (keyof T)[];
  searchPlaceholder?: string;
  persistKey?: string;
  emptyStateMessage?: string;
  emptyStateIcon?: React.ReactNode;
  /** Optional secondary hint rendered under the empty-state message. */
  emptyStateHint?: string;
  defaultSortKey?: string;
  itemsPerPageOptions?: number[];
  /** Render without the card chrome (used when wrapped in an outer card). */
  embedded?: boolean;
  /** Optional footer row rendered after the data rows (e.g. column totals). */
  summaryRow?: React.ReactNode[];
}

/**
 * Shared DataTable — one table component across every ERP module.
 *
 * Design basis (ui-ux-pro-max, Data-Dense Dashboard): compact toolbar,
 * sticky column header while scrolling, 150ms row hover, WCAG AA contrast,
 * aria-sort on sortable columns, and 32px+ icon-button targets via
 * <RowActionButton/>.
 */
function DataTableInner<T extends Record<string, any>>({
  data,
  columns,
  searchKeys,
  searchPlaceholder = "Search...",
  persistKey,
  emptyStateMessage = "No data found",
  emptyStateIcon = <FileText className="h-8 w-8 mb-3 mx-auto text-muted-foreground/40" />,
  emptyStateHint,
  defaultSortKey,
  itemsPerPageOptions = [10, 25, 50, 100],
  embedded = false,
  summaryRow
}: DataTableProps<T>) {
  // Try to load state from localStorage if persistKey is provided
  const loadState = (key: string, defaultValue: any) => {
    if (!persistKey) return defaultValue;
    try {
      const saved = localStorage.getItem(`${persistKey}-${key}`);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const [searchTerm, setSearchTerm] = useState(() => loadState('search', ''));
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(() => 
    loadState('sort', defaultSortKey ? { key: defaultSortKey, direction: 'desc' } : null)
  );
  const [currentPage, setCurrentPage] = useState(() => loadState('page', 1));
  const [itemsPerPage, setItemsPerPage] = useState(() => loadState('itemsPerPage', itemsPerPageOptions[0]));

  // Save state when it changes
  useEffect(() => {
    if (persistKey) {
      localStorage.setItem(`${persistKey}-search`, JSON.stringify(searchTerm));
      localStorage.setItem(`${persistKey}-sort`, JSON.stringify(sortConfig));
      localStorage.setItem(`${persistKey}-page`, JSON.stringify(currentPage));
      localStorage.setItem(`${persistKey}-itemsPerPage`, JSON.stringify(itemsPerPage));
    }
  }, [searchTerm, sortConfig, currentPage, itemsPerPage, persistKey]);

  // Reset to page 1 on search
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredData = useMemo(() => {
    if (!searchTerm || !searchKeys || searchKeys.length === 0) return data;
    const lowerSearch = searchTerm.toLowerCase();
    
    return data.filter((item) => {
      return searchKeys.some((key) => {
        const val = item[key];
        return val != null && String(val).toLowerCase().includes(lowerSearch);
      });
    });
  }, [data, searchTerm, searchKeys]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      // if it's a render function, we might not be able to sort easily unless we just sort by the raw value
      // we'll rely on the raw object value.
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  
  const paginatedData = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * itemsPerPage;
    return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedData, safeCurrentPage, itemsPerPage]);

  const paginationBtn =
    "p-2 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150";

  return (
    <div className={cn(
      "flex flex-col",
      !embedded && "rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
    )}>
      <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card">
        {searchKeys && searchKeys.length > 0 ? (
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/80" />
            <input
              type="text"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-8 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors duration-150"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center rounded-full bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {sortedData.length} {sortedData.length === 1 ? 'item' : 'items'}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show</span>
            <select
              aria-label="Rows per page"
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="h-10 px-3 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {itemsPerPageOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="sticky top-0 z-10 text-xs text-muted-foreground bg-muted/70 backdrop-blur-sm border-b border-border/50">
            <tr>
              {columns.map((col) => (
                <th 
                  key={col.key} 
                  aria-sort={
                    sortConfig?.key === col.key
                      ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending')
                      : 'none'
                  }
                  className={`px-6 py-4 font-medium ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`}
                >
                  {col.sortable ? (
                    <button
                      onClick={() => handleSort(col.key)}
                      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${col.align === 'right' ? 'ml-auto' : ''}`}
                    >
                      {col.label}
                      <div className="flex flex-col">
                        <ChevronUp className={`h-2.5 w-2.5 ${sortConfig?.key === col.key && sortConfig.direction === 'asc' ? 'text-foreground' : 'text-muted-foreground/80'}`} />
                        <ChevronDown className={`h-2.5 w-2.5 -mt-1 ${sortConfig?.key === col.key && sortConfig.direction === 'desc' ? 'text-foreground' : 'text-muted-foreground/80'}`} />
                      </div>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {paginatedData.map((item, idx) => (
              <tr key={item.id || idx} className="transition-colors duration-150 hover:bg-muted/40">
                {columns.map((col) => (
                  <td 
                    key={col.key} 
                    className={`px-6 py-4 ${col.align === 'right' ? 'text-right tabular-nums' : col.align === 'center' ? 'text-center' : ''}`}
                  >
                    {col.render ? col.render(item) : item[col.key]}
                  </td>
                ))}
              </tr>
            ))}
            {summaryRow && (
              <tr className="border-t-2 border-border bg-muted/40 font-semibold text-foreground">
                {summaryRow.map((cell, i) => (
                  <td key={i} className={`px-6 py-4 ${columns[i]?.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            )}
            {paginatedData.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-muted-foreground">
                  {emptyStateIcon}
                  <p className="text-sm font-medium text-foreground">{emptyStateMessage}</p>
                  {emptyStateHint && (
                    <p className="text-xs text-muted-foreground/70 mt-1">{emptyStateHint}</p>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sortedData.length > 0 && (
        <div className="px-6 py-4 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-card">
          <div className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{(safeCurrentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium text-foreground">{Math.min(safeCurrentPage * itemsPerPage, sortedData.length)}</span> of <span className="font-medium text-foreground">{sortedData.length}</span> results
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safeCurrentPage === 1}
              aria-label="First page"
              className={paginationBtn}
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              aria-label="Previous page"
              className={paginationBtn}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium text-foreground px-2">
              Page {safeCurrentPage} of {totalPages}
            </div>
            <button
              onClick={() => setCurrentPage((p: number) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
              aria-label="Next page"
              className={paginationBtn}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safeCurrentPage === totalPages}
              aria-label="Last page"
              className={paginationBtn}
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Memoized version for better performance with large datasets
export const DataTable = memo(DataTableInner) as typeof DataTableInner;

/** Shared icon-only action button for table rows — 32px target, 150ms hover, accessible label. */
export function RowActionButton({
  onClick,
  label,
  tone = "neutral",
  children,
  className,
}: {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Accessible name (aria-label) and tooltip. */
  label: string;
  tone?: "neutral" | "primary" | "destructive";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 [&>svg]:h-4 [&>svg]:w-4",
        tone === "neutral" && "text-muted-foreground/80 hover:bg-muted hover:text-foreground",
        tone === "primary" && "text-muted-foreground/80 hover:bg-primary/10 hover:text-primary",
        tone === "destructive" && "text-muted-foreground/80 hover:bg-destructive/10 hover:text-destructive",
        className
      )}
    >
      {children}
    </button>
  );
}
