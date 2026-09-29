'use client';

import { memo, useState, useRef } from 'react';
import clsx from 'clsx';
import { X, ListFilter, Clock, Users, MapPin, Plus, Link2, Check, Loader2, ChevronDown } from 'lucide-react';
import { CalendarIcon } from './icons/CalendarIcon';
import type { FilterState } from '@/lib/types';
import { VIBE_COLORS, getTabConfig, TAG_GROUPS } from '@/lib/constants';
import type { TabConfig } from '@/lib/conferences';
import { TAG_ICONS } from './TagBadge';
import { OrgDropdown } from './OrgDropdown';
import { SearchBar } from './SearchBar';
import { MiniCalendar } from './MiniCalendar';
import UserAvatar from './UserAvatar';
import { trackConferenceSelect, trackDateTimeRange, trackTagToggle, trackTimeMode, trackClearFilters, trackFriendFilter, trackFriendCodeGenerate, trackFriendCodeCopy, trackTagMatchMode } from '@/lib/analytics';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface FilterBarProps {
  filters: FilterState;
  onSetConference: (conf: string) => void;
  onSetDateTimeRange: (start: string, end: string) => void;
  onToggleVibe: (vibe: string) => void;
  onCycleTimeMode: () => void;
  onToggleTagMatchAll: () => void;
  onClearFilters: () => void;
  activeFilterCount: number;
  availableConferences: string[];
  availableTypes: string[];
  availableVibes: string[];
  tagCounts: Map<string, number>;
  friendsForFilter: Array<{ userId: string; displayName: string; avatarUrl?: string | null; xHandle?: string | null }>;
  selectedFriends: string[];
  onToggleFriend: (friendId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  eventCount: number;
  onSubmitEvent?: () => void;
  onSignIn?: () => void;
  conferenceTabs?: TabConfig[];
  orgNames: string[];
  orgEventCounts: Map<string, number>;
  selectedOrgs: string[];
  onToggleOrg: (name: string) => void;
  itineraryCount: number;
  onItineraryToggle: () => void;
  isItineraryActive: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  friendEventCount: number;
  orgEventCount: number;
}

export const FilterBar = memo(function FilterBar({
  filters,
  onSetConference,
  onSetDateTimeRange,
  onToggleVibe,
  onCycleTimeMode,
  onToggleTagMatchAll,
  onClearFilters,
  activeFilterCount,
  availableConferences,
  availableTypes,
  availableVibes,
  tagCounts,
  friendsForFilter,
  selectedFriends,
  onToggleFriend,
  searchQuery,
  onSearchChange,
  eventCount,
  onSubmitEvent,
  onSignIn,
  orgNames,
  orgEventCounts,
  selectedOrgs,
  onToggleOrg,
  conferenceTabs,
  itineraryCount,
  onItineraryToggle,
  isItineraryActive,
  onExpandedChange,
  friendEventCount,
  orgEventCount,
}: FilterBarProps) {
  const [expanded, setExpandedRaw] = useState(false);
  const setExpanded = (v: boolean) => { setExpandedRaw(v); onExpandedChange?.(v); };
  const [confOpen, setConfOpen] = useState(false);
  const [topicsExpanded, setTopicsExpanded] = useState(false);
  const [audienceExpanded, setAudienceExpanded] = useState(false);
  const confBtnRef = useRef<HTMLButtonElement | null>(null);

  // Friend invite link state
  const { user } = useAuth();
  const [friendLinkCopied, setFriendLinkCopied] = useState(false);
  const [friendLinkLoading, setFriendLinkLoading] = useState(false);

  async function handleCopyFriendLink() {
    if (!user || friendLinkLoading) return;
    setFriendLinkLoading(true);

    try {
      // Try to fetch existing code
      const { data: existing } = await supabase
        .from('friend_codes')
        .select('code')
        .eq('user_id', user.id)
        .single();

      let code = existing?.code;

      if (!code) {
        // Generate a new code (8 char alphanumeric)
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const arr = new Uint8Array(8);
        crypto.getRandomValues(arr);
        code = Array.from(arr, (b) => chars[b % chars.length]).join('');

        const { error } = await supabase
          .from('friend_codes')
          .insert({ user_id: user.id, code });

        if (error) {
          // Could be a race condition — try fetching again
          const { data: retry } = await supabase
            .from('friend_codes')
            .select('code')
            .eq('user_id', user.id)
            .single();
          code = retry?.code;
          if (!code) throw error;
        }

        trackFriendCodeGenerate();
      }

      const link = `${window.location.origin}?fc=${code}`;
      await navigator.clipboard.writeText(link);
      trackFriendCodeCopy();
      setFriendLinkCopied(true);
      setTimeout(() => setFriendLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy friend link:', err);
    }

    setFriendLinkLoading(false);
  }

  return (
    <div className="relative bg-[var(--theme-bg-filter)] border-b border-[var(--theme-border-secondary)] z-30">
      <div className="px-2 sm:px-4 pt-3.5 pb-2 space-y-3">
        {/* Top row: Conference tabs + Filter toggle */}
        <div className="flex items-center gap-1.5 sm:gap-3 lg:justify-center">
          {/* Conference selector — dropdown on all screen sizes */}
          {availableConferences.length > 0 && (
            <div className="shrink-0">
              <button
                ref={(el) => { confBtnRef.current = el; }}
                onClick={() => setConfOpen(!confOpen)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 h-9 rounded-lg font-semibold cursor-pointer transition-colors border',
                  confOpen
                    ? 'text-[var(--theme-filter-active)] border-[var(--theme-filter-active)]'
                    : 'bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] active:text-[var(--theme-text-primary)] active:bg-[var(--theme-bg-tertiary)] border-[var(--theme-filter-control-border)]',
                  (filters.conference || 'All').length > 12 ? 'text-xs' : 'text-sm'
                )}
                style={confOpen ? { backgroundColor: 'var(--theme-filter-active-bg)' } : undefined}
              >
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">{filters.conference || 'All'}</span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              </button>
              {confOpen && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setConfOpen(false)} />
                  <div
                    className="fixed z-[70] bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-lg shadow-xl overflow-hidden min-w-[180px]"
                    style={{
                      top: confBtnRef.current ? confBtnRef.current.getBoundingClientRect().bottom + 4 : 0,
                      left: confBtnRef.current ? confBtnRef.current.getBoundingClientRect().left : 16,
                    }}
                  >
                    {availableConferences.map((conf) => (
                      <button
                        key={conf}
                        onClick={() => { trackConferenceSelect(conf); onSetConference(conf); setConfOpen(false); }}
                        className={clsx(
                          'w-full text-left px-4 py-3 text-sm font-semibold transition-colors cursor-pointer',
                          filters.conference === conf
                            ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-text)]'
                            : 'text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] active:bg-[var(--theme-bg-tertiary)]'
                        )}
                      >
                        {conf}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Desktop: inline search bar between conference dropdown and Now */}
          <div className="hidden md:flex items-center gap-2 flex-1">
            <SearchBar value={searchQuery} onChange={onSearchChange} eventCount={eventCount} />
            {onSubmitEvent && (
              <button
                onClick={onSubmitEvent}
                className="shrink-0 h-9 flex items-center justify-center rounded-lg bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] active:text-[var(--theme-text-primary)] active:bg-[var(--theme-bg-tertiary)] border border-[var(--theme-filter-control-border)] transition-colors cursor-pointer px-2 xl:px-3 gap-1.5"
                aria-label="Submit event"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden xl:inline text-sm font-medium">Add Event</span>
              </button>
            )}
          </div>

          {/* Spacer pushes Now + Filters to the right */}
          <div className="flex-1 lg:hidden" />

          {/* Time mode cycle button */}
          <button
            onClick={() => {
              const order = ['off', 'now', 'today', 'tomorrow'] as const;
              const nextMode = order[(order.indexOf(filters.timeMode) + 1) % order.length];
              trackTimeMode(nextMode);
              onCycleTimeMode();
            }}
            aria-label="Time filter"
            className={clsx(
              'shrink-0 flex items-center gap-1 px-2.5 h-9 rounded-lg text-sm font-semibold transition-colors cursor-pointer',
              filters.timeMode !== 'off'
                ? 'text-[var(--theme-filter-active)] border border-[var(--theme-filter-active)]'
                : 'bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] active:text-[var(--theme-text-primary)] active:bg-[var(--theme-bg-tertiary)] border border-[var(--theme-filter-control-border)]'
            )}
            style={filters.timeMode !== 'off' ? { backgroundColor: 'var(--theme-filter-active-bg)' } : undefined}
          >
            <Clock className="w-4 h-4" />
            {filters.timeMode !== 'off' && (
              <span className="text-xs">
                {filters.timeMode === 'now' ? 'Now' : filters.timeMode === 'today' ? 'Today' : 'Tmrw'}
              </span>
            )}
          </button>

          {/* Filter toggle button */}
          <button
            onClick={() => setExpanded(!expanded)}
            aria-label="Filters"
            className={clsx(
              'group shrink-0 flex items-center gap-1 px-2.5 h-9 rounded-lg text-sm font-medium transition-colors cursor-pointer',
              expanded
                ? 'text-[var(--theme-filter-active)] border border-[var(--theme-filter-active)]'
                : 'bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] active:text-[var(--theme-text-primary)] active:bg-[var(--theme-bg-tertiary)] border border-[var(--theme-filter-control-border)]'
            )}
            style={expanded ? { backgroundColor: 'var(--theme-filter-active-bg)' } : undefined}
          >
            <ListFilter className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className={clsx(
                'text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 transition-colors',
                expanded
                  ? 'bg-[var(--theme-filter-active)] text-[var(--theme-bg-filter)] border border-[var(--theme-filter-active)]'
                  : 'bg-[var(--theme-filter-badge-bg)] text-[var(--theme-filter-badge-text)] border border-[var(--theme-filter-badge-border)] group-hover:text-[var(--theme-text-primary)] group-hover:border-[var(--theme-text-primary)] group-hover:bg-transparent'
              )}>
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Itinerary toggle */}
          <button
            onClick={onItineraryToggle}
            aria-label={`Itinerary: ${itineraryCount} events`}
            className={clsx(
              'group shrink-0 flex items-center gap-1 px-2.5 h-9 rounded-lg text-sm font-medium transition-colors cursor-pointer',
              isItineraryActive
                ? 'text-[var(--theme-filter-active)] border border-[var(--theme-filter-active)]'
                : 'bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] active:text-[var(--theme-text-primary)] active:bg-[var(--theme-bg-tertiary)] border border-[var(--theme-filter-control-border)]'
            )}
            style={isItineraryActive ? { backgroundColor: 'var(--theme-filter-active-bg)' } : undefined}
          >
            <CalendarIcon className="w-5 h-5" />
            {itineraryCount > 0 && (
              <span className={clsx(
                'text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 transition-colors',
                isItineraryActive
                  ? 'bg-[var(--theme-filter-active)] text-[var(--theme-bg-filter)] border border-[var(--theme-filter-active)]'
                  : 'bg-[var(--theme-filter-badge-bg)] text-[var(--theme-filter-badge-text)] border border-[var(--theme-filter-badge-border)] group-hover:text-[var(--theme-text-primary)] group-hover:border-[var(--theme-text-primary)] group-hover:bg-transparent'
              )}>
                {itineraryCount}
              </span>
            )}
          </button>
        </div>

        {/* Search bar — mobile only (desktop is inline in the row above) */}
        <div className="md:hidden flex items-center gap-2">
          <SearchBar value={searchQuery} onChange={onSearchChange} eventCount={eventCount} />
          {onSubmitEvent && (
            <button
              onClick={onSubmitEvent}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] active:text-[var(--theme-text-primary)] active:bg-[var(--theme-bg-tertiary)] border border-[var(--theme-filter-control-border)] transition-colors cursor-pointer"
              aria-label="Submit event"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Expandable filter content — overlays map on mobile */}
        {expanded && (
          <div className="space-y-3 pt-1 sm:relative absolute left-0 right-0 sm:bg-transparent bg-[var(--theme-bg-filter)] sm:px-0 px-2 sm:pb-0 pb-4 sm:shadow-none shadow-lg shadow-black/40 sm:max-h-none max-h-[70vh] overflow-y-auto">
            {/* Mini calendar date selector */}
            {(() => {
              const tab = getTabConfig(filters.conference, conferenceTabs);
              let calStart = filters.startDateTime;
              let calEnd = filters.endDateTime;
              if (filters.timeMode !== 'off') {
                const now = new Date(new Date().toLocaleString('en-US', { timeZone: tab.timezone }));
                const pad = (n: number) => String(n).padStart(2, '0');
                const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
                if (filters.timeMode === 'now' || filters.timeMode === 'today') {
                  calStart = `${todayISO}T00:00`;
                  calEnd = `${todayISO}T23:30`;
                } else if (filters.timeMode === 'tomorrow') {
                  const tmrw = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                  const tmrwISO = `${tmrw.getFullYear()}-${pad(tmrw.getMonth() + 1)}-${pad(tmrw.getDate())}`;
                  calStart = `${tmrwISO}T00:00`;
                  calEnd = `${tmrwISO}T23:30`;
                }
              }
              return (
                <MiniCalendar
                  dates={tab.dates}
                  startDateTime={calStart}
                  endDateTime={calEnd}
                  timezone={tab.timezone}
                  onChange={(start, end) => {
                    trackDateTimeRange(start, end);
                    onSetDateTimeRange(start, end);
                  }}
                />
              );
            })()}

            {/* Tag match mode toggle + Ordered filter sections */}
            {(() => {
              const allAvailable = new Set([...availableTypes, ...availableVibes]);

              // Build a render function for a tag group
              function renderGroup(group: typeof TAG_GROUPS[0]) {
                const groupTags = group.tags.filter(
                  (tag) => allAvailable.has(tag) && (tagCounts.get(tag) ?? 0) > 0
                );
                if (groupTags.length === 0) return null;
                return (
                  <div key={group.label}>
                    <div className="text-xs uppercase tracking-wider text-[var(--theme-filter-text)] mb-1">{group.label}</div>
                    <div className="flex flex-wrap gap-2">
                      {groupTags.map((vibe) => {
                        const isActive = filters.vibes.includes(vibe);
                        const vibeColor = VIBE_COLORS[vibe] || VIBE_COLORS['default'];
                        const Icon = TAG_ICONS[vibe];
                        const count = tagCounts.get(vibe) ?? 0;
                        return (
                          <button
                            key={vibe}
                            onClick={() => { trackTagToggle(vibe, !filters.vibes.includes(vibe)); onToggleVibe(vibe); }}
                            className={clsx(
                              'flex items-center gap-1.5 sm:px-3 px-2 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap cursor-pointer',
                              isActive
                                ? 'bg-[var(--theme-filter-active-bg)] border'
                                : 'bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:bg-[var(--theme-filter-control-border)] active:bg-[var(--theme-filter-control-border)] border border-[var(--theme-filter-control-border)]'
                            )}
                            style={isActive ? { borderColor: vibeColor, color: vibeColor } : undefined}
                            title={`${vibe} (${count})`}
                          >
                            {Icon && <Icon className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">{vibe}</span>
                            <span className={clsx('text-xs hidden sm:inline', isActive ? 'opacity-70' : 'opacity-60')}>
                              ({count})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              // Find groups by label
              const vibeGroup = TAG_GROUPS.find(g => g.label === 'Vibe');
              const detailsGroup = TAG_GROUPS.find(g => g.label === 'Details');

              return (
                <>
                  {/* Any/All toggle — only show when tags are selected */}
                  {filters.vibes.length > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--theme-filter-text)]">Match</span>
                      <button
                        onClick={() => { trackTagMatchMode('any'); onToggleTagMatchAll(); }}
                        className={clsx(
                          'px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer',
                          !filters.tagMatchAll
                            ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-text)]'
                            : 'bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:text-[var(--theme-text-primary)]'
                        )}
                      >
                        Any
                      </button>
                      <button
                        onClick={() => { trackTagMatchMode('all'); onToggleTagMatchAll(); }}
                        className={clsx(
                          'px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer',
                          filters.tagMatchAll
                            ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-text)]'
                            : 'bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:text-[var(--theme-text-primary)]'
                        )}
                      >
                        All
                      </button>
                    </div>
                  )}

                  {/* Vibe */}
                  {vibeGroup && renderGroup(vibeGroup)}

                  {/* Details */}
                  {detailsGroup && renderGroup(detailsGroup)}
                </>
              );
            })()}

            {/* Friends filter */}
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--theme-filter-text)] mb-1">
                Friends{friendEventCount > 0 && <span className="normal-case tracking-normal opacity-60"> ({friendEventCount})</span>}
              </div>
              {friendsForFilter.length > 0 ? (
                <div className="overflow-x-auto flex gap-2 pb-1">
                  {friendsForFilter.map((friend) => {
                    const isActive = selectedFriends.includes(friend.userId);
                    return (
                      <button
                        key={friend.userId}
                        onClick={() => { trackFriendFilter(friend.displayName, !isActive); onToggleFriend(friend.userId); }}
                        className={clsx(
                          'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap cursor-pointer',
                          isActive
                            ? 'text-white'
                            : 'bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:bg-[var(--theme-filter-control-border)] active:bg-[var(--theme-filter-control-border)]'
                        )}
                        style={isActive ? { backgroundColor: 'var(--friend-blue)' } : undefined}
                      >
                        <div className="w-5 h-5 rounded-full overflow-hidden shrink-0">
                          <UserAvatar
                            avatarUrl={friend.avatarUrl}
                            xHandle={friend.xHandle}
                            displayName={friend.displayName}
                            userId={friend.userId}
                            size="xs"
                            className="!w-full !h-full"
                          />
                        </div>
                        {friend.displayName}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div
                  className={clsx('bg-[var(--theme-filter-control-bg)] rounded-lg px-3 py-2 flex items-center gap-2 border border-[var(--theme-filter-control-border)]', !user && 'cursor-pointer hover:bg-[var(--theme-filter-control-border)] transition-colors')}
                >
                  <Users className="w-4 h-4 text-[var(--theme-filter-text)] shrink-0" />
                  <div className="flex-1 min-w-0" onClick={!user ? onSignIn : undefined}>
                    <p className="text-[var(--theme-filter-text)] text-sm">{user ? 'Add friends to see their plans' : 'Sign in to add friends'}</p>
                  </div>
                  {user && (
                    <button
                      onClick={handleCopyFriendLink}
                      disabled={friendLinkLoading}
                      className={clsx(
                        'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                        friendLinkCopied
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:text-[var(--theme-filter-active)] border border-[var(--theme-filter-control-border)]'
                      )}
                    >
                      {friendLinkCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copied!
                        </>
                      ) : friendLinkLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Copying...
                        </>
                      ) : (
                        <>
                          <Link2 className="w-3.5 h-3.5" />
                          Copy friend link
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Organizations */}
            {orgNames.length > 0 && (
              <OrgDropdown
                orgNames={orgNames}
                orgEventCounts={orgEventCounts}
                selectedOrgs={selectedOrgs}
                onToggleOrg={onToggleOrg}
                orgEventCount={orgEventCount}
              />
            )}

            {/* Audience — collapsed by default */}
            {(() => {
              const allAvailable = new Set([...availableTypes, ...availableVibes]);
              const audienceGroup = TAG_GROUPS.find(g => g.label === 'Audience');
              if (!audienceGroup) return null;
              const audienceTags = audienceGroup.tags.filter(
                (tag) => allAvailable.has(tag) && (tagCounts.get(tag) ?? 0) > 0
              );
              if (audienceTags.length === 0) return null;
              const hasActiveAudience = audienceTags.some(t => filters.vibes.includes(t));
              return (
                <div>
                  <button
                    onClick={() => setAudienceExpanded(!audienceExpanded)}
                    className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--theme-filter-text)] mb-1 cursor-pointer hover:text-[var(--theme-filter-active)] transition-colors"
                  >
                    <span>Audience</span>
                    {hasActiveAudience && !audienceExpanded && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-filter-active)]" />
                    )}
                    <ChevronDown className={clsx('w-3 h-3 transition-transform', !(audienceExpanded || hasActiveAudience) && 'rotate-90')} />
                  </button>
                  {(audienceExpanded || hasActiveAudience) && (
                    <div className="flex flex-wrap gap-2">
                      {audienceTags.map((vibe) => {
                        const isActive = filters.vibes.includes(vibe);
                        const vibeColor = VIBE_COLORS[vibe] || VIBE_COLORS['default'];
                        const Icon = TAG_ICONS[vibe];
                        const count = tagCounts.get(vibe) ?? 0;
                        return (
                          <button
                            key={vibe}
                            onClick={() => { trackTagToggle(vibe, !filters.vibes.includes(vibe)); onToggleVibe(vibe); }}
                            className={clsx(
                              'flex items-center gap-1.5 sm:px-3 px-2 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap cursor-pointer',
                              isActive
                                ? 'bg-[var(--theme-filter-active-bg)] border'
                                : 'bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:bg-[var(--theme-filter-control-border)] active:bg-[var(--theme-filter-control-border)] border border-[var(--theme-filter-control-border)]'
                            )}
                            style={isActive ? { borderColor: vibeColor, color: vibeColor } : undefined}
                            title={`${vibe} (${count})`}
                          >
                            {Icon && <Icon className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">{vibe}</span>
                            <span className={clsx('text-xs hidden sm:inline', isActive ? 'opacity-70' : 'opacity-60')}>
                              ({count})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Topics — collapsed by default */}
            {(() => {
              const allAvailable = new Set([...availableTypes, ...availableVibes]);
              const topicsGroup = TAG_GROUPS.find(g => g.label === 'Topics');
              if (!topicsGroup) return null;
              const topicsTags = topicsGroup.tags.filter(
                (tag) => allAvailable.has(tag) && (tagCounts.get(tag) ?? 0) > 0
              );
              if (topicsTags.length === 0) return null;
              const hasActiveTopics = topicsTags.some(t => filters.vibes.includes(t));

              return (
                <div className="pb-2">
                  <button
                    onClick={() => setTopicsExpanded(!topicsExpanded)}
                    className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--theme-filter-text)] mb-1 cursor-pointer hover:text-[var(--theme-filter-active)] transition-colors"
                  >
                    <span>Topics</span>
                    {hasActiveTopics && !topicsExpanded && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-filter-active)]" />
                    )}
                    <ChevronDown className={clsx('w-3 h-3 transition-transform', !(topicsExpanded || hasActiveTopics) && 'rotate-90')} />
                  </button>
                  {(topicsExpanded || hasActiveTopics) && (
                    <div className="flex flex-wrap gap-2">
                      {topicsTags.map((vibe) => {
                        const isActive = filters.vibes.includes(vibe);
                        const vibeColor = VIBE_COLORS[vibe] || VIBE_COLORS['default'];
                        const Icon = TAG_ICONS[vibe];
                        const count = tagCounts.get(vibe) ?? 0;
                        return (
                          <button
                            key={vibe}
                            onClick={() => { trackTagToggle(vibe, !filters.vibes.includes(vibe)); onToggleVibe(vibe); }}
                            className={clsx(
                              'flex items-center gap-1.5 sm:px-3 px-2 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap cursor-pointer',
                              isActive
                                ? 'bg-[var(--theme-filter-active-bg)] border'
                                : 'bg-[var(--theme-filter-control-bg)] text-[var(--theme-filter-text)] hover:bg-[var(--theme-filter-control-border)] active:bg-[var(--theme-filter-control-border)] border border-[var(--theme-filter-control-border)]'
                            )}
                            style={isActive ? { borderColor: vibeColor, color: vibeColor } : undefined}
                            title={`${vibe} (${count})`}
                          >
                            {Icon && <Icon className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">{vibe}</span>
                            <span className={clsx('text-xs hidden sm:inline', isActive ? 'opacity-70' : 'opacity-60')}>
                              ({count})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Clear all */}
            {activeFilterCount > 0 && (
              <div className="flex items-center">
                <button
                  onClick={() => { trackClearFilters(); onClearFilters(); }}
                  className="flex items-center gap-1.5 text-[var(--theme-filter-active)] hover:opacity-80 active:opacity-80 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
