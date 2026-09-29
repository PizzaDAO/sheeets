'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useEvents } from '@/hooks/useEvents';
import { useFilters } from '@/hooks/useFilters';
import { useItinerary } from '@/hooks/useItinerary';
import { usePOIs } from '@/hooks/usePOIs';
import { useFriends } from '@/hooks/useFriends';
import { useFriendsDependentData } from '@/hooks/useFriendsDependentData';
import { useEventReactions } from '@/hooks/useEventReactions';
import { useEventCommentCounts } from '@/hooks/useEventCommentCounts';
import { useViewMode } from '@/hooks/useViewMode';
import { useAuthGatedActions } from '@/hooks/useAuthGatedActions';
import { useConferenceData } from '@/hooks/useConferenceData';
import { useNowMode } from '@/hooks/useNowMode';
import { useOrgs } from '@/hooks/useOrgs';
import { useAdminConfig } from '@/hooks/useAdminConfig';
import { useConferenceTabs } from '@/hooks/useConferenceTabs';
import { useABTest } from '@/hooks/useABTest';
import { useEventCheckIn } from '@/hooks/useEventCheckIn';
import { useFriendCode } from '@/hooks/useFriendCode';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeId, DEFAULT_THEME, THEME_OPTIONS } from '@/lib/themes';
import type { ABTest, ETHDenverEvent } from '@/lib/types';
import { resolveItemVariants, getVisitorId } from '@/lib/ab-testing';
import { Header } from './Header';
import { FilterBar } from './FilterBar';
import { ListView } from './ListView';
import { GalleryView } from './GalleryView';
import { TableView } from './TableView';
import { MapViewWrapper } from './MapViewWrapper';
import { Loading } from './Loading';
import { AuthModal } from './AuthModal';
import { SubmitEventModal } from './SubmitEventModal';
import { FriendsPanel } from './FriendsPanel';
import { SponsorsTicker } from './SponsorsTicker';
import { CheckInFAB } from './CheckInFAB';
import { OnboardingWizard } from './OnboardingWizard';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { trackAuthPrompt, trackRsvpOpen, trackRsvpConfirm, setConferenceProperty } from '@/lib/analytics';
import { getTabConfig } from '@/lib/conferences';
import { extractFeaturedEvents } from '@/lib/featured';
import { passesNowFilter, getConferenceNow, applyFilters, computeTagCounts } from '@/lib/filters';
import { parseTimeToMinutes } from '@/lib/time-parse';
import { distanceMeters } from '@/lib/geo';
import { useAuth } from '@/contexts/AuthContext';
import { useRsvp } from '@/hooks/useRsvp';
import { useProfile } from '@/hooks/useProfile';
import { RsvpOverlay } from './RsvpOverlay';
import { BatchRsvpModal } from './BatchRsvpModal';
import { isLumaUrl } from '@/lib/luma';

