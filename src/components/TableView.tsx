'use client';

import { memo, useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Download, ExternalLink, Plus, Check, X, Users } from 'lucide-react';
import type { ETHDenverEvent, ReactionEmoji, FriendInfo } from '@/lib/types';
import { trackEventClick, trackTableExport, trackOutboundClick } from '@/lib/analytics';
import { trackEvent } from '@/lib/event-tracking';
import { shortenAddress, isSafeHttpUrl } from '@/lib/utils';
import { AddressLink } from './AddressLink';
import { TagBadge } from './TagBadge';
import { EventCard } from './EventCard';
import { CalendarIcon } from './icons/CalendarIcon';
import { FriendAvatarStack } from './FriendAvatarStack';
import UserAvatar from './UserAvatar';
import { distanceMeters } from '@/lib/geo';
import { imageCache, FlyerLightbox } from './OGImage';

interface TableViewProps {
  events: ETHDenverEvent[];
  totalCount: number;
  itinerary?: Set<string>;
  onItineraryToggle?: (eventId: string) => void;
  onScrolledChange?: (scrolled: boolean) => void;
  friendsCountByEvent?: Map<string, number>;
  friendsByEvent?: Map<string, FriendInfo[]>;
  checkedInFriendsByEvent?: Map<string, FriendInfo[]>;
  checkInCounts?: Map<string, number>;
  reactionsByEvent?: Map<string, { emoji: ReactionEmoji; count: number; reacted: boolean }[]>;
  onToggleReaction?: (eventId: string, emoji: ReactionEmoji) => void;
  commentCounts?: Map<string, number>;
  conference?: string;
  /** Featured events to show in a prominent section at the top of the table */
  featuredEvents?: ETHDenverEvent[];
  /** Whether user is signed in (shows ? tooltip in friends column when false) */
  isSignedIn?: boolean;
  /** Callback to open sign-in modal */
  onSignIn?: () => void;
  /** Set of event IDs that are currently live */
  liveEventIds?: Map<string, 'green' | 'yellow' | 'red'>;
  /** User's current location for distance display */
  userLocation?: { lat: number; lng: number } | null;
  getRsvpStatus?: (eventId: string) => 'idle' | 'confirmed';
  onRsvp?: (eventId: string, lumaUrl: string, eventName: string) => void;
}

/** Day-of-week abbreviations for mobile badges */
const DAY_ABBR: Record<number, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
};

/** Format a dateISO string like "2026-02-10" into "Mon Feb 10" */
function formatDateHeader(dateISO: string): string {
  // Parse as local date (avoid timezone offset issues with new Date(string))
  const [year, month, day] = dateISO.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
  const monthName = d.toLocaleDateString('en-US', { month: 'short' });
  const dayNum = d.getDate();
  return `${dayName} ${monthName} ${dayNum}`;
}

/** Render a styled day badge on mobile, plain text on desktop */
function DayBadge({ dateISO, label }: { dateISO: string; label: string }) {
  const [year, month, day] = dateISO.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const dow = d.getDay();
  const abbr = DAY_ABBR[dow];

  return (
    <>
      <span className="sm:hidden inline-flex items-center gap-0.5 text-xs text-white">
        <span className="font-bold">{abbr}</span>
        <span>{label.replace(/^\w+\s/, '')}</span>
      </span>
      <span className="hidden sm:inline">{label}</span>
    </>
  );
}

/** Group events by dateISO, preserving order */
function groupByDate(events: ETHDenverEvent[]): { dateISO: string; label: string; events: ETHDenverEvent[] }[] {
  const groups: { dateISO: string; label: string; events: ETHDenverEvent[] }[] = [];
  let current: typeof groups[number] | null = null;

  for (const event of events) {
    if (!current || current.dateISO !== event.dateISO) {
      current = { dateISO: event.dateISO, label: formatDateHeader(event.dateISO), events: [] };
      groups.push(current);
    }
    current.events.push(event);
  }

  return groups;
}

