import { Check, ChevronsUpDown, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils";

export interface Option {
  id: string;
  label: string;
  secondaryLabel?: string;
  searchValue?: string; // extra string to match against
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onAdd?: () => void;
  required?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  onAdd,
  required,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(option => {
      const searchString = `${option.label} ${option.secondaryLabel || ""} ${option.searchValue || ""}`.toLowerCase();
      return searchString.includes(q);
    });
  }, [options, query]);

  // Reset the highlighted option whenever the result list changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, options, isOpen]);

  // Keep the highlighted option visible.
  useEffect(() => {
    if (!isOpen) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  const selectedOption = options.find(o => o.id === value);

  // "Select Material..." -> "Search Material..."; never "search select material......"
  const searchPlaceholder = `Search ${placeholder
    .replace(/\.\.\.?$/, "")
    .replace(/^Select\s+/i, "")}...`;

  const openDropdown = () => {
    setIsOpen(true);
    setQuery("");
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const selectOption = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, Math.max(filteredOptions.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filteredOptions[activeIndex];
      if (opt) selectOption(opt.id);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex gap-2">
        <div
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="searchable-select-listbox"
          aria-haspopup="listbox"
          aria-label={placeholder}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex-1 flex items-center justify-between rounded-xl border bg-card p-3 text-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            !selectedOption && "text-muted-foreground",
            isOpen && "ring-2 ring-primary border-transparent"
          )}
          onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
        >
          <div className="flex-1 truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </div>
          <div className="flex items-center gap-1">
            {selectedOption && (
              <button
                type="button"
                aria-label={`Clear ${placeholder.replace(/\.\.\.?$/, "")}`}
                onClick={e => {
                  e.stopPropagation();
                  onChange("");
                }}
                className="rounded-md p-1 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </div>

        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="flex shrink-0 items-center justify-center rounded-xl border border-border bg-card w-12 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Hidden input for form requirement validation if needed */}
      <input
        type="text"
        required={required}
        value={value}
        onChange={() => {}}
        className="opacity-0 absolute inset-0 w-full h-full -z-10"
        tabIndex={-1}
      />

      {isOpen && (
        <div
          id="searchable-select-listbox"
          role="listbox"
          aria-label={placeholder}
          ref={listRef}
          className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-hidden rounded-xl border border-border bg-card shadow-md flex flex-col"
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
            <input
              ref={inputRef}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              placeholder={searchPlaceholder}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label={searchPlaceholder}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="rounded-md p-1 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No results found.
                {onAdd && (
                  <button
                    type="button"
                    onClick={onAdd}
                    className="mt-2 mx-auto flex items-center gap-1 text-primary hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add new
                  </button>
                )}
              </div>
            ) : (
              filteredOptions.map((option, index) => (
                <div
                  key={option.id}
                  role="option"
                  aria-selected={value === option.id}
                  data-active={index === activeIndex}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none",
                    index === activeIndex && "bg-muted/70",
                    value === option.id && "bg-muted"
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    {option.secondaryLabel && (
                      <span className="text-xs text-muted-foreground">{option.secondaryLabel}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