export function EventApp({ initialConference, initialEvents }: { initialConference?: string; initialEvents?: ETHDenverEvent[] }) {
  const { config } = useAdminConfig();
  const { tabs: conferenceTabs } = useConferenceTabs();
  const { events, loading, error } = useEvents(initialEvents);
  const {
    filters,
    setFilter,
    setConference,
    setDateTimeRange,
    toggleVibe,
    toggleFriend,
    toggleBool,
    cycleTimeMode,
    toggleTagMatchAll,
    clearFilters,
    activeFilterCount,
    toggleOrg,
  } = useFilters(initialConference, conferenceTabs);

  // Re-apply conference date range once dynamic tabs load
  // (fixes dates for conferences not in FALLBACK_TABS, e.g. Toronto Tech Week)
  useEffect(() => {
    if (initialConference && conferenceTabs.some(t => t.name === initialConference)) {
      setConference(initialConference);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conferenceTabs]);

  const {
    viewMode,
    setViewMode,
    contentScrolled,
    setContentScrolled,
    listMainRef,
    handleListScroll,
  } = useViewMode();

  const {
    itinerary,
    toggle: toggleItinerary,
    count: itineraryCount,
    ready: itineraryReady,
    hiddenEvents,
    toggleHidden,
  } = useItinerary();

  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const { pois, addPOI, removePOI, updatePOI, ownerNames } = usePOIs();

  const { friends, removeFriend, refreshFriends } = useFriends();
  const { friendItineraries, checkInCounts, checkInUsersByEvent, friendLocations } = useFriendsDependentData(friends);
  const { reactionsByEvent, toggleReaction } = useEventReactions();
  const commentCounts = useEventCommentCounts();

  const {
    showAuthForStar,
    handleItineraryToggle,
    handleToggleReaction,
    dismissAuth,
  } = useAuthGatedActions({
    itinerary,
    toggleItinerary,
    itineraryReady,
    toggleReaction,
    setFilter,
    itineraryOnly: filters.itineraryOnly,
  });

  const {
    availableConferences,
    availableTypes,
    availableVibes,
    conferenceEventCount,
    conferenceItineraryCount,
    friendsForFilter,
    selectedFriendEventIds,
    friendsCountByEvent,
    friendsByEvent,
    checkedInFriendsByEvent,
  } = useConferenceData({
    events,
    filters,
    itinerary,
    friends,
    friendItineraries,
    checkInUsersByEvent,
    setFilter,
  });

  const { orgMapping } = useOrgs(filters.conference);

  const orgNames = useMemo(() => orgMapping.orgs.map(o => o.name), [orgMapping]);

  const orgEventCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const org of orgMapping.orgs) m.set(org.name, org.eventIds.length);
    return m;
  }, [orgMapping]);

  const friendEventCount = friendsCountByEvent.size;

  const orgEventCount = useMemo(() => {
    const ids = new Set<string>();
    for (const org of orgMapping.orgs) {
      for (const id of org.eventIds) ids.add(id);
    }
    return ids.size;
  }, [orgMapping]);

  const orgEventIds = useMemo(() => {
    if (filters.selectedOrgs.length === 0) return undefined;
    const ids = new Set<string>();
    for (const org of orgMapping.orgs) {
      if (filters.selectedOrgs.includes(org.name)) {
        for (const id of org.eventIds) ids.add(id);
      }
    }
    return ids;
  }, [orgMapping, filters.selectedOrgs]);

  const eventIdToOrgs = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [eventId, orgNamesList] of Object.entries(orgMapping.eventOrgs)) {
      map.set(eventId, orgNamesList);
    }
    return map;
  }, [orgMapping]);

  const nowModeFilterOptions = useMemo(() => ({
    orgEventIds,
    eventIdToOrgs,
  }), [orgEventIds, eventIdToOrgs]);

  const { filteredEvents } = useNowMode({
    events,
    filters,
    itinerary,
    selectedFriendEventIds,
    filterOptions: nowModeFilterOptions,
  });

  const featuredEvents = useMemo(
    () => filters.itineraryOnly ? [] : extractFeaturedEvents(filteredEvents),
    [filteredEvents, filters.itineraryOnly],
  );

  // Events filtered by everything EXCEPT vibes — used to compute tag counts
  const baseFilteredEvents = useMemo(
    () => applyFilters(events, filters, itinerary, filters.timeMode !== 'off' ? getConferenceNow(filters.conference).getTime() : undefined, selectedFriendEventIds, { skipVibes: true, orgEventIds, eventIdToOrgs }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, filters, itinerary, selectedFriendEventIds, orgEventIds, eventIdToOrgs]
  );

  const tagCounts = useMemo(
    () => computeTagCounts(baseFilteredEvents),
    [baseFilteredEvents]
  );

  // Check-in hook + proximity watcher
  const { user: authUser } = useAuth();
  const {
    checkInToEvent,
    checkInToNearbyEvents,
    loading: checkInLoading,
    result: checkInResult,
    clearResult: clearCheckInResult,
  } = useEventCheckIn();

  const { getRsvpStatus, openRsvp, confirmRsvp, closeRsvp, activeRsvp, confirmedIds } = useRsvp();
  const { profile } = useProfile();

  // Batch RSVP: count eligible Luma events in itinerary that aren't RSVP'd yet
  const batchRsvpEligibleCount = useMemo(() => {
    let count = 0;
    for (const e of events) {
      if (itinerary.has(e.id) && isLumaUrl(e.link) && !confirmedIds.has(e.id)) {
        count++;
      }
    }
    return count;
  }, [events, itinerary, confirmedIds]);

  const liveEventIds = useMemo(() => {
    const now = getConferenceNow(filters.conference);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const map = new Map<string, 'green' | 'yellow' | 'red'>();
    for (const e of events) {
      if (passesNowFilter(e, now)) {
        const endMin = parseTimeToMinutes(e.endTime);
        let urgency: 'green' | 'yellow' | 'red' = 'green';
        if (endMin !== null) {
          const startMin = parseTimeToMinutes(e.startTime);
          let remaining: number;
          if (startMin !== null && endMin < startMin) {
            remaining = (endMin + 24 * 60) - nowMinutes;
          } else {
            remaining = endMin - nowMinutes;
          }
          if (remaining <= 30) urgency = 'red';
          else if (remaining <= 60) urgency = 'yellow';
        }
        map.set(e.id, urgency);
      }
    }
    return map;
  }, [events, filters.conference]);

  const liveItineraryCount = useMemo(() => {
    let count = 0;
    for (const id of itinerary) {
      if (liveEventIds.has(id)) count++;
    }
    return count;
  }, [itinerary, liveEventIds]);

  const [hasNearbyLiveEvents, setHasNearbyLiveEvents] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Proximity watcher: detect when user is within 150m of a live RSVP'd event
  const liveItineraryEventsRef = useRef<typeof events>([]);
  useEffect(() => {
    liveItineraryEventsRef.current = events.filter(
      (e) => itinerary.has(e.id) && liveEventIds.has(e.id) && e.lat && e.lng
    );
  }, [events, itinerary, liveEventIds]);

  useEffect(() => {
    if (liveItineraryCount <= 0 || !authUser) {
      setHasNearbyLiveEvents(false);
      return;
    }

    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: uLat, longitude: uLng } = pos.coords;
        setUserLocation({ lat: uLat, lng: uLng });
        const nearby = liveItineraryEventsRef.current.some(
          (e) => distanceMeters(uLat, uLng, e.lat!, e.lng!) <= 150
        );
        setHasNearbyLiveEvents(nearby);
      },
      () => setHasNearbyLiveEvents(false),
      { maximumAge: 30000, enableHighAccuracy: false }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [liveItineraryCount, authUser]);

  const handleBulkCheckIn = useCallback(() => {
    checkInToNearbyEvents(events, itinerary, filters.conference);
  }, [checkInToNearbyEvents, events, itinerary, filters.conference]);

  const handleItineraryFilterToggle = useCallback(() => {
    if (!authUser) {
      trackAuthPrompt('itinerary_button');
      setShowSignIn(true);
      return;
    }
    toggleBool('itineraryOnly');
  }, [authUser, toggleBool]);

  // Theme: read from admin config per-conference and apply
  const { setTheme } = useTheme();
  useEffect(() => {
    if (!config || !filters.conference) {
      setTheme(DEFAULT_THEME);
      return;
    }
    const configKey = `theme:${filters.conference}`;
    const configTheme = (config as Record<string, unknown>)[configKey] as string | undefined;
    const validIds = THEME_OPTIONS.map(t => t.id) as string[];
    if (configTheme && validIds.includes(configTheme)) {
      setTheme(configTheme as ThemeId);
    } else {
      setTheme(DEFAULT_THEME);
    }
  }, [config, filters.conference, setTheme]);

  // Sync URL with selected conference
  useEffect(() => {
    const tab = getTabConfig(filters.conference, conferenceTabs);
    if (tab?.slug) {
      const newPath = `/${tab.slug}`;
      if (window.location.pathname !== newPath) {
        window.history.replaceState(null, '', newPath);
      }
      setConferenceProperty(tab.slug);
    }
  }, [filters.conference, conferenceTabs]);

  // Per-item A/B variant resolution
  const visitorId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return getVisitorId();
  }, []);

  const resolvedSponsors = useMemo(
    () => resolveItemVariants(config?.sponsors || [], visitorId),
    [config?.sponsors, visitorId]
  );
  const resolvedNativeAds = useMemo(
    () => resolveItemVariants(config?.native_ads || [], visitorId),
    [config?.native_ads, visitorId]
  );

  // A/B Testing: find running tests by placement
  const abTests = useMemo(() => {
    const tests = (config as Record<string, unknown>)?.ab_tests as ABTest[] | undefined;
    return tests || [];
  }, [config]);

  const adFrequencyTest = useMemo(
    () => abTests.find(t => t.placement === 'ad-frequency' && t.status === 'running' && (!t.conference || t.conference === filters.conference)),
    [abTests, filters.conference]
  );

  const sponsorCopyTest = useMemo(
    () => abTests.find(t => t.placement === 'sponsor-copy' && t.status === 'running' && (!t.conference || t.conference === filters.conference)),
    [abTests, filters.conference]
  );

  const nativeAdContentTest = useMemo(
    () => abTests.find(t => t.placement === 'native-ad-content' && t.status === 'running' && (!t.conference || t.conference === filters.conference)),
    [abTests, filters.conference]
  );

  const {
    config: adFreqConfig,
    trackClick: trackAdFreqClick,
    isActive: adFreqActive,
  } = useABTest({ test: adFrequencyTest });

  const {
    config: sponsorConfig,
    trackClick: trackSponsorClick,
    isActive: sponsorTestActive,
  } = useABTest({ test: sponsorCopyTest });

  const {
    config: nativeAdConfig,
    trackClick: trackNativeAdClick,
    isActive: nativeAdTestActive,
  } = useABTest({ test: nativeAdContentTest });

  // Derive ad frequency from A/B test config, default 8
  const adFrequency = adFreqActive && typeof adFreqConfig.frequency === 'number'
    ? adFreqConfig.frequency
    : 8;


  // Ad impression/click tracking for A/B tests
  const handleAdImpression = useCallback((_adId: string) => {
    // Impressions are tracked via the useABTest hook automatically
  }, []);

  const handleAdClick = useCallback((_adId: string) => {
    if (adFreqActive) trackAdFreqClick({ ad_id: _adId });
    if (nativeAdTestActive) trackNativeAdClick({ ad_id: _adId });
  }, [adFreqActive, trackAdFreqClick, nativeAdTestActive, trackNativeAdClick]);

  const handleTickerSponsorClick = useCallback((url: string) => {
    if (sponsorTestActive) trackSponsorClick({ url });
  }, [sponsorTestActive, trackSponsorClick]);

  // Friends panel
  const [showFriends, setShowFriends] = useState(false);
  const [showSubmitEvent, setShowSubmitEvent] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showBatchRsvp, setShowBatchRsvp] = useState(false);

  // Friend code (?fc=) URL handler
  const { toast: friendCodeToast } = useFriendCode({
    openAuth: () => setShowSignIn(true),
    refreshFriends,
  });

  const handleRsvp = useCallback((eventId: string, lumaUrl: string, eventName: string) => {
    if (!authUser) {
      trackAuthPrompt('rsvp');
      setShowSignIn(true);
      return;
    }
    trackRsvpOpen(eventId, eventName);
    openRsvp(eventId, lumaUrl, eventName);
  }, [authUser, openRsvp]);

  const handleRsvpConfirm = useCallback(() => {
    if (activeRsvp) {
      trackRsvpConfirm(activeRsvp.eventId, activeRsvp.eventName);
    }
    confirmRsvp();
  }, [activeRsvp, confirmRsvp]);

  // Stable callback refs for child prop stability
  const handleOpenFriends = useCallback(() => setShowFriends(true), []);
  const handleOpenSubmitEvent = useCallback(() => setShowSubmitEvent(true), []);
  const handleOpenSignIn = useCallback(() => setShowSignIn(true), []);
  const handleSearchChange = useCallback((q: string) => setFilter('searchQuery', q), [setFilter]);
  const handleCloseAuth = useCallback(() => { dismissAuth(); setShowSignIn(false); }, [dismissAuth]);
  const handleCloseSubmitEvent = useCallback(() => setShowSubmitEvent(false), []);
  const handleCloseFriends = useCallback(() => setShowFriends(false), []);
  const handleOnboardingAuth = useCallback(() => { setShowOnboarding(false); setShowSignIn(true); }, []);

  // Memoized derived value
  const filteredItineraryCount = useMemo(
    () => filteredEvents.filter(e => itinerary.has(e.id)).length,
    [filteredEvents, itinerary]
  );

  // Onboarding wizard for first-time users
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETED)) {
      setShowOnboarding(true);
    }
  }, []);

  const handleOnboardingComplete = useCallback(
    (config: { conference: string; selectedTags: string[] }) => {
      localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETED, '1');
      setShowOnboarding(false);
      if (config.conference) {
        setConference(config.conference);
      }
      for (const tag of config.selectedTags) {
        toggleVibe(tag);
      }
    },
    [setConference, toggleVibe]
  );

  const handleOnboardingDismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETED, '1');
    setShowOnboarding(false);
  }, []);

  const conferenceEventCounts = useMemo(
    () => events.reduce<Record<string, number>>((acc, e) => {
      if (e.conference) {
        acc[e.conference] = (acc[e.conference] || 0) + 1;
      }
      return acc;
    }, {}),
    [events]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--theme-bg-primary)]">
        <Header
          viewMode={viewMode}
          onViewChange={setViewMode}
          events={events}
          itinerary={itinerary}
          onOpenFriends={handleOpenFriends}
          refreshFriends={refreshFriends}
        />
        <Loading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--theme-bg-primary)]">
        <Header
          viewMode={viewMode}
          onViewChange={setViewMode}
          events={events}
          itinerary={itinerary}
          onOpenFriends={handleOpenFriends}
          refreshFriends={refreshFriends}
        />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-4">
          <div className="text-red-400 text-lg font-medium">Failed to load events</div>
          <p className="text-[var(--theme-text-muted)] text-sm text-center max-w-md">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] active:bg-[var(--theme-accent-hover)] text-[var(--theme-accent-text)] rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-[var(--theme-bg-primary)] overflow-hidden">
      <Header
        viewMode={viewMode}
        onViewChange={setViewMode}
        events={events}
        itinerary={itinerary}
        onOpenFriends={handleOpenFriends}
        onSubmitEvent={handleOpenSubmitEvent}
        refreshFriends={refreshFriends}
        activeConference={filters.conference}
        hasNearbyLiveEvents={hasNearbyLiveEvents}
        onBulkCheckIn={handleBulkCheckIn}
        checkInLoading={checkInLoading}
      />

      <SponsorsTicker
        sponsors={resolvedSponsors}
        conference={filters.conference}
        onSponsorClick={handleTickerSponsorClick}
      />

      {/* Filter bar -- collapses on scroll down in table/list views */}
      <div className={
        viewMode === 'table' || viewMode === 'list' || viewMode === 'gallery'
          ? `shrink-0 transition-all duration-200 ${contentScrolled && !filtersExpanded ? 'lg:overflow-visible lg:max-h-none overflow-hidden max-h-0' : ''}`
          : 'shrink-0'
      }>
        <FilterBar
          filters={filters}
          onSetConference={setConference}
          onSetDateTimeRange={setDateTimeRange}
          onToggleVibe={toggleVibe}
          onCycleTimeMode={cycleTimeMode}
          onToggleTagMatchAll={toggleTagMatchAll}
          onClearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
          availableConferences={availableConferences}
          availableTypes={availableTypes}
          availableVibes={availableVibes}
          tagCounts={tagCounts}
          friendsForFilter={friendsForFilter}
          selectedFriends={filters.selectedFriends}
          onToggleFriend={toggleFriend}
          searchQuery={filters.searchQuery}
          onSearchChange={handleSearchChange}
          eventCount={filteredEvents.length}
          onSubmitEvent={handleOpenSubmitEvent}
          onSignIn={handleOpenSignIn}
          orgNames={orgNames}
          orgEventCounts={orgEventCounts}
          selectedOrgs={filters.selectedOrgs}
          onToggleOrg={toggleOrg}
          conferenceTabs={conferenceTabs}
          itineraryCount={filteredItineraryCount}
          onItineraryToggle={handleItineraryFilterToggle}
          isItineraryActive={filters.itineraryOnly}
          onExpandedChange={setFiltersExpanded}
          friendEventCount={friendEventCount}
          orgEventCount={orgEventCount}
        />
      </div>

      {/* Main content area */}
      {viewMode === 'map' ? (
        <main key="map" className="flex-1 min-h-0">
          <MapViewWrapper
            events={filteredEvents}
            itinerary={itinerary}
            onItineraryToggle={handleItineraryToggle}
            isItineraryView={filters.itineraryOnly}
            friendsCountByEvent={friendsCountByEvent}
            friendsByEvent={friendsByEvent}
            checkedInFriendsByEvent={checkedInFriendsByEvent}
            checkInCounts={checkInCounts}
            reactionsByEvent={reactionsByEvent}
            onToggleReaction={handleToggleReaction}
            commentCounts={commentCounts}
            friendLocations={friendLocations}
            conference={filters.conference}
            pois={pois}
            onAddPOI={addPOI}
            onRemovePOI={removePOI}
            onUpdatePOI={updatePOI}
            ownerNames={ownerNames}
            onSignIn={handleOpenSignIn}
            conferenceTabs={conferenceTabs}
            onCheckIn={checkInToEvent}
            checkInLoading={checkInLoading}
            liveEventIds={liveEventIds}
            getRsvpStatus={getRsvpStatus}
            onRsvp={handleRsvp}
          />
        </main>
      ) : viewMode === 'table' ? (
        <main key="table" className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden bg-[var(--theme-bg-list)]">
          <TableView
            events={filteredEvents}
            totalCount={conferenceEventCount}
            itinerary={itinerary}
            onItineraryToggle={handleItineraryToggle}
            onScrolledChange={setContentScrolled}
            friendsCountByEvent={friendsCountByEvent}
            friendsByEvent={friendsByEvent}
            checkedInFriendsByEvent={checkedInFriendsByEvent}
            checkInCounts={checkInCounts}
            reactionsByEvent={reactionsByEvent}
            onToggleReaction={handleToggleReaction}
            commentCounts={commentCounts}
            conference={filters.conference}
            featuredEvents={featuredEvents}
            isSignedIn={!!authUser}
            onSignIn={handleOpenSignIn}
            liveEventIds={liveEventIds}
            userLocation={userLocation}
            getRsvpStatus={getRsvpStatus}
            onRsvp={handleRsvp}
          />
        </main>
      ) : viewMode === 'gallery' ? (
        <main key="gallery" ref={listMainRef} onScroll={handleListScroll} className="flex-1 min-h-0 overflow-y-auto bg-[var(--theme-bg-list)]">
          <GalleryView
            events={filteredEvents}
            totalCount={conferenceEventCount}
            itinerary={itinerary}
            onItineraryToggle={handleItineraryToggle}
            friendsCountByEvent={friendsCountByEvent}
            friendsByEvent={friendsByEvent}
            checkedInFriendsByEvent={checkedInFriendsByEvent}
            checkInCounts={checkInCounts}
            reactionsByEvent={reactionsByEvent}
            onToggleReaction={handleToggleReaction}
            commentCounts={commentCounts}
            scrollContainerRef={listMainRef}
            conference={filters.conference}
            liveEventIds={liveEventIds}
          />
        </main>
      ) : (
        <main key="list" ref={listMainRef} onScroll={handleListScroll} className="flex-1 min-h-0 overflow-y-auto bg-[var(--theme-bg-list)]">
          <ListView
            events={filteredEvents}
            totalCount={conferenceEventCount}
            itinerary={itinerary}
            onItineraryToggle={handleItineraryToggle}
            friendsCountByEvent={friendsCountByEvent}
            friendsByEvent={friendsByEvent}
            checkedInFriendsByEvent={checkedInFriendsByEvent}
            checkInCounts={checkInCounts}
            reactionsByEvent={reactionsByEvent}
            onToggleReaction={handleToggleReaction}
            commentCounts={commentCounts}
            nativeAds={resolvedNativeAds}
            scrollContainerRef={listMainRef}
            adFrequency={adFrequency}
            onAdImpression={handleAdImpression}
            onAdClick={handleAdClick}
            conference={filters.conference}
            featuredEvents={featuredEvents}
            onCheckIn={checkInToEvent}
            checkInLoading={checkInLoading}
            liveEventIds={liveEventIds}
            userLocation={userLocation}
            getRsvpStatus={getRsvpStatus}
            onRsvp={handleRsvp}
          />
        </main>
      )}

      {hasNearbyLiveEvents && (
        <CheckInFAB
          liveItineraryCount={liveItineraryCount}
          onCheckIn={handleBulkCheckIn}
          loading={checkInLoading}
          result={checkInResult}
        />
      )}

      {/* Batch RSVP FAB: visible when logged in with eligible Luma events */}
      {authUser && batchRsvpEligibleCount > 0 && (
        <button
          onClick={() => setShowBatchRsvp(true)}
          className={`fixed right-6 z-[60] flex items-center gap-2 px-4 py-2.5 rounded-full bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold shadow-lg transition-colors cursor-pointer ${hasNearbyLiveEvents ? 'bottom-20' : 'bottom-6'}`}
          title={`Batch RSVP to ${batchRsvpEligibleCount} event(s)`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Batch RSVP ({batchRsvpEligibleCount})
        </button>
      )}

      <AuthModal isOpen={showAuthForStar || showSignIn} onClose={handleCloseAuth} />
      <SubmitEventModal isOpen={showSubmitEvent} onClose={handleCloseSubmitEvent} upsellCopy={config?.upsell_copy} initialConference={filters.conference} conferenceTabs={conferenceTabs} />
      <FriendsPanel
        isOpen={showFriends}
        onClose={handleCloseFriends}
        friends={friends}
        onRemoveFriend={removeFriend}
      />
      <OnboardingWizard
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
        onDismiss={handleOnboardingDismiss}
        availableConferences={availableConferences}
        conferenceEventCounts={conferenceEventCounts}
        events={events}
        onOpenAuth={handleOnboardingAuth}
        conferenceTabs={conferenceTabs}
      />
      {activeRsvp && (
        <RsvpOverlay
          eventName={activeRsvp.eventName}
          lumaUrl={activeRsvp.lumaUrl}
          userName={profile?.rsvp_name ?? profile?.display_name}
          userEmail={profile?.email}
          userXHandle={profile?.x_handle}
          userTelegram={profile?.telegram_handle}
          userCompany={profile?.company}
          userLinkedin={profile?.linkedin_url}
          userJobTitle={profile?.job_title}
          onConfirm={handleRsvpConfirm}
          onClose={closeRsvp}
        />
      )}
      <BatchRsvpModal
        isOpen={showBatchRsvp}
        onClose={() => setShowBatchRsvp(false)}
        events={events}
        itinerary={itinerary}
        confirmedIds={confirmedIds}
      />
      {friendCodeToast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-opacity duration-300 ${
          friendCodeToast.type === 'success'
            ? 'bg-green-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {friendCodeToast.message}
        </div>
      )}
    </div>
  );
}
