'use client';

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { X, AlertTriangle, Trash2, CalendarX, Share2, ExternalLink, GripVertical, Eye, EyeOff } from 'lucide-react';
import type { ETHDenverEvent } from '@/lib/types';
import { VIBE_COLORS } from '@/lib/tags';
import { formatDateLabel, isSafeHttpUrl } from '@/lib/utils';
import { sortByStartTime, detectConflicts } from '@/lib/time-parse';
import { useDragReorder } from '@/hooks/useDragReorder';
import { useProfile } from '@/hooks/useProfile';
import { trackItineraryClear, trackItineraryConferenceTab, trackItineraryReorder } from '@/lib/analytics';
import { ShareCardModal } from '@/components/ShareCardModal';

interface ItineraryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  events: ETHDenverEvent[];
  itinerary: Set<string>;
  onItineraryToggle: (eventId: string) => void;
  onItineraryClear: () => void;
  onReorder?: (orderedIds: string[]) => void;
  activeConference?: string;
  hiddenEvents: Set<string>;
  onToggleHidden: (eventId: string) => void;
}

interface DateGroup {
  dateISO: string;
  label: string;
  events: ETHDenverEvent[];
}

export function ItineraryPanel({
  isOpen,
  onClose,
  events,
  itinerary,
  onItineraryToggle,
  onItineraryClear,
  onReorder,
  activeConference,
  hiddenEvents,
  onToggleHidden,
}: ItineraryPanelProps) {
  const { profile } = useProfile();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  // All itinerary events (for badge count)
  const allItineraryEvents = useMemo(
    () => events.filter((e) => itinerary.has(e.id)),
    [events, itinerary]
  );

  // Conferences that have itinerary events
  const conferences = useMemo(
    () => [...new Set(allItineraryEvents.map((e) => e.conference).filter(Boolean))],
    [allItineraryEvents]
  );

  // Default to the active conference from the main view, fall back to first conference with events.
  // A tab the user picks wins until the main view's active conference changes.
  // Derived during render (no effect) to avoid cascading re-renders.
  const [picked, setPicked] = useState<{ conference: string; forActive: string | undefined } | null>(null);
  const selectedConference =
    picked && picked.forActive === activeConference && conferences.includes(picked.conference)
      ? picked.conference
      : activeConference && conferences.includes(activeConference)
        ? activeConference
        : conferences[0] ?? '';
  const setSelectedConference = (conference: string) => setPicked({ conference, forActive: activeConference });

  // Filter to selected conference
  const itineraryEvents = useMemo(
    () => allItineraryEvents.filter((e) => !selectedConference || e.conference === selectedConference),
    [allItineraryEvents, selectedConference]
  );

  // Detect conflicts
  const conflicts = useMemo(
    () => detectConflicts(itineraryEvents),
    [itineraryEvents]
  );

  // Group by date
  const dateGroups: DateGroup[] = useMemo(() => {
    const groupMap = new Map<string, ETHDenverEvent[]>();

    for (const event of itineraryEvents) {
      const key = event.dateISO || 'unknown';
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(event);
    }

    return Array.from(groupMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([dateISO, groupEvents]) => ({
        dateISO,
        label:
          dateISO === 'unknown' ? 'Date TBD' : formatDateLabel(dateISO),
        events: groupEvents.sort(sortByStartTime),
      }));
  }, [itineraryEvents]);

  const handleClear = () => {
    trackItineraryClear();
    onItineraryClear();
    setShowClearConfirm(false);
  };

  // Flat ordered list of all event IDs across date groups (for drag reorder)
  const flatEventIds = useMemo(
    () => dateGroups.flatMap((g) => g.events.map((e) => e.id)),
    [dateGroups]
  );

  const handleReorder = useCallback(
    (orderedIds: string[]) => {
      if (!onReorder) return;
      trackItineraryReorder();
      // The drag reorder gives us the visible (conference-filtered) IDs in new order.
      // We need to preserve IDs from other conferences that aren't visible.
      const allIds = [...itinerary];
      const visibleIdSet = new Set(flatEventIds);
      const otherIds = allIds.filter((id) => !visibleIdSet.has(id));
      onReorder([...orderedIds, ...otherIds]);
    },
    [onReorder, itinerary, flatEventIds]
  );

  const {
    setOrderedIds,
    registerItemRef,
    getDragHandleProps,
    getItemProps,
    getDropIndicator,
    dragId,
  } = useDragReorder({ onReorder: handleReorder });

  // Keep ordered IDs in sync
  useEffect(() => {
    setOrderedIds(flatEventIds);
  }, [flatEventIds, setOrderedIds]);

  const canDrag = !!onReorder;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-[70] h-full w-full max-w-md bg-[var(--theme-bg-primary)] border-l border-[var(--theme-border-primary)] shadow-2xl transition-transform duration-300 ease-in-out pt-[var(--safe-area-top)] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border-secondary)]">
          <h2 className="text-lg font-bold text-[var(--theme-text-primary)]">
            My Itinerary{' '}
            <span className="text-sm font-normal text-[var(--theme-text-secondary)]">
              ({itineraryEvents.length} event
              {itineraryEvents.length !== 1 ? 's' : ''})
            </span>
          </h2>
          <div className="flex items-center gap-1">
            {itineraryEvents.length > 0 && (
              <>
                <Link
                  href="/itinerary"
                  className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent-link)] active:text-[var(--theme-accent-link)] transition-colors"
                  aria-label="Open full page"
                  title="Open full page"
                >
                  <ExternalLink className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => setShowShareCard(true)}
                  className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent-link)] active:text-[var(--theme-accent-link)] transition-colors cursor-pointer"
                  aria-label="Share itinerary"
                  title="Share itinerary as PNG"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] active:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
              aria-label="Close itinerary"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conference tabs */}
        {conferences.length > 0 && (
          <div className="flex border-b border-[var(--theme-border-secondary)] px-4">
            {conferences.map((conf) => (
              <button
                key={conf}
                onClick={() => { trackItineraryConferenceTab(conf); setSelectedConference(conf); }}
                className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer border-b-2 ${
                  selectedConference === conf
                    ? 'border-[var(--theme-accent)] text-[var(--theme-text-primary)]'
                    : 'border-transparent text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] active:text-[var(--theme-text-primary)]'
                }`}
              >
                {conf.replace(/ 2026$/, '')}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className={`overflow-y-auto ${conferences.length > 0 ? 'h-[calc(100%-95px)]' : 'h-[calc(100%-57px)]'} px-4 pb-4`}>
          {itineraryEvents.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CalendarX className="w-12 h-12 text-[var(--theme-text-faint)] mb-4" />
              <p className="text-[var(--theme-text-secondary)] font-medium mb-2">
                No events in your itinerary yet
              </p>
              <p className="text-[var(--theme-text-muted)] text-sm max-w-xs">
                Tap + on any event to add it to your plan!
              </p>
            </div>
          ) : (
            <>
              {/* Capturable content for PNG export */}
              <div ref={captureRef} className="bg-[var(--theme-bg-primary)]">
                {/* Branding header (visible in PNG) */}
                <div className="pt-3 pb-1 px-1 flex items-center gap-2">
                  <span className="text-base">📅</span>
                  <span className="text-sm font-bold text-[var(--theme-text-primary)]">sheeets.xyz</span>
                  <span className="text-xs text-[var(--theme-text-muted)]">— My Itinerary</span>
                </div>

                {/* Conflict warning */}
                {conflicts.size > 0 && (
                  <div className="mt-2 mb-1 px-3 py-2 bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 rounded-lg flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--theme-accent-link)] shrink-0" />
                    <p className="text-[var(--theme-accent-link)] text-xs">
                      {conflicts.size} event{conflicts.size !== 1 ? 's' : ''} with
                      schedule conflicts
                    </p>
                  </div>
                )}

                {/* Date groups */}
                {dateGroups.map((group) => (
                  <section key={group.dateISO} className="mt-4">
                    {/* Date header */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-px flex-1 bg-[var(--theme-bg-tertiary)]" />
                      <h3 className="text-xs font-bold text-[var(--theme-text-secondary)] uppercase tracking-wider whitespace-nowrap">
                        {group.label}
                      </h3>
                      <div className="h-px flex-1 bg-[var(--theme-bg-tertiary)]" />
                    </div>

                    {/* Event cards */}
                    <div className="space-y-2">
                      {group.events.map((event) => {
                        const hasConflict = conflicts.has(event.id);
                        const vibeColor =
                          VIBE_COLORS[event.vibe] || VIBE_COLORS['default'];
                        const timeDisplay = event.isAllDay
                          ? 'All Day'
                          : `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}`;
                        const dropIndicator = getDropIndicator(event.id);
                        const isBeingDragged = dragId === event.id;

                        return (
                          <div
                            key={event.id}
                            ref={(el) => registerItemRef(event.id, el)}
                            {...(canDrag ? getItemProps(event.id) : {})}
                            className="relative"
                          >
                            {/* Drop indicator - above */}
                            {dropIndicator.showAbove && (
                              <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-[var(--theme-accent)] rounded-full z-10" />
                            )}

                            <div
                              className={`bg-[var(--theme-bg-secondary)] rounded-lg p-3 border transition-opacity ${
                                hasConflict
                                  ? 'border-[var(--theme-accent)]/40'
                                  : 'border-[var(--theme-border-primary)]'
                              } ${isBeingDragged ? 'opacity-40' : 'opacity-100'}`}
                            >
                              {/* Conflict warning */}
                              {hasConflict && (
                                <div className="flex items-center gap-1.5 mb-2 text-[var(--theme-accent-link)]">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span className="text-[10px] font-medium uppercase tracking-wide">
                                    Schedule conflict
                                  </span>
                                </div>
                              )}

                              {/* Top row: drag handle, name, link + star */}
                              <div className="flex items-start gap-2">
                                {canDrag && (
                                  <div
                                    data-export-hide
                                    {...getDragHandleProps(event.id)}
                                    className="shrink-0 pt-0.5 text-[var(--theme-text-faint)] hover:text-[var(--theme-text-secondary)] active:text-[var(--theme-text-secondary)] cursor-grab active:cursor-grabbing touch-none select-none"
                                    aria-label="Drag to reorder"
                                    title="Drag to reorder"
                                  >
                                    <GripVertical className="w-4 h-4" />
                                  </div>
                                )}
                                <h4 className="flex-1 text-sm font-semibold text-[var(--theme-text-primary)] leading-tight min-w-0 truncate">
                                  {event.name}
                                </h4>
                                <div className="flex items-center gap-0.5 shrink-0" data-export-hide>
                                  {isSafeHttpUrl(event.link) && (
                                    <a
                                      href={event.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-accent-link)] active:text-[var(--theme-accent-link)] transition-colors"
                                      aria-label="Open event link"
                                      title="Open event link"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onToggleHidden(event.id);
                                    }}
                                    className={`p-1 transition-colors cursor-pointer ${
                                      hiddenEvents.has(event.id)
                                        ? 'text-[var(--theme-text-muted)]'
                                        : 'text-[var(--theme-text-faint)] hover:text-[var(--theme-text-muted)]'
                                    }`}
                                    title={hiddenEvents.has(event.id) ? 'Hidden from friends (tap to show)' : 'Hide from friends'}
                                  >
                                    {hiddenEvents.has(event.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => onItineraryToggle(event.id)}
                                    className="p-1 text-[var(--theme-accent-link)] hover:text-[var(--theme-accent-link)] active:text-[var(--theme-accent-link)] transition-colors cursor-pointer"
                                    aria-label="Remove from itinerary"
                                    title="Remove from itinerary"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Time */}
                              <p className={`text-[var(--theme-text-secondary)] text-xs mt-1 ${canDrag ? 'ml-6' : ''}`}>
                                {timeDisplay}
                              </p>

                              {/* Badges */}
                              <div className={`flex items-center gap-1.5 mt-1.5 ${canDrag ? 'ml-6' : ''}`}>
                                {event.vibe && (
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-[var(--theme-text-primary)]"
                                    style={{ backgroundColor: vibeColor }}
                                  >
                                    {event.vibe}
                                  </span>
                                )}
                                {event.isFree && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-400">
                                    FREE
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Drop indicator - below */}
                            {dropIndicator.showBelow && (
                              <div className="absolute -bottom-1.5 left-0 right-0 h-0.5 bg-[var(--theme-accent)] rounded-full z-10" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}

                {/* Footer in PNG */}
                <div className="pt-3 pb-2 text-center">
                  <span className="text-[10px] text-[var(--theme-text-faint)]">sheeets.xyz — side event guide</span>
                </div>
              </div>

              {/* Interactive controls (outside capture area) */}

              {/* Clear all button */}
              <div className="mt-6 pt-4 border-t border-[var(--theme-border-secondary)]">
                {showClearConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--theme-text-secondary)]">
                      Clear all events?
                    </span>
                    <button
                      onClick={handleClear}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-600 active:bg-red-600 text-[var(--theme-text-primary)] text-xs font-medium rounded transition-colors cursor-pointer"
                    >
                      Yes, clear
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="px-3 py-1.5 bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-card-hover)] active:bg-[var(--theme-bg-card-hover)] text-[var(--theme-text-secondary)] text-xs font-medium rounded transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] active:bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-secondary)] active:text-[var(--theme-text-secondary)] rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear Itinerary
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ShareCardModal
        isOpen={showShareCard}
        onClose={() => setShowShareCard(false)}
        events={itineraryEvents}
        conferenceName={selectedConference || 'Itinerary'}
        displayName={profile?.display_name ?? null}
        avatarUrl={profile?.avatar_url}
        hiddenEventIds={hiddenEvents}
      />
    </>
  );
}
