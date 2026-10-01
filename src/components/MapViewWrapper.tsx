'use client';

import { memo, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { ChevronUp, ChevronDown, MapPinOff } from 'lucide-react';
import type { ETHDenverEvent, POI, POICategory, ReactionEmoji, FriendLocation, FriendInfo } from '@/lib/types';
import type { TabConfig } from '@/lib/conferences';
import { EventCard } from './EventCard';
import type { VenuePin } from '@/lib/venue-pins';

const MapView = dynamic(
  () => import('./MapView').then((mod) => ({ default: mod.MapView })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-[var(--theme-bg-primary)] flex items-center justify-center">
        <div className="text-[var(--theme-text-secondary)]">Loading map...</div>
      </div>
    ),
  }
);

interface MapViewWrapperProps {
  events: ETHDenverEvent[];
  onEventSelect?: (event: ETHDenverEvent) => void;
  itinerary?: Set<string>;
  onItineraryToggle?: (eventId: string) => void;
  isItineraryView?: boolean;
  friendsCountByEvent?: Map<string, number>;
  friendsByEvent?: Map<string, FriendInfo[]>;
  checkedInFriendsByEvent?: Map<string, FriendInfo[]>;
  checkInCounts?: Map<string, number>;
  reactionsByEvent?: Map<string, { emoji: ReactionEmoji; count: number; reacted: boolean }[]>;
  onToggleReaction?: (eventId: string, emoji: ReactionEmoji) => void;
  commentCounts?: Map<string, number>;
  friendLocations?: FriendLocation[];
  /** Friends checked in at events, pinned at the venue (preferred over raw GPS). */
  venuePins?: VenuePin[];
  conference?: string;
  pois?: POI[];
  onAddPOI?: (poi: { name: string; lat: number; lng: number; address?: string | null; category: POICategory; note?: string | null }) => Promise<unknown>;
  onRemovePOI?: (id: string) => void;
  onUpdatePOI?: (id: string, updates: Partial<Pick<POI, 'name' | 'category' | 'note' | 'is_public'>>) => void;
  ownerNames?: Map<string, string>;
  onSignIn?: () => void;
  conferenceTabs?: TabConfig[];
  onCheckIn?: (eventId: string) => void;
  checkInLoading?: boolean;
  liveEventIds?: Map<string, 'green' | 'yellow' | 'red'>;
  getRsvpStatus?: (eventId: string) => 'idle' | 'confirmed';
  onRsvp?: (eventId: string, lumaUrl: string, eventName: string) => void;
}

export const MapViewWrapper = memo(function MapViewWrapper({
  events,
  onEventSelect,
  itinerary,
  onItineraryToggle,
  isItineraryView,
  friendsCountByEvent,
  friendsByEvent,
  checkedInFriendsByEvent,
  checkInCounts,
  reactionsByEvent,
  onToggleReaction,
  commentCounts,
  friendLocations,
  venuePins,
  conference,
  pois,
  onAddPOI,
  onRemovePOI,
  onUpdatePOI,
  ownerNames,
  onSignIn,
  conferenceTabs,
  onCheckIn,
  checkInLoading,
  liveEventIds,
  getRsvpStatus,
  onRsvp,
}: MapViewWrapperProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const noLocationEvents = useMemo(
    () => events.filter((e) => e.lat == null || e.lng == null),
    [events]
  );

  const count = noLocationEvents.length;

  return (
    <div className="w-full h-full overflow-hidden relative">
      <MapView
        events={events}
        onEventSelect={onEventSelect}
        itinerary={itinerary}
        onItineraryToggle={onItineraryToggle}
        isItineraryView={isItineraryView}
        friendsCountByEvent={friendsCountByEvent}
        friendsByEvent={friendsByEvent}
        checkedInFriendsByEvent={checkedInFriendsByEvent}
        checkInCounts={checkInCounts}
        reactionsByEvent={reactionsByEvent}
        onToggleReaction={onToggleReaction}
        commentCounts={commentCounts}
        friendLocations={friendLocations}
        venuePins={venuePins}
        conference={conference}
        pois={pois}
        onAddPOI={onAddPOI}
        onRemovePOI={onRemovePOI}
        onUpdatePOI={onUpdatePOI}
        ownerNames={ownerNames}
        onSignIn={onSignIn}
        conferenceTabs={conferenceTabs}
        onCheckIn={onCheckIn}
        checkInLoading={checkInLoading}
        liveEventIds={liveEventIds}
        getRsvpStatus={getRsvpStatus}
        onRsvp={onRsvp}
      />

      {/* No-location drawer */}
      {count > 0 && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col pointer-events-none">
          {/* Scrollable event list */}
          {drawerOpen && (
            <div className="pointer-events-auto bg-[var(--theme-bg-primary)]/95 backdrop-blur-sm border-t border-[var(--theme-border-primary)] max-h-[45vh] overflow-y-auto">
              <div className="max-w-3xl mx-auto px-3 py-2 space-y-2">
                {noLocationEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    isInItinerary={itinerary?.has(event.id) ?? false}
                    onItineraryToggle={onItineraryToggle}
                    friendsCount={friendsCountByEvent?.get(event.id)}
                    friendsGoing={friendsByEvent?.get(event.id)}
                    rsvpStatus={getRsvpStatus?.(event.id)}
                    onRsvp={event.link ? () => onRsvp?.(event.id, event.link!, event.name) : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Toggle tab */}
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="pointer-events-auto self-center mb-2 flex items-center gap-1.5 px-3 py-1.5 bg-[var(--theme-bg-secondary)]/90 backdrop-blur-sm border border-[var(--theme-border-primary)] rounded-full text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] active:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer shadow-lg"
          >
            <MapPinOff className="w-3.5 h-3.5" />
            {count} without location
            {drawerOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
        </div>
      )}
    </div>
  );
});
