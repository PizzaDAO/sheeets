'use client';

import { Marker } from 'react-map-gl/mapbox';
import type { VenuePin } from '@/lib/venue-pins';
import { venuePinLabel } from '@/lib/venue-pins';
import { getDisplayName } from '@/lib/user-display';
import UserAvatar from './UserAvatar';

interface VenueFriendMarkerProps {
  pin: VenuePin;
  zoom?: number;
  /** Nth venue pin at the same coordinates (co-located events) — stacked upward. */
  stackIndex?: number;
}

const MAX_AVATARS = 3;

/**
 * Friends checked in at an event, pinned at the event's venue. Multiple
 * friends stack into one overlapping avatar group with a +N badge. Floats
 * just above the event marker so both stay tappable.
 */
export function VenueFriendMarker({ pin, zoom = 12, stackIndex = 0 }: VenueFriendMarkerProps) {
  const showLabel = zoom >= 13;
  const shown = pin.friends.slice(0, MAX_AVATARS);
  const extra = pin.friends.length - shown.length;
  const firstName = getDisplayName(pin.friends[0], 'Friend').split(' ')[0];
  const label = venuePinLabel(firstName, pin.friends.length, pin.eventName);
  const allNames = pin.friends.map((f) => getDisplayName(f, 'Friend')).join(', ');

  return (
    <Marker latitude={pin.lat} longitude={pin.lng} anchor="bottom" offset={[0, -26 - stackIndex * (showLabel ? 48 : 30)]}>
      <div
        className="flex flex-col items-center pointer-events-none"
        title={`${allNames} @ ${pin.eventName}`}
        aria-label={`${allNames} checked in at ${pin.eventName}`}
      >
        {showLabel && (
          <div className="mb-1 px-1.5 py-0.5 rounded bg-green-600/95 text-white text-[10px] font-medium whitespace-nowrap max-w-[180px] truncate leading-tight shadow">
            {label}
          </div>
        )}
        <div className="flex items-center">
          {shown.map((f, i) => (
            <div
              key={f.user_id}
              className={`rounded-full border-2 border-green-400 shadow-lg overflow-hidden bg-[var(--theme-bg-secondary)] ${i > 0 ? '-ml-2' : ''}`}
              style={{ zIndex: MAX_AVATARS - i }}
            >
              <UserAvatar size="sm" avatarUrl={f.avatar_url} xHandle={f.x_handle} displayName={f.display_name} />
            </div>
          ))}
          {extra > 0 && (
            <div className="-ml-2 min-w-[24px] h-6 px-1 rounded-full border-2 border-green-400 bg-green-600 text-white text-[10px] font-bold flex items-center justify-center shadow-lg">
              +{extra}
            </div>
          )}
        </div>
      </div>
    </Marker>
  );
}
