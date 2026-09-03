import { Calendar as CalendarIcon, SlidersHorizontal, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { DatePicker } from '../../ui/date-picker';
import { SearchInput } from '../../ui/SearchInput';
import { ReportExportBar } from './ReportExportBar';

interface ReportFilterBarProps {
  onSearch?: (value: string) => void;
  onFilterClick?: () => void;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  onExportCSV?: () => void;
  onPrint?: () => void;
  onDateRangeChange?: (range: { start: string; end: string; label: string }) => void;
  showDateRange?: boolean;
  customFilters?: React.ReactNode;
}

export const DATE_RANGE_OPTIONS = [
  { label: 'Today', getValue: () => { const d = new Date(); return { start: d.toISOString(), end: d.toISOString() }; } },
  { label: 'Yesterday', getValue: () => { const d = new Date(); d.setDate(d.getDate() - 1); return { start: d.toISOString(), end: d.toISOString() }; } },
  { label: 'This Week', getValue: () => { 
      const d = new Date(); 
      const start = new Date(d.setDate(d.getDate() - d.getDay()));
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return { start: start.toISOString(), end: end.toISOString() }; 
    } 
  },
  { label: 'Last Week', getValue: () => { 
      const d = new Date(); 
      const start = new Date(d.setDate(d.getDate() - d.getDay() - 7));
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return { start: start.toISOString(), end: end.toISOString() }; 
    } 
  },
  { label: 'This Month', getValue: () => { 
      const d = new Date(); 
      return { start: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(), end: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString() }; 
    } 
  },
  { label: 'Last Month', getValue: () => { 
      const d = new Date(); 
      return { start: new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString(), end: new Date(d.getFullYear(), d.getMonth(), 0).toISOString() }; 
    } 
  },
  { label: 'This Quarter', getValue: () => { 
      const d = new Date(); 
      const q = Math.floor(d.getMonth() / 3);
      return { start: new Date(d.getFullYear(), q * 3, 1).toISOString(), end: new Date(d.getFullYear(), q * 3 + 3, 0).toISOString() }; 
    } 
  },
  { label: 'Last Quarter', getValue: () => { 
      const d = new Date(); 
      const q = Math.floor(d.getMonth() / 3) - 1;
      return { start: new Date(d.getFullYear(), q * 3, 1).toISOString(), end: new Date(d.getFullYear(), q * 3 + 3, 0).toISOString() }; 
    } 
  },
  { label: 'This Year', getValue: () => { 
      const d = new Date(); 
      return { start: new Date(d.getFullYear(), 0, 1).toISOString(), end: new Date(d.getFullYear(), 11, 31).toISOString() }; 
    } 
  },
  { label: 'Last Year', getValue: () => { 
      const d = new Date(); 
      return { start: new Date(d.getFullYear() - 1, 0, 1).toISOString(), end: new Date(d.getFullYear() - 1, 11, 31).toISOString() }; 
    } 
  },
  { label: 'Current Financial Year', getValue: () => { 
      const d = new Date();
      // Pakistan fiscal year: 1 July - 30 June (July-start).
      const currentMonth = d.getMonth();
      const startYear = currentMonth >= 6 ? d.getFullYear() : d.getFullYear() - 1;
      return { start: new Date(startYear, 6, 1).toISOString(), end: new Date(startYear + 1, 5, 30).toISOString() }; 
    } 
  },
  { label: 'Previous Financial Year', getValue: () => { 
      const d = new Date();
      const currentMonth = d.getMonth();
      const startYear = currentMonth >= 6 ? d.getFullYear() - 1 : d.getFullYear() - 2;
      return { start: new Date(startYear, 6, 1).toISOString(), end: new Date(startYear + 1, 5, 30).toISOString() }; 
    } 
  },
  { label: 'Custom Date Range', getValue: () => ({ start: '', end: '' }) }
];

export function ReportFilterBar({ 
  onSearch, 
  onFilterClick, 
  onExportPDF,
  onExportExcel,
  onExportCSV,
  onPrint,
  onDateRangeChange,
  showDateRange = true,
  customFilters
}: ReportFilterBarProps) {
  const [selectedRangeIndex, setSelectedRangeIndex] = useState(4); // Default to 'This Month'
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [search, setSearch] = useState('');

  // Call onDateRangeChange on initial render or when range changes
  useEffect(() => {
    if (onDateRangeChange) {
      const option = DATE_RANGE_OPTIONS[selectedRangeIndex];
      if (option.label === 'Custom Date Range') {
        if (customStart && customEnd) {
          onDateRangeChange({ start: customStart, end: customEnd, label: `${customStart} to ${customEnd}` });
        }
      } else {
        const { start, end } = option.getValue();
        onDateRangeChange({ start, end, label: option.label });
      }
    }
  }, [selectedRangeIndex, customStart, customEnd]);

  // Active filter chips: non-default date range or an active search.
  const activeRangeLabel = DATE_RANGE_OPTIONS[selectedRangeIndex].label;
  const isCustom = activeRangeLabel === 'Custom Date Range';
  const rangeActive = showDateRange && (isCustom ? !!(customStart && customEnd) : selectedRangeIndex !== 4);
  const chipLabel = isCustom && customStart && customEnd
    ? `${customStart} to ${customEnd}`
    : activeRangeLabel;
  const searchActive = search.trim().length > 0;

  const clearRange = () => {
    setSelectedRangeIndex(4);
    setCustomStart('');
    setCustomEnd('');
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-card border border-border/50 rounded-xl shadow-sm mb-6">
      {(rangeActive || searchActive) && (
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active filters</span>
          {rangeActive && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium">
              {chipLabel}
              <button onClick={clearRange} aria-label="Clear date range filter" className="rounded-full hover:bg-primary/20 p-0.5">
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          )}
          {searchActive && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium max-w-[240px]">
              <span className="truncate">Search: {search.trim()}</span>
              <button
                onClick={() => { setSearch(''); onSearch?.(''); }}
                aria-label="Clear search filter"
                className="rounded-full hover:bg-primary/20 p-0.5"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        
        {/* Left side: Search & Date Range */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto flex-wrap">
          {showDateRange && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-48">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <select 
                  aria-label="Date range"
                  className="w-full pl-9 pr-8 py-2 bg-muted/50 border border-transparent hover:border-border focus:bg-background rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 transition-[border-color,box-shadow,background-color] appearance-none cursor-pointer"
                  value={selectedRangeIndex}
                  onChange={(e) => setSelectedRangeIndex(Number(e.target.value))}
                >
                  {DATE_RANGE_OPTIONS.map((opt, i) => (
                    <option key={i} value={i}>{opt.label}</option>
                  ))}
                </select>
              </div>
              
              {DATE_RANGE_OPTIONS[selectedRangeIndex].label === 'Custom Date Range' && (
                <div className="flex items-center gap-2">
                  <DatePicker value={customStart} onChange={setCustomStart} size="sm" className="w-36" placeholder="Start" />
                  <span className="text-muted-foreground">to</span>
                  <DatePicker value={customEnd} onChange={setCustomEnd} size="sm" className="w-36" placeholder="End" />
                </div>
              )}
            </div>
          )}

          {onSearch && (
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                onSearch(v);
              }}
              placeholder="Search report data…"
              ariaLabel="Search report data"
              className="w-full sm:w-64"
            />
          )}
          
          {customFilters}
          
          {onFilterClick && (
            <button 
              onClick={onFilterClick}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap"
            >
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="hidden sm:inline">Advanced Filters</span>
              <span className="sm:hidden">Filters</span>
            </button>
          )}
        </div>

        {/* Right side: Exports */}
        <ReportExportBar 
          onExportPDF={onExportPDF}
          onExportExcel={onExportExcel}
          onExportCSV={onExportCSV}
          onPrint={onPrint}
        />
      </div>
    </div>
  );
}