/** Format distance for display */
function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`;
}

/** Friends going modal for table view */
function FriendsGoingModal({ eventName, friends, onClose }: { eventName: string; friends: FriendInfo[]; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border-primary)]">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-[var(--theme-text-primary)]">Friends Going</h3>
            <p className="text-xs text-[var(--theme-text-secondary)] truncate">{eventName}</p>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer shrink-0 ml-2" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto max-h-[60vh] p-3 space-y-2">
          {friends.map((friend) => (
            <div key={friend.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--theme-bg-tertiary)]">
              <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden" style={{ backgroundColor: 'color-mix(in srgb, var(--friend-blue) 20%, transparent)' }}>
                <UserAvatar avatarUrl={friend.avatarUrl} xHandle={friend.xHandle} displayName={friend.displayName} userId={friend.userId} size="sm" className="!w-full !h-full" />
              </div>
              <span className="text-sm text-[var(--theme-text-primary)] truncate">{friend.displayName}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const COLUMN_COUNT = 7; // star, friends, time, organizer, event, location, tags

export const TableView = memo(function TableView({
  events,
  itinerary,
  onItineraryToggle,
  onScrolledChange,
  friendsCountByEvent,
  friendsByEvent,
  checkedInFriendsByEvent,
  checkInCounts,
  reactionsByEvent,
  onToggleReaction,
  commentCounts,
  conference,
  featuredEvents,
  isSignedIn,
  onSignIn,
  liveEventIds,
  userLocation,
  getRsvpStatus,
  onRsvp,
}: TableViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const separatorRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const [currentDateLabel, setCurrentDateLabel] = useState<string>('Time');
  const lastScrolledRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const [selectedEvent, setSelectedEvent] = useState<ETHDenverEvent | null>(null);
  const [friendsModalEvent, setFriendsModalEvent] = useState<{ name: string; friends: FriendInfo[] } | null>(null);

  const groups = useMemo(() => groupByDate(events), [events]);

  /* ---- flyer lightbox navigation ---- */
  const [lightboxEventIndex, setLightboxEventIndex] = useState<number | null>(null);
  const [, setImageLoadTick] = useState(0);

  const allEvents = useMemo(() => groups.flatMap((g) => g.events), [groups]);

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

  // Compute dynamic tags column width based on max tag count across visible events
  const tagsColWidth = useMemo(() => {
    const maxTags = Math.min(10, events.reduce((max, e) => Math.max(max, e.tags.length), 0));
    return maxTags * 24 + 24; // 24px per icon (20px + 4px gap) + 24px cell padding
  }, [events]);

  // Close modal on Escape key
  useEffect(() => {
    if (!selectedEvent) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedEvent(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedEvent]);

  // Reset to "Time" when groups change (e.g. filter change). Adjusted during
  // render rather than in an effect to avoid an extra commit.
  const [prevGroups, setPrevGroups] = useState(groups);
  if (groups !== prevGroups) {
    setPrevGroups(groups);
    setCurrentDateLabel('Time');
  }

  // Track which date separator is at/near the top using IntersectionObserver
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || groups.length === 0) return;

    const observer = new IntersectionObserver(
      () => {
        const hasScrolled = container.scrollTop > 5;
        if (!hasScrolled) {
          setCurrentDateLabel('Time');
          return;
        }

        const separators = Array.from(separatorRefs.current.entries()).map(([dateISO, el]) => {
          const rect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          return { dateISO, relativeTop: rect.top - containerRect.top };
        });
        separators.sort((a, b) => a.relativeTop - b.relativeTop);

        const stickyThreshold = 40;
        let currentDate: string | null = null;
        for (const sep of separators) {
          if (sep.relativeTop <= stickyThreshold) {
            currentDate = sep.dateISO;
          }
        }

        if (currentDate) {
          setCurrentDateLabel(formatDateHeader(currentDate));
        } else {
          setCurrentDateLabel('Time');
        }
      },
      {
        root: container,
        threshold: [0, 0.1, 0.5, 1],
        rootMargin: '-40px 0px 0px 0px',
      }
    );

    for (const el of separatorRefs.current.values()) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [groups]);

  // Also handle scroll events for more precise tracking
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || groups.length === 0) return;

    // Notify parent: hide filter on scroll down, show on scroll up or at top
    const scrollTop = container.scrollTop;
    const atTop = scrollTop <= 5;
    const scrollingDown = scrollTop > lastScrollTopRef.current + 2;
    const scrollingUp = scrollTop < lastScrollTopRef.current - 2;
    lastScrollTopRef.current = scrollTop;

    // Only hide the filter bar if there's enough overflow that hiding it won't
    // eliminate the scroll, which would cause a show->hide->show jitter loop.
    const overflowAmount = container.scrollHeight - container.clientHeight;
    const nearBottom = scrollTop + container.clientHeight >= container.scrollHeight - 50;
    const shouldHide = !atTop && !nearBottom && scrollingDown && overflowAmount > 80;
    const shouldShow = atTop || scrollingUp;

    if (shouldHide && !lastScrolledRef.current) {
      lastScrolledRef.current = true;
      onScrolledChange?.(true);
    } else if (shouldShow && lastScrolledRef.current) {
      lastScrolledRef.current = false;
      onScrolledChange?.(false);
    }

    if (container.scrollTop <= 5) {
      setCurrentDateLabel('Time');
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const stickyThreshold = containerRect.top + 40;

    const separators = Array.from(separatorRefs.current.entries()).map(([dateISO, el]) => ({
      dateISO,
      top: el.getBoundingClientRect().top,
    }));

    separators.sort((a, b) => a.top - b.top);

    let currentDate: string | null = null;
    for (const sep of separators) {
      if (sep.top <= stickyThreshold) {
        currentDate = sep.dateISO;
      }
    }

    if (currentDate) {
      setCurrentDateLabel(formatDateHeader(currentDate));
    } else {
      setCurrentDateLabel('Time');
    }
  }, [groups, onScrolledChange]);

  // Store ref callback for separator rows
  const setSeparatorRef = useCallback((dateISO: string, el: HTMLTableRowElement | null) => {
    if (el) {
      separatorRefs.current.set(dateISO, el);
    } else {
      separatorRefs.current.delete(dateISO);
    }
  }, []);

  // Generate and download CSV from currently displayed events
  const downloadCSV = useCallback(() => {
    trackTableExport();
    const escapeCSV = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const header = ['Date', 'Start Time', 'End Time', 'Organizer', 'Event Name', 'Address', 'Cost', 'Tags', 'Link'];
    const rows = events.map((e) => [
      e.date,
      e.startTime,
      e.endTime,
      e.organizer,
      e.name,
      e.address,
      e.cost,
      e.tags.join(', '),
      e.link,
    ].map(escapeCSV));

    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plan-wtf-events.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [events]);

  return (
    <div className="max-w-full mx-auto px-2 sm:px-4 pb-3 flex-1 min-h-0 min-w-0 flex flex-col w-full">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="overflow-auto rounded-lg border border-[var(--theme-border-primary)] flex-1 min-h-0 min-w-0 overscroll-none"
      >
        <table className="w-full text-sm text-left md:table-fixed" style={{ minWidth: Math.max(640, 142 + tagsColWidth + 420) }}>
          <colgroup>
            <col style={{ width: 36 }} />                                                                          {/* star */}
            <col style={{ width: 44 }} />                                                                          {/* friends */}
            <col style={{ width: 100 }} />                                                                         {/* when */}
            <col style={{ width: `calc((100% - 36px - 44px - 100px - ${tagsColWidth}px) * 0.22)` }} />             {/* organizer */}
            <col style={{ width: `calc((100% - 36px - 44px - 100px - ${tagsColWidth}px) * 0.50)` }} />             {/* event */}
            <col style={{ width: `calc((100% - 36px - 44px - 100px - ${tagsColWidth}px) * 0.28)` }} />             {/* where */}
            <col style={{ width: tagsColWidth }} />                                                                {/* tags */}
          </colgroup>
          <thead className="text-xs uppercase tracking-wider text-[var(--theme-table-header-text)] bg-[var(--theme-table-header-bg)] border-b border-[var(--theme-border-primary)] sticky top-0 z-20">
            <tr>
              <th className="py-2.5"><div className="flex justify-center"><CalendarIcon className="w-5 h-5" /></div></th>
              <th className="px-1 py-2.5 text-center" title={!isSignedIn ? 'Sign in to add friends and see who\'s going' : 'Friends going'}><Users className="w-3.5 h-3.5 mx-auto" /></th>
              <th className="px-3 py-2.5 whitespace-nowrap align-middle">
                {currentDateLabel === 'Time' ? (
                  'WHEN'
                ) : (
                  <span className="text-[var(--theme-table-header-text)] font-semibold">
                    <span className="hidden sm:inline">{currentDateLabel.toUpperCase()}</span>
                    <span className="sm:hidden flex flex-col leading-tight text-white">
                      {(() => {
                        const g = groups.find(gr => formatDateHeader(gr.dateISO) === currentDateLabel);
                        if (!g) return <span className="text-[11px]">{currentDateLabel.toUpperCase()}</span>;
                        const [y, m, d] = g.dateISO.split('-').map(Number);
                        const date = new Date(y, m - 1, d);
                        const dow = date.getDay();
                        return (
                          <>
                            <span className="text-[11px] font-bold">{DAY_ABBR[dow]}</span>
                            <span className="text-[10px]">{currentDateLabel.replace(/^\w+\s/, '').toUpperCase()}</span>
                          </>
                        );
                      })()}
                    </span>
                  </span>
                )}
              </th>
              <th className="px-3 py-2.5 hidden sm:table-cell">Organizer</th>
              <th className="px-3 py-2.5">Event</th>
              <th className="px-3 py-2.5">Where</th>
              <th className="px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span>Tags</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={downloadCSV}
                      className="p-1 rounded text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
                      title="Download CSV"
                      aria-label="Download CSV"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href="https://plan.wtf/data"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors"
                      title="Open spreadsheet"
                      aria-label="Open spreadsheet"
                      onClick={() => trackOutboundClick('spreadsheet', 'https://plan.wtf/data')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--theme-border-primary)]/50">
            {groups.map((group) => (
              <DateGroup
                key={group.dateISO}
                group={group}
                itinerary={itinerary}
                onItineraryToggle={onItineraryToggle}
                setSeparatorRef={setSeparatorRef}
                friendsCountByEvent={friendsCountByEvent}
                friendsByEvent={friendsByEvent}
                checkInCounts={checkInCounts}
                onSelectEvent={setSelectedEvent}
                conference={conference}
                featuredEvents={featuredEvents?.filter(e => e.dateISO === group.dateISO)}
                selectedEventId={selectedEvent?.id}
                isSignedIn={isSignedIn}
                onSignIn={onSignIn}
                liveEventIds={liveEventIds}
                userLocation={userLocation}
                onShowFriends={(name, friends) => setFriendsModalEvent({ name, friends })}
              />
            ))}
          </tbody>
        </table>
      </div>
      {events.length === 0 && (
        <div className="text-center py-12 text-[var(--theme-text-muted)]">
          No events match your filters.
        </div>
      )}
      {selectedEvent && createPortal(
        <EventDetailModal
          event={selectedEvent}
          isInItinerary={itinerary?.has(selectedEvent.id) ?? false}
          onItineraryToggle={onItineraryToggle}
          friendsCount={friendsCountByEvent?.get(selectedEvent.id) ?? 0}
          friendsGoing={friendsByEvent?.get(selectedEvent.id)}
          checkedInFriends={checkedInFriendsByEvent?.get(selectedEvent.id)}
          reactions={reactionsByEvent?.get(selectedEvent.id)}
          onToggleReaction={onToggleReaction}
          commentCount={commentCounts?.get(selectedEvent.id)}
          onClose={() => setSelectedEvent(null)}
          rsvpStatus={getRsvpStatus?.(selectedEvent.id)}
          onRsvp={selectedEvent.link ? () => onRsvp?.(selectedEvent.id, selectedEvent.link!, selectedEvent.name) : undefined}
          onOpenLightbox={() => {
            const idx = allEvents.findIndex((e) => e.id === selectedEvent.id);
            if (idx >= 0) {
              setSelectedEvent(null);
              setLightboxEventIndex(idx);
            }
          }}
        />,
        document.body
      )}
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
      {friendsModalEvent && createPortal(
        <FriendsGoingModal
          eventName={friendsModalEvent.name}
          friends={friendsModalEvent.friends}
          onClose={() => setFriendsModalEvent(null)}
        />,
        document.body
      )}
    </div>
  );
});

/** Modal overlay showing full EventCard for a selected table row */
function EventDetailModal({
  event,
  isInItinerary,
  onItineraryToggle,
  friendsCount,
  friendsGoing,
  checkedInFriends,
  reactions,
  onToggleReaction,
  commentCount,
  onClose,
  rsvpStatus,
  onRsvp,
  onOpenLightbox,
}: {
  event: ETHDenverEvent;
  isInItinerary: boolean;
  onItineraryToggle?: (eventId: string) => void;
  friendsCount: number;
  friendsGoing?: FriendInfo[];
  checkedInFriends?: FriendInfo[];
  reactions?: { emoji: ReactionEmoji; count: number; reacted: boolean }[];
  onToggleReaction?: (eventId: string, emoji: ReactionEmoji) => void;
  commentCount?: number;
  onClose: () => void;
  rsvpStatus?: 'idle' | 'confirmed';
  onRsvp?: () => void;
  onOpenLightbox?: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[50] bg-black/50" onClick={onClose} />
      {/* Modal container */}
      <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 pointer-events-none">
        <div className="relative w-full max-w-lg pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <EventCard
            event={event}
            isInItinerary={isInItinerary}
            onItineraryToggle={onItineraryToggle}
            friendsCount={friendsCount}
            friendsGoing={friendsGoing}
            checkedInFriends={checkedInFriends}
            reactions={reactions}
            onToggleReaction={onToggleReaction}
            commentCount={commentCount}
            rsvpStatus={rsvpStatus}
            onRsvp={onRsvp}
            onOpenLightbox={onOpenLightbox ? () => onOpenLightbox() : undefined}
          />
        </div>
      </div>
    </>
  );
}

/** Shared row-level props passed down to TableRow / FeaturedTableRow */
interface TableRowSharedProps {
  itinerary?: Set<string>;
  onItineraryToggle?: (eventId: string) => void;
  friendsByEvent?: Map<string, FriendInfo[]>;
  checkInCounts?: Map<string, number>;
  onSelectEvent: (event: ETHDenverEvent) => void;
  conference?: string;
  isSignedIn?: boolean;
  onSignIn?: () => void;
  liveEventIds?: Map<string, 'green' | 'yellow' | 'red'>;
  userLocation?: { lat: number; lng: number } | null;
}

/** A single featured event row with impression tracking */
function FeaturedTableRow({
  event,
  itinerary,
  onItineraryToggle,
  friendsByEvent,
  checkInCounts,
  onSelectEvent,
  conference,
  isSignedIn,
  onSignIn,
  liveEventIds,
  userLocation,
}: TableRowSharedProps & { event: ETHDenverEvent }) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const impressionTracked = useRef(false);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || impressionTracked.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !impressionTracked.current) {
          impressionTracked.current = true;
          trackEvent({
            event_id: event.id,
            event_name: event.name,
            event_type: 'impression',
            conference,
            source: 'table',
          });
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [event.id, event.name, conference]);

  const isInItinerary = itinerary?.has(event.id) ?? false;

  return (
    <tr
      ref={rowRef}
      key={`featured-${event.id}`}
      className="hover:bg-[var(--theme-bg-secondary)]/70 transition-colors cursor-pointer bg-[var(--theme-bg-primary)]"
      style={{ outline: '2px solid var(--theme-popup-featured-border)', outlineOffset: '-2px' }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('a, button')) return;
        onSelectEvent(event);
      }}
    >
      <td className="px-2 py-2">
        <button
          onClick={() => onItineraryToggle?.(event.id)}
          className="cursor-pointer p-0.5"
          title={isInItinerary ? 'Remove from itinerary' : 'Add to itinerary'}
        >
          <span className={`w-6 h-6 flex items-center justify-center rounded-full border transition-colors ${
            isInItinerary
              ? 'text-[var(--theme-accent)] border-[var(--theme-accent)]'
              : 'text-[var(--theme-text-secondary)] border-[var(--theme-border-primary)] hover:text-[var(--theme-text-primary)]'
          }`} style={isInItinerary ? { backgroundColor: 'var(--theme-accent-muted)' } : undefined}>
            {isInItinerary ? <Check className="w-3 h-3" strokeWidth={3} /> : <Plus className="w-3 h-3" strokeWidth={2.5} />}
          </span>
        </button>
      </td>
      <td className="px-1 py-2">
        <div className="flex justify-center">
          {(() => {
            if (!isSignedIn) return (
              <button
                onClick={(e) => { e.stopPropagation(); onSignIn?.(); }}
                className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] text-xs cursor-pointer transition-colors"
                title="Sign in to add friends and see who's going"
              >?</button>
            );
            const friends = friendsByEvent?.get(event.id);
            return friends && friends.length > 0 ? (
              <FriendAvatarStack friends={friends} maxShow={1} size="sm" />
            ) : null;
          })()}
        </div>
      </td>
      <td className="px-3 py-2 text-[var(--theme-text-secondary)] sm:whitespace-nowrap">
        <div className="flex items-start sm:items-center gap-1.5">
          {(() => { const u = liveEventIds?.get(event.id); return u ? <span className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 mt-1.5 sm:mt-0 ${u === 'red' ? 'bg-red-400' : u === 'yellow' ? 'bg-yellow-400' : 'bg-green-400'}`} title={u === 'red' ? 'Ending soon' : u === 'yellow' ? 'Less than 1hr left' : 'Live now'} /> : null; })()}
          <span className="relative inline-block">
            <span className="sm:inline hidden">{event.startTime}{event.endTime ? `-${event.endTime}` : ''}</span>
            <span className="sm:hidden flex flex-col leading-tight">
              <span>{event.startTime}</span>
              {event.endTime && <span className="text-[10px] text-[var(--theme-text-muted)]">{event.endTime}</span>}
            </span>
            {(checkInCounts?.get(event.id) ?? 0) > 0 && (
              <span className="absolute -top-1.5 -right-3 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-green-500 text-white text-[8px] font-bold px-0.5 pointer-events-none">
                {checkInCounts!.get(event.id)}
              </span>
            )}
          </span>
          {userLocation && event.lat && event.lng && (
            <span className="text-[10px] text-[var(--theme-text-muted)]">{formatDistance(distanceMeters(userLocation.lat, userLocation.lng, event.lat, event.lng))}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-[var(--theme-text-secondary)] truncate hidden sm:table-cell" title={event.organizer}>{event.organizer}</td>
      <td className="px-3 py-2 font-medium text-[var(--theme-text-primary)] overflow-hidden truncate max-w-[25ch] sm:max-w-none" title={event.name}>
        <span className="inline-flex items-center gap-1.5 max-w-full truncate">
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: 'var(--theme-popup-featured-border)', background: 'var(--theme-accent-muted)' }}>Featured</span>
          {isSafeHttpUrl(event.link) ? (
            <a href={event.link} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--theme-accent)] transition-colors truncate"
              onClick={() => { trackEventClick(event.name, event.link!); trackEvent({ event_id: event.id, event_name: event.name, event_type: 'click', conference, url: event.link!, source: 'table' }); }}>
              {event.name}
            </a>
          ) : (<span className="truncate">{event.name}</span>)}
        </span>
        {event.organizer && (<div className="sm:hidden text-[var(--theme-text-secondary)] text-xs font-normal truncate mt-0.5">{event.organizer}</div>)}
      </td>
      <td className="px-3 py-2 text-[var(--theme-text-secondary)] truncate max-w-[20ch] sm:max-w-none" title={event.address}>
        {event.address ? (
          <AddressLink address={event.address} navAddress={event.matchedAddress} lat={event.lat} lng={event.lng} eventId={event.id} eventName={event.name} className="hover:text-[var(--theme-accent)] transition-colors">{shortenAddress(event.address)}</AddressLink>
        ) : null}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex gap-1 items-center" title={event.tags.join(', ')}>
          {event.tags.slice(0, 10).map((tag) => (<TagBadge key={tag} tag={tag} iconOnly />))}
        </div>
      </td>
    </tr>
  );
}

