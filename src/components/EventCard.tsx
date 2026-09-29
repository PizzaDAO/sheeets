'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Calendar, X, Link, Check, MapPinCheck, Loader2 } from 'lucide-react';
import type { ETHDenverEvent, ReactionEmoji, FriendInfo } from '@/lib/types';
import { trackEventClick, trackCopyEventLink, trackFriendsGoingOpen, trackFriendsCheckedInOpen, trackOutboundClick } from '@/lib/analytics';
import { trackAdEvent } from '@/lib/ad-tracking';
import { trackEvent } from '@/lib/event-tracking';
import { formatFriendsText } from '@/lib/user-display';
import { shortenAddress, isSafeHttpUrl } from '@/lib/utils';
import { distanceMeters } from '@/lib/geo';
import { AddressLink } from './AddressLink';
import { StarButton } from './StarButton';
import { TagBadge } from './TagBadge';
import { OGImage } from './OGImage';
import { EmojiReactions } from './EmojiReactions';
import UserAvatar from './UserAvatar';
import { CommentSection } from './CommentSection';
import { FriendAvatarStack } from './FriendAvatarStack';
import { RsvpButton } from './RsvpButton';

interface EventCardProps {
  event: ETHDenverEvent;
  isInItinerary?: boolean;
  onItineraryToggle?: (eventId: string) => void;
  friendsCount?: number;
  friendsGoing?: FriendInfo[];
  checkedInFriends?: FriendInfo[];
  checkInCount?: number;
  reactions?: { emoji: ReactionEmoji; count: number; reacted: boolean }[];
  onToggleReaction?: (eventId: string, emoji: ReactionEmoji) => void;
  commentCount?: number;
  /** Conference context for featured event ad tracking */
  conference?: string;
  onCheckIn?: (eventId: string) => void;
  checkInLoading?: boolean;
  liveUrgency?: 'green' | 'yellow' | 'red';
  userLocation?: { lat: number; lng: number } | null;
  onOpenLightbox?: (imageUrl: string, rsvpUrl?: string) => void;
  rsvpStatus?: 'idle' | 'confirmed';
  onRsvp?: () => void;
  /** Compact mode for map popups — smaller text, no impression tracking */
  compact?: boolean;
}

