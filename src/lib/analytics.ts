/** Lightweight wrapper around gtag for custom event tracking */

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
  }
}

function track(eventName: string, params?: Record<string, string | number | boolean>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  }
}

// View mode
export const trackViewChange = (mode: string) =>
  track('view_change', { view_mode: mode });

// Conference selection
export const trackConferenceSelect = (conference: string) =>
  track('conference_select', { conference });

// Tag/vibe toggle
export const trackTagToggle = (tag: string, active: boolean) =>
  track('tag_toggle', { tag, active });

// Datetime range change
export const trackDateTimeRange = (start: string, end: string) =>
  track('datetime_range', { start_datetime: start, end_datetime: end });

// Time mode cycle (now / today / tomorrow / week / off)
export const trackTimeMode = (mode: string) =>
  track('time_mode', { mode });

// Now mode toggle (legacy alias)
export const trackNowMode = (active: boolean) =>
  track('now_mode', { active });

// Search
export const trackSearch = (query: string) =>
  track('search', { search_term: query });

// Itinerary
export const trackItinerary = (eventId: string, action: 'add' | 'remove') =>
  track('itinerary', { event_id: eventId, action });

// Event link click
export const trackEventClick = (eventName: string, url: string) =>
  track('event_click', { event_name: eventName, url });

// Auth
export const trackAuthPrompt = (trigger: string) =>
  track('auth_prompt', { trigger });

export const trackAuthSuccess = () =>
  track('auth_success');

export const trackSignOut = () =>
  track('sign_out');

// Map
export const trackLocateMe = () =>
  track('locate_me');

// Clear filters
export const trackClearFilters = () =>
  track('clear_filters');

// Social / Friends
export const trackProfileUpdate = () => track('profile_update');
export const trackFriendCodeGenerate = () => track('friend_code_generate');
export const trackFriendCodeCopy = () => track('friend_code_copy');
export const trackFriendAdded = () => track('friend_added');
export const trackFriendFilter = (friendName: string, active: boolean) =>
  track('friend_filter', { friend_name: friendName, active });

// Friend Requests
export const trackFriendSearch = (searchType: string) => track('friend_search', { search_type: searchType });
export const trackFriendRequestSent = () => track('friend_request_sent');
export const trackFriendRequestAccepted = () => track('friend_request_accepted');
export const trackFriendRequestRejected = () => track('friend_request_rejected');

// Submit Event
export const trackSubmitEventOpen = () => track('submit_event_open');
export const trackSubmitEventSuccess = (conference: string) =>
  track('submit_event_success', { conference });
export const trackSubmitEventFetch = (success: boolean) =>
  track('submit_event_fetch', { success });
export const trackSubmitEventTagToggle = (tag: string, active: boolean) =>
  track('submit_event_tag_toggle', { tag, active });

// Reactions
export const trackReactionToggle = (eventId: string, emoji: string, active: boolean) =>
  track('reaction_toggle', { event_id: eventId, emoji, active });
export const trackReactionPickerOpen = () => track('reaction_picker_open');

// Comments
export const trackCommentExpand = (eventId: string) =>
  track('comment_expand', { event_id: eventId });
export const trackCommentAdd = (eventId: string, visibility: string) =>
  track('comment_add', { event_id: eventId, visibility });
export const trackCommentDelete = (eventId: string) =>
  track('comment_delete', { event_id: eventId });
export const trackCommentVisibilityToggle = (visibility: string) =>
  track('comment_visibility_toggle', { visibility });

// Event Card
export const trackCopyEventLink = (eventName: string) =>
  track('copy_event_link', { event_name: eventName });
export const trackFriendsGoingOpen = (eventName: string) =>
  track('friends_going_open', { event_name: eventName });
export const trackFriendsCheckedInOpen = (eventName: string) =>
  track('friends_checked_in_open', { event_name: eventName });

// Address / Navigation
export const trackAddressClick = (address: string) =>
  track('address_click', { address });
export const trackCopyAddress = (address: string) =>
  track('copy_address', { address });
export const trackNavigation = (provider: string) =>
  track('navigation', { provider });
export const trackCheckIn = (eventId: string, success: boolean) =>
  track('check_in', { event_id: eventId, success });
export const trackCheckOut = (success: boolean) =>
  track('check_out', { success });

// Friends Panel
export const trackFriendExpand = (friendName: string) =>
  track('friend_expand', { friend_name: friendName });
export const trackFriendXProfileClick = (xHandle: string) =>
  track('friend_x_profile_click', { x_handle: xHandle });
export const trackFriendRemove = () => track('friend_remove');

