'use client';

import { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Search, ArrowLeft } from 'lucide-react';
import { fetchEvents } from '@/lib/fetch-events';
import { FALLBACK_TABS } from '@/lib/constants';
import type { ETHDenverEvent } from '@/lib/types';
import { conferenceToTab } from '@/lib/conferences';
import type { TabConfig } from '@/lib/conferences';
import SponsorDataTab from '@/components/admin/SponsorDataTab';
import SubmissionsTab from '@/components/admin/SubmissionsTab';
import FeaturedTab from '@/components/admin/FeaturedTab';
import ConferencesTab from '@/components/admin/ConferencesTab';
import SponsorsTab from '@/components/admin/SponsorsTab';
import NativeAdsTab from '@/components/admin/NativeAdsTab';
import UpsellTab from '@/components/admin/UpsellTab';
import AdInventoryTab from '@/components/admin/AdInventoryTab';
import ThemeTab from '@/components/admin/ThemeTab';
import AbTestsTab from '@/components/admin/AbTestsTab';
import AdReportsTab from '@/components/admin/AdReportsTab';
import EventAnalyticsTab from '@/components/admin/EventAnalyticsTab';
import ErrorsTab from '@/components/admin/ErrorsTab';
import { useAdminConfigEditor } from '@/components/admin/hooks/useAdminConfigEditor';

const SESSION_KEY = 'sheeets-admin-auth';

const noopSubscribe = () => () => {};
/** Admin password remembered for this tab (null during SSR/hydration). */
function useSessionPassword(): string | null {
  const saved = useSyncExternalStore(
    noopSubscribe,
    () => sessionStorage.getItem(SESSION_KEY),
    () => null
  );
  // Legacy sessions stored the literal 'true' instead of the password.
  return saved && saved !== 'true' ? saved : null;
}

type AdminTab = 'submissions' | 'featured' | 'conferences' | 'sponsors' | 'nativeAds' | 'upsell' | 'adInventory' | 'theme' | 'abTests' | 'adReports' | 'eventAnalytics' | 'sponsorData' | 'errors';

const TAB_LABELS: { key: AdminTab; label: string }[] = [
  { key: 'submissions', label: 'Submissions' },
  { key: 'featured', label: 'Featured' },
  { key: 'conferences', label: 'Conferences' },
  { key: 'sponsors', label: 'Sponsors' },
  { key: 'nativeAds', label: 'Native Ads' },
  { key: 'upsell', label: 'Upsell Copy' },
  { key: 'adInventory', label: 'Ad Inventory' },
  { key: 'theme', label: 'Theme' },
  { key: 'abTests', label: 'A/B Tests' },
  { key: 'adReports', label: 'Ad Reports' },
  { key: 'eventAnalytics', label: 'Event Analytics' },
  { key: 'sponsorData', label: 'Sponsor Data' },
  { key: 'errors', label: 'Errors' },
];

