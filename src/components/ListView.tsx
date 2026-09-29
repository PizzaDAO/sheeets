'use client';

import { memo, useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ETHDenverEvent, ReactionEmoji, NativeAd, FriendInfo } from '@/lib/types';
import { formatDateLabel } from '@/lib/utils';
import { sortByStartTime } from '@/lib/time-parse';
import { EventCard } from './EventCard';
import { FeaturedSection } from './FeaturedSection';
import NativeAdCard from './NativeAdCard';
import { imageCache, FlyerLightbox } from './OGImage';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ListViewProps {
  events: ETHDenverEvent[];
  totalCount: number;
  itinerary?: Set<string>;
  onItineraryToggle?: (eventId: string) => void;
  friendsCountByEvent?: Map<string, number>;
  friendsByEvent?: Map<string, FriendInfo[]>;
  checkedInFriendsByEvent?: Map<string, FriendInfo[]>;
  checkInCounts?: Map<string, number>;
  reactionsByEvent?: Map<string, { emoji: ReactionEmoji; count: number; reacted: boolean }[]>;
  onToggleReaction?: (eventId: string, emoji: ReactionEmoji) => void;
  commentCounts?: Map<string, number>;
  nativeAds?: NativeAd[];
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  scrollToEventId?: string;
  /** Override ad insertion frequency (default 8). Controlled by A/B testing. */
  adFrequency?: number;
  /** Called when an ad becomes visible (for A/B impression tracking) */
  onAdImpression?: (adId: string) => void;
  /** Called when an ad is clicked (for A/B click tracking) */
  onAdClick?: (adId: string) => void;
  /** Which conference context (for per-ad tracking) */
  conference?: string;
  /** Featured events to show in a prominent section above the list */
  featuredEvents?: ETHDenverEvent[];
  onCheckIn?: (eventId: string) => void;
  checkInLoading?: boolean;
  liveEventIds?: Map<string, 'green' | 'yellow' | 'red'>;
  userLocation?: { lat: number; lng: number } | null;
  getRsvpStatus?: (eventId: string) => 'idle' | 'confirmed';
  onRsvp?: (eventId: string, lumaUrl: string, eventName: string) => void;
}

interface DateGroup {
  dateISO: string;
  label: string;
  events: ETHDenverEvent[];
}

type VirtualListItem =
  | { kind: 'date-header'; dateISO: string; label: string; eventCount: number }
  | { kind: 'event'; event: ETHDenverEvent }
  | { kind: 'ad'; ad: NativeAd };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Build the flat virtual list from date-grouped events, interleaving ads.
 *  Featured events are injected at the top of their date group (before time-sorted events). */
