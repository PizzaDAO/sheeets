'use client';

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AddressLink } from '@/components/AddressLink';
import { ArrowLeft, AlertTriangle, Trash2, CalendarX, Share2, Map as MapIcon, List, GripVertical, Star, ExternalLink, Eye, EyeOff, MapPinCheck, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useEvents } from '@/hooks/useEvents';
import { useItinerary } from '@/hooks/useItinerary';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { VIBE_COLORS } from '@/lib/tags';
import { formatDateLabel, isSafeHttpUrl } from '@/lib/utils';
import { sortByStartTime, detectConflicts } from '@/lib/time-parse';
import { trackItineraryClear, trackItineraryConferenceTab, trackItineraryShareLink, trackItineraryReorder, trackItineraryView } from '@/lib/analytics';
import type { ETHDenverEvent } from '@/lib/types';
import { Loading } from '@/components/Loading';
import { useEventCheckIn } from '@/hooks/useEventCheckIn';
import { passesNowFilter, getConferenceNow } from '@/lib/filters';
import { useDragReorder } from '@/hooks/useDragReorder';
import { useProfile } from '@/hooks/useProfile';
import { ShareCardModal } from '@/components/ShareCardModal';
import { GoogleCalendarButton } from '@/components/GoogleCalendarButton';
import { getTabConfig } from '@/lib/conferences';
import { useConferenceTabs } from '@/hooks/useConferenceTabs';

const MapView = dynamic(
  () => import('@/components/MapView').then((mod) => ({ default: mod.MapView })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-[var(--theme-bg-primary)] flex items-center justify-center">
        <div className="text-[var(--theme-text-secondary)]">Loading map...</div>
      </div>
    ),
  }
);

type ItineraryViewMode = 'list' | 'map';

function generateShortCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function CheckInToast({ result, onDismiss }: { result: { ok: boolean; message: string }; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`mx-4 mt-2 px-3 py-2 rounded-lg text-sm font-medium ${
      result.ok
        ? 'bg-green-600 text-white'
        : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] border border-[var(--theme-border-primary)]'
    }`}>
      {result.message}
    </div>
  );
}

