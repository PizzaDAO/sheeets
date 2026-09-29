'use client';

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import MapGL, { NavigationControl, Marker } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { LocateFixed } from 'lucide-react';
import type { ETHDenverEvent, POI, POICategory, ReactionEmoji, FriendLocation, FriendInfo } from '@/lib/types';
import { getTabConfig } from '@/lib/constants';
import type { TabConfig } from '@/lib/conferences';
import { parseTimeToMinutes } from '@/lib/filters';
import { trackLocateMe } from '@/lib/analytics';
import { trackEvent } from '@/lib/event-tracking';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { MapMarker } from './MapMarker';
import { EventPopup, MultiEventPopup } from './EventPopup';
import { POIMarker } from './POIMarker';
import { POIPopup } from './POIPopup';
import { POISearchBar } from './POISearchBar';
import { FriendMarker } from './FriendMarker';

interface MapViewProps {
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

/**
 * Round a coordinate to 5 decimal places for co-location grouping.
 * 5 decimals gives ~1.1 m accuracy, enough to detect same-address events.
 */
function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function MapView({
  events,
  onEventSelect,
  itinerary,
  onItineraryToggle,
  isItineraryView = false,
  friendsCountByEvent,
  friendsByEvent,
  checkedInFriendsByEvent,
  checkInCounts,
  reactionsByEvent,
  onToggleReaction,
  commentCounts,
  friendLocations,
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
}: MapViewProps) {
  const mapCenter = getTabConfig(conference ?? '', conferenceTabs).center;
  const { user } = useAuth();
  const { theme } = useTheme();
  const mapStyle = (theme === 'paper' || theme === 'light' || theme === 'light-blue')
    ? 'mapbox://styles/mapbox/streets-v12'
    : 'mapbox://styles/mapbox/dark-v11';
  const mapRef = useRef<MapRef>(null);
  const hasFittedRef = useRef(false);

  // Compute center from events with coordinates, excluding outliers
  // Returns null when no located events (e.g. "Now" filters everything out)
  const eventsCenter = useMemo(() => {
    const located = events.filter((e) => e.lat != null && e.lng != null);
    if (located.length === 0) return null;
    if (located.length <= 3) {
      const avgLat = located.reduce((s, e) => s + e.lat!, 0) / located.length;
      const avgLng = located.reduce((s, e) => s + e.lng!, 0) / located.length;
      return { lat: avgLat, lng: avgLng };
    }

    // Use IQR to exclude geographic outliers
    const lats = located.map((e) => e.lat!).sort((a, b) => a - b);
    const lngs = located.map((e) => e.lng!).sort((a, b) => a - b);

    const q1 = (arr: number[]) => arr[Math.floor(arr.length * 0.25)];
    const q3 = (arr: number[]) => arr[Math.floor(arr.length * 0.75)];

    const latQ1 = q1(lats), latQ3 = q3(lats), latIQR = latQ3 - latQ1;
    const lngQ1 = q1(lngs), lngQ3 = q3(lngs), lngIQR = lngQ3 - lngQ1;

    const margin = 1.5;
    const inliers = located.filter((e) =>
      e.lat! >= latQ1 - margin * latIQR &&
      e.lat! <= latQ3 + margin * latIQR &&
      e.lng! >= lngQ1 - margin * lngIQR &&
      e.lng! <= lngQ3 + margin * lngIQR
    );

    const pool = inliers.length > 0 ? inliers : located;
    const avgLat = pool.reduce((s, e) => s + e.lat!, 0) / pool.length;
    const avgLng = pool.reduce((s, e) => s + e.lng!, 0) / pool.length;
    return { lat: avgLat, lng: avgLng };
  }, [events]);

  const [viewState, setViewState] = useState({
    latitude: eventsCenter?.lat ?? mapCenter.lat,
    longitude: eventsCenter?.lng ?? mapCenter.lng,
    zoom: 12,
  });

  // Re-center when the events center changes significantly (e.g. switching conferences)
  // Skip if no located events (e.g. "Now" mode filters everything out)
  useEffect(() => {
    if (!eventsCenter) return;
    const dist = Math.abs(viewState.latitude - eventsCenter.lat) + Math.abs(viewState.longitude - eventsCenter.lng);
    if (dist > 1) {
      setViewState((prev) => ({ ...prev, latitude: eventsCenter.lat, longitude: eventsCenter.lng }));
    }
  }, [eventsCenter]); // eslint-disable-line react-hooks/exhaustive-deps

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) return;
    trackLocateMe();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setLocating(false);
        mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 14, duration: 1500 });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const [popupEvent, setPopupEvent] = useState<ETHDenverEvent | null>(null);
  const [popupEvents, setPopupEvents] = useState<ETHDenverEvent[] | null>(null);
  const [popupCoords, setPopupCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);

  // Keep selectedPOI in sync with pois array updates
  useEffect(() => {
    if (selectedPOI && pois) {
      const updated = pois.find(p => p.id === selectedPOI.id);
      if (updated && updated !== selectedPOI) {
        setSelectedPOI(updated);
      } else if (!updated) {
        setSelectedPOI(null); // POI was deleted
      }
    }
  }, [pois]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group events by co-located coordinates
  const colocatedMap = useMemo(() => {
    const map = new Map<string, ETHDenverEvent[]>();
    for (const event of events) {
      if (event.lat == null || event.lng == null) continue;
      const key = coordKey(event.lat, event.lng);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(event);
    }
    return map;
  }, [events]);

  // Unique location markers (one per coordinate, with co-location count)
  const locationMarkers = useMemo(() => {
    const seen = new Set<string>();
    const result: { event: ETHDenverEvent; key: string; count: number }[] = [];

    for (const event of events) {
      if (event.lat == null || event.lng == null) continue;
      const key = coordKey(event.lat, event.lng);
      if (seen.has(key)) continue;
      seen.add(key);

      const colocated = colocatedMap.get(key);
      result.push({ event, key, count: colocated ? colocated.length : 1 });
    }

    // Sort so featured events render last (on top)
    result.sort((a, b) => (a.event.isFeatured ? 1 : 0) - (b.event.isFeatured ? 1 : 0));
    return result;
  }, [events, colocatedMap]);

  // Itinerary ordering: assign 1-based numbers sorted by date then start time
  const itineraryOrderMap = useMemo(() => {
    if (!isItineraryView) return new Map<string, number>();
    const sorted = [...events]
      .filter((e) => e.lat != null && e.lng != null)
      .sort((a, b) => {
        const dateCmp = a.dateISO.localeCompare(b.dateISO);
        if (dateCmp !== 0) return dateCmp;
        const aMin = parseTimeToMinutes(a.startTime) ?? 0;
        const bMin = parseTimeToMinutes(b.startTime) ?? 0;
        return aMin - bMin;
      });
    const map = new Map<string, number>();
    sorted.forEach((e, i) => map.set(e.id, i + 1));
    return map;
  }, [events, isItineraryView]);

  // Compute label placements to avoid overlap using greedy algorithm
  const labelPlacements = useMemo(() => {
    const placements = new Map<string, { offsetX: number; offsetY: number; leader: boolean }>();
    const map = mapRef.current;
    if (!map || locationMarkers.length === 0) return placements;

    const PIN_R = 15;      // pin half-size + tap padding
    const LABEL_W = 144;   // max-w-[140px] + horizontal padding
    const LABEL_H = 28;    // approximate label height (name + organizer)
    const GAP = 4;
    const LEADER_GAP = 50;

    // Project all markers to screen pixel coordinates
    const projected: { key: string; sx: number; sy: number }[] = [];
    for (const { event, key } of locationMarkers) {
      try {
        const pt = map.project([event.lng!, event.lat!]);
        projected.push({ key, sx: pt.x, sy: pt.y });
      } catch {
        projected.push({ key, sx: -9999, sy: -9999 });
      }
    }

    // Candidate offsets: [dx, dy] relative to pin center
    // dx = label center offset, dy = label top offset
    const near: [number, number][] = [
      [LABEL_W / 2 + PIN_R + GAP, -LABEL_H / 2],        // right (default)
      [-(LABEL_W / 2 + PIN_R + GAP), -LABEL_H / 2],     // left
      [0, PIN_R + GAP],                                  // below
      [0, -(PIN_R + GAP + LABEL_H)],                     // above
      [LABEL_W / 3, PIN_R + GAP],                        // below-right
      [-LABEL_W / 3, PIN_R + GAP],                       // below-left
      [LABEL_W / 3, -(PIN_R + GAP + LABEL_H)],           // above-right
      [-LABEL_W / 3, -(PIN_R + GAP + LABEL_H)],          // above-left
    ];

    const far: [number, number][] = [
      [LABEL_W / 2 + PIN_R + LEADER_GAP, -LABEL_H / 2],
      [-(LABEL_W / 2 + PIN_R + LEADER_GAP), -LABEL_H / 2],
      [0, PIN_R + LEADER_GAP],
      [0, -(PIN_R + LEADER_GAP + LABEL_H)],
      [LABEL_W / 2 + LEADER_GAP, PIN_R + LEADER_GAP],
      [-(LABEL_W / 2 + LEADER_GAP), PIN_R + LEADER_GAP],
    ];

    // Pin bounding boxes (other pins are obstacles)
    const pinBoxes = projected.map(({ sx, sy }) => ({
      l: sx - PIN_R, t: sy - PIN_R, r: sx + PIN_R, b: sy + PIN_R,
    }));

    // Already-placed label bounding boxes
    const labelBoxes: { l: number; t: number; r: number; b: number }[] = [];

    const PAD = 3; // collision padding between labels
    function overlaps(cx: number, top: number, skipPinIdx: number): boolean {
      const l = cx - LABEL_W / 2 - PAD;
      const r = cx + LABEL_W / 2 + PAD;
      const t = top - PAD;
      const b = top + LABEL_H + PAD;
      // Check against other pins
      for (let i = 0; i < pinBoxes.length; i++) {
        if (i === skipPinIdx) continue;
        const box = pinBoxes[i];
        if (l < box.r && r > box.l && t < box.b && b > box.t) return true;
      }
      // Check against already-placed labels
      for (const box of labelBoxes) {
        if (l < box.r && r > box.l && t < box.b && b > box.t) return true;
      }
      return false;
    }

    for (let idx = 0; idx < projected.length; idx++) {
      const { key, sx, sy } = projected[idx];
      let bestDx = LABEL_W / 2 + PIN_R + GAP;
      let bestDy = -LABEL_H / 2;
      let found = false;

      // Try near positions first
      for (const [dx, dy] of near) {
        if (!overlaps(sx + dx, sy + dy, idx)) {
          bestDx = dx;
          bestDy = dy;
          found = true;
          break;
        }
      }

      // Fall back to far positions
      if (!found) {
        for (const [dx, dy] of far) {
          if (!overlaps(sx + dx, sy + dy, idx)) {
            bestDx = dx;
            bestDy = dy;
            found = true;
            break;
          }
        }
      }

      // Draw leader line if label isn't in the default "right of pin" position
      const PIN_DIAM = 22;
      const labelCenterDist = Math.sqrt(bestDx * bestDx + (bestDy + LABEL_H / 2) * (bestDy + LABEL_H / 2));
      const leader = labelCenterDist > PIN_DIAM * 1.6;

      // Register this label's bounding box
      labelBoxes.push({
        l: sx + bestDx - LABEL_W / 2,
        t: sy + bestDy,
        r: sx + bestDx + LABEL_W / 2,
        b: sy + bestDy + LABEL_H,
      });

      placements.set(key, { offsetX: bestDx, offsetY: bestDy, leader });
    }

    return placements;
  // Recalculate on zoom changes (relative positions are stable during pan)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationMarkers, viewState.zoom]);

  const handleMarkerClick = useCallback(
    (event: ETHDenverEvent, lat: number, lng: number) => {
      const key = coordKey(lat, lng);
      const colocated = colocatedMap.get(key);

      // Track pin click and impression for all events at this location
      if (colocated && colocated.length > 1) {
        for (const evt of colocated) {
          trackEvent({
            event_id: evt.id,
            event_name: evt.name,
            event_type: 'pin-click',
            conference,
            source: 'map',
          });
          trackEvent({
            event_id: evt.id,
            event_name: evt.name,
            event_type: 'impression',
            conference,
            source: 'map',
          });
        }
        // Multiple events at this location
        setPopupEvent(null);
        setPopupEvents(colocated);
        setPopupCoords({ lat, lng });
      } else {
        trackEvent({
          event_id: event.id,
          event_name: event.name,
          event_type: 'pin-click',
          conference,
          source: 'map',
        });
        trackEvent({
          event_id: event.id,
          event_name: event.name,
          event_type: 'impression',
          conference,
          source: 'map',
        });
        // Single event
        setPopupEvents(null);
        setPopupEvent(event);
        setPopupCoords({ lat, lng });
      }

      // Pan map so the popup (which appears above the pin) is visible
      const map = mapRef.current;
      if (map) {
        const point = map.project([lng, lat]);
        const container = map.getContainer();
        const targetY = container.clientHeight * 0.65; // pin at 65% from top
        if (point.y < container.clientHeight * 0.4) {
          // Pin is in the upper 40% — pan down so popup has room
          const newCenter = map.unproject([point.x, point.y - (targetY - point.y)]);
          map.easeTo({ center: newCenter, duration: 300 });
        }
      }
    },
    [colocatedMap, conference]
  );

  const handlePopupClose = useCallback(() => {
    setPopupEvent(null);
    setPopupEvents(null);
    setPopupCoords(null);
    setSelectedPOI(null);
  }, []);


  const handlePOISelect = useCallback((poi: POI) => {
    setPopupEvent(null);
    setPopupEvents(null);
    setPopupCoords(null);
    setSelectedPOI(poi);
  }, []);

  const handlePOIDelete = useCallback(
    (id: string) => {
      onRemovePOI?.(id);
      setSelectedPOI(null);
    },
    [onRemovePOI]
  );

  const handleMapClick = useCallback(() => {
    handlePopupClose();
  }, [handlePopupClose]);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!mapboxToken) {
    return (
      <div className="w-full h-full bg-[var(--theme-bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--theme-text-secondary)] text-lg mb-2">
            Mapbox token not configured
          </p>
          <p className="text-[var(--theme-text-muted)] text-sm">
            Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local
          </p>
        </div>
      </div>
    );
  }

  return (
    <MapGL
      ref={mapRef}
      {...viewState}
      onMove={(evt) => setViewState(evt.viewState)}
      onClick={handleMapClick}
      mapStyle={mapStyle}
      mapboxAccessToken={mapboxToken}
      style={{ width: '100%', height: '100%' }}
      maxZoom={20}
      minZoom={9}
    >
      <NavigationControl position="top-right" />


      {/* Locate me button */}
      <div className="absolute top-2 left-2 z-10">
        <button
          onClick={handleLocateMe}
          disabled={locating}
          className={`p-2 rounded-lg shadow-lg border transition-colors cursor-pointer ${
            userLocation
              ? 'bg-blue-500 border-blue-400 text-white'
              : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)]'
          } disabled:opacity-50`}
          title="Show my location"
          aria-label="Show my location"
        >
          <LocateFixed className={`w-4 h-4 ${locating ? 'animate-pulse' : ''}`} />
        </button>
      </div>

      {/* User location marker */}
      {userLocation && (
        <Marker latitude={userLocation.lat} longitude={userLocation.lng} anchor="center">
          <div className="relative">
            <div className="w-4 h-4 bg-blue-500 border-2 border-white rounded-full shadow-lg" />
            <div className="absolute inset-0 w-4 h-4 bg-blue-400 rounded-full animate-ping opacity-40" />
          </div>
        </Marker>
      )}

      {/* POI Search Bar */}
      <POISearchBar onAddPOI={onAddPOI} mapRef={mapRef} onSignIn={onSignIn} />

      {/* Friend location markers (rendered first, below POIs and events) */}
      {friendLocations?.map((loc) => (
        <FriendMarker key={loc.user_id} location={loc} zoom={viewState.zoom} />
      ))}

      {/* POI Markers (rendered before events so events layer on top) */}
      {pois?.map((poi) => (
        <POIMarker key={poi.id} poi={poi} onSelect={handlePOISelect} isOwn={poi.user_id === user?.id} zoom={viewState.zoom} />
      ))}

      {locationMarkers.map(({ event, key, count }) => {
        const colocated = colocatedMap.get(key);
        // Always show the first event's details on the pin label
        const markerLabel = event.name;
        const markerOrganizer = event.organizer;
        const markerTags = event.tags;
        // For itinerary view: single pin gets its number, co-located gets lowest number in group
        let orderNumber: number | undefined;
        if (isItineraryView) {
          if (count === 1) {
            orderNumber = itineraryOrderMap.get(event.id);
          } else if (colocated) {
            const nums = colocated
              .map((e) => itineraryOrderMap.get(e.id))
              .filter((n): n is number => n != null);
            orderNumber = nums.length > 0 ? Math.min(...nums) : undefined;
          }
        }
        const placement = labelPlacements.get(key);
        return (
          <MapMarker
            key={`loc-${key}`}
            latitude={event.lat!}
            longitude={event.lng!}
            startMinutes={parseTimeToMinutes(event.startTime)}
            endMinutes={parseTimeToMinutes(event.endTime)}
            isAllDay={event.isAllDay}
            eventCount={count}
            onClick={() =>
              handleMarkerClick(event, event.lat!, event.lng!)
            }
            zoom={viewState.zoom}
            label={markerLabel}
            organizer={markerOrganizer}
            tags={markerTags}
            orderNumber={orderNumber}
            labelOffsetX={placement?.offsetX}
            labelOffsetY={placement?.offsetY}
            showLeaderLine={placement?.leader}
            isFeatured={event.isFeatured}
          />
        );
      })}

      {popupEvent && popupCoords && (
        <EventPopup
          event={popupEvent}
          latitude={popupCoords.lat}
          longitude={popupCoords.lng}
          onClose={handlePopupClose}
          isInItinerary={itinerary?.has(popupEvent.id)}
          onItineraryToggle={onItineraryToggle}
          friendsCount={friendsCountByEvent?.get(popupEvent.id)}
          friendsGoing={friendsByEvent?.get(popupEvent.id)}
          checkedInFriends={checkedInFriendsByEvent?.get(popupEvent.id)}
          checkInCount={checkInCounts?.get(popupEvent.id)}
          reactions={reactionsByEvent?.get(popupEvent.id)}
          onToggleReaction={onToggleReaction}
          commentCount={commentCounts?.get(popupEvent.id)}
          conference={conference}
          onCheckIn={onCheckIn}
          checkInLoading={checkInLoading}
          liveUrgency={liveEventIds?.get(popupEvent.id)}
          rsvpStatus={getRsvpStatus?.(popupEvent.id)}
          onRsvp={popupEvent.link ? () => onRsvp?.(popupEvent.id, popupEvent.link!, popupEvent.name) : undefined}
        />
      )}

      {popupEvents && popupCoords && (
        <MultiEventPopup
          events={popupEvents}
          latitude={popupCoords.lat}
          longitude={popupCoords.lng}
          onClose={handlePopupClose}
          itinerary={itinerary}
          onItineraryToggle={onItineraryToggle}
          friendsCountByEvent={friendsCountByEvent}
          friendsByEvent={friendsByEvent}
          checkedInFriendsByEvent={checkedInFriendsByEvent}
          checkInCounts={checkInCounts}
          reactionsByEvent={reactionsByEvent}
          onToggleReaction={onToggleReaction}
          commentCounts={commentCounts}
        />
      )}

      {selectedPOI && (
        <POIPopup
          poi={selectedPOI}
          onClose={handlePopupClose}
          onDelete={handlePOIDelete}
          onUpdate={onUpdatePOI}
          currentUserId={user?.id}
          ownerName={ownerNames?.get(selectedPOI.user_id)}
        />
      )}
    </MapGL>
  );
}