function buildFlatList(
  dateGroups: DateGroup[],
  activeAds: NativeAd[],
  adFrequency: number,
  featuredEvents?: ETHDenverEvent[],
): VirtualListItem[] {
  const items: VirtualListItem[] = [];
  let globalEventIndex = 0;

  // Index featured events by date for quick lookup
  const featuredByDate = new Map<string, ETHDenverEvent[]>();
  if (featuredEvents) {
    for (const fe of featuredEvents) {
      const key = fe.dateISO || 'unknown';
      if (!featuredByDate.has(key)) featuredByDate.set(key, []);
      featuredByDate.get(key)!.push(fe);
    }
  }

  for (const group of dateGroups) {
    items.push({
      kind: 'date-header',
      dateISO: group.dateISO,
      label: group.label,
      eventCount: group.events.length,
    });

    // Insert featured events at top of their date group
    const dateFeatured = featuredByDate.get(group.dateISO);
    if (dateFeatured) {
      for (const event of dateFeatured) {
        items.push({ kind: 'event', event });
        globalEventIndex++;
      }
    }

    for (const event of group.events) {
      items.push({ kind: 'event', event });
      globalEventIndex++;

      // Insert ad based on frequency (configurable via A/B testing)
      if (activeAds.length > 0 && adFrequency > 0 && globalEventIndex % adFrequency === 0) {
        const adIndex = (Math.floor(globalEventIndex / adFrequency) - 1) % activeAds.length;
        items.push({ kind: 'ad', ad: activeAds[adIndex] });
      }
    }
  }

  return items;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */


export const ListView = memo(function ListView({
  events,
  totalCount,
  itinerary,
  onItineraryToggle,
  friendsCountByEvent,
  friendsByEvent,
  checkedInFriendsByEvent,
  checkInCounts,
  reactionsByEvent,
  onToggleReaction,
  commentCounts,
  nativeAds,
  scrollContainerRef,
  scrollToEventId,
  adFrequency = 8,
  onAdImpression,
  onAdClick,
  conference,
  featuredEvents,
  onCheckIn,
  checkInLoading,
  liveEventIds,
  userLocation,
  getRsvpStatus,
  onRsvp,
}: ListViewProps) {
  const activeAds = useMemo(() => nativeAds?.filter(ad => ad.active !== false) || [], [nativeAds]);

  /* ---- date-group the events ---- */
  const dateGroups: DateGroup[] = useMemo(() => {
    const groupMap = new Map<string, ETHDenverEvent[]>();
    for (const event of events) {
      const key = event.dateISO || 'unknown';
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(event);
    }
    return Array.from(groupMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([dateISO, groupEvents]) => ({
        dateISO,
        label: dateISO === 'unknown' ? 'Date TBD' : formatDateLabel(dateISO),
        events: groupEvents.sort(sortByStartTime),
      }));
  }, [events]);

  /* ---- flatten into virtual items ---- */
  const flatItems = useMemo(
    () => buildFlatList(dateGroups, activeAds, adFrequency, featuredEvents),
    [dateGroups, activeAds, adFrequency, featuredEvents],
  );

  /* ---- fallback scroll container ref ---- */
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = scrollContainerRef ?? internalRef;

  /* ---- virtualizer ---- */
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => {
      const item = flatItems[index];
      if (item.kind === 'date-header') return 44;
      if (item.kind === 'ad') return 120;
      return 180; // event card estimate
    },
    overscan: 4,
    initialOffset: 0,
    measureElement: (el) => {
      // Include the item's actual height (padding is part of the element)
      return el.getBoundingClientRect().height;
    },
  });

  /* ---- force virtualizer to recalculate once scroll container is mounted ---- */
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      virtualizer.scrollToOffset(0);
      virtualizer.measure();
    }
  }, [virtualizer, containerRef, flatItems]);

  /* ---- flyer lightbox navigation ---- */
  const [lightboxEventIndex, setLightboxEventIndex] = useState<number | null>(null);
  // Counter to force re-render when an OG image finishes loading into the cache
  const [, setImageLoadTick] = useState(0);

  // Build ordered list of event indices (skip ads and headers)
  const eventIndices = useMemo(
    () => flatItems.reduce<number[]>((acc, item, i) => { if (item.kind === 'event') acc.push(i); return acc; }, []),
    [flatItems]
  );

  const lightboxEvent = lightboxEventIndex !== null ? flatItems[lightboxEventIndex] : null;
  const lightboxImageUrl = lightboxEvent?.kind === 'event' && lightboxEvent.event.link
    ? imageCache.get(lightboxEvent.event.link) ?? null
    : null;
  const lightboxRsvpUrl = lightboxEvent?.kind === 'event' ? lightboxEvent.event.link : undefined;

  const lightboxPosInEvents = lightboxEventIndex !== null ? eventIndices.indexOf(lightboxEventIndex) : -1;

  const hasImageAtPos = useCallback((pos: number) => {
    const idx = eventIndices[pos];
    const item = flatItems[idx];
    return item?.kind === 'event' && !!(item.event.link && imageCache.get(item.event.link));
  }, [eventIndices, flatItems]);

  const canPrev = lightboxPosInEvents > 0 && eventIndices.slice(0, lightboxPosInEvents).some((idx) => {
    const item = flatItems[idx];
    return item?.kind === 'event' && !!(item.event.link && imageCache.get(item.event.link));
  });
  const canNext = lightboxPosInEvents >= 0 && lightboxPosInEvents < eventIndices.length - 1 && eventIndices.slice(lightboxPosInEvents + 1).some((idx) => {
    const item = flatItems[idx];
    return item?.kind === 'event' && !!(item.event.link && imageCache.get(item.event.link));
  });

  // Preload current + adjacent event OG images when lightbox is open
  useEffect(() => {
    if (lightboxPosInEvents < 0) return;
    const toPreload: number[] = [lightboxPosInEvents];
    for (let d = 1; d <= 2; d++) {
      if (lightboxPosInEvents + d < eventIndices.length) toPreload.push(lightboxPosInEvents + d);
      if (lightboxPosInEvents - d >= 0) toPreload.push(lightboxPosInEvents - d);
    }
    for (const pos of toPreload) {
      const idx = eventIndices[pos];
      const item = flatItems[idx];
      if (item.kind === 'event' && item.event.link && !imageCache.has(item.event.link)) {
        const params = new URLSearchParams({ url: item.event.link });
        if (item.event.id) params.set('eventId', item.event.id);
        fetch(`/api/og?${params.toString()}`)
          .then(res => res.json())
          .then(data => {
            imageCache.set(item.event.link!, data.imageUrl);
            setImageLoadTick(n => n + 1);
          })
          .catch(() => {
            imageCache.set(item.event.link!, null);
            setImageLoadTick(n => n + 1);
          });
      }
    }
  }, [lightboxPosInEvents, eventIndices, flatItems]);

  const handleLightboxPrev = useCallback(() => {
    if (!canPrev) return;
    for (let p = lightboxPosInEvents - 1; p >= 0; p--) {
      if (hasImageAtPos(p)) { setLightboxEventIndex(eventIndices[p]); return; }
    }
  }, [canPrev, eventIndices, lightboxPosInEvents, hasImageAtPos]);

  const handleLightboxNext = useCallback(() => {
    if (!canNext) return;
    for (let p = lightboxPosInEvents + 1; p < eventIndices.length; p++) {
      if (hasImageAtPos(p)) { setLightboxEventIndex(eventIndices[p]); return; }
    }
  }, [canNext, eventIndices, lightboxPosInEvents, hasImageAtPos]);

  /* ---- sticky date header overlay ---- */
  const [stickyLabel, setStickyLabel] = useState<string | null>(null);
  const [stickyCount, setStickyCount] = useState<number>(0);

  const updateStickyHeader = useCallback(() => {
    const scrollEl = containerRef.current;
    if (!scrollEl) return;

    const scrollTop = scrollEl.scrollTop;

    // Don't show sticky overlay when first in-flow date header is still visible
    const virtualItems = virtualizer.getVirtualItems();
    if (flatItems[0]?.kind === 'date-header') {
      const firstVItem = virtualItems.find(v => v.index === 0);
      if (firstVItem && scrollTop < firstVItem.start + firstVItem.size) {
        setStickyLabel(null);
        setStickyCount(0);
        return;
      }
    } else if (scrollTop <= 10) {
      setStickyLabel(null);
      setStickyCount(0);
      return;
    }

    // Offset for the wrapper's padding-top (32px = py-4 on the outer container)
    const wrapperOffsetTop = 0;

    // Find the last date-header that has scrolled past the top
    let lastHeader: { label: string; eventCount: number } | null = null;
    for (const vItem of virtualItems) {
      const item = flatItems[vItem.index];
      if (item.kind === 'date-header') {
        // vItem.start is relative to the virtual list top
        if (vItem.start <= scrollTop + wrapperOffsetTop) {
          lastHeader = { label: item.label, eventCount: item.eventCount };
        }
      }
    }

    // If we have no virtual items in range, check non-virtual items:
    // fallback — find the last date-header before scroll position
    if (!lastHeader) {
      for (let i = 0; i < flatItems.length; i++) {
        const item = flatItems[i];
        if (item.kind === 'date-header') {
          const offset = virtualizer.getOffsetForIndex(i, 'start');
          if (offset !== undefined && offset[0] <= scrollTop + wrapperOffsetTop) {
            lastHeader = { label: item.label, eventCount: item.eventCount };
          }
        }
      }
    }

    if (lastHeader) {
      setStickyLabel(lastHeader.label);
      setStickyCount(lastHeader.eventCount);
    } else if (flatItems.length > 0 && flatItems[0].kind === 'date-header') {
      // default to first header
      const first = flatItems[0];
      setStickyLabel(first.label);
      setStickyCount(first.eventCount);
    }
  }, [containerRef, flatItems, virtualizer]);

  // Attach scroll listener for sticky header
  useEffect(() => {
    const scrollEl = containerRef.current;
    if (!scrollEl) return;

    // Initial computation
    updateStickyHeader();

    const handleScroll = () => updateStickyHeader();
    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [containerRef, updateStickyHeader]);

  // Also update when items change
  useEffect(() => {
    updateStickyHeader();
  }, [flatItems, updateStickyHeader]);

  /* ---- scrollToEventId support ---- */
  useEffect(() => {
    if (!scrollToEventId) return;
    const idx = flatItems.findIndex(
      (item) => item.kind === 'event' && item.event.id === scrollToEventId,
    );
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: 'start', behavior: 'smooth' });
    }
  }, [scrollToEventId, flatItems, virtualizer]);

  /* ---- empty state ---- */
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[var(--theme-text-muted)]">
        <p className="text-lg font-medium">No events found</p>
        <p className="text-sm mt-1">Try adjusting your filters</p>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="max-w-3xl mx-auto px-2 sm:px-4 pb-8 relative">
      {/* Overlay sticky date header */}
      {stickyLabel && (
        <div className="sticky top-0 z-20 bg-[var(--theme-date-sep-bg)] py-2 -mx-2 px-2 sm:-mx-4 sm:px-4 border-b border-[var(--theme-date-sep-border)] rounded-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[var(--theme-date-sep-text)]">
              {stickyLabel}
            </h2>
            <span className="text-xs text-[var(--theme-date-sep-muted)] font-medium">
              {stickyCount} event{stickyCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Virtual list container */}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = flatItems[virtualRow.index];

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {item.kind === 'date-header' ? (
                /* In-flow date header (hidden behind sticky overlay once scrolled past) */
                <div className={`py-2 border-b border-[var(--theme-date-sep-border)] bg-[var(--theme-date-sep-bg)] -mx-2 px-2 sm:-mx-4 sm:px-4 rounded-lg ${virtualRow.index === 0 ? '' : 'mt-4'}`}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-[var(--theme-date-sep-text)]">
                      {item.label}
                    </h2>
                    <span className="text-xs text-[var(--theme-date-sep-muted)] font-medium">
                      {item.eventCount} event{item.eventCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ) : item.kind === 'ad' ? (
                <div className="pt-3">
                  <NativeAdCard
                    ad={item.ad}
                    conference={conference}
                    onImpression={onAdImpression}
                    onClick={onAdClick}
                  />
                </div>
              ) : (
                <div className="pt-3">
                  <EventCard
                    event={item.event}
                    isInItinerary={itinerary?.has(item.event.id)}
                    onItineraryToggle={onItineraryToggle}
                    friendsCount={friendsCountByEvent?.get(item.event.id)}
                    friendsGoing={friendsByEvent?.get(item.event.id)}
                    checkedInFriends={checkedInFriendsByEvent?.get(item.event.id)}
                    checkInCount={checkInCounts?.get(item.event.id)}
                    reactions={reactionsByEvent?.get(item.event.id)}
                    onToggleReaction={onToggleReaction}
                    commentCount={commentCounts?.get(item.event.id)}
                    conference={conference}
                    onCheckIn={onCheckIn}
                    checkInLoading={checkInLoading}
                    liveUrgency={liveEventIds?.get(item.event.id)}
                    userLocation={userLocation}
                    onOpenLightbox={() => setLightboxEventIndex(virtualRow.index)}
                    rsvpStatus={getRsvpStatus?.(item.event.id)}
                    onRsvp={item.event.link ? () => onRsvp?.(item.event.id, item.event.link!, item.event.name) : undefined}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Flyer lightbox with prev/next navigation */}
      {lightboxEventIndex !== null && lightboxImageUrl && lightboxEvent?.kind === 'event' && (
        <FlyerLightbox
          imageUrl={lightboxImageUrl!}
          rsvpUrl={lightboxRsvpUrl}
          onClose={() => setLightboxEventIndex(null)}
          onPrev={canPrev ? handleLightboxPrev : undefined}
          onNext={canNext ? handleLightboxNext : undefined}
          eventId={lightboxEvent.event.id}
          isInItinerary={itinerary?.has(lightboxEvent.event.id)}
          onItineraryToggle={onItineraryToggle}
          friendsGoing={friendsByEvent?.get(lightboxEvent.event.id)}
        />
      )}
    </div>
  );
});