/** A single regular event row with impression tracking */
function TableRow({
  event,
  itinerary,
  onItineraryToggle,
  friendsByEvent,
  checkInCounts,
  onSelectEvent,
  conference,
  isSignedIn,
  onSignIn,
  liveEventIds,
  userLocation,
  onShowFriends,
}: TableRowSharedProps & { event: ETHDenverEvent; onShowFriends?: (eventName: string, friends: FriendInfo[]) => void }) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const impressionTracked = useRef(false);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || impressionTracked.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !impressionTracked.current) {
          impressionTracked.current = true;
          trackEvent({
            event_id: event.id,
            event_name: event.name,
            event_type: 'impression',
            conference,
            source: 'table',
          });
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [event.id, event.name, conference]);

  const isInItinerary = itinerary?.has(event.id) ?? false;

  return (
    <tr
      ref={rowRef}
      className={`hover:bg-[var(--theme-bg-secondary)]/70 transition-colors cursor-pointer ${event.isDuplicate ? 'bg-red-950/30' : 'bg-[var(--theme-bg-primary)]'}`}
      style={event.isFeatured && !event.isDuplicate ? { outline: '2px solid var(--theme-popup-featured-border)', outlineOffset: '-2px' } : undefined}
      title={event.isDuplicate ? 'Possible duplicate — same name, date, and time as another event' : undefined}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('a, button')) return;
        onSelectEvent(event);
      }}
    >
      {/* Star (toggles itinerary) */}
      <td className="px-2 py-2">
        <button
          onClick={() => onItineraryToggle?.(event.id)}
          className="cursor-pointer p-0.5"
          title={isInItinerary ? 'Remove from itinerary' : 'Add to itinerary'}
        >
          <span className={`w-6 h-6 flex items-center justify-center rounded-full border transition-colors ${
            isInItinerary
              ? 'text-[var(--theme-accent)] border-[var(--theme-accent)]'
              : 'text-[var(--theme-text-secondary)] border-[var(--theme-border-primary)] hover:text-[var(--theme-text-primary)]'
          }`} style={isInItinerary ? { backgroundColor: 'var(--theme-accent-muted)' } : undefined}>
            {isInItinerary ? <Check className="w-3 h-3" strokeWidth={3} /> : <Plus className="w-3 h-3" strokeWidth={2.5} />}
          </span>
        </button>
      </td>

      {/* Friends avatars */}
      <td className="px-1 py-2" onClick={(e) => { e.stopPropagation(); const friends = friendsByEvent?.get(event.id); if (friends && friends.length > 0) onShowFriends?.(event.name, friends); }}>
        <div className="flex justify-center">
          {(() => {
            if (!isSignedIn) return (
              <button
                onClick={(e) => { e.stopPropagation(); onSignIn?.(); }}
                className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] text-xs cursor-pointer transition-colors"
                title="Sign in to add friends and see who's going"
              >?</button>
            );
            const friends = friendsByEvent?.get(event.id);
            return friends && friends.length > 0 ? (
              <FriendAvatarStack friends={friends} maxShow={1} size="sm" />
            ) : null;
          })()}
        </div>
      </td>

      {/* Time */}
      <td className="px-3 py-2 text-[var(--theme-text-secondary)] sm:whitespace-nowrap">
        <div className="flex items-start sm:items-center gap-1.5">
          {(() => { const u = liveEventIds?.get(event.id); return u ? <span className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 mt-1.5 sm:mt-0 ${u === 'red' ? 'bg-red-400' : u === 'yellow' ? 'bg-yellow-400' : 'bg-green-400'}`} title={u === 'red' ? 'Ending soon' : u === 'yellow' ? 'Less than 1hr left' : 'Live now'} /> : null; })()}
          <span className="relative inline-block">
            <span className="sm:inline hidden">
              {event.startTime}
              {event.endTime ? `-${event.endTime}` : ''}
            </span>
            <span className="sm:hidden flex flex-col leading-tight">
              <span>{event.startTime}</span>
              {event.endTime && <span className="text-[10px] text-[var(--theme-text-muted)]">{event.endTime}</span>}
            </span>
            {(checkInCounts?.get(event.id) ?? 0) > 0 && (
              <span className="absolute -top-1.5 -right-3 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-green-500 text-white text-[8px] font-bold px-0.5 pointer-events-none">
                {checkInCounts!.get(event.id)}
              </span>
            )}
          </span>
          {userLocation && event.lat && event.lng && (
            <span className="text-[10px] text-[var(--theme-text-muted)]">{formatDistance(distanceMeters(userLocation.lat, userLocation.lng, event.lat, event.lng))}</span>
          )}
        </div>
      </td>

      {/* Organizer (hidden on mobile portrait — shown inside Event cell instead) */}
      <td className="px-3 py-2 text-[var(--theme-text-secondary)] truncate hidden sm:table-cell" title={event.organizer}>
        {event.organizer}
      </td>

      {/* Event Name (+ organizer on mobile portrait) */}
      <td className="px-3 py-2 font-medium text-[var(--theme-text-primary)] overflow-hidden truncate max-w-[25ch] sm:max-w-none" title={event.name}>
        <span className="inline-flex items-center gap-1 max-w-full truncate">
          {event.isDuplicate && (
            <span title="Duplicate entry in sheet"><AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" /></span>
          )}
          {isSafeHttpUrl(event.link) ? (
            <a
              href={event.link}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--theme-accent)] transition-colors truncate"
              onClick={() => {
                trackEventClick(event.name, event.link!);
                trackEvent({
                  event_id: event.id,
                  event_name: event.name,
                  event_type: 'click',
                  conference,
                  url: event.link!,
                  source: 'table',
                });
              }}
            >
              {event.name}
            </a>
          ) : (
            <span className="truncate">{event.name}</span>
          )}
        </span>
        {event.organizer && (
          <div className="sm:hidden text-[var(--theme-text-secondary)] text-xs font-normal truncate mt-0.5">
            {event.organizer}
          </div>
        )}
      </td>

      {/* Location */}
      <td className="px-3 py-2 text-[var(--theme-text-secondary)] truncate max-w-[20ch] sm:max-w-none" title={event.address}>
        {event.address ? (
          <AddressLink address={event.address} navAddress={event.matchedAddress} lat={event.lat} lng={event.lng}
            eventId={event.id} eventName={event.name}
            className="hover:text-[var(--theme-accent)] transition-colors">
            {shortenAddress(event.address)}
          </AddressLink>
        ) : null}
      </td>

      {/* Tags — single row, all visible */}
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex gap-1 items-center" title={event.tags.join(', ')}>
          {event.tags.slice(0, 10).map((tag) => (
            <TagBadge key={tag} tag={tag} iconOnly />
          ))}
        </div>
      </td>
    </tr>
  );
}

/** Renders a date separator row + all event rows for that date */
function DateGroup({
  group,
  itinerary,
  onItineraryToggle,
  setSeparatorRef,
  friendsByEvent,
  checkInCounts,
  onSelectEvent,
  conference,
  featuredEvents,
  isSignedIn,
  onSignIn,
  liveEventIds,
  userLocation,
  onShowFriends,
}: {
  group: { dateISO: string; label: string; events: ETHDenverEvent[] };
  itinerary?: Set<string>;
  onItineraryToggle?: (eventId: string) => void;
  setSeparatorRef: (dateISO: string, el: HTMLTableRowElement | null) => void;
  friendsCountByEvent?: Map<string, number>;
  friendsByEvent?: Map<string, FriendInfo[]>;
  checkInCounts?: Map<string, number>;
  onSelectEvent: (event: ETHDenverEvent) => void;
  conference?: string;
  featuredEvents?: ETHDenverEvent[];
  selectedEventId?: string;
  isSignedIn?: boolean;
  onSignIn?: () => void;
  liveEventIds?: Map<string, 'green' | 'yellow' | 'red'>;
  userLocation?: { lat: number; lng: number } | null;
  onShowFriends?: (eventName: string, friends: FriendInfo[]) => void;
}) {
  return (
    <>
      {/* Date separator row */}
      <tr
        ref={(el) => setSeparatorRef(group.dateISO, el)}
        className="bg-[var(--theme-date-sep-bg)]"
        data-date={group.dateISO}
      >
        <td className="border-b border-[var(--theme-date-sep-border)]"></td>
        <td
          colSpan={COLUMN_COUNT - 1}
          className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border-b border-[var(--theme-date-sep-border)] text-[var(--theme-date-sep-text)]"
        >
          <DayBadge dateISO={group.dateISO} label={group.label} />
        </td>
      </tr>

      {/* Featured events for this date */}
      {featuredEvents && featuredEvents.length > 0 && featuredEvents.map((event) => (
        <FeaturedTableRow
          key={`featured-${event.id}`}
          event={event}
          itinerary={itinerary}
          onItineraryToggle={onItineraryToggle}
          friendsByEvent={friendsByEvent}
          checkInCounts={checkInCounts}
          onSelectEvent={onSelectEvent}
          conference={conference}
          isSignedIn={isSignedIn}
          onSignIn={onSignIn}
          liveEventIds={liveEventIds}
          userLocation={userLocation}
        />
      ))}

      {/* Regular event rows */}
      {group.events.map((event) => (
        <TableRow
          key={event.id}
          event={event}
          itinerary={itinerary}
          onItineraryToggle={onItineraryToggle}
          friendsByEvent={friendsByEvent}
          checkInCounts={checkInCounts}
          onSelectEvent={onSelectEvent}
          conference={conference}
          isSignedIn={isSignedIn}
          onSignIn={onSignIn}
          liveEventIds={liveEventIds}
          userLocation={userLocation}
          onShowFriends={onShowFriends}
        />
      ))}
    </>
  );
}
