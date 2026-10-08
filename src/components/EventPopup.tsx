'use client';

import { memo } from 'react';
import { Popup } from 'react-map-gl/mapbox';
import { X } from 'lucide-react';
import type { ETHDenverEvent, ReactionEmoji, FriendInfo } from '@/lib/types';
import { EventCard } from './EventCard';
import { ClaimEventLink } from './ClaimEventLink';

interface EventPopupProps {
  event: ETHDenverEvent;
  latitude: number;
  longitude: number;
  onClose: () => void;
  isInItinerary?: boolean;
  onItineraryToggle?: (eventId: string) => void;
  friendsCount?: number;
  friendsGoing?: FriendInfo[];
  checkedInFriends?: FriendInfo[];
  checkInCount?: number;
  reactions?: { emoji: ReactionEmoji; count: number; reacted: boolean }[];
  onToggleReaction?: (eventId: string, emoji: ReactionEmoji) => void;
  commentCount?: number;
  conference?: string;
  onCheckIn?: (eventId: string) => void;
  checkInLoading?: boolean;
  liveUrgency?: 'green' | 'yellow' | 'red';
  rsvpStatus?: 'idle' | 'confirmed';
  onRsvp?: () => void;
}

interface MultiEventPopupProps {
  events: ETHDenverEvent[];
  latitude: number;
  longitude: number;
  onClose: () => void;
  itinerary?: Set<string>;
  onItineraryToggle?: (eventId: string) => void;
  friendsCountByEvent?: Map<string, number>;
  friendsByEvent?: Map<string, FriendInfo[]>;
  checkedInFriendsByEvent?: Map<string, FriendInfo[]>;
  checkInCounts?: Map<string, number>;
  reactionsByEvent?: Map<string, { emoji: ReactionEmoji; count: number; reacted: boolean }[]>;
  onToggleReaction?: (eventId: string, emoji: ReactionEmoji) => void;
  commentCounts?: Map<string, number>;
}

export const EventPopup = memo(function EventPopup({
  event,
  latitude,
  longitude,
  onClose,
  isInItinerary,
  onItineraryToggle,
  friendsCount,
  friendsGoing,
  checkedInFriends,
  checkInCount,
  reactions,
  onToggleReaction,
  commentCount,
  conference,
  onCheckIn,
  checkInLoading,
  liveUrgency,
  rsvpStatus,
  onRsvp,
}: EventPopupProps) {
  return (
    <Popup
      latitude={latitude}
      longitude={longitude}
      onClose={onClose}
      closeButton={false}
      closeOnClick={false}
      anchor="bottom"
      offset={16}
      className={`map-popup${event.isFeatured ? ' map-popup-featured' : ''}`}
    >
      <div className="w-[300px] max-w-[calc(100vw-3rem)]">
        <EventCard
          event={event}
          isInItinerary={isInItinerary}
          onItineraryToggle={onItineraryToggle}
          friendsCount={friendsCount}
          friendsGoing={friendsGoing}
          checkedInFriends={checkedInFriends}
          checkInCount={checkInCount}
          reactions={reactions}
          onToggleReaction={onToggleReaction}
          commentCount={commentCount}
          conference={conference}
          onCheckIn={onCheckIn}
          checkInLoading={checkInLoading}
          liveUrgency={liveUrgency}
          rsvpStatus={rsvpStatus}
          onRsvp={onRsvp}
          compact
        />
        <div className="text-right -mt-0.5">
          <ClaimEventLink event={event} />
        </div>
      </div>
    </Popup>
  );
});

export function MultiEventPopup({
  events,
  latitude,
  longitude,
  onClose,
  itinerary,
  onItineraryToggle,
  friendsCountByEvent,
  friendsByEvent,
  checkedInFriendsByEvent,
  checkInCounts,
  reactionsByEvent,
  onToggleReaction,
  commentCounts,
}: MultiEventPopupProps) {
  return (
    <Popup
      latitude={latitude}
      longitude={longitude}
      onClose={onClose}
      closeButton={false}
      closeOnClick={false}
      anchor="bottom"
      offset={16}
      className="map-popup"
    >
      <div className="w-[300px] max-w-[calc(100vw-3rem)]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm text-[var(--theme-text-primary)]">
            {events.length} events at this location
          </h3>
          <button
            onClick={onClose}
            className="shrink-0 p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] active:text-[var(--theme-text-primary)] transition-colors"
            aria-label="Close popup"
          >
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[260px] overflow-y-auto space-y-2 pr-1">
          {events.map((event) => (
            <div key={event.id}>
              <EventCard
                event={event}
                isInItinerary={itinerary?.has(event.id) ?? false}
                onItineraryToggle={onItineraryToggle}
                friendsCount={friendsCountByEvent?.get(event.id)}
                friendsGoing={friendsByEvent?.get(event.id)}
                checkedInFriends={checkedInFriendsByEvent?.get(event.id)}
                checkInCount={checkInCounts?.get(event.id)}
                reactions={reactionsByEvent?.get(event.id)}
                onToggleReaction={onToggleReaction}
                commentCount={commentCounts?.get(event.id)}
                compact
              />
            </div>
          ))}
        </div>
      </div>
    </Popup>
  );
}
