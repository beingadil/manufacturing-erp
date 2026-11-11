import { Calendar as CalendarIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formInputClass } from '../form/formStyles';
import { DATE_RANGE_OPTIONS } from '../reports/common/ReportFilterBar';
import { DatePicker } from '../ui/date-picker';
import { cn } from '../../lib/utils';

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
}

/**
 * Statement period picker shared by the Ledgers page and the General Ledger
 * module. Presets come from the report filter's one list (`DATE_RANGE_OPTIONS`)
 * so "This Month", "All Time" and the custom range behave identically
 * everywhere in the ledger family.
 */
export function LedgerPeriodFilter({
  onChange,
  defaultLabel = 'All Time',
  className,
}: LedgerPeriodFilterProps) {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const index = DATE_RANGE_OPTIONS.findIndex((option) => option.label === defaultLabel);
    return index === -1 ? 0 : index;
  });
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  useEffect(() => {
    const option = DATE_RANGE_OPTIONS[selectedIndex];
    if (option.label === 'Custom Date Range') {
      if (customStart && customEnd) {
        onChange({ start: customStart, end: customEnd, label: `${customStart} to ${customEnd}` });
      }
      return;
    }
    const { start, end } = option.getValue();
    onChange({ start, end, label: option.label });
  }, [selectedIndex, customStart, customEnd, onChange]);

  const isCustom = DATE_RANGE_OPTIONS[selectedIndex].label === 'Custom Date Range';

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="relative w-full sm:w-48">
        <CalendarIcon
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <select
          aria-label="Statement period"
          className={cn(formInputClass, 'pl-9')}
          value={selectedIndex}
          onChange={(event) => setSelectedIndex(Number(event.target.value))}
        >
          {DATE_RANGE_OPTIONS.map((option, index) => (
            <option key={option.label} value={index}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {isCustom && (
        <div className="flex items-center gap-2">
          <DatePicker value={customStart} onChange={setCustomStart} size="sm" className="w-36" placeholder="Start" />
          <span className="text-sm text-muted-foreground">to</span>
          <DatePicker value={customEnd} onChange={setCustomEnd} size="sm" className="w-36" placeholder="End" />
        </div>
      )}
    </div>
  );
}