export default function ItineraryPage() {
  const { events, loading } = useEvents();
  const { itinerary, toggle: toggleItinerary, clear: clearItinerary, reorder: reorderItinerary, hiddenEvents, toggleHidden } = useItinerary();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { checkInToEvent, loading: checkInLoading, result: checkInResult, clearResult: clearCheckInResult } = useEventCheckIn();
  const { tabs } = useConferenceTabs();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<ItineraryViewMode>('list');
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'copied'>('idle');
  const [showShareCard, setShowShareCard] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trackItineraryView();
  }, []);

  // Get conferences that have itinerary events
  const allItineraryEvents = useMemo(
    () => events.filter((e) => itinerary.has(e.id)),
    [events, itinerary]
  );
  const conferences = useMemo(
    () => [...new Set(allItineraryEvents.map((e) => e.conference).filter(Boolean))],
    [allItineraryEvents]
  );
  const [activeConference, setActiveConference] = useState('');

  // Auto-select first conference when data loads
  useMemo(() => {
    if (conferences.length > 0 && !activeConference) {
      setActiveConference(conferences[0]);
    }
  }, [conferences, activeConference]);

  const itineraryEvents = useMemo(
    () => allItineraryEvents.filter((e) => !activeConference || e.conference === activeConference),
    [allItineraryEvents, activeConference]
  );

  const conflicts = useMemo(() => detectConflicts(itineraryEvents), [itineraryEvents]);

  // Timezone for the active conference (used for Google Calendar export)
  const conferenceTimezone = useMemo(
    () => getTabConfig(activeConference, tabs).timezone,
    [activeConference, tabs]
  );

  // Events eligible for Google Calendar export (exclude hidden)
  const exportableEvents = useMemo(
    () => itineraryEvents.filter((e) => !hiddenEvents.has(e.id)),
    [itineraryEvents, hiddenEvents]
  );

  const dateGroups = useMemo(() => {
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
        label: dateISO === 'unknown' ? 'Date TBD' : formatDateLabel(dateISO),
        events: groupEvents.sort(sortByStartTime),
      }));
  }, [itineraryEvents]);

  // Flat ordered list of all event IDs across date groups (for drag reorder)
  const flatEventIds = useMemo(
    () => dateGroups.flatMap((g) => g.events.map((e) => e.id)),
    [dateGroups]
  );

  const handleReorder = useCallback(
    (orderedIds: string[]) => {
      trackItineraryReorder();
      // The drag reorder gives us the visible (conference-filtered) IDs in new order.
      // Preserve IDs from other conferences that aren't visible.
      const allIds = [...itinerary];
      const visibleIdSet = new Set(flatEventIds);
      const otherIds = allIds.filter((id) => !visibleIdSet.has(id));
      reorderItinerary([...orderedIds, ...otherIds]);
    },
    [itinerary, flatEventIds, reorderItinerary]
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

  const handleShareLink = useCallback(async () => {
    if (itineraryEvents.length === 0) return;
    setShareStatus('sharing');
    try {
      const shortCode = generateShortCode();
      const eventIds = itineraryEvents
        .filter((e) => !hiddenEvents.has(e.id))
        .map((e) => e.id);
      const { error } = await supabase.from('shared_itineraries').insert({
        short_code: shortCode,
        event_ids: eventIds,
        created_by: user?.id ?? null,
      });
      if (error) {
        console.error('Failed to create share link:', error);
        setShareStatus('idle');
        return;
      }
      const shareUrl = `${window.location.origin}/itinerary/s/${shortCode}`;
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 2500);
    } catch (err) {
      console.error('Share failed:', err);
      setShareStatus('idle');
    }
  }, [itineraryEvents, hiddenEvents, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--theme-bg-primary)]">
        <Loading />
      </div>
    );
  }

  return (
    <div className={viewMode === 'map' ? 'h-screen flex flex-col bg-[var(--theme-bg-primary)]' : 'min-h-screen bg-[var(--theme-bg-primary)]'}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--theme-bg-primary)]/95 backdrop-blur-sm border-b border-[var(--theme-border-secondary)]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors"
              aria-label="Back to events"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-bold text-[var(--theme-text-primary)]">
              My Itinerary{' '}
              <span className="text-sm font-normal text-[var(--theme-text-secondary)]">
                ({itineraryEvents.length} event{itineraryEvents.length !== 1 ? 's' : ''})
              </span>
            </h1>
          </div>
          {/* Conference tabs */}
          {conferences.length > 0 && (
            <div className="flex rounded-lg border border-[var(--theme-border-primary)] overflow-hidden">
              {conferences.map((conf) => (
                <button
                  key={conf}
                  onClick={() => { trackItineraryConferenceTab(conf); setActiveConference(conf); }}
                  className={clsx(
                    'px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                    activeConference === conf
                      ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-text)]'
                      : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                  )}
                >
                  {conf.replace(/ 2026$/, '')}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1">
            {itineraryEvents.length > 0 && (
              <>
                {/* View toggle */}
                <div className="flex rounded-lg border border-[var(--theme-border-primary)] overflow-hidden mr-1">
                  {([
                    { mode: 'list' as const, icon: List, label: 'List' },
                    { mode: 'map' as const, icon: MapIcon, label: 'Map' },
                  ]).map(({ mode, icon: Icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={clsx(
                        'flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors cursor-pointer',
                        viewMode === mode
                          ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-text)]'
                          : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                      )}
                      aria-label={`${label} view`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowShareCard(true)}
                  className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] transition-colors cursor-pointer"
                  aria-label="Share my plan"
                  title="Share my plan as PNG"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { trackItineraryShareLink(); handleShareLink(); }}
                  disabled={shareStatus === 'sharing'}
                  className={clsx(
                    'px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer',
                    shareStatus === 'copied'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] hover:border-[var(--theme-border-primary)]'
                  )}
                  title="Share link"
                >
                  {shareStatus === 'sharing' ? 'Saving...' : shareStatus === 'copied' ? 'Copied!' : 'Share Link'}
                </button>
                <GoogleCalendarButton
                  events={exportableEvents}
                  timezone={conferenceTimezone}
                />
              </>
            )}
          </div>
        </div>
      </header>

      {/* Check-in result toast */}
      {checkInResult && (
        <CheckInToast result={checkInResult} onDismiss={clearCheckInResult} />
      )}

      {/* Content */}
      {itineraryEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <CalendarX className="w-12 h-12 text-[var(--theme-text-faint)] mb-4" />
          <p className="text-[var(--theme-text-secondary)] font-medium mb-2">No events in your itinerary yet</p>
          <p className="text-[var(--theme-text-muted)] text-sm max-w-xs mb-4">
            Star events from the main page to build your schedule!
          </p>
          <Link
            href="/"
            className="px-4 py-2 bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] text-[var(--theme-accent-text)] rounded-lg text-sm font-medium transition-colors"
          >
            Browse Events
          </Link>
        </div>
      ) : viewMode === 'map' ? (
        <main className="flex-1 min-h-0">
          <MapView
            events={itineraryEvents}
            itinerary={itinerary}
            onItineraryToggle={toggleItinerary}
          />
        </main>
      ) : (
        <div className="max-w-2xl mx-auto px-4 pb-8">
          <div ref={captureRef} className="bg-[var(--theme-bg-primary)]">
            <div className="pt-3 pb-1 px-1 flex items-center gap-2">
              <span className="text-base">📅</span>
              <span className="text-sm font-bold text-[var(--theme-text-primary)]">sheeets.xyz</span>
              <span className="text-xs text-[var(--theme-text-muted)]">— My Itinerary</span>
            </div>

            {conflicts.size > 0 && (
              <div className="mt-2 mb-1 px-3 py-2 bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/20 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[var(--theme-accent)] shrink-0" />
                <p className="text-[var(--theme-accent)] text-xs">
                  {conflicts.size} event{conflicts.size !== 1 ? 's' : ''} with schedule conflicts
                </p>
              </div>
            )}

            {dateGroups.map((group) => (
              <section key={group.dateISO} className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-[var(--theme-border-secondary)]" />
                  <h3 className="text-xs font-bold text-[var(--theme-text-secondary)] uppercase tracking-wider whitespace-nowrap">
                    {group.label}
                  </h3>
                  <div className="h-px flex-1 bg-[var(--theme-border-secondary)]" />
                </div>

                <div className="space-y-2">
                  {group.events.map((event) => {
                    const hasConflict = conflicts.has(event.id);
                    const vibeColor = VIBE_COLORS[event.vibe] || VIBE_COLORS['default'];
                    const timeDisplay = event.isAllDay
                      ? 'All Day'
                      : `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}`;
                    const dropIndicator = getDropIndicator(event.id);
                    const isBeingDragged = dragId === event.id;

                    return (
                      <div
                        key={event.id}
                        ref={(el) => registerItemRef(event.id, el)}
                        {...getItemProps(event.id)}
                        className="relative"
                      >
                        {/* Drop indicator - above */}
                        {dropIndicator.showAbove && (
                          <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-[var(--theme-accent)] rounded-full z-10" />
                        )}

                        <div
                          className={`bg-[var(--theme-bg-secondary)] rounded-lg p-3 border transition-opacity ${
                            hasConflict ? 'border-[var(--theme-accent)]/40' : 'border-[var(--theme-border-primary)]'
                          } ${isBeingDragged ? 'opacity-40' : 'opacity-100'}`}
                        >
                          {hasConflict && (
                            <div className="flex items-center gap-1.5 mb-2 text-[var(--theme-accent)]">
                              <AlertTriangle className="w-3 h-3" />
                              <span className="text-[10px] font-medium uppercase tracking-wide">
                                Schedule conflict
                              </span>
                            </div>
                          )}

                          <div className="flex items-start gap-2">
                            <div
                              data-export-hide
                              {...getDragHandleProps(event.id)}
                              className="shrink-0 pt-0.5 text-[var(--theme-text-faint)] hover:text-[var(--theme-text-secondary)] active:text-[var(--theme-text-secondary)] cursor-grab active:cursor-grabbing touch-none select-none"
                              aria-label="Drag to reorder"
                              title="Drag to reorder"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>
                            <h4 className="flex-1 text-sm font-semibold text-[var(--theme-text-primary)] leading-tight min-w-0">
                              {event.name}
                            </h4>
                            <div className="flex items-center gap-0.5 shrink-0" data-export-hide>
                              {passesNowFilter(event, getConferenceNow(activeConference)) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    checkInToEvent(event.id, event.name);
                                  }}
                                  disabled={checkInLoading}
                                  className="p-1 text-green-400 hover:text-green-300 transition-colors cursor-pointer"
                                  aria-label="Check in"
                                  title="Check in"
                                >
                                  {checkInLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <MapPinCheck className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                              {isSafeHttpUrl(event.link) && (
                                <a
                                  href={event.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-accent)] transition-colors"
                                  aria-label="Open event link"
                                  title="Open event link"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleHidden(event.id);
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
                                onClick={() => toggleItinerary(event.id)}
                                className="p-1 text-[var(--theme-accent)] hover:text-[var(--theme-accent)] transition-colors cursor-pointer"
                                aria-label="Remove from itinerary"
                                title="Remove from itinerary"
                              >
                                <Star className="w-3.5 h-3.5 fill-current" />
                              </button>
                            </div>
                          </div>

                          {event.organizer && (
                            <p className="text-[var(--theme-text-muted)] text-xs mt-0.5 ml-6">By {event.organizer}</p>
                          )}

                          <p className="text-[var(--theme-text-secondary)] text-xs mt-1 ml-6">{timeDisplay}</p>

                          {event.address && (
                            <AddressLink address={event.address} navAddress={event.matchedAddress} lat={event.lat} lng={event.lng}
                              eventId={event.id} eventName={event.name}
                              className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] text-xs mt-0.5 truncate block transition-colors ml-6">
                              {event.address}
                            </AddressLink>
                          )}

                          <div className="flex items-center gap-1.5 mt-1.5 ml-6">
                            {event.vibe && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
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

            <div className="pt-3 pb-2 text-center">
              <span className="text-[10px] text-[var(--theme-text-faint)]">sheeets.xyz — side event guide</span>
            </div>
          </div>

          {/* Clear button */}
          <div className="mt-6 pt-4 border-t border-[var(--theme-border-secondary)]">
            {showClearConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--theme-text-secondary)]">Clear all events?</span>
                <button
                  onClick={() => { trackItineraryClear(); clearItinerary(); setShowClearConfirm(false); }}
                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded transition-colors cursor-pointer"
                >
                  Yes, clear
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1.5 bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] text-xs font-medium rounded transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-secondary)] rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Clear Itinerary
              </button>
            )}
          </div>
        </div>
      )}

      <ShareCardModal
        isOpen={showShareCard}
        onClose={() => setShowShareCard(false)}
        events={itineraryEvents}
        conferenceName={activeConference || 'Itinerary'}
        displayName={profile?.display_name ?? null}
        avatarUrl={profile?.avatar_url}
        hiddenEventIds={hiddenEvents}
      />
    </div>
  );
}