function FriendsGoingModal({
  eventName,
  friends,
  onClose,
  title = 'Friends Going',
  accentColor = 'blue',
}: {
  eventName: string;
  friends: FriendInfo[];
  onClose: () => void;
  title?: string;
  accentColor?: 'blue' | 'green';
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const avatarBg = accentColor === 'green' ? 'bg-green-500/20' : '';
  const avatarBgStyle = accentColor === 'green' ? undefined : { backgroundColor: 'color-mix(in srgb, var(--friend-blue) 20%, transparent)' };
  const avatarText = accentColor === 'green' ? 'text-green-400' : '';

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div
        className="relative bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-xl shadow-2xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border-primary)]">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-[var(--theme-text-primary)]">{title}</h3>
            <p className="text-xs text-[var(--theme-text-secondary)] truncate">{eventName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer shrink-0 ml-2"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Friends list */}
        <div className="overflow-y-auto max-h-[60vh] p-3 space-y-2">
          {friends.map((friend) => (
            <div
              key={friend.userId}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--theme-bg-tertiary)] transition-colors"
            >
              <div className={`w-8 h-8 rounded-full ${avatarBg} shrink-0 overflow-hidden ${accentColor === 'green' ? 'border-2 border-green-500/40' : ''}`} style={avatarBgStyle}>
                <UserAvatar
                  avatarUrl={friend.avatarUrl}
                  xHandle={friend.xHandle}
                  displayName={friend.displayName}
                  userId={friend.userId}
                  size="sm"
                  className="!w-full !h-full"
                />
              </div>
              <span className="text-sm text-[var(--theme-text-primary)] truncate">{friend.displayName}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

export const EventCard = memo(function EventCard({
  event,
  isInItinerary = false,
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
  userLocation,
  onOpenLightbox,
  rsvpStatus,
  onRsvp,
  compact,
}: EventCardProps) {
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showCheckedInModal, setShowCheckedInModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const hasFriends = (friendsGoing?.length ?? 0) > 0;
  const featuredImpressionTracked = useRef(false);
  const eventImpressionTracked = useRef(false);

  // Track featured event impressions via IntersectionObserver
  useEffect(() => {
    if (!event.isFeatured || compact) return;
    const el = cardRef.current;
    if (!el || featuredImpressionTracked.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !featuredImpressionTracked.current) {
          featuredImpressionTracked.current = true;
          trackAdEvent({
            ad_id: `featured-${event.id}`,
            ad_name: event.name,
            placement: 'featured-event',
            event_type: 'impression',
            conference,
          });
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [event.id, event.name, event.isFeatured, conference]);

  // Track event impressions via IntersectionObserver (all events in list view)
  useEffect(() => {
    if (compact) return;
    const el = cardRef.current;
    if (!el || eventImpressionTracked.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !eventImpressionTracked.current) {
          eventImpressionTracked.current = true;
          trackEvent({
            event_id: event.id,
            event_name: event.name,
            event_type: 'impression',
            conference,
            source: 'list',
          });
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [event.id, event.name, conference]);

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!event.link) return;
    navigator.clipboard.writeText(event.link).then(() => {
      trackCopyEventLink(event.name);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const timeDisplay = event.isAllDay
    ? 'All Day'
    : `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}`;

  return (
    <div ref={cardRef} className={`rounded-lg ${compact ? 'p-3' : 'p-4'} transition-colors group flex gap-${compact ? '3' : '4'} overflow-hidden ${
      event.isFeatured
        ? 'bg-[var(--theme-bg-card)] border-2 hover:bg-[var(--theme-bg-card-hover)]'
        : `bg-[var(--theme-bg-card)] border border-[var(--theme-border-primary)] hover:bg-[var(--theme-bg-card-hover)] hover:border-[var(--theme-border-primary)] active:bg-[var(--theme-bg-card-hover)]${hasFriends ? ' border-l-[3px]' : ''}`
    }`}
      style={event.isFeatured ? { borderColor: 'var(--theme-popup-featured-border)' } : hasFriends ? { borderLeftColor: 'var(--friend-blue)' } : undefined}
    >
      {/* Left column: action buttons + cover image */}
      <div className="flex items-center shrink-0 gap-1">
        <div className="flex flex-col items-center gap-1">
          {onItineraryToggle && (
            <StarButton
              eventId={event.id}
              isStarred={isInItinerary}
              onToggle={onItineraryToggle}
            />
          )}
          {onRsvp && event.link && (
            <div className="mt-px">
              <RsvpButton eventLink={event.link} status={rsvpStatus ?? 'idle'} onClick={onRsvp} />
            </div>
          )}
          {event.link && (
            <button
              onClick={handleCopyLink}
              className="p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] transition-colors cursor-pointer"
              aria-label="Copy event link"
              title="Copy link"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Link className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
        {event.link && <OGImage url={event.link} eventId={event.id} rsvpUrl={event.link} onOpenLightbox={onOpenLightbox} />}
      </div>

      {/* Right: event details */}
      <div className="flex-1 min-w-0">
        {/* Top row: Name */}
        <div>
          <div className="min-w-0">
            <h3 className={`font-semibold text-[var(--theme-text-primary)] ${compact ? 'text-sm' : 'text-sm sm:text-base'} leading-tight`}>
              {event.isFeatured && (
                <span className="inline-block text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded mr-1.5 align-middle" style={{ color: 'var(--theme-popup-featured-border)', background: 'var(--theme-accent-muted)' }}>Featured</span>
              )}
              {isSafeHttpUrl(event.link) ? (
                <a
                  href={event.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--theme-accent)] active:text-[var(--theme-accent)] transition-colors"
                  onClick={() => {
                    trackEventClick(event.name, event.link!);
                    trackOutboundClick(event.name, event.link!);
                    trackEvent({
                      event_id: event.id,
                      event_name: event.name,
                      event_type: 'click',
                      conference,
                      url: event.link!,
                      source: 'list',
                    });
                    if (event.isFeatured) {
                      trackAdEvent({
                        ad_id: `featured-${event.id}`,
                        ad_name: event.name,
                        placement: 'featured-event',
                        event_type: 'click',
                        url: event.link!,
                        conference,
                      });
                    }
                  }}
                >
                  {event.name}
                </a>
              ) : (
                event.name
              )}
            </h3>
            {event.organizer && (
              <p className="text-[var(--theme-text-muted)] text-xs mt-0.5">{event.organizer}</p>
            )}
          </div>
        </div>

        {/* Date + Time + Check In */}
        <div className="flex items-center gap-2 mt-1">
          <div className="relative w-fit">
            <p className="text-[var(--theme-text-secondary)] text-sm flex items-center gap-1">
              {liveUrgency && (
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 ${
                  liveUrgency === 'red' ? 'bg-red-400' :
                  liveUrgency === 'yellow' ? 'bg-yellow-400' :
                  'bg-green-400'
                }`} title={liveUrgency === 'red' ? 'Ending soon' : liveUrgency === 'yellow' ? 'Less than 1hr left' : 'Live now'} />
              )}
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>{event.date} · {timeDisplay}</span>
            </p>
            {(checkInCount ?? 0) > 0 && (
              <span className="absolute -top-1 -right-3 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-green-500 text-white text-[9px] font-bold px-0.5 pointer-events-none">
                {checkInCount}
              </span>
            )}
          </div>
          {isInItinerary && liveUrgency && onCheckIn && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCheckIn(event.id);
              }}
              disabled={checkInLoading}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-[10px] font-medium transition-colors cursor-pointer"
            >
              {checkInLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <MapPinCheck className="w-3 h-3" />
              )}
              Check In
            </button>
          )}
        </div>

        {/* Address */}
        {event.address && (
          <AddressLink address={event.address} navAddress={event.matchedAddress} lat={event.lat} lng={event.lng}
            eventId={event.id} eventName={event.name}
            className="w-full text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] text-sm mt-1 flex items-start gap-1 overflow-hidden transition-colors min-w-0">
            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="truncate">{shortenAddress(event.address)}</span>
            {userLocation && event.lat && event.lng && (
              <span className="shrink-0 text-[var(--theme-text-muted)] text-xs">
                · {(() => {
                  const m = distanceMeters(userLocation.lat, userLocation.lng, event.lat, event.lng);
                  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
                })()}
              </span>
            )}
          </AddressLink>
        )}

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {event.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} iconOnly={compact} />
          ))}
        </div>

        {/* Note */}
        {event.note && (
          <p className="text-[var(--theme-text-faint)] text-xs mt-1 italic truncate">{event.note}</p>
        )}

        {/* Bottom row: friends + reactions + checked-in indicator */}
        <div className="flex items-center gap-2 mt-2">
          {friendsGoing && friendsGoing.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                trackFriendsGoingOpen(event.name);
                setShowFriendsModal(true);
              }}
              className="cursor-pointer hover:opacity-80 transition-opacity shrink-0"
              title={formatFriendsText(friendsGoing)}
            >
              <FriendAvatarStack friends={friendsGoing} maxShow={2} size="sm" />
            </button>
          )}
          {onToggleReaction && (
            <EmojiReactions
              eventId={event.id}
              reactions={reactions}
              onToggle={onToggleReaction}
              compact={compact}
            />
          )}
          {/* Comments disabled until social verification is in place */}
          {/* <CommentSection eventId={event.id} commentCount={commentCount} eventName={event.name} /> */}
          {checkedInFriends && checkedInFriends.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                trackFriendsCheckedInOpen(event.name);
                setShowCheckedInModal(true);
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-[var(--theme-bg-tertiary)]/50 transition-colors cursor-pointer"
            >
              <MapPin className="w-3 h-3 text-green-400 shrink-0" />
              <span className="text-[10px] text-green-400">
                {checkedInFriends.length} here
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Friends going modal */}
      {showFriendsModal && friendsGoing && friendsGoing.length > 0 && (
        <FriendsGoingModal
          eventName={event.name}
          friends={friendsGoing}
          onClose={() => setShowFriendsModal(false)}
        />
      )}

      {/* Friends checked in modal (green) */}
      {showCheckedInModal && checkedInFriends && checkedInFriends.length > 0 && (
        <FriendsGoingModal
          eventName={event.name}
          friends={checkedInFriends}
          onClose={() => setShowCheckedInModal(false)}
          title="Friends Checked In"
          accentColor="green"
        />
      )}
    </div>
  );
});
