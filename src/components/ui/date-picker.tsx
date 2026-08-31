import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, formatDateISO } from '@/lib/utils';

interface DatePickerProps {
  /** Date as a local yyyy-MM-dd string (matches the rest of the app). */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Compact variant for filter bars; default is the taller form-field style. */
  size?: 'sm' | 'default';
}

/**
 * Enhanced calendar date picker built on react-day-picker + Radix Popover.
 * Replaces the plain <input type="date"> in data-entry forms and filters.
 */
export function DatePicker({
  value,
  onChange,
  id,
  disabled,
  placeholder = 'Select a date',
  className,
  size = 'default',
}: DatePickerProps) {
  const selected = value ? new Date(value) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal text-sm",
            size === 'default'
              ? "h-12 rounded-xl border-border px-4 py-3"
              : "h-9 rounded-xl px-3 py-2",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
          {selected ? format(selected, 'dd-MMM-yyyy') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => onChange(d ? formatDateISO(d) : '')}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
