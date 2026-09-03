import { Search, X } from "lucide-react";
import { cn } from "../../lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name; falls back to the placeholder. */
  ariaLabel?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Shared search input — icon, clear button, and consistent focus ring across
 * every module's filter toolbar. Replaces the ad-hoc "relative div + Search
 * icon + input" blocks that previously drifted in styling per page.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  ariaLabel,
  className,
  autoFocus,
}: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80"
        aria-hidden="true"
      />
      <input
        type="text"
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-8 text-sm placeholder:text-muted-foreground/70 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground/70 transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
