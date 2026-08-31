import { Calendar as CalendarIcon, Search, SlidersHorizontal } from 'lucide-react';
import React, { useEffect, useState } from 'react';
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

  return (
    <div className="flex flex-col gap-4 p-4 bg-card border border-border/50 rounded-xl shadow-sm mb-6">
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
                  <input type="date" aria-label="Custom range start" className="px-3 py-2 bg-muted/50 border border-transparent hover:border-border focus:bg-background rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                  <span className="text-muted-foreground">to</span>
                  <input type="date" aria-label="Custom range end" className="px-3 py-2 bg-muted/50 border border-transparent hover:border-border focus:bg-background rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {onSearch && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search report data…"
                aria-label="Search report data"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  onSearch(e.target.value);
                }}
                className="w-full pl-9 pr-4 py-2 bg-muted/50 border border-transparent hover:border-border focus:bg-background rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-[border-color,box-shadow,background-color]"
              />
            </div>
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