export default function AdminPage() {
  const [typedPassword, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggedIn, setAuthed] = useState(false);
  // Restore the session (sessionStorage) after hydration, without an effect.
  const sessionPassword = useSessionPassword();
  const authed = loggedIn || sessionPassword !== null;
  const password = loggedIn || sessionPassword === null ? typedPassword : sessionPassword;
  const [events, setEvents] = useState<ETHDenverEvent[]>([]);
  // Events are loading while authed and the fetch hasn't settled yet.
  const [eventsSettled, setEventsSettled] = useState(false);
  const loading = authed && !eventsSettled;
  // Featured tab filters live here because their controls sit in the sticky header
  const [conference, setConference] = useState(FALLBACK_TABS[0]?.name || '');
  const [search, setSearch] = useState('');

  const [activeTab, setActiveTab] = useState<AdminTab>('submissions');
  // Tabs are mounted on first visit and kept mounted (hidden) afterwards, so
  // unsaved edits / loaded reports survive switching tabs, as before the split.
  const [visitedTabs, setVisitedTabs] = useState<Set<AdminTab>>(() => new Set(['submissions']));

  const {
    adminConfig,
    configLoading,
    saving,
    saveMessage,
    saveConfig,
    conferences,
    setConferences,
  } = useAdminConfigEditor(authed, password);

  // Fetch events when authed
  useEffect(() => {
    if (!authed) return;
    fetchEvents()
      .then(setEvents)
      .finally(() => setEventsSettled(true));
  }, [authed]);

  // Merged conference tabs: FALLBACK_TABS + dynamic conferences from DB
  const allConferenceTabs: TabConfig[] = useMemo(() => {
    const seen = new Set<string>();
    const merged: TabConfig[] = [];
    // Dynamic conferences first (most up-to-date)
    for (const conf of conferences) {
      if (!seen.has(conf.name)) {
        seen.add(conf.name);
        merged.push(conferenceToTab(conf));
      }
    }
    // Fallback tabs for any not already covered
    for (const tab of FALLBACK_TABS) {
      if (!seen.has(tab.name)) {
        seen.add(tab.name);
        merged.push(tab);
      }
    }
    return merged;
  }, [conferences]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) {
      setAuthed(true);
      sessionStorage.setItem(SESSION_KEY, password);
    } else {
      setLoginError('Wrong password');
    }
  }

  function selectTab(key: AdminTab) {
    setActiveTab(key);
    setVisitedTabs((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  /** Render a tab lazily on first visit, then keep it mounted but hidden. */
  const keepAlive = (key: AdminTab, node: React.ReactNode) =>
    visitedTabs.has(key) ? <div hidden={activeTab !== key}>{node}</div> : null;

  const featuredCount = events.filter(
    (e) => e.conference === conference && e.isFeatured
  ).length;

  if (!authed) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="bg-stone-900 border border-stone-700 rounded-xl p-6 w-full max-w-sm"
        >
          <h1 className="text-lg font-bold text-white mb-4">Admin Access</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-stone-950 border border-stone-600 rounded-lg text-white text-sm px-3 py-2 focus:border-amber-500 focus:outline-none placeholder:text-stone-500 mb-3"
            autoFocus
          />
          {loginError && <p className="text-red-400 text-xs mb-3">{loginError}</p>}
          <button
            type="submit"
            className="w-full px-4 py-2 bg-amber-500 hover:bg-amber-600 text-stone-900 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Enter
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-stone-950 border-b border-stone-800 px-4 py-3">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-stone-400 hover:text-white transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-lg font-bold">Admin</h1>
              {activeTab === 'featured' && (
                <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  {featuredCount} featured
                </span>
              )}
            </div>
            {saveMessage && (
              <span className={`text-sm ${saveMessage.startsWith('Error') || saveMessage === 'Failed to save' ? 'text-red-400' : 'text-green-400'}`}>
                {saveMessage}
              </span>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 bg-stone-900 rounded-lg p-1 mb-3">
            {TAB_LABELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => selectTab(key)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === key
                    ? 'bg-stone-800 text-white'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Conference tabs + search (only for Featured tab) */}
          {activeTab === 'featured' && (
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {allConferenceTabs.map((tab) => (
                  <button
                    key={tab.gid}
                    onClick={() => setConference(tab.name)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      conference === tab.name
                        ? 'bg-amber-500 text-stone-900'
                        : 'bg-stone-900 text-stone-400 hover:text-white'
                    }`}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search events..."
                  className="w-full bg-stone-900 border border-stone-700 rounded-lg text-white text-sm pl-9 pr-3 py-1.5 focus:border-amber-500 focus:outline-none placeholder:text-stone-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* Tab: Submissions */}
        {activeTab === 'submissions' && (
          <SubmissionsTab allConferenceTabs={allConferenceTabs} password={password} />
        )}

        {keepAlive('featured', (
          <FeaturedTab
            events={events}
            setEvents={setEvents}
            loading={loading}
            conference={conference}
            search={search}
            password={password}
          />
        ))}

        {keepAlive('conferences', (
          <ConferencesTab
            conferences={conferences}
            setConferences={setConferences}
            configLoading={configLoading}
            saving={saving}
            saveConfig={saveConfig}
          />
        ))}

        {keepAlive('sponsors', (
          <SponsorsTab
            adminConfig={adminConfig}
            configLoading={configLoading}
            saving={saving}
            saveConfig={saveConfig}
          />
        ))}

        {keepAlive('nativeAds', (
          <NativeAdsTab
            adminConfig={adminConfig}
            allConferenceTabs={allConferenceTabs}
            configLoading={configLoading}
            saving={saving}
            saveConfig={saveConfig}
          />
        ))}

        {keepAlive('upsell', (
          <UpsellTab
            adminConfig={adminConfig}
            configLoading={configLoading}
            saving={saving}
            saveConfig={saveConfig}
          />
        ))}

        {keepAlive('adInventory', (
          <AdInventoryTab
            adminConfig={adminConfig}
            allConferenceTabs={allConferenceTabs}
            configLoading={configLoading}
            saving={saving}
            saveConfig={saveConfig}
          />
        ))}

        {keepAlive('theme', (
          <ThemeTab
            adminConfig={adminConfig}
            allConferenceTabs={allConferenceTabs}
            saving={saving}
            saveMessage={saveMessage}
            saveConfig={saveConfig}
          />
        ))}

        {keepAlive('abTests', (
          <AbTestsTab
            adminConfig={adminConfig}
            allConferenceTabs={allConferenceTabs}
            saving={saving}
            saveMessage={saveMessage}
            saveConfig={saveConfig}
          />
        ))}

        {keepAlive('adReports', (
          <AdReportsTab password={password} allConferenceTabs={allConferenceTabs} />
        ))}

        {keepAlive('eventAnalytics', (
          <EventAnalyticsTab password={password} allConferenceTabs={allConferenceTabs} />
        ))}

        {keepAlive('errors', <ErrorsTab password={password} />)}

        {activeTab === 'sponsorData' && (
          <SponsorDataTab allConferenceTabs={allConferenceTabs} password={password} />
        )}
      </div>
    </div>
  );
}
