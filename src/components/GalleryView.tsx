'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import type { ETHDenverEvent, ReactionEmoji, FriendInfo } from '@/lib/types';
import { formatDateLabel } from '@/lib/utils';
import { sortByStartTime } from '@/lib/time-parse';
import { VIBE_COLORS } from '@/lib/constants';
import { TAG_ICONS } from './TagBadge';
import { StarButton } from './StarButton';
import { imageCache, FlyerLightbox } from './OGImage';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface GalleryViewProps {
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
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  conference?: string;
  liveEventIds?: Map<string, 'green' | 'yellow' | 'red'>;
}

interface DateGroup {
  dateISO: string;
  label: string;
  events: ETHDenverEvent[];
}

/* ------------------------------------------------------------------ */
/* GalleryCard                                                         */
/* ------------------------------------------------------------------ */

function GalleryCard({
  event,
  isInItinerary,
  onItineraryToggle,
  friendsGoing,
  liveUrgency,
  onClick,
}: {
  event: ETHDenverEvent;
  isInItinerary: boolean;
  onItineraryToggle?: (eventId: string) => void;
  friendsGoing?: FriendInfo[];
  liveUrgency?: 'green' | 'yellow' | 'red';
  onClick: () => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(
    event.link ? imageCache.get(event.link) ?? null : null
  );
  const [loaded, setLoaded] = useState(event.link ? imageCache.has(event.link) : true);
  const [imgError, setImgError] = useState(false);

  // Lazy-load OG image via IntersectionObserver (same pattern as OGImage component)
  const cardRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !event.link || imageCache.has(event.link)) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          observer.disconnect();

          const params = new URLSearchParams({ url: event.link! });
          if (event.id) params.set('eventId', event.id);

          fetch(`/api/og?${params.toString()}`)
            .then((res) => res.json())
            .then((data) => {
              imageCache.set(event.link!, data.imageUrl);
              setImageUrl(data.imageUrl);
              setLoaded(true);
            })
            .catch(() => {
              imageCache.set(event.link!, null);
              setLoaded(true);
            });
        },
        { rootMargin: '200px' }
      );

      observer.observe(node);
    },
    [event.link, event.id]
  );

  const timeDisplay = event.isAllDay
    ? 'All Day'
    : `${event.startTime}${event.endTime ? ` \u2013 ${event.endTime}` : ''}`;

  const hasImage = loaded && imageUrl && !imgError;
  const showPlaceholder = !event.link || (loaded && !imageUrl) || imgError;

  // Tag icon + color for placeholder
  const primaryTag = event.tags[0] || event.vibe;
  const TagIcon = primaryTag ? TAG_ICONS[primaryTag] : null;
  const tagColor = primaryTag ? VIBE_COLORS[primaryTag] || VIBE_COLORS['default'] : undefined;

  return (
    <div
      ref={cardRef}
      className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`View flyer for ${event.name}`}
    >
      {/* Image or shimmer or placeholder */}
      {!loaded && !showPlaceholder && (
        <div className="absolute inset-0 animate-pulse bg-stone-800/50" />
      )}

      {hasImage && (
        <img
          src={imageUrl!}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      )}

      {showPlaceholder && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3"
          style={{
            backgroundColor: tagColor
              ? `color-mix(in srgb, ${tagColor} 15%, var(--theme-bg-secondary))`
              : 'var(--theme-bg-secondary)',
          }}
        >
          {TagIcon && (
            <TagIcon
              className="w-8 h-8 opacity-60"
              style={{ color: tagColor }}
            />
          )}
          <span className="text-xs text-center text-[var(--theme-text-secondary)] line-clamp-2 font-medium">
            {event.name}
          </span>
        </div>
      )}

      {/* StarButton + friend avatars overlay — top-right */}
      {onItineraryToggle && (
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
          {friendsGoing && friendsGoing.length > 0 && (
            <div className="flex items-center">
              {friendsGoing.slice(0, 3).map((friend, i) => (
                <div
                  key={friend.userId}
                  className={`w-5 h-5 rounded-full border border-white/50 shrink-0 overflow-hidden ${i > 0 ? '-ml-1.5' : ''}`}
                  style={{ zIndex: 3 - i }}
                  title={friend.displayName}
                >
                  {friend.avatarUrl ? (
                    <img
                      src={friend.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-[8px] font-bold text-white"
                      style={{
                        backgroundColor: `hsl(${Math.abs(friend.userId.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)) % 360}, 60%, 45%)`,
                      }}
                    >
                      {(friend.displayName || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="rounded-full bg-black/40 backdrop-blur-sm" style={{ '--theme-text-secondary': '#ffffff', '--theme-border-primary': 'rgba(255,255,255,0.6)', '--theme-accent': '#ffffff', '--theme-accent-muted': 'rgba(255,255,255,0.2)' } as React.CSSProperties}>
            <StarButton
              eventId={event.id}
              isStarred={isInItinerary}
              onToggle={onItineraryToggle}
              size="sm"
            />
          </div>
        </div>
      )}

      {/* Bottom overlay bar — gradient + name + time */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pt-8 pb-1.5 px-2">
        <div className="flex flex-col">
          <span className="text-white text-sm font-medium line-clamp-1">
            {event.name}
          </span>
          <span className="text-white/70 text-xs flex items-center gap-1">
            {liveUrgency && (
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 ${
                liveUrgency === 'red' ? 'bg-red-400' :
                liveUrgency === 'yellow' ? 'bg-yellow-400' :
                'bg-green-400'
              }`} />
            )}
            {timeDisplay}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GalleryView                                                         */
/* ------------------------------------------------------------------ */

export function GalleryView({
  events,
  totalCount,
  itinerary,
  onItineraryToggle,
  friendsCountByEvent,
  friendsByEvent,
  scrollContainerRef,
  conference,
  liveEventIds,
}: GalleryViewProps) {
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

  /* ---- flyer lightbox navigation ---- */
  const [lightboxEventIndex, setLightboxEventIndex] = useState<number | null>(null);
  const [, setImageLoadTick] = useState(0);

  // Flat list of all events for lightbox prev/next
  const allEvents = useMemo(
    () => dateGroups.flatMap((g) => g.events),
    [dateGroups]
  );

  const lightboxEvent = lightboxEventIndex !== null ? allEvents[lightboxEventIndex] : null;
  const lightboxImageUrl = lightboxEvent?.link
    ? imageCache.get(lightboxEvent.link) ?? null
    : null;
  const lightboxRsvpUrl = lightboxEvent?.link;

  const hasImage = useCallback((idx: number) => {
    const ev = allEvents[idx];
    return !!(ev?.link && imageCache.get(ev.link));
  }, [allEvents]);

  const canPrev = lightboxEventIndex !== null && allEvents.slice(0, lightboxEventIndex).some((ev) => ev.link && imageCache.get(ev.link));
  const canNext = lightboxEventIndex !== null && allEvents.slice(lightboxEventIndex + 1).some((ev) => ev.link && imageCache.get(ev.link));

  // Preload adjacent event OG images when lightbox is open
  useEffect(() => {
    if (lightboxEventIndex === null) return;
    const toPreload: number[] = [lightboxEventIndex];
    for (let d = 1; d <= 2; d++) {
      if (lightboxEventIndex + d < allEvents.length) toPreload.push(lightboxEventIndex + d);
      if (lightboxEventIndex - d >= 0) toPreload.push(lightboxEventIndex - d);
    }
    for (const pos of toPreload) {
      const ev = allEvents[pos];
      if (ev.link && !imageCache.has(ev.link)) {
        const params = new URLSearchParams({ url: ev.link });
        if (ev.id) params.set('eventId', ev.id);
        fetch(`/api/og?${params.toString()}`)
          .then((res) => res.json())
          .then((data) => {
            imageCache.set(ev.link!, data.imageUrl);
            setImageLoadTick((n) => n + 1);
          })
          .catch(() => {
            imageCache.set(ev.link!, null);
            setImageLoadTick((n) => n + 1);
          });
      }
    }
  }, [lightboxEventIndex, allEvents]);

  const handleLightboxPrev = useCallback(() => {
    if (!canPrev) return;
    setLightboxEventIndex((i) => {
      for (let j = i! - 1; j >= 0; j--) {
        if (hasImage(j)) return j;
      }
      return i;
    });
  }, [canPrev, hasImage]);

  const handleLightboxNext = useCallback(() => {
    if (!canNext) return;
    setLightboxEventIndex((i) => {
      for (let j = i! + 1; j < allEvents.length; j++) {
        if (hasImage(j)) return j;
      }
      return i;
    });
  }, [canNext, hasImage, allEvents.length]);

  /* ---- empty state ---- */
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[var(--theme-text-muted)]">
        <p className="text-lg font-medium">No events found</p>
        <p className="text-sm mt-1">Try adjusting your filters</p>
      </div>
    );
  }

  // Track a running global index across date groups for lightbox
  let globalIndex = 0;

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 pb-8">
      {dateGroups.map((group, groupIdx) => {
        const startIndex = globalIndex;
        const cards = group.events.map((event, eventIdx) => {
          const idx = startIndex + eventIdx;
          return (
            <GalleryCard
              key={event.id}
              event={event}
              isInItinerary={itinerary?.has(event.id) ?? false}
              onItineraryToggle={onItineraryToggle}
              friendsGoing={friendsByEvent?.get(event.id)}
              liveUrgency={liveEventIds?.get(event.id)}
              onClick={() => setLightboxEventIndex(idx)}
            />
          );
        });
        globalIndex += group.events.length;

        return (
          <div key={group.dateISO}>
            {/* Date header */}
            <div className={`sticky top-0 z-20 bg-[var(--theme-date-sep-bg)] px-3 sm:px-4 py-2 border-b border-[var(--theme-date-sep-border)] rounded-lg ${groupIdx > 0 ? 'mt-6' : ''}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[var(--theme-date-sep-text)]">
                  {group.label}
                </h2>
                <span className="text-xs text-[var(--theme-date-sep-muted)] font-medium">
                  {group.events.length} event{group.events.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
              {cards}
            </div>
          </div>
        );
      })}

      {/* Flyer lightbox with prev/next navigation */}
      {lightboxEventIndex !== null && lightboxImageUrl && lightboxEvent && (
        <FlyerLightbox
          imageUrl={lightboxImageUrl}
          rsvpUrl={lightboxRsvpUrl}
          onClose={() => setLightboxEventIndex(null)}
          onPrev={canPrev ? handleLightboxPrev : undefined}
          onNext={canNext ? handleLightboxNext : undefined}
          eventId={lightboxEvent.id}
          isInItinerary={itinerary?.has(lightboxEvent.id)}
          onItineraryToggle={onItineraryToggle}
          friendsGoing={friendsByEvent?.get(lightboxEvent.id)}
        />
      )}
    </div>
  );
}
