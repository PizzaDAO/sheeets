'use client';

import { useMemo, useCallback } from 'react';
import clsx from 'clsx';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface MiniCalendarProps {
  dates: string[];
  startDateTime: string;
  endDateTime: string;
  onChange: (start: string, end: string) => void;
  timezone?: string;
}

export function MiniCalendar({ dates, startDateTime, endDateTime, onChange, timezone }: MiniCalendarProps) {
  const startDate = startDateTime.split('T')[0];
  const endDate = endDateTime.split('T')[0];

  const today = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', { timeZone: timezone || 'America/New_York' });
  }, [timezone]);

  const grid = useMemo(() => {
    if (!dates.length) return [] as (string | null)[];

    const [y0, m0, d0] = dates[0].split('-').map(Number);
    const startDow = new Date(y0, m0 - 1, d0).getDay();

    const cells: (string | null)[] = Array(startDow).fill(null);
    for (const d of dates) {
      const [y, m, day] = d.split('-').map(Number);
      const dow = new Date(y, m - 1, day).getDay();
      while (cells.length % 7 !== dow) cells.push(null);
      cells.push(d);
    }
    while (cells.length % 7 !== 0) cells.push(null);

    return cells;
  }, [dates]);

  const isFullRange = startDate === dates[0] && endDate === dates[dates.length - 1];

  const isSingleDay = startDate === endDate;

  const handleDateTap = useCallback((tappedDate: string) => {
    // Tap the selected single-day again → clear to full range
    if (isSingleDay && startDate === tappedDate) {
      onChange(`${dates[0]}T00:00`, `${dates[dates.length - 1]}T23:30`);
      return;
    }
    // Single day selected → tap another date to create a range
    if (isSingleDay) {
      const a = tappedDate < startDate ? tappedDate : startDate;
      const b = tappedDate > startDate ? tappedDate : startDate;
      onChange(`${a}T00:00`, `${b}T23:30`);
      return;
    }
    // Full range → select single day
    if (isFullRange) {
      onChange(`${tappedDate}T00:00`, `${tappedDate}T23:30`);
      return;
    }
    // Multi-day range selected → tap any date to start over with single day
    onChange(`${tappedDate}T00:00`, `${tappedDate}T23:30`);
  }, [startDate, isSingleDay, dates, onChange, isFullRange]);

  const day = (iso: string) => parseInt(iso.split('-')[2], 10);

  return (
    <div className="rounded-xl overflow-hidden inline-block border border-[var(--theme-filter-control-border)]" style={{ backgroundColor: 'var(--theme-bg-card)' }}>
      {/* Day-of-week header row */}
      <div className="grid grid-cols-7 gap-x-1 px-3 pt-2 pb-2 bg-[var(--theme-filter-control-bg)]" style={{ backgroundImage: 'linear-gradient(var(--theme-filter-control-bg), var(--theme-filter-control-bg))', backgroundColor: 'var(--theme-bg-filter)' }}>
        {DAY_LETTERS.map((letter, i) => (
          <div key={i} className="w-9 h-6 flex items-center justify-center text-xs font-bold text-white select-none">
            {letter}
          </div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7 gap-x-1 px-3 py-2">
        {grid.map((date, i) => {
          if (!date) return <div key={`e${i}`} className="w-9 h-9" />;

          const inRange = date >= startDate && date <= endDate;
          const isStart = date === startDate;
          const isEnd = date === endDate;
          const isEndpoint = isStart || isEnd;
          const isPast = date < today;

          return (
            <button
              key={date}
              type="button"
              onClick={() => handleDateTap(date)}
              className={clsx(
                'w-9 h-9 flex items-center justify-center text-sm font-medium transition-all cursor-pointer select-none',
                isPast && 'line-through opacity-50',
                isEndpoint && 'text-[var(--theme-accent-text)]',
                isEndpoint && isSingleDay && 'rounded-full',
                isStart && !isSingleDay && 'rounded-l-full',
                isEnd && !isSingleDay && 'rounded-r-full',
                inRange && !isEndpoint && 'text-[var(--theme-text-primary)]',
                !inRange && 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-full'
              )}
              style={
                isEndpoint
                  ? { backgroundColor: 'var(--theme-accent)' }
                  : inRange
                    ? { backgroundColor: 'color-mix(in srgb, var(--theme-accent) 15%, transparent)' }
                    : undefined
              }
            >
              {day(date)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
