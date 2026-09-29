'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { trackSearch } from '@/lib/analytics';

interface SearchBarProps {
  value: string;
  onChange: (query: string) => void;
  eventCount?: number;
}

export function SearchBar({ value, onChange, eventCount }: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local value when external value changes (e.g., on clear)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      onChange(newValue);
      if (newValue.length >= 2) trackSearch(newValue);
    }, 300);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleClear = () => {
    setLocalValue('');
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    onChange('');
    trackSearch('');
  };

  return (
    <div className="relative w-full max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-filter-text)] pointer-events-none" />
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={eventCount != null ? `${eventCount} events` : 'Events'}
        className="w-full pl-10 pr-9 py-2 bg-[var(--theme-filter-control-bg)] border border-[var(--theme-filter-control-border)] text-[var(--theme-filter-active)] placeholder-[var(--theme-filter-text)] rounded-lg text-sm focus:outline-none focus:border-[var(--theme-accent)] transition-colors"
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--theme-filter-text)] hover:text-[var(--theme-filter-active)] transition-colors cursor-pointer"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
