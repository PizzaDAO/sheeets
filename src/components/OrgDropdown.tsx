'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, X, Building2, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

interface OrgDropdownProps {
  orgNames: string[];
  orgEventCounts: Map<string, number>;
  selectedOrgs: string[];
  onToggleOrg: (name: string) => void;
  orgEventCount?: number;
}

export function OrgDropdown({ orgNames, orgEventCounts, selectedOrgs, onToggleOrg, orgEventCount }: OrgDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Focus input on open
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = search
    ? orgNames.filter((n) => n.toLowerCase().includes(search.toLowerCase()))
    : orgNames;

  return (
    <div ref={containerRef}>
      <div className="text-xs uppercase tracking-wider text-[var(--theme-filter-text)] mb-1">Organizations{orgEventCount != null && orgEventCount > 0 && <span className="normal-case tracking-normal opacity-60"> ({orgEventCount})</span>}</div>

      {/* Selected chips */}
      {selectedOrgs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedOrgs.map((name) => (
            <button
              key={name}
              onClick={() => onToggleOrg(name)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-[var(--theme-filter-active-bg)] text-[var(--theme-filter-active)] border border-[var(--theme-filter-active)] cursor-pointer"
            >
              {name}
              <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer border',
          open
            ? 'border-[var(--theme-filter-active)] text-[var(--theme-filter-active)] bg-[var(--theme-filter-active-bg)]'
            : 'border-[var(--theme-filter-control-border)] bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:bg-[var(--theme-filter-control-border)]'
        )}
      >
        <Building2 className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">
          {selectedOrgs.length > 0 ? `${selectedOrgs.length} selected` : 'Filter by organization...'}
        </span>
        <ChevronDown className={clsx('w-4 h-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="mt-1 rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)] shadow-lg overflow-hidden max-h-64">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--theme-border-primary)]">
            <Search className="w-4 h-4 text-[var(--theme-text-secondary)] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search organizations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-secondary)] outline-none"
            />
          </div>

          {/* Options list */}
          <div className="overflow-y-auto max-h-48">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-[var(--theme-text-secondary)] text-center">
                No organizations found
              </div>
            ) : (
              filtered.slice(0, 50).map((name) => {
                const isSelected = selectedOrgs.includes(name);
                return (
                  <button
                    key={name}
                    onClick={() => onToggleOrg(name)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-[var(--theme-accent-muted)] text-[var(--theme-accent)]'
                        : 'text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                    )}
                  >
                    <div className={clsx(
                      'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                      isSelected
                        ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]'
                        : 'border-[var(--theme-text-secondary)]'
                    )}>
                      {isSelected && <span className="text-[10px] text-[var(--theme-accent-text)] font-bold">&#10003;</span>}
                    </div>
                    <span className="truncate">{name}</span>
                    {(orgEventCounts.get(name) ?? 0) > 0 && (
                      <span className="shrink-0 text-xs opacity-50">({orgEventCounts.get(name)})</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
