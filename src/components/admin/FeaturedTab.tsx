'use client';

import { useState, useMemo } from 'react';
import { Star, Loader2 } from 'lucide-react';
import type { ETHDenverEvent } from '@/lib/types';

interface Props {
  events: ETHDenverEvent[];
  setEvents: React.Dispatch<React.SetStateAction<ETHDenverEvent[]>>;
  loading: boolean;
  conference: string;
  search: string;
  password: string;
}

export default function FeaturedTab({ events, setEvents, loading, conference, search, password }: Props) {
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = events.filter((e) => e.conference === conference);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.organizer.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      if (a.isFeatured && !b.isFeatured) return -1;
      if (!a.isFeatured && b.isFeatured) return 1;
      const d = a.dateISO.localeCompare(b.dateISO);
      if (d !== 0) return d;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [events, conference, search]);

  async function toggleFeatured(event: ETHDenverEvent) {
    setTogglingId(event.id);
    try {
      const res = await fetch('/api/admin/toggle-featured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          conference: event.conference,
          eventName: event.name,
          featured: !event.isFeatured,
        }),
      });

      if (res.ok) {
        setEvents((prev) =>
          prev.map((e) =>
            e.id === event.id ? { ...e, isFeatured: !e.isFeatured } : e
          )
        );
      }
    } catch {
      // ignore
    }
    setTogglingId(null);
  }

  return (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading events...
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((event) => (
            <div
              key={event.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                event.isFeatured
                  ? 'bg-amber-500/10 border border-amber-500/20'
                  : 'hover:bg-stone-900/50'
              }`}
            >
              <button
                onClick={() => toggleFeatured(event)}
                disabled={togglingId === event.id}
                className="shrink-0 cursor-pointer disabled:opacity-50"
                title={event.isFeatured ? 'Remove featured' : 'Mark as featured'}
              >
                {togglingId === event.id ? (
                  <Loader2 className="w-5 h-5 animate-spin text-stone-500" />
                ) : (
                  <Star
                    className={`w-5 h-5 transition-colors ${
                      event.isFeatured
                        ? 'text-amber-400 fill-orange-400'
                        : 'text-stone-600 hover:text-stone-400'
                    }`}
                  />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {event.name}
                </p>
                <p className="text-xs text-stone-500 truncate">
                  {event.organizer && `${event.organizer} · `}
                  {event.date} · {event.startTime}
                </p>
              </div>

              {event.isFeatured && (
                <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full shrink-0">
                  FEATURED
                </span>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="text-center text-stone-500 py-10">No events found</p>
          )}
        </div>
      )}
    </>
  );
}
