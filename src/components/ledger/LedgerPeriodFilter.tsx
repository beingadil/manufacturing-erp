import { Calendar as CalendarIcon, Check, ChevronDown } from 'lucide-react';
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { DatePicker } from '../ui/date-picker';
import { AnchoredOverlay } from '../ui/AnchoredOverlay';
import {
  DATE_RANGE_OPTIONS,
  describePeriodOption,
  formatPeriodRange,
} from '../reports/common/ReportFilterBar';

export interface LedgerPeriod {
  start: string;
  end: string;
  label: string;
}

interface LedgerPeriodFilterProps {
  onChange: (period: LedgerPeriod) => void;
  /** Preset selected on mount. Defaults to "All Time" so no history is hidden. */
  defaultLabel?: string;
  className?: string;
  /** Extra classes for the trigger (e.g. a fixed control height). */
  triggerClassName?: string;
}

const CUSTOM_LABEL = 'Custom Date Range';

/**
 * Statement period picker shared by the Ledgers page and the General Ledger
 * module. Presets come from the report filter's one list (`DATE_RANGE_OPTIONS`)
 * so "This Month", "All Time" and the custom range behave identically
 * everywhere in the ledger family — but the control itself is a dropdown that
 * shows the window each preset actually covers, because "This Month" alone
 * never says WHICH month.
 */
export function LedgerPeriodFilter({
  onChange,
  defaultLabel = 'All Time',
  className,
  triggerClassName,
}: LedgerPeriodFilterProps) {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const index = DATE_RANGE_OPTIONS.findIndex(option => option.label === defaultLabel);
    return index === -1 ? 0 : index;
  });
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [isOpen, setIsOpen] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const triggerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const customIndex = useMemo(
    () => DATE_RANGE_OPTIONS.findIndex(option => option.label === CUSTOM_LABEL),
    []
  );
  const isCustom = selectedIndex === customIndex;
  const selectedOption = DATE_RANGE_OPTIONS[selectedIndex];
  const selectedRange = isCustom
    ? (customStart && customEnd ? formatPeriodRange(customStart, customEnd) : 'Pick a start and end date')
    : describePeriodOption(selectedOption?.label ?? '');

  // Notify the owner about the active window (mount included, so the ledger
  // never renders against a stale period).
  useEffect(() => {
    if (selectedIndex === customIndex) return;
    const option = DATE_RANGE_OPTIONS[selectedIndex];
    if (!option) return;
    const { start, end } = option.getValue();
    onChange({ start, end, label: option.label });
  }, [selectedIndex, customIndex, onChange]);

  useEffect(() => {
    if (!isOpen) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  const selectPreset = (index: number) => {
    setSelectedIndex(index);
    setActiveIndex(index);
    setIsOpen(false);
  };

  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    onChange({ start: customStart, end: customEnd, label: `${customStart} to ${customEnd}` });
    setIsOpen(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setIsOpen(true);
        setActiveIndex(selectedIndex);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => Math.min(index + 1, DATE_RANGE_OPTIONS.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = DATE_RANGE_OPTIONS[activeIndex];
      if (option?.label === CUSTOM_LABEL) {
        setSelectedIndex(activeIndex);
        return;
      }
      selectPreset(activeIndex);
    }
  };

  return (
    <div className={cn('relative', className)}>
      <div
        ref={triggerRef}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Statement period"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={() => {
          setActiveIndex(selectedIndex);
          setIsOpen(open => !open);
        }}
        className={cn(
          'flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-4 text-sm text-foreground transition-colors',
          'hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          triggerClassName,
          isOpen && 'border-primary/60 ring-1 ring-primary'
        )}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
          <span className="truncate font-medium">{selectedOption?.label ?? 'Select period'}</span>
          <span className="truncate text-[11px] leading-tight text-muted-foreground">{selectedRange}</span>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </div>

      <AnchoredOverlay
        anchorEl={triggerRef.current}
        open={isOpen}
        onClose={() => setIsOpen(false)}
        minWidth={320}
      >
        <div
          role="listbox"
          aria-label="Statement period"
          className="flex max-h-80 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-md"
        >
          <div ref={listRef} className="dropdown-scroll overflow-y-auto p-1">
            {DATE_RANGE_OPTIONS.map((option, index) => {
              const isCustomOption = option.label === CUSTOM_LABEL;
              const range = isCustomOption ? 'Pick a start and end date' : describePeriodOption(option.label);
              return (
                <div
                  key={option.label}
                  role="option"
                  aria-selected={index === selectedIndex}
                  data-active={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    if (isCustomOption) {
                      setSelectedIndex(index);
                      setActiveIndex(index);
                      return;
                    }
                    selectPreset(index);
                  }}
                  className={cn(
                    'relative flex cursor-pointer select-none items-center justify-between gap-3 rounded-sm px-2 py-2 text-sm outline-none',
                    index === activeIndex && 'bg-muted/70',
                    index === selectedIndex && 'bg-muted'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Check className={cn('h-4 w-4 shrink-0', index === selectedIndex ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{option.label}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {range}
                  </span>
                </div>
              );
            })}
          </div>

          {isCustom && (
            <div className="flex items-center gap-2 border-t border-border/50 p-3">
              <DatePicker
                value={customStart}
                onChange={setCustomStart}
                size="sm"
                className="w-32"
                placeholder="Start"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <DatePicker
                value={customEnd}
                onChange={setCustomEnd}
                size="sm"
                className="w-32"
                placeholder="End"
              />
              <button
                type="button"
                onClick={applyCustom}
                disabled={!customStart || !customEnd}
                className="ml-auto rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </AnchoredOverlay>
    </div>
  );
}
