import { useState, useMemo, useRef, useEffect } from 'react';
import { useERPStore } from '../../store/useERPStore';
import { Search, ChevronRight, ChevronDown, FolderOpen, Check, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Account, AccountSubtype, AccountType } from '../../types/erp';

interface SearchableAccountTreeProps {
  value: string;
  onChange: (accountId: string) => void;
  placeholder?: string;
  /** Optional filter: only show accounts of specific types */
  allowedTypes?: AccountType[];
  /** Optional filter: only show accounts linked to these subtype names */
  allowedSubtypeNames?: string[];
  /** If true, allow selecting parent (non-leaf) accounts */
  allowParents?: boolean;
  required?: boolean;
}

interface TreeNode {
  type: 'subtype-header' | 'account';
  id: string;
  label: string;
  subtitle?: string;
  isLeaf: boolean;
  account?: Account;
  subtype?: AccountSubtype;
  depth: number;
  parentType: string;
}

export function SearchableAccountTree({
  value,
  onChange,
  placeholder = 'Select account...',
  allowedTypes,
  allowedSubtypeNames,
  allowParents = false,
  required,
}: SearchableAccountTreeProps) {
  const { accounts, accountSubtypes } = useERPStore();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-expand all types on open
  useEffect(() => {
    if (isOpen) {
      const allTypes = new Set(types);
      setExpandedTypes(allTypes);
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Build the tree of account types
  const types = useMemo(() => {
    return [...new Set(accounts.map(a => a.type))] as AccountType[];
  }, [accounts]);

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    let list = accounts;

    if (allowedTypes && allowedTypes.length > 0) {
      list = list.filter(a => allowedTypes.includes(a.type));
    }
    if (allowedSubtypeNames && allowedSubtypeNames.length > 0) {
      const subtypeIds = accountSubtypes
        .filter(s => allowedSubtypeNames.includes(s.name))
        .map(s => s.id);
      list = list.filter(a => subtypeIds.includes(a.subtypeId));
    }

    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        a =>
          a.name.toLowerCase().includes(q) ||
          a.code.toLowerCase().includes(q)
      );
    }

    return list;
  }, [accounts, accountSubtypes, allowedTypes, allowedSubtypeNames, query]);

  // Build tree nodes for rendering
  const treeNodes = useMemo((): { type: AccountType; nodes: TreeNode[] }[] => {
    return types
      .filter(t => filteredAccounts.some(a => a.type === t))
      .map(type => {
        const typeAccounts = filteredAccounts.filter(a => a.type === type);
        const subtypesOfType = accountSubtypes.filter(s => s.type === type);

        const nodes: TreeNode[] = [];

        subtypesOfType.forEach(subtype => {
          const subtypeAccounts = typeAccounts.filter(a => a.subtypeId === subtype.id);
          if (subtypeAccounts.length === 0) return;

          // Subtype header
          nodes.push({
            type: 'subtype-header',
            id: `subtype-${subtype.id}`,
            label: subtype.name,
            subtitle: `${subtypeAccounts.length} accounts`,
            isLeaf: false,
            subtype,
            depth: 0,
            parentType: type,
          });

          // Accounts under this subtype
          subtypeAccounts.forEach(acc => {
            const isLeaf = !accounts.some(a => a.parentId === acc.id);
            if (!allowParents && !isLeaf && !query) return; // Hide parent accounts unless searching or allowParents

            nodes.push({
              type: 'account',
              id: acc.id,
              label: `${acc.code} — ${acc.name}`,
              subtitle: acc.type,
              isLeaf: isLeaf || !!allowParents,
              account: acc,
              depth: 1,
              parentType: type,
            });
          });
        });

        // Accounts without a subtype
        const orphanAccounts = typeAccounts.filter(
          a => !subtypesOfType.some(s => s.id === a.subtypeId)
        );
        orphanAccounts.forEach(acc => {
          const isLeaf = !accounts.some(a => a.parentId === acc.id);
          if (!allowParents && !isLeaf && !query) return;

          nodes.push({
            type: 'account',
            id: acc.id,
            label: `${acc.code} — ${acc.name}`,
            subtitle: acc.type,
            isLeaf: isLeaf || !!allowParents,
            account: acc,
            depth: 0,
            parentType: type,
          });
        });

        return { type, nodes };
      })
      .filter(section => section.nodes.length > 0);
  }, [types, filteredAccounts, accountSubtypes, accounts, allowParents, query]);

  // Selections
  const selectedAccount = accounts.find(a => a.id === value);

  const handleSelect = (node: TreeNode) => {
    if (!node.isLeaf) return;
    onChange(node.id);
    setIsOpen(false);
  };

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger */}
      <div
        className={cn(
          'flex items-center justify-between rounded-xl border bg-card p-3 text-sm cursor-pointer',
          !selectedAccount && 'text-muted-foreground',
          isOpen && 'ring-2 ring-primary border-transparent'
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex-1 truncate flex items-center gap-2">
          {selectedAccount ? (
            <>
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <span className="text-foreground font-medium">{selectedAccount.code}</span>
              <span className="text-foreground">— {selectedAccount.name}</span>
            </>
          ) : (
            placeholder
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 opacity-50 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </div>

      {/* Hidden input for form validation */}
      <input
        type="text"
        required={required}
        value={value}
        onChange={() => {}}
        className="opacity-0 absolute inset-0 w-full h-full -z-10"
        tabIndex={-1}
      />

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-border bg-card shadow-md flex flex-col max-h-80 overflow-hidden">
          {/* Search */}
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search accounts..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* Tree */}
          <div className="overflow-y-auto p-1">
            {treeNodes.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No accounts found.
              </div>
            ) : (
              treeNodes.map((section) => (
                <div key={section.type}>
                  {/* Account Type Header */}
                  <button
                    type="button"
                    onClick={() => toggleType(section.type)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted/50 rounded-sm transition-colors sticky top-0 bg-card z-10"
                  >
                    {expandedTypes.has(section.type) ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {section.type}
                    <span className="ml-auto text-[10px] font-normal normal-case opacity-60">
                      {section.nodes.filter(n => n.type === 'account').length} accounts
                    </span>
                  </button>

                  {/* Nodes (collapsible) */}
                  {expandedTypes.has(section.type) && (
                    <div>
                      {section.nodes.map((node) => {
                        if (node.type === 'subtype-header') {
                          return (
                            <div
                              key={node.id}
                              className="flex items-center gap-2 px-6 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/20"
                            >
                              <FolderOpen className="h-3 w-3" />
                              {node.label}
                            </div>
                          );
                        }

                        return (
                          <button
                            key={node.id}
                            type="button"
                            disabled={!node.isLeaf}
                            onClick={() => handleSelect(node)}
                            className={cn(
                              'flex w-full items-center gap-2 px-8 py-2 text-sm rounded-sm transition-colors text-left',
                              node.isLeaf
                                ? 'cursor-pointer hover:bg-muted'
                                : 'cursor-default opacity-50',
                              value === node.id && 'bg-primary/10 text-primary'
                            )}
                            style={{ paddingLeft: `${node.depth * 1.5 + 2}rem` }}
                          >
                            <Check
                              className={cn(
                                'h-4 w-4 shrink-0',
                                value === node.id ? 'opacity-100 text-primary' : 'opacity-0'
                              )}
                            />
                            <span className="font-mono text-xs text-muted-foreground">{node.account?.code}</span>
                            <span className="font-medium text-foreground">{node.account?.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
