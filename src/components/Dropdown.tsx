import { Check, ChevronDown } from 'lucide-react';
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { AnchoredOverlay } from './ui/AnchoredOverlay';

export interface DropdownOption {
  value: string;
  label: string;
  /** Secondary line — shown under the label in the trigger and in the panel. */
  secondaryLabel?: string;
  disabled?: boolean;
}

export interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name for the trigger. Falls back to `label`, then the placeholder. */
  ariaLabel?: string;
  /** Field label rendered above the control. */
  label?: string;
  /** Helper text rendered below the control. */
  hint?: string;
  /** Visual density: 'sm' (compact) or 'md' (comfortable, default). */
  size?: 'sm' | 'md';
  /** Extra classes for the outer wrapper. */
  className?: string;
  /** Extra classes for the trigger itself (e.g. a fixed width). */
  triggerClassName?: string;
  disabled?: boolean;
  /** Rendered inside the panel, under the option list (e.g. a custom-range editor). */
  panelFooter?: ReactNode;
  /** Icon rendered before the label in the trigger. */
  leadingIcon?: ReactNode;
  /** Forwarded to the trigger — shadcn's FormControl wires id/aria-* this way. */
  id?: string;
  name?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-required'?: boolean | 'true' | 'false';
  /** Marks the control required for assistive tech (form validation is the caller's). */
  required?: boolean;
  onBlur?: () => void;
}

/** Canonical input chrome shared with formInputs — every dropdown looks identical. */
const triggerBase =
  "flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card text-sm text-foreground transition-colors hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

let listboxSeq = 0;
function nextListboxId() {
  return `dropdown-listbox-${++listboxSeq}`;
}

/**
 * The app's plain dropdown — a styled replacement for the raw `<select>`
 * elements that used to ship in half the modules.
 *
 * Same chrome as `SearchableSelect` (rounded card surface, hairline border,
 * chevron affordance) and the same portal'd `AnchoredOverlay` panel, so a
 * dropdown never gets clipped by a scroll container and never renders with
 * the browser's grey native menu.
 */
export function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  ariaLabel,
  label,
  hint,
  size = 'md',
  className,
  triggerClassName,
  disabled,
  panelFooter,
  leadingIcon,
  id,
  name,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  required,
  onBlur,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useRef(nextListboxId());

  const selected = options.find(option => option.value === value);
  const isSm = size === 'sm';

  useEffect(() => {
    if (!isOpen) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  const selectOption = (option: DropdownOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setActiveIndex(Math.max(options.findIndex(option => option.value === value), 0));
        setIsOpen(true);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) selectOption(option);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    }
  };

  return (
    <div className={cn('relative', className)}>
      {label && (
        <label className="mb-1.5 block text-sm font-semibold text-foreground">{label}</label>
      )}

      <div
        ref={triggerRef}
        id={id}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={required ?? ariaRequired}
        onBlur={onBlur}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId.current}
        aria-haspopup="listbox"
        aria-label={ariaLabel || label || placeholder}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (disabled) return;
          setActiveIndex(Math.max(options.findIndex(option => option.value === value), 0));
          setIsOpen(open => !open);
        }}
        className={cn(
          triggerBase,
          isSm ? 'px-3 py-2' : 'px-4 py-2.5',
          triggerClassName,
          !selected && 'text-muted-foreground',
          disabled && 'cursor-not-allowed opacity-60',
          isOpen && 'border-primary/60 ring-1 ring-primary'
        )}
      >
        {leadingIcon && <span className="shrink-0 text-muted-foreground">{leadingIcon}</span>}
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-medium">{selected?.label ?? placeholder}</span>
          {selected?.secondaryLabel && (
            <span className="truncate text-[11px] text-muted-foreground">{selected.secondaryLabel}</span>
          )}
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </div>

      {name && <input type="hidden" name={name} value={value} />}

      <AnchoredOverlay
        anchorEl={triggerRef.current}
        open={isOpen}
        onClose={() => setIsOpen(false)}
        minWidth={220}
      >
        <div
          id={listboxId.current}
          role="listbox"
          aria-label={ariaLabel || label || placeholder}
          className="flex max-h-72 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-md"
        >
          <div ref={listRef} className="dropdown-scroll overflow-y-auto p-1">
            {options.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No options</div>
            ) : (
              options.map((option, index) => (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  data-active={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option)}
                  className={cn(
                    'relative flex cursor-pointer select-none items-center justify-between gap-3 rounded-sm px-2 py-2 text-sm outline-none',
                    option.disabled && 'cursor-not-allowed opacity-50',
                    index === activeIndex && !option.disabled && 'bg-muted/70',
                    option.value === value && 'bg-muted'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Check
                      className={cn('h-4 w-4 shrink-0', option.value === value ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{option.label}</span>
                      {option.secondaryLabel && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {option.secondaryLabel}
                        </span>
                      )}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>

          {panelFooter && <div className="border-t border-border/50 p-2">{panelFooter}</div>}
        </div>
      </AnchoredOverlay>

      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
