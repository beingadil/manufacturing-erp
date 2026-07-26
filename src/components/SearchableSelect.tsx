import React, { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Plus, Search, X } from "lucide-react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const filteredOptions = options.filter(option => {
    const searchString = `${option.label} ${option.secondaryLabel || ''} ${option.searchValue || ''}`.toLowerCase();
    return searchString.includes(query.toLowerCase());
  });

  const selectedOption = options.find(o => o.id === value);

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex gap-2">
        <div 
          className={cn(
            "flex-1 flex items-center justify-between rounded-xl border bg-card p-3 text-sm cursor-pointer",
            !selectedOption && "text-muted-foreground",
            isOpen && "ring-2 ring-primary border-transparent"
          )}
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) {
              setQuery("");
              setTimeout(() => inputRef.current?.focus(), 0);
            }
          }}
        >
          <div className="flex-1 truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
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
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-hidden rounded-xl border border-border bg-card shadow-md flex flex-col">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              placeholder={`Search ${placeholder.toLowerCase()}...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.id}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-muted",
                    value === option.id && "bg-muted"
                  )}
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                    setQuery("");
                  }}
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
