'use client';

import { Map, List, Table, LayoutGrid } from 'lucide-react';
import { ViewMode } from '@/lib/types';
import { trackViewChange } from '@/lib/analytics';
import clsx from 'clsx';

interface ViewToggleProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
}

const views: { mode: ViewMode; icon: typeof Map; label: string }[] = [
  { mode: 'map', icon: Map, label: 'Map' },
  { mode: 'list', icon: List, label: 'List' },
  { mode: 'table', icon: Table, label: 'Table' },
  { mode: 'gallery', icon: LayoutGrid, label: 'Gallery' },
];

/**
 * Segmented control for switching how events are displayed.
 * Rendered in the content toolbar (directly above the events), not the site header.
 * On small screens only the active option shows its text label; the rest are
 * icon-only with an accessible name and a tooltip.
 */
export function ViewToggle({ viewMode, onViewChange }: ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="View events as"
      className="flex rounded-lg border border-[var(--theme-border-primary)] overflow-hidden"
    >
      {views.map(({ mode, icon: Icon, label }) => {
        const active = viewMode === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => {
              trackViewChange(mode);
              onViewChange(mode);
            }}
            aria-pressed={active}
            aria-label={`${label} view`}
            title={`${label} view`}
            className={clsx(
              'flex items-center gap-1.5 h-8 px-2.5 sm:px-3 text-sm font-medium transition-colors cursor-pointer border-l first:border-l-0 border-[var(--theme-border-primary)]',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--theme-accent)]',
              active
                ? 'text-[var(--theme-accent)]'
                : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] active:text-[var(--theme-text-primary)]'
            )}
            style={{ backgroundColor: active ? 'var(--theme-accent-muted)' : 'var(--theme-bg-primary)' }}
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className={active ? 'inline' : 'hidden sm:inline'}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