// Itinerary
export const trackItineraryClear = () => track('itinerary_clear');
export const trackItineraryConferenceTab = (conference: string) =>
  track('itinerary_conference_tab', { conference });
export const trackItineraryExportIcs = () => track('itinerary_export_ics');
export const trackItinerarySharePng = () => track('itinerary_share_png');
export const trackItineraryShareLink = () => track('itinerary_share_link');
export const trackItineraryReorder = () => track('itinerary_reorder');
export const trackItineraryHideEvent = (hidden: boolean) =>
  track('itinerary_hide_event', { hidden });

// POI
export const trackPoiAdd = (category: string) =>
  track('poi_add', { category });
export const trackPoiCategorySelect = (category: string) =>
  track('poi_category_select', { category });
export const trackPoiShareToggle = (isPublic: boolean) =>
  track('poi_share_toggle', { is_public: isPublic });

// Modals
export const trackModalDismiss = (modal: string) =>
  track('modal_dismiss', { modal });

// Share Card
export const trackShareCardOpen = () => track('share_card_open');
export const trackShareCardCopy = () => track('share_card_copy');
export const trackShareCardDownload = () => track('share_card_download');

// Onboarding
export const trackOnboardingStart = () => track('onboarding_start');
export const trackOnboardingStep = (step: string) =>
  track('onboarding_step', { step });
export const trackOnboardingComplete = (conference: string, tagCount: number) =>
  track('onboarding_complete', { conference, tag_count: tagCount });
export const trackOnboardingSkip = (step: string) =>
  track('onboarding_skip', { step });

// Ad tracking
export const trackAdClick = (placement: string, url: string) =>
  track('ad_click', { placement, url });
export const trackAdImpression = (placement: string) =>
  track('ad_impression', { placement });

// Google Calendar Export
export const trackGoogleCalendarExport = (inserted: number, failed: number) =>
  track('google_calendar_export', { inserted, failed });
export const trackGoogleCalendarError = (error: string) =>
  track('google_calendar_error', { error });

// A/B Testing (GA4 dual-tracking -- events also tracked in Supabase via /api/ab/track)
export const trackABImpression = (testId: string, variantId: string) =>
  track('ab_impression', { test_id: testId, variant_id: variantId });
export const trackABClick = (testId: string, variantId: string, metadata?: string) =>
  track('ab_click', { test_id: testId, variant_id: variantId, ...(metadata ? { metadata } : {}) });
export const trackABConversion = (testId: string, variantId: string, metadata?: string) =>
  track('ab_conversion', { test_id: testId, variant_id: variantId, ...(metadata ? { metadata } : {}) });

// Lock Screen Card
export const trackLockScreenOpen = () => track('lock_screen_open');
export const trackLockScreenDownload = () => track('lock_screen_download');
export const trackLockScreenCopy = () => track('lock_screen_copy');

// Friend Code Redemption
export const trackFriendCodeRedeemed = (code: string) =>
  track('friend_code_redeemed', { code });

// RSVP
export const trackRsvpOpen = (eventId: string, eventName: string) =>
  track('rsvp_open', { event_id: eventId, event_name: eventName });
export const trackRsvpConfirm = (eventId: string, eventName: string) =>
  track('rsvp_confirm', { event_id: eventId, event_name: eventName });

// User properties
export function setUserProperties(props: Record<string, string | boolean>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('set', 'user_properties', props);
  }
}

export const setConferenceProperty = (conference: string) =>
  setUserProperties({ conference_slug: conference });

export const setAuthProperty = (isAuthenticated: boolean) =>
  setUserProperties({ is_authenticated: String(isAuthenticated) });

export const setItineraryProperty = (hasItinerary: boolean) =>
  setUserProperties({ has_itinerary: String(hasItinerary) });

// Tag match mode
export const trackTagMatchMode = (mode: 'any' | 'all') =>
  track('tag_match_mode', { action: mode });

// Table export
export const trackTableExport = () => track('table_export', { action: 'csv' });

// Outbound clicks
export const trackOutboundClick = (eventName: string, url: string) =>
  track('outbound_click', { event_name: eventName, url });

// Itinerary view
export const trackItineraryView = () =>
  track('itinerary_view');

// Error tracking
export const trackError = (message: string, source?: string) =>
  track('error', { message: message.slice(0, 100), ...(source ? { source } : {}) });

// X (Twitter) verification
export const trackXConnectStart = () => track('x_connect_start');
export const trackXConnectSuccess = () => track('x_connect_success');
export const trackXDisconnect = () => track('x_disconnect');
