'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Star, Search, Loader2, ArrowLeft, Plus, Trash2, Pencil, Save, X, GripVertical, Copy, MapPin, ChevronDown, FlaskConical, Play, Pause, Trophy, BarChart3, Eye, MousePointer, Download, ClipboardCopy, Check } from 'lucide-react';
import { PlaceLookup } from '@/components/PlaceLookup';
import { fetchEvents } from '@/lib/fetch-events';
import { FALLBACK_TABS } from '@/lib/constants';
import { THEME_OPTIONS, type ThemeId } from '@/lib/themes';
import type { ETHDenverEvent } from '@/lib/types';
import type { AdminConfig, SponsorEntry, NativeAd, UpsellCopy, AdInventoryItem, AdvertisePageConfig, ABTest, ABTestVariant, ABTestStatus, ABVariantResult, ConferenceConfig } from '@/lib/types';
import { isConferencePast, conferenceToTab } from '@/lib/conferences';
import type { TabConfig } from '@/lib/conferences';
import SponsorDataTab from '@/components/admin/SponsorDataTab';
import SubmissionsTab from '@/components/admin/SubmissionsTab';

const SESSION_KEY = 'sheeets-admin-auth';

type AdminTab = 'submissions' | 'featured' | 'conferences' | 'sponsors' | 'nativeAds' | 'upsell' | 'adInventory' | 'theme' | 'abTests' | 'adReports' | 'eventAnalytics' | 'sponsorData';

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
];

const KNOWN_GIDS: { gid: number; name: string }[] = [
  { gid: 621468538, name: 'ETHDenver 2025' },
  { gid: 213147189, name: 'CES LAS VEGAS 2025' },
  { gid: 1199055119, name: 'Token2049 Dubai 2025' },
  { gid: 1389731314, name: 'NFT Paris 2025' },
  { gid: 246719283, name: 'Consensus 2025' },
  { gid: 733250516, name: 'NFC Summit Lisbon 2025' },
  { gid: 2000776073, name: 'NFT NYC / Permissionless 2025' },
  { gid: 377806756, name: 'CONSENSUS HK 2026' },
  { gid: 356217373, name: 'ETH DENVER 2026' },
  { gid: 666597336, name: 'DAS 2026' },
  { gid: 437576609, name: 'ETHCC 2026' },
  { gid: 1543768695, name: 'SXSW 2026' },
  { gid: 1965015727, name: 'TEAMZ 2026' },
  { gid: 1604258025, name: 'PBW 2026' },
  { gid: 1002070994, name: 'Bitcoin Vegas' },
  { gid: 2092019144, name: 'Consensus Miami' },
  { gid: 2043780918, name: 'CES LAS VEGAS 2026' },
  { gid: 100522285, name: 'ETHCC 2025' },
  { gid: 1138663114, name: 'Berlin Blockchain Week 2025' },
  { gid: 881139194, name: 'Malaysia Blockchain Week 2025' },
  { gid: 2048840578, name: 'WebX 2025' },
  { gid: 1893526059, name: 'Bitcoin Asia 2025' },
  { gid: 1049919215, name: 'TBW 2025' },
  { gid: 120573008, name: 'KBW 2025' },
  { gid: 1050529252, name: 'Token 2049' },
  { gid: 218449335, name: 'ADE 2025' },
  { gid: 1292905087, name: 'Art Basel Miami 2024' },
  { gid: 1380177749, name: 'Devcon 2025' },
  { gid: 1932321572, name: 'SXSW 2025' },
  { gid: 102931368, name: 'Art Basel Miami' },
  { gid: 1672479012, name: 'GDC 2026' },
];

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const AB_PLACEMENTS = [
  { value: 'native-ad-content', label: 'Native Ad Content', hint: 'Test different ad creatives (title, description, image, link)' },
  { value: 'sponsor-copy', label: 'Sponsor Ticker Copy', hint: 'Test different sponsor messaging' },
  { value: 'ad-frequency', label: 'Ad Frequency (ListView)', hint: 'Test how often ads appear in the list' },
  { value: 'hero-copy', label: 'Hero Copy (/ads)', hint: 'Test /ads page headline and CTA' },
  { value: 'tier-layout', label: 'Tier Layout (/ads)', hint: 'Test tier grid layout on /ads page' },
  { value: 'custom', label: 'Custom', hint: 'Custom placement with JSON config' },
];

const inputClass = 'bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-white text-sm w-full focus:border-blue-500 focus:outline-none';
const btnPrimary = 'bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer';
const btnDanger = 'bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authed, setAuthed] = useState(false);
  const [events, setEvents] = useState<ETHDenverEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [conference, setConference] = useState(FALLBACK_TABS[0]?.name || '');
  const [search, setSearch] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>('submissions');
  const [adminConfig, setAdminConfig] = useState<AdminConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Sponsors state
  const [sponsors, setSponsors] = useState<SponsorEntry[]>([]);
  const [editingSponsorIndex, setEditingSponsorIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Native Ads state
  const [nativeAds, setNativeAds] = useState<NativeAd[]>([]);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [adDragIndex, setAdDragIndex] = useState<number | null>(null);
  const [adDragOverIndex, setAdDragOverIndex] = useState<number | null>(null);

  // Per-card A/B variant view state
  const [abVariantView, setAbVariantView] = useState<Record<number, 'a' | 'b'>>({});
  const [adAbVariantView, setAdAbVariantView] = useState<Record<string, 'a' | 'b'>>({});

  // Upsell state
  const [upsellCopy, setUpsellCopy] = useState<UpsellCopy>({
    heading: '',
    body: '',
    cta_text: '',
    cta_url: '',
  });

  // Ad Inventory state
  const [adConference, setAdConference] = useState(FALLBACK_TABS[0]?.name || '');
  const [adInventory, setAdInventory] = useState<AdInventoryItem[]>([]);
  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);
  const [adPageConfig, setAdPageConfig] = useState<AdvertisePageConfig>({
    heroHeading: '',
    heroSubheading: '',
    statsLine: '',
    ctaText: '',
    ctaUrl: '',
    ctaSecondaryText: '',
    ctaSecondaryUrl: '',
    footerText: '',
    tiersEnabled: true,
    tiers: [],
  });
  const [showCopyFrom, setShowCopyFrom] = useState(false);
  const [adConfOpen, setAdConfOpen] = useState(false);

  // Conferences state
  const [conferences, setConferences] = useState<ConferenceConfig[]>([]);
  const [editingConfIdx, setEditingConfIdx] = useState<number | null>(null);
  const [addingConference, setAddingConference] = useState(false);
  const [newConference, setNewConference] = useState<ConferenceConfig>({
    gid: 0, name: '', slug: '', timezone: 'America/New_York',
    startDate: '', endDate: '', center: { lat: 0, lng: 0 },
  });
  const [showGidDropdown, setShowGidDropdown] = useState(false);
  const [newConfShowGidDropdown, setNewConfShowGidDropdown] = useState(false);

  // Theme state
  const [themeConference, setThemeConference] = useState(FALLBACK_TABS[0]?.name || '');
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>('dark');

  // A/B Tests state
  const [abTests, setAbTests] = useState<ABTest[]>([]);
  const [abEditingId, setAbEditingId] = useState<string | null>(null);
  const [abViewResults, setAbViewResults] = useState<string | null>(null);
  const [abResults, setAbResults] = useState<Record<string, ABVariantResult[]>>({});
  const [abResultsLoading, setAbResultsLoading] = useState(false);
  const [abNewTest, setAbNewTest] = useState<ABTest | null>(null);

  // Ad Reports state
  interface AdReportRow {
    ad_id: string;
    ad_name: string;
    placement: string;
    impressions: number;
    unique_impressions: number;
    clicks: number;
    unique_clicks: number;
    ctr: number;
    first_seen: string;
    last_seen: string;
  }
  interface AdReportData {
    ads: AdReportRow[];
    totals: { impressions: number; clicks: number; ctr: number };
    period: { start: string; end: string };
  }
  const [adReport, setAdReport] = useState<AdReportData | null>(null);
  const [adReportLoading, setAdReportLoading] = useState(false);
  const [adReportConference, setAdReportConference] = useState('');
  const [adReportRange, setAdReportRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [adReportSort, setAdReportSort] = useState<'impressions' | 'ctr'>('impressions');
  const [adReportCopied, setAdReportCopied] = useState(false);

  // Event Analytics state
  interface EventReportRow {
    event_id: string;
    event_name: string;
    conference: string;
    clicks: number;
    unique_clicks: number;
    impressions: number;
    unique_impressions: number;
    pin_clicks: number;
    list_clicks: number;
    table_clicks: number;
    map_popup_clicks: number;
    ctr: number;
    first_seen: string;
    last_seen: string;
  }
  interface EventReportData {
    events: EventReportRow[];
    totals: { clicks: number; impressions: number; pinClicks: number; listClicks: number; tableClicks: number; mapPopupClicks: number; ctr: number };
    period: { start: string; end: string };
  }
  const [eventReport, setEventReport] = useState<EventReportData | null>(null);
  const [eventReportLoading, setEventReportLoading] = useState(false);
  const [eventReportConference, setEventReportConference] = useState('');
  const [eventReportRange, setEventReportRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  type EventReportSortKey = 'clicks' | 'ctr' | 'pin_clicks' | 'list_clicks' | 'table_clicks' | 'map_popup_clicks' | 'impressions' | 'last_seen' | 'event_name' | 'conference';
  const [eventReportSort, setEventReportSort] = useState<EventReportSortKey>('clicks');
  const [eventReportCopied, setEventReportCopied] = useState(false);

  const sortEvents = (events: EventReportRow[]) => {
    const numericKeys: EventReportSortKey[] = ['clicks', 'ctr', 'pin_clicks', 'list_clicks', 'table_clicks', 'map_popup_clicks', 'impressions'];
    const stringKeys: EventReportSortKey[] = ['event_name', 'conference'];
    return [...events].sort((a, b) => {
      if (numericKeys.includes(eventReportSort)) {
        return (b[eventReportSort as keyof EventReportRow] as number) - (a[eventReportSort as keyof EventReportRow] as number);
      }
      if (stringKeys.includes(eventReportSort)) {
        const aVal = ((a[eventReportSort as keyof EventReportRow] as string) || '').toLowerCase();
        const bVal = ((b[eventReportSort as keyof EventReportRow] as string) || '').toLowerCase();
        return aVal.localeCompare(bVal);
      }
      if (eventReportSort === 'last_seen') {
        const aDate = a.last_seen ? new Date(a.last_seen).getTime() : 0;
        const bDate = b.last_seen ? new Date(b.last_seen).getTime() : 0;
        return bDate - aDate;
      }
      return 0;
    });
  };

  // Check session on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved && saved !== 'true') {
      setAuthed(true);
      setPassword(saved);
    }
  }, []);

  // Fetch events when authed
  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    fetchEvents()
      .then(setEvents)
      .finally(() => setLoading(false));
  }, [authed]);

  // Fetch admin config when authed
  useEffect(() => {
    if (!authed) return;
    setConfigLoading(true);
    fetch('/api/admin/config')
      .then(res => res.json())
      .then((data: AdminConfig) => {
        setAdminConfig(data);
        setSponsors(data.sponsors || []);
        setNativeAds(data.native_ads || []);
        setUpsellCopy(data.upsell_copy || { heading: '', body: '', cta_text: '', cta_url: '' });
        setAbTests((data.ab_tests as ABTest[]) || []);
        const savedConfs = (data.conferences as ConferenceConfig[]) || [];
        if (savedConfs.length > 0) {
          setConferences(savedConfs);
        } else {
          // Pre-populate from fallback tabs so admin sees existing conferences
          setConferences(FALLBACK_TABS.map(t => ({
            gid: t.gid,
            name: t.name,
            slug: t.slug,
            timezone: t.timezone,
            startDate: t.dates[0],
            endDate: t.dates[t.dates.length - 1],
            center: t.center,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setConfigLoading(false));
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

  // Conference list for ad inventory tab (allConferenceTabs + any from config keys)
  const adConferenceList = useMemo(() => {
    const names = new Set(allConferenceTabs.map(t => t.name));
    if (adminConfig) {
      for (const key of Object.keys(adminConfig)) {
        const match = key.match(/^(?:ad_inventory|advertise_page):(.+)$/);
        if (match) names.add(match[1]);
      }
    }
    return Array.from(names);
  }, [adminConfig, allConferenceTabs]);

  // Other conferences that have saved config (for copy-from)
  const copyFromConferences = useMemo(() => {
    if (!adminConfig) return [];
    return adConferenceList.filter(c => c !== adConference && (
      adminConfig[`ad_inventory:${c}`] || adminConfig[`advertise_page:${c}`]
    ));
  }, [adminConfig, adConference, adConferenceList]);

  // Load per-conference ad config when conference changes
  useEffect(() => {
    if (!adminConfig) return;
    const inv = adminConfig[`ad_inventory:${adConference}`] as AdInventoryItem[] | undefined;
    setAdInventory(inv && Array.isArray(inv) ? inv : []);
    const page = adminConfig[`advertise_page:${adConference}`] as AdvertisePageConfig | undefined;
    setAdPageConfig(page || {
      heroHeading: '', heroSubheading: '', statsLine: '',
      ctaText: '', ctaUrl: '', ctaSecondaryText: '', ctaSecondaryUrl: '',
      footerText: '', tiersEnabled: true, tiers: [],
    });
    setEditingInventoryId(null);
    setShowCopyFrom(false);
  }, [adConference, adminConfig]);

  // Load per-conference theme when themeConference changes
  useEffect(() => {
    if (!adminConfig) return;
    const t = adminConfig[`theme:${themeConference}`] as string | undefined;
    const validIds = THEME_OPTIONS.map(o => o.id) as string[];
    if (t && validIds.includes(t)) {
      setSelectedTheme(t as ThemeId);
    } else {
      setSelectedTheme('dark');
    }
  }, [themeConference, adminConfig]);

  function handleCopyFrom(sourceConf: string) {
    if (!adminConfig) return;
    const inv = adminConfig[`ad_inventory:${sourceConf}`] as AdInventoryItem[] | undefined;
    const page = adminConfig[`advertise_page:${sourceConf}`] as AdvertisePageConfig | undefined;
    if (inv) setAdInventory(structuredClone(inv));
    if (page) setAdPageConfig(structuredClone(page));
    setShowCopyFrom(false);
  }

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

  async function saveConfig(key: string, value: unknown) {
    setSaving(true);
    setSaveMessage('');
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, key, value }),
      });
      if (res.ok) {
        setSaveMessage('Saved!');
        setTimeout(() => setSaveMessage(''), 2000);
      } else {
        const data = await res.json();
        setSaveMessage(`Error: ${data.error}`);
      }
    } catch {
      setSaveMessage('Failed to save');
    }
    setSaving(false);
  }

  // A/B Test helpers
  function createEmptyTest(): ABTest {
    const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return {
      id,
      name: '',
      description: '',
      status: 'draft',
      placement: 'ad-frequency',
      conference: '',
      variants: [
        { id: 'control', name: 'Control', weight: 50, config: {} },
        { id: 'variant-a', name: 'Variant A', weight: 50, config: {} },
      ],
      created_at: new Date().toISOString(),
    };
  }

  async function saveAbTests(tests: ABTest[]) {
    setAbTests(tests);
    await saveConfig('ab_tests', tests);
  }

  function updateTestStatus(testId: string, status: ABTestStatus, winnerId?: string) {
    const updated = abTests.map(t => {
      if (t.id !== testId) return t;
      const patch: Partial<ABTest> = { status };
      if (status === 'running' && !t.started_at) patch.started_at = new Date().toISOString();
      if (status === 'completed') {
        patch.completed_at = new Date().toISOString();
        if (winnerId) patch.winnerId = winnerId;
      }
      return { ...t, ...patch };
    });
    saveAbTests(updated);
  }

  const fetchResults = useCallback(async (testId: string) => {
    setAbResultsLoading(true);
    try {
      const res = await fetch(`/api/ab/results?test_id=${testId}`);
      if (res.ok) {
        const data = await res.json();
        setAbResults(prev => ({ ...prev, [testId]: data.variants }));
      }
    } catch { /* ignore */ }
    setAbResultsLoading(false);
  }, []);

  const fetchAdReport = useCallback(async () => {
    setAdReportLoading(true);
    try {
      const params = new URLSearchParams({ password });
      if (adReportConference) params.set('conference', adReportConference);
      if (adReportRange !== 'all') {
        const now = new Date();
        const days = adReportRange === '7d' ? 7 : adReportRange === '30d' ? 30 : 90;
        const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        params.set('start_date', start.toISOString());
        params.set('end_date', now.toISOString());
      } else {
        // All time: use a far past date
        params.set('start_date', '2020-01-01T00:00:00.000Z');
        params.set('end_date', new Date().toISOString());
      }
      const res = await fetch(`/api/ads/report?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAdReport(data);
      }
    } catch { /* ignore */ }
    setAdReportLoading(false);
  }, [password, adReportConference, adReportRange]);

  const fetchEventReport = useCallback(async () => {
    setEventReportLoading(true);
    try {
      const params = new URLSearchParams({ password });
      if (eventReportConference) params.set('conference', eventReportConference);
      if (eventReportRange !== 'all') {
        const now = new Date();
        const days = eventReportRange === '7d' ? 7 : eventReportRange === '30d' ? 30 : 90;
        const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        params.set('start_date', start.toISOString());
        params.set('end_date', now.toISOString());
      } else {
        params.set('start_date', '2020-01-01T00:00:00.000Z');
        params.set('end_date', new Date().toISOString());
      }
      const res = await fetch(`/api/events/report?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEventReport(data);
      }
    } catch { /* ignore */ }
    setEventReportLoading(false);
  }, [password, eventReportConference, eventReportRange]);

  const filtered = useMemo(() => {
    let list = events.filter((e) => e.conference === conference);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.organizer.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      if (a.isFeatured && !b.isFeatured) return -1;
      if (!a.isFeatured && b.isFeatured) return 1;
      const d = a.dateISO.localeCompare(b.dateISO);
      if (d !== 0) return d;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [events, conference, search]);

  async function toggleFeatured(event: ETHDenverEvent) {
    setTogglingId(event.id);
    try {
      const res = await fetch('/api/admin/toggle-featured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          conference: event.conference,
          eventName: event.name,
          featured: !event.isFeatured,
        }),
      });

      if (res.ok) {
        setEvents((prev) =>
          prev.map((e) =>
            e.id === event.id ? { ...e, isFeatured: !e.isFeatured } : e
          )
        );
      }
    } catch {
      // ignore
    }
    setTogglingId(null);
  }

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
              <a href="/" className="text-stone-400 hover:text-white transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </a>
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
                onClick={() => setActiveTab(key)}
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

        {/* Tab 1: Featured */}
        {activeTab === 'featured' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading events...
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((event) => (
                  <div
                    key={event.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      event.isFeatured
                        ? 'bg-amber-500/10 border border-amber-500/20'
                        : 'hover:bg-stone-900/50'
                    }`}
                  >
                    <button
                      onClick={() => toggleFeatured(event)}
                      disabled={togglingId === event.id}
                      className="shrink-0 cursor-pointer disabled:opacity-50"
                      title={event.isFeatured ? 'Remove featured' : 'Mark as featured'}
                    >
                      {togglingId === event.id ? (
                        <Loader2 className="w-5 h-5 animate-spin text-stone-500" />
                      ) : (
                        <Star
                          className={`w-5 h-5 transition-colors ${
                            event.isFeatured
                              ? 'text-amber-400 fill-orange-400'
                              : 'text-stone-600 hover:text-stone-400'
                          }`}
                        />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {event.name}
                      </p>
                      <p className="text-xs text-stone-500 truncate">
                        {event.organizer && `${event.organizer} · `}
                        {event.date} · {event.startTime}
                      </p>
                    </div>

                    {event.isFeatured && (
                      <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full shrink-0">
                        FEATURED
                      </span>
                    )}
                  </div>
                ))}

                {filtered.length === 0 && (
                  <p className="text-center text-stone-500 py-10">No events found</p>
                )}
              </div>
            )}
          </>
        )}

        {/* Tab: Conferences */}
        {activeTab === 'conferences' && (
          <div className="space-y-6">
            {configLoading ? (
              <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading config...
              </div>
            ) : (
              <>
                <div className="bg-stone-900 rounded-xl p-4 border border-stone-700">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Conferences</h3>
                      <p className="text-xs text-stone-500 mt-0.5">Manage conference tabs. Sorted by start date. Past conferences auto-hide.</p>
                    </div>
                    <button
                      onClick={() => {
                        setAddingConference(true);
                        setNewConference({
                          gid: 0, name: '', slug: '', timezone: 'America/New_York',
                          startDate: '', endDate: '', center: { lat: 0, lng: 0 },
                        });
                      }}
                      className={`${btnPrimary} flex items-center gap-1.5`}
                    >
                      <Plus className="w-4 h-4" />
                      Add Conference
                    </button>
                  </div>

                  {/* Add Conference Form */}
                  {addingConference && (
                    <div className="mb-4 p-4 bg-stone-800 rounded-lg border border-blue-500/50 space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-blue-400">New Conference</h4>
                        <button onClick={() => setAddingConference(false)} className="text-stone-400 hover:text-white cursor-pointer">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Name</label>
                          <input
                            type="text"
                            value={newConference.name}
                            onChange={(e) => {
                              const name = e.target.value;
                              const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-')[0] || '';
                              setNewConference({ ...newConference, name, slug });
                            }}
                            placeholder="ETHDenver 2027"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Slug</label>
                          <input
                            type="text"
                            value={newConference.slug}
                            onChange={(e) => setNewConference({ ...newConference, slug: e.target.value })}
                            placeholder="ethdenver"
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="relative">
                          <label className="block text-xs text-stone-400 mb-1">GID (Sheet Tab ID)</label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={newConference.gid || ''}
                              onChange={(e) => setNewConference({ ...newConference, gid: Number(e.target.value) })}
                              placeholder="123456789"
                              className={inputClass}
                            />
                            <button
                              onClick={() => setNewConfShowGidDropdown(!newConfShowGidDropdown)}
                              className="shrink-0 px-2 py-1 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-lg text-xs cursor-pointer"
                              title="Select from known GIDs"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                          {newConfShowGidDropdown && (
                            <div className="absolute z-20 mt-1 left-0 right-0 bg-stone-800 border border-stone-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                              {KNOWN_GIDS.map((kg) => (
                                <button
                                  key={kg.gid}
                                  onClick={() => {
                                    setNewConference({ ...newConference, gid: kg.gid, name: newConference.name || kg.name });
                                    setNewConfShowGidDropdown(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-stone-700 cursor-pointer"
                                >
                                  {kg.name} <span className="text-stone-500">({kg.gid})</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Timezone</label>
                          <select
                            value={newConference.timezone}
                            onChange={(e) => setNewConference({ ...newConference, timezone: e.target.value })}
                            className={inputClass}
                          >
                            {COMMON_TIMEZONES.map((tz) => (
                              <option key={tz} value={tz}>{tz}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Start Date</label>
                          <input
                            type="date"
                            value={newConference.startDate}
                            onChange={(e) => setNewConference({ ...newConference, startDate: e.target.value })}
                            className={inputClass}
                            style={{ colorScheme: 'dark' }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">End Date</label>
                          <input
                            type="date"
                            value={newConference.endDate}
                            onChange={(e) => setNewConference({ ...newConference, endDate: e.target.value })}
                            className={inputClass}
                            style={{ colorScheme: 'dark' }}
                          />
                        </div>
                      </div>
                      <PlaceLookup
                        value={newConference.center}
                        onChange={(center) => setNewConference({ ...newConference, center })}
                        inputClass={inputClass}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (!newConference.name || !newConference.gid || !newConference.startDate || !newConference.endDate) return;
                            const updated = [...conferences, newConference].sort((a, b) => a.startDate.localeCompare(b.startDate));
                            setConferences(updated);
                            setAddingConference(false);
                          }}
                          disabled={!newConference.name || !newConference.gid || !newConference.startDate || !newConference.endDate}
                          className={`${btnPrimary} flex items-center gap-1.5 ${(!newConference.name || !newConference.gid || !newConference.startDate || !newConference.endDate) ? 'opacity-50' : ''}`}
                        >
                          <Plus className="w-4 h-4" />
                          Add
                        </button>
                        <button onClick={() => setAddingConference(false)} className="text-stone-400 hover:text-white text-sm cursor-pointer px-3">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {conferences.length === 0 && !addingConference && (
                    <p className="text-stone-500 text-sm py-4 text-center">No conferences configured. Using fallback defaults.</p>
                  )}

                  {/* Conference List */}
                  <div className="space-y-2">
                    {(() => {
                      const activeConfs = conferences.filter((c) => !c.hidden && !isConferencePast(c));
                      const pastOrHidden = conferences.filter((c) => c.hidden || isConferencePast(c));
                      const sortedActive = [...activeConfs].sort((a, b) => a.startDate.localeCompare(b.startDate));
                      const sortedPast = [...pastOrHidden].sort((a, b) => b.startDate.localeCompare(a.startDate));

                      return (
                        <>
                          {sortedActive.map((conf) => {
                            const idx = conferences.indexOf(conf);
                            const isEditing = editingConfIdx === idx;
                            return (
                              <div
                                key={`${conf.gid}-${conf.slug}`}
                                className="p-3 bg-stone-800 rounded-lg border border-stone-600"
                              >
                                {isEditing ? (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-xs text-stone-400 mb-1">Name</label>
                                        <input
                                          type="text"
                                          value={conf.name}
                                          onChange={(e) => {
                                            const updated = [...conferences];
                                            updated[idx] = { ...updated[idx], name: e.target.value };
                                            setConferences(updated);
                                          }}
                                          className={inputClass}
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs text-stone-400 mb-1">Slug</label>
                                        <input
                                          type="text"
                                          value={conf.slug}
                                          onChange={(e) => {
                                            const updated = [...conferences];
                                            updated[idx] = { ...updated[idx], slug: e.target.value };
                                            setConferences(updated);
                                          }}
                                          className={inputClass}
                                        />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="relative">
                                        <label className="block text-xs text-stone-400 mb-1">GID</label>
                                        <div className="flex gap-1">
                                          <input
                                            type="number"
                                            value={conf.gid || ''}
                                            onChange={(e) => {
                                              const updated = [...conferences];
                                              updated[idx] = { ...updated[idx], gid: Number(e.target.value) };
                                              setConferences(updated);
                                            }}
                                            className={inputClass}
                                          />
                                          <button
                                            onClick={() => setShowGidDropdown(showGidDropdown ? false : true)}
                                            className="shrink-0 px-2 py-1 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-lg text-xs cursor-pointer"
                                          >
                                            <ChevronDown className="w-3 h-3" />
                                          </button>
                                        </div>
                                        {showGidDropdown && editingConfIdx === idx && (
                                          <div className="absolute z-20 mt-1 left-0 right-0 bg-stone-800 border border-stone-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                            {KNOWN_GIDS.map((kg) => (
                                              <button
                                                key={kg.gid}
                                                onClick={() => {
                                                  const updated = [...conferences];
                                                  updated[idx] = { ...updated[idx], gid: kg.gid };
                                                  setConferences(updated);
                                                  setShowGidDropdown(false);
                                                }}
                                                className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-stone-700 cursor-pointer"
                                              >
                                                {kg.name} <span className="text-stone-500">({kg.gid})</span>
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div>
                                        <label className="block text-xs text-stone-400 mb-1">Timezone</label>
                                        <select
                                          value={conf.timezone}
                                          onChange={(e) => {
                                            const updated = [...conferences];
                                            updated[idx] = { ...updated[idx], timezone: e.target.value };
                                            setConferences(updated);
                                          }}
                                          className={inputClass}
                                        >
                                          {COMMON_TIMEZONES.map((tz) => (
                                            <option key={tz} value={tz}>{tz}</option>
                                          ))}
                                          {!COMMON_TIMEZONES.includes(conf.timezone) && (
                                            <option value={conf.timezone}>{conf.timezone}</option>
                                          )}
                                        </select>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-xs text-stone-400 mb-1">Start Date</label>
                                        <input
                                          type="date"
                                          value={conf.startDate}
                                          onChange={(e) => {
                                            const updated = [...conferences];
                                            updated[idx] = { ...updated[idx], startDate: e.target.value };
                                            setConferences(updated);
                                          }}
                                          className={inputClass}
                                          style={{ colorScheme: 'dark' }}
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs text-stone-400 mb-1">End Date</label>
                                        <input
                                          type="date"
                                          value={conf.endDate}
                                          onChange={(e) => {
                                            const updated = [...conferences];
                                            updated[idx] = { ...updated[idx], endDate: e.target.value };
                                            setConferences(updated);
                                          }}
                                          className={inputClass}
                                          style={{ colorScheme: 'dark' }}
                                        />
                                      </div>
                                    </div>
                                    <PlaceLookup
                                      value={conf.center}
                                      onChange={(center) => {
                                        const updated = [...conferences];
                                        updated[idx] = { ...updated[idx], center };
                                        setConferences(updated);
                                      }}
                                      inputClass={inputClass}
                                    />
                                    <button
                                      onClick={() => { setEditingConfIdx(null); setShowGidDropdown(false); }}
                                      className="text-green-400 hover:text-green-300 cursor-pointer p-1 flex items-center gap-1 text-sm"
                                    >
                                      <Save className="w-4 h-4" />
                                      Done
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-white">{conf.name}</p>
                                      </div>
                                      <p className="text-xs text-stone-400 mt-0.5">
                                        /{conf.slug} &middot; GID: {conf.gid} &middot; {conf.startDate} to {conf.endDate} &middot; {conf.timezone}
                                      </p>
                                      <p className="text-xs text-stone-500 mt-0.5">
                                        Center: {conf.center.lat}, {conf.center.lng}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => { setEditingConfIdx(idx); setShowGidDropdown(false); }}
                                      className="text-stone-400 hover:text-white cursor-pointer p-1"
                                      title="Edit"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        const updated = [...conferences];
                                        updated[idx] = { ...updated[idx], hidden: true };
                                        setConferences(updated);
                                      }}
                                      className="text-stone-400 hover:text-amber-400 cursor-pointer p-1"
                                      title="Hide"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        const updated = conferences.filter((_, i) => i !== idx);
                                        setConferences(updated);
                                      }}
                                      className="text-red-400 hover:text-red-300 cursor-pointer p-1"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Past / Hidden section */}
                          {sortedPast.length > 0 && (
                            <>
                              <div className="text-xs text-stone-500 uppercase tracking-wider pt-3 pb-1 border-t border-stone-700 mt-3">
                                Past / Hidden
                              </div>
                              {sortedPast.map((conf) => {
                                const idx = conferences.indexOf(conf);
                                const past = isConferencePast(conf);
                                return (
                                  <div
                                    key={`${conf.gid}-${conf.slug}`}
                                    className="p-3 bg-stone-800/50 rounded-lg border border-stone-700 opacity-60"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <p className="text-sm font-medium text-stone-400">{conf.name}</p>
                                          {past && (
                                            <span className="text-[10px] font-bold uppercase bg-stone-700 text-stone-400 px-1.5 py-0.5 rounded-full">Past</span>
                                          )}
                                          {conf.hidden && (
                                            <span className="text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">Hidden</span>
                                          )}
                                        </div>
                                        <p className="text-xs text-stone-500 mt-0.5">
                                          /{conf.slug} &middot; GID: {conf.gid} &middot; {conf.startDate} to {conf.endDate}
                                        </p>
                                      </div>
                                      <button
                                        onClick={() => {
                                          const updated = [...conferences];
                                          updated[idx] = { ...updated[idx], hidden: false };
                                          setConferences(updated);
                                        }}
                                        className="text-stone-400 hover:text-green-400 cursor-pointer px-2 py-1 text-xs border border-stone-600 rounded-lg"
                                        title="Restore"
                                      >
                                        Restore
                                      </button>
                                      <button
                                        onClick={() => {
                                          const updated = conferences.filter((_, i) => i !== idx);
                                          setConferences(updated);
                                        }}
                                        className="text-red-400 hover:text-red-300 cursor-pointer p-1"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Save button */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => saveConfig('conferences', conferences)}
                    disabled={saving}
                    className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Conferences
                  </button>
                  {conferences.length === 0 && (
                    <span className="text-xs text-stone-500">No conferences saved — using fallback defaults</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Sponsors */}
        {activeTab === 'sponsors' && (
          <div className="space-y-6">
            {configLoading ? (
              <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading config...
              </div>
            ) : (
              <>
                <div className="bg-stone-900 rounded-xl p-4 border border-stone-700">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Sponsors</h3>
                      <p className="text-xs text-stone-500 mt-0.5">Each sponsor shows as: before text + <span className="text-blue-400">link text</span> + after text</p>
                    </div>
                    <button
                      onClick={() => {
                        setSponsors([...sponsors, { beforeText: '', linkText: '', afterText: '', url: '' }]);
                        setEditingSponsorIndex(sponsors.length);
                      }}
                      className={`${btnPrimary} flex items-center gap-1.5`}
                    >
                      <Plus className="w-4 h-4" />
                      Add Sponsor
                    </button>
                  </div>

                  {sponsors.length === 0 && (
                    <p className="text-stone-500 text-sm py-4 text-center">No sponsors added yet</p>
                  )}

                  <div className="space-y-3">
                    {sponsors.map((sponsor, idx) => (
                      <div
                        key={idx}
                        className={`p-3 bg-stone-800 rounded-lg border transition-colors ${
                          dragOverIndex === idx && dragIndex !== idx
                            ? 'border-amber-500 border-t-2'
                            : 'border-stone-600'
                        } ${dragIndex === idx ? 'opacity-40' : ''}`}
                        draggable={editingSponsorIndex !== idx}
                        onDragStart={(e) => {
                          setDragIndex(idx);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragIndex !== null && dragIndex !== idx) {
                            setDragOverIndex(idx);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverIndex === idx) setDragOverIndex(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragIndex !== null && dragIndex !== idx) {
                            const updated = [...sponsors];
                            const [moved] = updated.splice(dragIndex, 1);
                            updated.splice(idx, 0, moved);
                            setSponsors(updated);
                          }
                          setDragIndex(null);
                          setDragOverIndex(null);
                        }}
                        onDragEnd={() => {
                          setDragIndex(null);
                          setDragOverIndex(null);
                        }}
                      >
                        {editingSponsorIndex === idx ? (() => {
                          const viewingB = sponsor.ab?.enabled && abVariantView[idx] === 'b';
                          const currentBefore = viewingB ? (sponsor.ab?.b.beforeText ?? '') : sponsor.beforeText;
                          const currentLink = viewingB ? (sponsor.ab?.b.linkText ?? '') : sponsor.linkText;
                          const currentAfter = viewingB ? (sponsor.ab?.b.afterText ?? '') : sponsor.afterText;
                          const currentUrl = viewingB ? (sponsor.ab?.b.url ?? '') : sponsor.url;
                          const handleFieldChange = (field: string, value: string) => {
                            const updated = [...sponsors];
                            if (viewingB) {
                              updated[idx] = { ...updated[idx], ab: { ...updated[idx].ab!, b: { ...updated[idx].ab!.b, [field]: value } } };
                            } else {
                              updated[idx] = { ...updated[idx], [field]: value };
                            }
                            setSponsors(updated);
                          };
                          return (
                          <div className="space-y-3">
                            {/* A/B Toggle */}
                            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-stone-700">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!!sponsor.ab?.enabled}
                                  onChange={(e) => {
                                    const updated = [...sponsors];
                                    if (e.target.checked) {
                                      updated[idx] = { ...updated[idx], ab: updated[idx].ab || { b: { beforeText: '', linkText: '', afterText: '', url: '' }, weightA: 50, weightB: 50, enabled: true } };
                                      updated[idx] = { ...updated[idx], ab: { ...updated[idx].ab!, enabled: true } };
                                    } else {
                                      updated[idx] = { ...updated[idx], ab: updated[idx].ab ? { ...updated[idx].ab!, enabled: false } : undefined };
                                    }
                                    setSponsors(updated);
                                  }}
                                  className="w-4 h-4 rounded"
                                />
                                <span className="text-sm text-stone-300">A/B Test</span>
                              </label>
                              {sponsor.ab?.enabled && (
                                <>
                                  <div className="flex items-center gap-1 ml-auto">
                                    <button
                                      onClick={() => setAbVariantView({ ...abVariantView, [idx]: 'a' })}
                                      className={`px-2 py-0.5 text-xs rounded-l-lg border ${(abVariantView[idx] || 'a') === 'a' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-stone-800 border-stone-600 text-stone-400'} cursor-pointer`}
                                    >A</button>
                                    <button
                                      onClick={() => setAbVariantView({ ...abVariantView, [idx]: 'b' })}
                                      className={`px-2 py-0.5 text-xs rounded-r-lg border ${abVariantView[idx] === 'b' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-stone-800 border-stone-600 text-stone-400'} cursor-pointer`}
                                    >B</button>
                                  </div>
                                  <div className="flex items-center gap-1 text-xs text-stone-400">
                                    <input type="number" min={0} max={100} value={sponsor.ab?.weightA ?? 50} onChange={(e) => {
                                      const updated = [...sponsors];
                                      updated[idx] = { ...updated[idx], ab: { ...updated[idx].ab!, weightA: Number(e.target.value) } };
                                      setSponsors(updated);
                                    }} className="w-12 bg-stone-800 border border-stone-600 rounded px-1 py-0.5 text-center text-xs text-white" />
                                    <span>/</span>
                                    <input type="number" min={0} max={100} value={sponsor.ab?.weightB ?? 50} onChange={(e) => {
                                      const updated = [...sponsors];
                                      updated[idx] = { ...updated[idx], ab: { ...updated[idx].ab!, weightB: Number(e.target.value) } };
                                      setSponsors(updated);
                                    }} className="w-12 bg-stone-800 border border-stone-600 rounded px-1 py-0.5 text-center text-xs text-white" />
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-stone-400 mb-1">Before Text</label>
                                <input
                                  type="text"
                                  value={currentBefore}
                                  onChange={(e) => handleFieldChange('beforeText', e.target.value)}
                                  placeholder="Supported by "
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-stone-400 mb-1">Link Text</label>
                                <input
                                  type="text"
                                  value={currentLink}
                                  onChange={(e) => handleFieldChange('linkText', e.target.value)}
                                  placeholder="Stand With Crypto"
                                  className={inputClass}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-stone-400 mb-1">After Text</label>
                              <input
                                type="text"
                                value={currentAfter}
                                onChange={(e) => handleFieldChange('afterText', e.target.value)}
                                placeholder=". Join the Fight for Sensible Crypto Policy!"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-stone-400 mb-1">URL</label>
                              <input
                                type="url"
                                value={currentUrl}
                                onChange={(e) => handleFieldChange('url', e.target.value)}
                                placeholder="https://..."
                                className={inputClass}
                              />
                            </div>
                            {/* Inline preview */}
                            <div className="text-xs text-stone-500 bg-stone-950/50 rounded-lg px-3 py-2">
                              Preview{viewingB ? ' (B)' : ''}: <span className="text-stone-300">{currentBefore}<span className="text-blue-400 underline">{currentLink}</span>{currentAfter}</span>
                            </div>
                            <button
                              onClick={() => setEditingSponsorIndex(null)}
                              className="text-green-400 hover:text-green-300 cursor-pointer p-1 flex items-center gap-1 text-sm"
                            >
                              <Save className="w-4 h-4" />
                              Done
                            </button>
                          </div>
                          );
                        })() : (
                          <div className="flex items-center gap-3">
                            <GripVertical className="w-4 h-4 text-stone-500 cursor-grab shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-stone-300 truncate">
                                {sponsor.beforeText}<span className="font-medium text-white">{sponsor.linkText || '(no link text)'}</span>{sponsor.afterText}
                              </p>
                              <p className="text-xs text-stone-500 truncate mt-0.5">{sponsor.url || '(no url)'}</p>
                            </div>
                            {sponsor.ab?.enabled && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-purple-500/20 text-purple-400 rounded-full border border-purple-500/30">A/B</span>
                            )}
                            <button
                              onClick={() => setEditingSponsorIndex(idx)}
                              className="text-stone-400 hover:text-white cursor-pointer p-1"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setSponsors(sponsors.filter((_, i) => i !== idx))}
                              className="text-red-400 hover:text-red-300 cursor-pointer p-1"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save button */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => saveConfig('sponsors', sponsors)}
                    disabled={saving}
                    className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Sponsors
                  </button>
                </div>

              </>
            )}
          </div>
        )}

        {/* Tab 3: Native Ads */}
        {activeTab === 'nativeAds' && (
          <div className="space-y-6">
            {configLoading ? (
              <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading config...
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Native Ads ({nativeAds.length})</h3>
                  <button
                    onClick={() => {
                      const newAd: NativeAd = {
                        id: crypto.randomUUID(),
                        title: '',
                        description: '',
                        link: '',
                        imageUrl: '',
                        conference: allConferenceTabs[0]?.name || '',
                        badge: 'Sponsored',
                        active: true,
                      };
                      setNativeAds([...nativeAds, newAd]);
                      setEditingAdId(newAd.id);
                    }}
                    className={`${btnPrimary} flex items-center gap-1.5`}
                  >
                    <Plus className="w-4 h-4" />
                    Add Ad
                  </button>
                </div>

                {nativeAds.length === 0 && (
                  <p className="text-stone-500 text-sm py-4 text-center">No native ads configured</p>
                )}

                <div className="space-y-4">
                  {nativeAds.map((ad, adIdx) => (
                    <div
                      key={ad.id}
                      className={`bg-stone-900 rounded-xl p-4 border transition-colors ${
                        adDragOverIndex === adIdx && adDragIndex !== adIdx
                          ? 'border-amber-500 border-t-2'
                          : 'border-stone-700'
                      } ${adDragIndex === adIdx ? 'opacity-40' : ''}`}
                      draggable={editingAdId !== ad.id}
                      onDragStart={(e) => {
                        setAdDragIndex(adIdx);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (adDragIndex !== null && adDragIndex !== adIdx) {
                          setAdDragOverIndex(adIdx);
                        }
                      }}
                      onDragLeave={() => {
                        if (adDragOverIndex === adIdx) setAdDragOverIndex(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (adDragIndex !== null && adDragIndex !== adIdx) {
                          const updated = [...nativeAds];
                          const [moved] = updated.splice(adDragIndex, 1);
                          updated.splice(adIdx, 0, moved);
                          setNativeAds(updated);
                        }
                        setAdDragIndex(null);
                        setAdDragOverIndex(null);
                      }}
                      onDragEnd={() => {
                        setAdDragIndex(null);
                        setAdDragOverIndex(null);
                      }}
                    >
                      {editingAdId === ad.id ? (() => {
                        const adViewingB = ad.ab?.enabled && adAbVariantView[ad.id] === 'b';
                        const currentTitle = adViewingB ? (ad.ab?.b.title ?? '') : ad.title;
                        const currentDesc = adViewingB ? (ad.ab?.b.description ?? '') : ad.description;
                        const currentLink = adViewingB ? (ad.ab?.b.link ?? '') : ad.link;
                        const currentImage = adViewingB ? (ad.ab?.b.imageUrl ?? '') : ad.imageUrl;
                        const currentBadge = adViewingB ? (ad.ab?.b.badge ?? '') : ad.badge;
                        const handleAdFieldChange = (field: string, value: string) => {
                          if (adViewingB) {
                            setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, ab: { ...a.ab!, b: { ...a.ab!.b, [field]: value } } } : a));
                          } else {
                            setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, [field]: value } : a));
                          }
                        };
                        return (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-stone-500 font-mono">{ad.id.slice(0, 8)}...</span>
                            <button
                              onClick={() => setEditingAdId(null)}
                              className="text-stone-400 hover:text-white cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          {/* A/B Toggle */}
                          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-stone-700">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!ad.ab?.enabled}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, ab: a.ab || { b: { title: '', description: '', link: '', imageUrl: '', badge: '' }, weightA: 50, weightB: 50, enabled: true }, ...(a.ab ? {} : {})} : a));
                                    setNativeAds(prev => prev.map(a => a.id === ad.id ? { ...a, ab: { ...(a.ab || { b: { title: '', description: '', link: '', imageUrl: '', badge: '' }, weightA: 50, weightB: 50, enabled: false }), enabled: true } } : a));
                                  } else {
                                    setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, ab: a.ab ? { ...a.ab, enabled: false } : undefined } : a));
                                  }
                                }}
                                className="w-4 h-4 rounded"
                              />
                              <span className="text-sm text-stone-300">A/B Test</span>
                            </label>
                            {ad.ab?.enabled && (
                              <>
                                <div className="flex items-center gap-1 ml-auto">
                                  <button
                                    onClick={() => setAdAbVariantView({ ...adAbVariantView, [ad.id]: 'a' })}
                                    className={`px-2 py-0.5 text-xs rounded-l-lg border ${(adAbVariantView[ad.id] || 'a') === 'a' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-stone-800 border-stone-600 text-stone-400'} cursor-pointer`}
                                  >A</button>
                                  <button
                                    onClick={() => setAdAbVariantView({ ...adAbVariantView, [ad.id]: 'b' })}
                                    className={`px-2 py-0.5 text-xs rounded-r-lg border ${adAbVariantView[ad.id] === 'b' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-stone-800 border-stone-600 text-stone-400'} cursor-pointer`}
                                  >B</button>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-stone-400">
                                  <input type="number" min={0} max={100} value={ad.ab?.weightA ?? 50} onChange={(e) => {
                                    setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, ab: { ...a.ab!, weightA: Number(e.target.value) } } : a));
                                  }} className="w-12 bg-stone-800 border border-stone-600 rounded px-1 py-0.5 text-center text-xs text-white" />
                                  <span>/</span>
                                  <input type="number" min={0} max={100} value={ad.ab?.weightB ?? 50} onChange={(e) => {
                                    setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, ab: { ...a.ab!, weightB: Number(e.target.value) } } : a));
                                  }} className="w-12 bg-stone-800 border border-stone-600 rounded px-1 py-0.5 text-center text-xs text-white" />
                                </div>
                              </>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs text-stone-400 mb-1">Title</label>
                            <input
                              type="text"
                              value={currentTitle}
                              onChange={(e) => handleAdFieldChange('title', e.target.value)}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-stone-400 mb-1">Description</label>
                            <textarea
                              value={currentDesc}
                              onChange={(e) => handleAdFieldChange('description', e.target.value)}
                              rows={2}
                              className={`${inputClass} resize-none`}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-stone-400 mb-1">Link</label>
                            <input
                              type="url"
                              value={currentLink}
                              onChange={(e) => handleAdFieldChange('link', e.target.value)}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-stone-400 mb-1">Image URL</label>
                            <input
                              type="url"
                              value={currentImage}
                              onChange={(e) => handleAdFieldChange('imageUrl', e.target.value)}
                              className={inputClass}
                            />
                          </div>
                          <div className="flex gap-3">
                            <div className="flex-1">
                              <label className="block text-xs text-stone-400 mb-1">Conference</label>
                              <select
                                value={ad.conference}
                                onChange={(e) => setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, conference: e.target.value } : a))}
                                className={inputClass}
                              >
                                <option value="">All Conferences</option>
                                {allConferenceTabs.map((t) => (
                                  <option key={t.gid} value={t.name}>{t.name}</option>
                                ))}
                                {ad.conference && !allConferenceTabs.some(t => t.name === ad.conference) && (
                                  <option value={ad.conference}>{ad.conference} (legacy)</option>
                                )}
                              </select>
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs text-stone-400 mb-1">Badge Text</label>
                              <input
                                type="text"
                                value={currentBadge}
                                onChange={(e) => handleAdFieldChange('badge', e.target.value)}
                                placeholder="Sponsored"
                                className={inputClass}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={ad.active}
                                onChange={(e) => setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, active: e.target.checked } : a))}
                                className="w-4 h-4 rounded"
                              />
                              <span className="text-sm text-stone-300">Active</span>
                            </label>
                          </div>
                        </div>
                        );
                      })() : (
                        <div className="flex items-start gap-4">
                          <GripVertical className="w-4 h-4 text-stone-500 cursor-grab shrink-0 mt-1" />
                          {ad.imageUrl && (
                            <div className="w-[80px] h-[60px] flex-shrink-0 rounded-lg overflow-hidden bg-stone-800">
                              <img src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-white truncate">{ad.title || '(untitled)'}</span>
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ad.active ? 'bg-green-500' : 'bg-red-500'}`} />
                              <span className="text-[10px] text-stone-500">{ad.active ? 'Active' : 'Inactive'}</span>
                              {ad.ab?.enabled && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-purple-500/20 text-purple-400 rounded-full border border-purple-500/30">A/B</span>
                              )}
                            </div>
                            <p className="text-xs text-stone-400 line-clamp-1">{ad.description || '(no description)'}</p>
                            <p className="text-xs text-stone-500 mt-0.5">{ad.conference} &middot; {ad.badge || 'Sponsored'}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setEditingAdId(ad.id)}
                              className="text-stone-400 hover:text-white cursor-pointer p-1"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setNativeAds(nativeAds.filter(a => a.id !== ad.id))}
                              className="text-red-400 hover:text-red-300 cursor-pointer p-1"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => saveConfig('native_ads', nativeAds)}
                  disabled={saving}
                  className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Native Ads
                </button>

              </>
            )}
          </div>
        )}

        {/* Tab 4: Upsell Copy */}
        {activeTab === 'upsell' && (
          <div className="space-y-6">
            {configLoading ? (
              <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading config...
              </div>
            ) : (
              <>
                <div className="bg-stone-900 rounded-xl p-4 border border-stone-700 space-y-4">
                  <h3 className="text-sm font-semibold text-white">Upsell Copy (shown after event submission)</h3>

                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Heading</label>
                    <input
                      type="text"
                      value={upsellCopy.heading}
                      onChange={(e) => setUpsellCopy({ ...upsellCopy, heading: e.target.value })}
                      placeholder="Want more visibility?"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Body</label>
                    <textarea
                      value={upsellCopy.body}
                      onChange={(e) => setUpsellCopy({ ...upsellCopy, body: e.target.value })}
                      placeholder="Highlight your event and get featured placement..."
                      rows={3}
                      className={`${inputClass} resize-none`}
                    />
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-stone-400 mb-1">CTA Text</label>
                      <input
                        type="text"
                        value={upsellCopy.cta_text}
                        onChange={(e) => setUpsellCopy({ ...upsellCopy, cta_text: e.target.value })}
                        placeholder="Learn More — $500"
                        className={inputClass}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-stone-400 mb-1">CTA URL</label>
                      <input
                        type="url"
                        value={upsellCopy.cta_url}
                        onChange={(e) => setUpsellCopy({ ...upsellCopy, cta_url: e.target.value })}
                        placeholder="https://..."
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>

                {/* Live preview */}
                <div className="bg-stone-900 rounded-xl p-4 border border-stone-700">
                  <h3 className="text-sm font-semibold text-white mb-3">Preview</h3>
                  <div className="max-w-md mx-auto">
                    <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/10 border border-amber-500/30">
                      <h4 className="text-sm font-semibold text-amber-300 mb-1">
                        {upsellCopy.heading || 'Heading...'}
                      </h4>
                      <p className="text-xs text-stone-400 mb-3">
                        {upsellCopy.body || 'Body text...'}
                      </p>
                      <a
                        href={upsellCopy.cta_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-stone-900 rounded-lg transition-colors"
                      >
                        {upsellCopy.cta_text || 'CTA Text'}
                      </a>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => saveConfig('upsell_copy', upsellCopy)}
                  disabled={saving}
                  className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Upsell Copy
                </button>
              </>
            )}
          </div>
        )}

        {/* Tab 5: Ad Inventory */}
        {activeTab === 'adInventory' && (
          <div className="space-y-8">
            {configLoading ? (
              <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading config...
              </div>
            ) : (
              <>
                {/* Conference selector dropdown */}
                <div className="relative inline-block">
                  <button
                    onClick={() => setAdConfOpen(!adConfOpen)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-stone-900 text-sm font-semibold cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">{adConference}</span>
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  </button>
                  {adConfOpen && (
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={() => setAdConfOpen(false)} />
                      <div className="absolute left-0 top-full mt-1 bg-stone-900 border border-stone-700 rounded-lg shadow-xl overflow-hidden min-w-[180px] z-[70]">
                        {adConferenceList.map((name) => (
                          <button
                            key={name}
                            onClick={() => { setAdConference(name); setAdConfOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                              adConference === name
                                ? 'bg-amber-500 text-stone-900'
                                : 'text-stone-300 hover:bg-stone-800'
                            }`}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Section A: Page Settings */}
                <div className="bg-stone-900 rounded-xl p-4 border border-stone-700 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Advertise Page Settings</h3>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Configure the /ads page for {adConference}. Leave blank to use defaults.
                      </p>
                    </div>
                    {copyFromConferences.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setShowCopyFrom(!showCopyFrom)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-300 bg-stone-800 border border-stone-600 rounded-lg hover:border-stone-500 transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy from...
                        </button>
                        {showCopyFrom && (
                          <div className="absolute right-0 top-full mt-1 bg-stone-800 border border-stone-600 rounded-lg shadow-xl z-10 py-1 min-w-[160px]">
                            {copyFromConferences.map(c => (
                              <button
                                key={c}
                                onClick={() => handleCopyFrom(c)}
                                className="w-full text-left px-3 py-2 text-sm text-stone-300 hover:bg-stone-700 cursor-pointer"
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Hero Heading</label>
                    <input
                      type="text"
                      value={adPageConfig.heroHeading}
                      onChange={(e) => setAdPageConfig({ ...adPageConfig, heroHeading: e.target.value })}
                      placeholder="Reach Crypto Conference Attendees"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Hero Subheading</label>
                    <textarea
                      value={adPageConfig.heroSubheading}
                      onChange={(e) => setAdPageConfig({ ...adPageConfig, heroSubheading: e.target.value })}
                      placeholder="plan.wtf is the go-to guide for thousands of attendees..."
                      rows={2}
                      className={`${inputClass} resize-none`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Stats Line</label>
                    <input
                      type="text"
                      value={adPageConfig.statsLine}
                      onChange={(e) => setAdPageConfig({ ...adPageConfig, statsLine: e.target.value })}
                      placeholder="10,000+ monthly users across ETH Denver, Consensus, ETHCC..."
                      className={inputClass}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">CTA Text</label>
                      <input
                        type="text"
                        value={adPageConfig.ctaText}
                        onChange={(e) => setAdPageConfig({ ...adPageConfig, ctaText: e.target.value })}
                        placeholder="Get in Touch"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">CTA URL</label>
                      <input
                        type="text"
                        value={adPageConfig.ctaUrl}
                        onChange={(e) => setAdPageConfig({ ...adPageConfig, ctaUrl: e.target.value })}
                        placeholder="mailto:ads@plan.wtf"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Secondary CTA Text</label>
                      <input
                        type="text"
                        value={adPageConfig.ctaSecondaryText}
                        onChange={(e) => setAdPageConfig({ ...adPageConfig, ctaSecondaryText: e.target.value })}
                        placeholder="View Media Kit"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Secondary CTA URL</label>
                      <input
                        type="text"
                        value={adPageConfig.ctaSecondaryUrl}
                        onChange={(e) => setAdPageConfig({ ...adPageConfig, ctaSecondaryUrl: e.target.value })}
                        placeholder="https://..."
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Footer Text</label>
                    <input
                      type="text"
                      value={adPageConfig.footerText}
                      onChange={(e) => setAdPageConfig({ ...adPageConfig, footerText: e.target.value })}
                      placeholder="Questions? Reach out at ads@plan.wtf"
                      className={inputClass}
                    />
                  </div>

                  {/* Tiers Toggle */}
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-stone-400">Show Sponsorship Tiers</label>
                    <button
                      type="button"
                      onClick={() => setAdPageConfig({ ...adPageConfig, tiersEnabled: !adPageConfig.tiersEnabled })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${adPageConfig.tiersEnabled ? 'bg-amber-500' : 'bg-stone-600'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${adPageConfig.tiersEnabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* Tiers Editor */}
                  {adPageConfig.tiersEnabled && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-stone-400">Sponsorship Tiers ({adPageConfig.tiers.length})</label>
                        <button
                          type="button"
                          onClick={() => setAdPageConfig({
                            ...adPageConfig,
                            tiers: [...adPageConfig.tiers, { name: '', price: '', features: [''], highlighted: false }],
                          })}
                          className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                        >
                          + Add Tier
                        </button>
                      </div>
                      {adPageConfig.tiers.map((tier, ti) => (
                        <div key={ti} className="bg-stone-800 rounded-lg p-3 space-y-2 border border-stone-700">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-stone-500">Tier {ti + 1}</span>
                            <button
                              type="button"
                              onClick={() => setAdPageConfig({
                                ...adPageConfig,
                                tiers: adPageConfig.tiers.filter((_, i) => i !== ti),
                              })}
                              className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-stone-500 mb-0.5">Name</label>
                              <input
                                type="text"
                                value={tier.name}
                                onChange={(e) => {
                                  const tiers = [...adPageConfig.tiers];
                                  tiers[ti] = { ...tiers[ti], name: e.target.value };
                                  setAdPageConfig({ ...adPageConfig, tiers });
                                }}
                                placeholder="Gold Sponsor"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-stone-500 mb-0.5">Price</label>
                              <input
                                type="text"
                                value={tier.price}
                                onChange={(e) => {
                                  const tiers = [...adPageConfig.tiers];
                                  tiers[ti] = { ...tiers[ti], price: e.target.value };
                                  setAdPageConfig({ ...adPageConfig, tiers });
                                }}
                                placeholder="$2,500"
                                className={inputClass}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={tier.highlighted}
                              onChange={(e) => {
                                const tiers = [...adPageConfig.tiers];
                                tiers[ti] = { ...tiers[ti], highlighted: e.target.checked };
                                setAdPageConfig({ ...adPageConfig, tiers });
                              }}
                              className="accent-amber-500"
                            />
                            <label className="text-xs text-stone-400">Highlighted (featured styling)</label>
                          </div>
                          <div>
                            <label className="block text-xs text-stone-500 mb-1">Features (one per line)</label>
                            <textarea
                              value={tier.features.join('\n')}
                              onChange={(e) => {
                                const tiers = [...adPageConfig.tiers];
                                tiers[ti] = { ...tiers[ti], features: e.target.value.split('\n') };
                                setAdPageConfig({ ...adPageConfig, tiers });
                              }}
                              rows={4}
                              placeholder={"Logo on homepage ticker\nFeatured event badge\n1 native ad slot"}
                              className={inputClass}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => saveConfig(`advertise_page:${adConference}`, adPageConfig)}
                    disabled={saving}
                    className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Page Settings
                  </button>
                </div>

                {/* Section B: Inventory Items */}
                <div className="bg-stone-900 rounded-xl p-4 border border-stone-700">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Inventory Items ({adInventory.length})</h3>
                      <p className="text-xs text-stone-500 mt-0.5">Ad placements shown on the /ads page</p>
                    </div>
                    <button
                      onClick={() => {
                        const newItem: AdInventoryItem = {
                          id: crypto.randomUUID(),
                          title: '',
                          slug: '',
                          description: '',
                          price: '',
                          features: [],
                          available: true,
                          sortOrder: adInventory.length + 1,
                        };
                        setAdInventory([...adInventory, newItem]);
                        setEditingInventoryId(newItem.id);
                      }}
                      className={`${btnPrimary} flex items-center gap-1.5`}
                    >
                      <Plus className="w-4 h-4" />
                      Add Item
                    </button>
                  </div>

                  {adInventory.length === 0 && (
                    <p className="text-stone-500 text-sm py-4 text-center">
                      No inventory items. Default items will be shown on the page.
                    </p>
                  )}

                  <div className="space-y-3">
                    {adInventory.map((item) => (
                      <div key={item.id} className="p-3 bg-stone-800 rounded-lg border border-stone-600">
                        {editingInventoryId === item.id ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-stone-500 font-mono">{item.id.slice(0, 8)}...</span>
                              <button
                                onClick={() => setEditingInventoryId(null)}
                                className="text-stone-400 hover:text-white cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-stone-400 mb-1">Title</label>
                                <input
                                  type="text"
                                  value={item.title}
                                  onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, title: e.target.value } : i))}
                                  placeholder="Sponsor Ticker"
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-stone-400 mb-1">Slug</label>
                                <input
                                  type="text"
                                  value={item.slug}
                                  onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, slug: e.target.value } : i))}
                                  placeholder="sponsor-ticker"
                                  className={inputClass}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-stone-400 mb-1">Description</label>
                              <textarea
                                value={item.description}
                                onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, description: e.target.value } : i))}
                                rows={2}
                                className={`${inputClass} resize-none`}
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs text-stone-400 mb-1">Price</label>
                                <input
                                  type="text"
                                  value={item.price}
                                  onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, price: e.target.value } : i))}
                                  placeholder="$500"
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-stone-400 mb-1">Price Note</label>
                                <input
                                  type="text"
                                  value={item.priceNote || ''}
                                  onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, priceNote: e.target.value } : i))}
                                  placeholder="per conference"
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-stone-400 mb-1">Sort Order</label>
                                <input
                                  type="number"
                                  value={item.sortOrder}
                                  onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, sortOrder: parseInt(e.target.value) || 0 } : i))}
                                  className={inputClass}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-stone-400 mb-1">Stats</label>
                                <input
                                  type="text"
                                  value={item.stats || ''}
                                  onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, stats: e.target.value } : i))}
                                  placeholder="Seen by 100% of users"
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-stone-400 mb-1">Badge</label>
                                <input
                                  type="text"
                                  value={item.badge || ''}
                                  onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, badge: e.target.value } : i))}
                                  placeholder="Popular"
                                  className={inputClass}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-stone-400 mb-1">Image URL</label>
                              <input
                                type="url"
                                value={item.imageUrl || ''}
                                onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, imageUrl: e.target.value } : i))}
                                placeholder="https://..."
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-stone-400 mb-1">
                                Features (one per line)
                              </label>
                              <textarea
                                value={item.features.join('\n')}
                                onChange={(e) => setAdInventory(adInventory.map(i =>
                                  i.id === item.id
                                    ? { ...i, features: e.target.value.split('\n').filter(f => f.trim()) }
                                    : i
                                ))}
                                rows={3}
                                placeholder="Custom message + link&#10;Runs across all pages&#10;Per-conference targeting"
                                className={`${inputClass} resize-none`}
                              />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.available}
                                onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, available: e.target.checked } : i))}
                                className="w-4 h-4 rounded"
                              />
                              <span className="text-sm text-stone-300">Available</span>
                            </label>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-medium text-white truncate">{item.title || '(untitled)'}</span>
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.available ? 'bg-green-500' : 'bg-red-500'}`} />
                                {item.badge && (
                                  <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">{item.badge}</span>
                                )}
                              </div>
                              <p className="text-xs text-stone-500 truncate">
                                {item.price}{item.priceNote ? ` (${item.priceNote})` : ''} &middot; {item.features.length} features &middot; sort: {item.sortOrder}
                              </p>
                            </div>
                            <button
                              onClick={() => setEditingInventoryId(item.id)}
                              className="text-stone-400 hover:text-white cursor-pointer p-1"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setAdInventory(adInventory.filter(i => i.id !== item.id))}
                              className="text-red-400 hover:text-red-300 cursor-pointer p-1"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => saveConfig(`ad_inventory:${adConference}`, adInventory)}
                  disabled={saving}
                  className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Inventory Items
                </button>
              </>
            )}
          </div>
        )}

        {activeTab === 'theme' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-white">Theme per Conference</h2>

            {/* Conference selector */}
            <div>
              <label className="block text-sm text-stone-400 mb-2">Conference</label>
              <select
                value={themeConference}
                onChange={(e) => setThemeConference(e.target.value)}
                className={inputClass + ' max-w-xs'}
              >
                {allConferenceTabs.map(tab => (
                  <option key={tab.name} value={tab.name}>{tab.name}</option>
                ))}
              </select>
            </div>

            {/* Theme radio buttons */}
            <div>
              <label className="block text-sm text-stone-400 mb-3">Active Theme for {themeConference}</label>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 max-w-4xl">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedTheme(opt.id)}
                    className={`relative rounded-lg border-2 p-4 text-center cursor-pointer transition-all ${
                      selectedTheme === opt.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-stone-700 hover:border-stone-500'
                    }`}
                  >
                    {/* Theme preview swatch */}
                    <div className="flex gap-1 justify-center mb-2">
                      {opt.id === 'dark' && (
                        <>
                          <span className="w-5 h-5 rounded" style={{ background: '#0c0a09' }} />
                          <span className="w-5 h-5 rounded" style={{ background: '#1c1917' }} />
                          <span className="w-5 h-5 rounded" style={{ background: '#f59e0b' }} />
                        </>
                      )}
                      {opt.id === 'paper' && (
                        <>
                          <span className="w-5 h-5 rounded border border-stone-600" style={{ background: '#f5f0e8' }} />
                          <span className="w-5 h-5 rounded border border-stone-600" style={{ background: '#faf7f2' }} />
                          <span className="w-5 h-5 rounded" style={{ background: '#c47a2a' }} />
                        </>
                      )}
                      {opt.id === 'light' && (
                        <>
                          <span className="w-5 h-5 rounded border border-stone-600" style={{ background: '#fafafa' }} />
                          <span className="w-5 h-5 rounded border border-stone-600" style={{ background: '#ffffff' }} />
                          <span className="w-5 h-5 rounded" style={{ background: '#ef4444' }} />
                        </>
                      )}
                      {opt.id === 'light-blue' && (
                        <>
                          <span className="w-5 h-5 rounded border border-stone-600" style={{ background: '#fafafa' }} />
                          <span className="w-5 h-5 rounded border border-stone-600" style={{ background: '#ffffff' }} />
                          <span className="w-5 h-5 rounded" style={{ background: '#1c4586' }} />
                        </>
                      )}
                      {opt.id === 'sxsw' && (
                        <>
                          <span className="w-5 h-5 rounded" style={{ background: '#0a1410' }} />
                          <span className="w-5 h-5 rounded" style={{ background: '#111f18' }} />
                          <span className="w-5 h-5 rounded" style={{ background: '#d8fc30' }} />
                        </>
                      )}
                      {opt.id === 'sxsw2' && (
                        <>
                          <span className="w-5 h-5 rounded" style={{ background: '#0a0a0a' }} />
                          <span className="w-5 h-5 rounded" style={{ background: '#F9CB0D' }} />
                          <span className="w-5 h-5 rounded" style={{ background: '#F2A6D1' }} />
                        </>
                      )}
                      {opt.id === 'gdc' && (
                        <>
                          <span className="w-5 h-5 rounded" style={{ background: '#0e1525' }} />
                          <span className="w-5 h-5 rounded" style={{ background: '#EF0000' }} />
                          <span className="w-5 h-5 rounded" style={{ background: '#f5a0c0' }} />
                        </>
                      )}
                      {opt.id === 'ethcc' && (
                        <>
                          <span className="w-5 h-5 rounded" style={{ background: '#152066' }} />
                          <span className="w-5 h-5 rounded" style={{ background: '#6b9de8' }} />
                          <span className="w-5 h-5 rounded" style={{ background: '#f06b6b' }} />
                        </>
                      )}
                    </div>
                    <span className={`text-sm font-semibold ${selectedTheme === opt.id ? 'text-blue-400' : 'text-stone-300'}`}>
                      {opt.label}
                    </span>
                    {selectedTheme === opt.id && (
                      <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Save + status */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => saveConfig(`theme:${themeConference}`, selectedTheme)}
                disabled={saving}
                className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Theme
              </button>
              {saveMessage && <span className="text-sm text-green-400">{saveMessage}</span>}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  A/B Tests Tab                                                */}
        {/* ============================================================ */}
        {activeTab === 'abTests' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FlaskConical className="w-5 h-5" />
                A/B Tests
              </h2>
              <button
                onClick={() => setAbNewTest(createEmptyTest())}
                className={`${btnPrimary} flex items-center gap-2`}
              >
                <Plus className="w-4 h-4" />
                New Test
              </button>
            </div>

            {/* Create / Edit Test Form */}
            {abNewTest && (
              <div className="bg-stone-800/50 border border-stone-600 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  {abEditingId ? 'Edit Test' : 'Create New Test'}
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Name</label>
                    <input
                      className={inputClass}
                      value={abNewTest.name}
                      onChange={e => setAbNewTest({ ...abNewTest, name: e.target.value })}
                      placeholder="e.g. Ad Frequency Test"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Placement</label>
                    <select
                      className={inputClass}
                      value={abNewTest.placement}
                      onChange={e => setAbNewTest({ ...abNewTest, placement: e.target.value })}
                    >
                      {AB_PLACEMENTS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-stone-400 mb-1">Description</label>
                  <input
                    className={inputClass}
                    value={abNewTest.description}
                    onChange={e => setAbNewTest({ ...abNewTest, description: e.target.value })}
                    placeholder="What are we testing?"
                  />
                </div>

                <div>
                  <label className="block text-xs text-stone-400 mb-1">Conference (leave empty for global)</label>
                  <select
                    className={inputClass + ' max-w-xs'}
                    value={abNewTest.conference}
                    onChange={e => setAbNewTest({ ...abNewTest, conference: e.target.value })}
                  >
                    <option value="">Global (all conferences)</option>
                    {allConferenceTabs.map(tab => (
                      <option key={tab.name} value={tab.name}>{tab.name}</option>
                    ))}
                  </select>
                </div>

                {/* Variants */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-stone-400 font-medium">Variants</label>
                    <button
                      onClick={() => {
                        const newId = `variant-${String.fromCharCode(97 + abNewTest.variants.length - 1)}`;
                        setAbNewTest({
                          ...abNewTest,
                          variants: [
                            ...abNewTest.variants,
                            { id: newId, name: `Variant ${String.fromCharCode(65 + abNewTest.variants.length - 1)}`, weight: 0, config: {} },
                          ],
                        });
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                    >
                      + Add Variant
                    </button>
                  </div>
                  <div className="space-y-2">
                    {abNewTest.variants.map((v, vi) => {
                      const updateConfig = (key: string, val: string) => {
                        const updated = [...abNewTest.variants];
                        updated[vi] = { ...updated[vi], config: { ...updated[vi].config, [key]: val } };
                        setAbNewTest({ ...abNewTest, variants: updated });
                      };
                      const updateAdField = (idx: number, key: string, val: string) => {
                        const ads = [...((v.config.ads as Record<string, string>[]) || [{ id: `ad-${vi}`, title: '', description: '', link: '', imageUrl: '', badge: 'Sponsored' }])];
                        ads[idx] = { ...ads[idx], [key]: val };
                        const updated = [...abNewTest.variants];
                        updated[vi] = { ...updated[vi], config: { ...updated[vi].config, ads } };
                        setAbNewTest({ ...abNewTest, variants: updated });
                      };
                      const updateSponsorField = (idx: number, key: string, val: string) => {
                        const sponsors = [...((v.config.sponsors as Record<string, string>[]) || [{ beforeText: '', linkText: '', afterText: '', url: '' }])];
                        sponsors[idx] = { ...sponsors[idx], [key]: val };
                        const updated = [...abNewTest.variants];
                        updated[vi] = { ...updated[vi], config: { ...updated[vi].config, sponsors } };
                        setAbNewTest({ ...abNewTest, variants: updated });
                      };
                      const ads = (v.config.ads as Record<string, string>[]) || [];
                      const sponsors = (v.config.sponsors as Record<string, string>[]) || [];

                      return (
                      <div key={v.id} className="bg-stone-900/50 rounded-lg p-3 space-y-3">
                        <div className="flex items-center gap-2">
                          <input
                            className={inputClass + ' flex-1'}
                            value={v.name}
                            onChange={e => {
                              const updated = [...abNewTest.variants];
                              updated[vi] = { ...updated[vi], name: e.target.value };
                              setAbNewTest({ ...abNewTest, variants: updated });
                            }}
                            placeholder="Variant name"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              className={inputClass + ' w-16 text-center'}
                              value={v.weight}
                              onChange={e => {
                                const updated = [...abNewTest.variants];
                                updated[vi] = { ...updated[vi], weight: Number(e.target.value) || 0 };
                                setAbNewTest({ ...abNewTest, variants: updated });
                              }}
                            />
                            <span className="text-xs text-stone-500">%</span>
                          </div>
                          {abNewTest.variants.length > 2 && (
                            <button
                              onClick={() => setAbNewTest({
                                ...abNewTest,
                                variants: abNewTest.variants.filter((_, i) => i !== vi),
                              })}
                              className="text-red-400 hover:text-red-300 cursor-pointer p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Native Ad Content fields */}
                        {abNewTest.placement === 'native-ad-content' && (
                          <div className="space-y-2 border-t border-stone-700 pt-2">
                            {(ads.length === 0 ? [{ id: `ad-${vi}`, title: '', description: '', link: '', imageUrl: '', badge: 'Sponsored' }] : ads).map((ad, ai) => (
                              <div key={ai} className="grid grid-cols-2 gap-2">
                                <input className={inputClass} value={ad.title || ''} onChange={e => updateAdField(ai, 'title', e.target.value)} placeholder="Ad title" />
                                <input className={inputClass} value={ad.badge || ''} onChange={e => updateAdField(ai, 'badge', e.target.value)} placeholder="Badge (e.g. Sponsored)" />
                                <input className={inputClass + ' col-span-2'} value={ad.description || ''} onChange={e => updateAdField(ai, 'description', e.target.value)} placeholder="Description" />
                                <input className={inputClass} value={ad.link || ''} onChange={e => updateAdField(ai, 'link', e.target.value)} placeholder="Destination URL" />
                                <input className={inputClass} value={ad.imageUrl || ''} onChange={e => updateAdField(ai, 'imageUrl', e.target.value)} placeholder="Image URL" />
                                <input className={inputClass} value={ad.id || ''} onChange={e => updateAdField(ai, 'id', e.target.value)} placeholder="Ad ID (unique)" />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Sponsor Copy fields */}
                        {abNewTest.placement === 'sponsor-copy' && (
                          <div className="space-y-2 border-t border-stone-700 pt-2">
                            {(sponsors.length === 0 ? [{ beforeText: '', linkText: '', afterText: '', url: '' }] : sponsors).map((sp, si) => (
                              <div key={si} className="grid grid-cols-2 gap-2">
                                <input className={inputClass} value={sp.beforeText || ''} onChange={e => updateSponsorField(si, 'beforeText', e.target.value)} placeholder="Before text (e.g. 'Supported by ')" />
                                <input className={inputClass} value={sp.linkText || ''} onChange={e => updateSponsorField(si, 'linkText', e.target.value)} placeholder="Link text (sponsor name)" />
                                <input className={inputClass} value={sp.afterText || ''} onChange={e => updateSponsorField(si, 'afterText', e.target.value)} placeholder="After text (e.g. '. Learn more!')" />
                                <input className={inputClass} value={sp.url || ''} onChange={e => updateSponsorField(si, 'url', e.target.value)} placeholder="Destination URL" />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Ad Frequency field */}
                        {abNewTest.placement === 'ad-frequency' && (
                          <div className="border-t border-stone-700 pt-2">
                            <label className="text-xs text-stone-400">Show ad every N events</label>
                            <input type="number" min="1" max="50" className={inputClass + ' w-24 mt-1'} value={(v.config.frequency as number) || 8} onChange={e => updateConfig('frequency', e.target.value)} />
                          </div>
                        )}

                        {/* Hero Copy fields */}
                        {abNewTest.placement === 'hero-copy' && (
                          <div className="space-y-2 border-t border-stone-700 pt-2">
                            <input className={inputClass} value={(v.config.heroHeading as string) || ''} onChange={e => updateConfig('heroHeading', e.target.value)} placeholder="Hero heading" />
                            <input className={inputClass} value={(v.config.heroSubheading as string) || ''} onChange={e => updateConfig('heroSubheading', e.target.value)} placeholder="Hero subheading" />
                            <input className={inputClass} value={(v.config.ctaText as string) || ''} onChange={e => updateConfig('ctaText', e.target.value)} placeholder="CTA button text" />
                          </div>
                        )}

                        {/* Tier Layout field */}
                        {abNewTest.placement === 'tier-layout' && (
                          <div className="border-t border-stone-700 pt-2">
                            <label className="text-xs text-stone-400">Grid columns</label>
                            <select className={inputClass + ' w-24 mt-1'} value={(v.config.columns as number) || 2} onChange={e => updateConfig('columns', e.target.value)}>
                              <option value="1">1</option>
                              <option value="2">2</option>
                              <option value="3">3</option>
                            </select>
                          </div>
                        )}

                        {/* Custom / fallback: raw JSON */}
                        {abNewTest.placement === 'custom' && (
                          <div className="border-t border-stone-700 pt-2">
                            <input
                              className={inputClass}
                              value={JSON.stringify(v.config)}
                              onChange={e => {
                                try {
                                  const parsed = JSON.parse(e.target.value);
                                  const updated = [...abNewTest.variants];
                                  updated[vi] = { ...updated[vi], config: parsed };
                                  setAbNewTest({ ...abNewTest, variants: updated });
                                } catch { /* ignore invalid JSON while typing */ }
                              }}
                              placeholder='{"key": "value"}'
                              title="Variant config (JSON)"
                            />
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                  {(() => {
                    const totalWeight = abNewTest.variants.reduce((s, v) => s + v.weight, 0);
                    return totalWeight !== 100 ? (
                      <p className="text-xs text-amber-400 mt-1">
                        Weights sum to {totalWeight}% (should be 100%)
                      </p>
                    ) : null;
                  })()}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      if (!abNewTest.name.trim()) return;
                      if (abEditingId) {
                        // Update existing
                        const updated = abTests.map(t => t.id === abEditingId ? abNewTest : t);
                        saveAbTests(updated);
                      } else {
                        // Create new
                        saveAbTests([...abTests, abNewTest]);
                      }
                      setAbNewTest(null);
                      setAbEditingId(null);
                    }}
                    disabled={!abNewTest.name.trim() || saving}
                    className={`${btnPrimary} flex items-center gap-2 ${!abNewTest.name.trim() || saving ? 'opacity-50' : ''}`}
                  >
                    <Save className="w-4 h-4" />
                    {abEditingId ? 'Update Test' : 'Create Test'}
                  </button>
                  <button
                    onClick={() => { setAbNewTest(null); setAbEditingId(null); }}
                    className="text-sm text-stone-400 hover:text-stone-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  {saveMessage && <span className="text-sm text-green-400">{saveMessage}</span>}
                </div>
              </div>
            )}

            {/* Test List */}
            {abTests.length === 0 && !abNewTest && (
              <div className="text-center py-12 text-stone-500">
                <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No A/B tests yet. Create one to get started.</p>
              </div>
            )}

            <div className="space-y-3">
              {abTests.map(test => (
                <div key={test.id} className="bg-stone-800/50 border border-stone-700 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold text-white truncate">{test.name}</h3>
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${
                          test.status === 'running'
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : test.status === 'paused'
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            : test.status === 'completed'
                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                            : 'bg-stone-500/20 text-stone-400 border-stone-500/30'
                        }`}>
                          {test.status}
                        </span>
                        {test.winnerId && (
                          <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30">
                            <Trophy className="w-3 h-3" />
                            {test.variants.find(v => v.id === test.winnerId)?.name || test.winnerId}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400 mb-1">{test.description}</p>
                      <div className="flex items-center gap-3 text-[11px] text-stone-500">
                        <span>Placement: {AB_PLACEMENTS.find(p => p.value === test.placement)?.label || test.placement}</span>
                        {test.conference && <span>Conference: {test.conference}</span>}
                        <span>{test.variants.length} variants</span>
                        {test.started_at && <span>Started: {new Date(test.started_at).toLocaleDateString()}</span>}
                      </div>

                      {/* Variant summary */}
                      <div className="flex gap-2 mt-2">
                        {test.variants.map(v => (
                          <span key={v.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-stone-900/50 rounded text-[11px] text-stone-300">
                            {v.name} <span className="text-stone-500">{v.weight}%</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {test.status === 'draft' && (
                        <button
                          onClick={() => updateTestStatus(test.id, 'running')}
                          className="p-1.5 rounded hover:bg-green-500/20 text-green-400 cursor-pointer"
                          title="Start test"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      {test.status === 'running' && (
                        <button
                          onClick={() => updateTestStatus(test.id, 'paused')}
                          className="p-1.5 rounded hover:bg-amber-500/20 text-amber-400 cursor-pointer"
                          title="Pause test"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      )}
                      {test.status === 'paused' && (
                        <button
                          onClick={() => updateTestStatus(test.id, 'running')}
                          className="p-1.5 rounded hover:bg-green-500/20 text-green-400 cursor-pointer"
                          title="Resume test"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      {(test.status === 'running' || test.status === 'paused') && (
                        <button
                          onClick={() => {
                            setAbViewResults(abViewResults === test.id ? null : test.id);
                            if (abViewResults !== test.id) fetchResults(test.id);
                          }}
                          className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 cursor-pointer"
                          title="View results"
                        >
                          <BarChart3 className="w-4 h-4" />
                        </button>
                      )}
                      {test.status !== 'completed' && (
                        <button
                          onClick={() => {
                            setAbEditingId(test.id);
                            setAbNewTest(structuredClone(test));
                          }}
                          className="p-1.5 rounded hover:bg-stone-700 text-stone-400 cursor-pointer"
                          title="Edit test"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Delete test "${test.name}"?`)) {
                            saveAbTests(abTests.filter(t => t.id !== test.id));
                          }
                        }}
                        className="p-1.5 rounded hover:bg-red-500/20 text-red-400 cursor-pointer"
                        title="Delete test"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Results panel */}
                  {abViewResults === test.id && (
                    <div className="mt-4 pt-4 border-t border-stone-700">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                          <BarChart3 className="w-4 h-4" />
                          Results
                        </h4>
                        <button
                          onClick={() => fetchResults(test.id)}
                          className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                        >
                          Refresh
                        </button>
                      </div>

                      {abResultsLoading ? (
                        <div className="flex items-center gap-2 text-stone-400 text-sm py-4">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading results...
                        </div>
                      ) : abResults[test.id] ? (
                        <div className="space-y-3">
                          <div className="grid gap-2">
                            {abResults[test.id].map(r => {
                              const maxImpressions = Math.max(...abResults[test.id].map(v => v.impressions), 1);
                              const barWidth = (r.impressions / maxImpressions) * 100;
                              return (
                                <div key={r.variant_id} className="bg-stone-900/50 rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-white">{r.variant_name}</span>
                                    <span className="text-xs text-stone-500">{r.variant_id}</span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-4 text-center mb-2">
                                    <div>
                                      <div className="flex items-center justify-center gap-1 text-xs text-stone-400 mb-0.5">
                                        <Eye className="w-3 h-3" />
                                        Impressions
                                      </div>
                                      <span className="text-lg font-bold text-white">{r.impressions.toLocaleString()}</span>
                                    </div>
                                    <div>
                                      <div className="flex items-center justify-center gap-1 text-xs text-stone-400 mb-0.5">
                                        <MousePointer className="w-3 h-3" />
                                        Clicks
                                      </div>
                                      <span className="text-lg font-bold text-white">{r.clicks.toLocaleString()}</span>
                                    </div>
                                    <div>
                                      <div className="text-xs text-stone-400 mb-0.5">CTR</div>
                                      <span className="text-lg font-bold text-amber-400">{(r.ctr * 100).toFixed(2)}%</span>
                                    </div>
                                  </div>
                                  {/* Bar */}
                                  <div className="h-2 bg-stone-800 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-blue-500 rounded-full transition-all"
                                      style={{ width: `${barWidth}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Complete test with winner selection */}
                          {(test.status === 'running' || test.status === 'paused') && (
                            <div className="flex items-center gap-2 pt-2">
                              <span className="text-xs text-stone-400">Complete test with winner:</span>
                              {test.variants.map(v => (
                                <button
                                  key={v.id}
                                  onClick={() => {
                                    if (confirm(`Complete test and declare "${v.name}" as winner?`)) {
                                      updateTestStatus(test.id, 'completed', v.id);
                                      setAbViewResults(null);
                                    }
                                  }}
                                  className="px-3 py-1 text-xs font-medium bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 border border-amber-500/30 cursor-pointer"
                                >
                                  <Trophy className="w-3 h-3 inline mr-1" />
                                  {v.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-stone-500 py-2">No results data available. The ab_events table may need to be created in Supabase.</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* Tab 8: Ad Reports                                             */}
        {/* ============================================================ */}
        {activeTab === 'adReports' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Ad Performance Reports
            </h2>

            {/* Filters row */}
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs text-stone-400 mb-1">Conference</label>
                <select
                  value={adReportConference}
                  onChange={e => setAdReportConference(e.target.value)}
                  className={inputClass + ' w-48'}
                >
                  <option value="">All Conferences</option>
                  {allConferenceTabs.map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-400 mb-1">Date Range</label>
                <select
                  value={adReportRange}
                  onChange={e => setAdReportRange(e.target.value as typeof adReportRange)}
                  className={inputClass + ' w-36'}
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="all">All time</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-400 mb-1">Sort by</label>
                <select
                  value={adReportSort}
                  onChange={e => setAdReportSort(e.target.value as typeof adReportSort)}
                  className={inputClass + ' w-36'}
                >
                  <option value="impressions">Impressions</option>
                  <option value="ctr">CTR</option>
                </select>
              </div>
              <button
                onClick={fetchAdReport}
                disabled={adReportLoading}
                className={btnPrimary + ' flex items-center gap-2'}
              >
                {adReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                Load Report
              </button>
            </div>

            {/* Results */}
            {adReport && (
              <div className="space-y-4">
                {/* Period info */}
                <p className="text-xs text-stone-400">
                  Period: {new Date(adReport.period.start).toLocaleDateString()} &ndash; {new Date(adReport.period.end).toLocaleDateString()}
                  {adReportConference && <> &middot; Conference: {adReportConference}</>}
                </p>

                {/* Table */}
                {adReport.ads.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-stone-400 border-b border-stone-700">
                          <th className="py-2 pr-4">Name</th>
                          <th className="py-2 pr-4">Placement</th>
                          <th className="py-2 pr-4 text-right">Impressions</th>
                          <th className="py-2 pr-4 text-right">Unique</th>
                          <th className="py-2 pr-4 text-right">Clicks</th>
                          <th className="py-2 pr-4 text-right">Unique</th>
                          <th className="py-2 text-right">CTR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...adReport.ads]
                          .sort((a, b) => adReportSort === 'ctr' ? b.ctr - a.ctr : b.impressions - a.impressions)
                          .map(ad => (
                          <tr key={ad.ad_id} className="border-b border-stone-800 text-white">
                            <td className="py-2 pr-4 font-medium">{ad.ad_name}</td>
                            <td className="py-2 pr-4">
                              <span className="px-2 py-0.5 text-xs bg-stone-800 rounded-full text-stone-300">{ad.placement}</span>
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">{ad.impressions.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-stone-400">{ad.unique_impressions.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{ad.clicks.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-stone-400">{ad.unique_clicks.toLocaleString()}</td>
                            <td className="py-2 text-right tabular-nums font-medium text-amber-400">{ad.ctr.toFixed(2)}%</td>
                          </tr>
                        ))}
                        {/* Totals row */}
                        <tr className="border-t-2 border-stone-600 text-white font-bold">
                          <td className="py-2 pr-4" colSpan={2}>Total</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{adReport.totals.impressions.toLocaleString()}</td>
                          <td className="py-2 pr-4"></td>
                          <td className="py-2 pr-4 text-right tabular-nums">{adReport.totals.clicks.toLocaleString()}</td>
                          <td className="py-2 pr-4"></td>
                          <td className="py-2 text-right tabular-nums text-amber-400">{adReport.totals.ctr.toFixed(2)}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-stone-500 text-sm py-4">No ad events found for this period.</p>
                )}

                {/* Action buttons */}
                {adReport.ads.length > 0 && (
                  <div className="flex flex-wrap gap-3 pt-2">
                    {/* Export CSV */}
                    <button
                      onClick={() => {
                        const sorted = [...adReport.ads].sort((a, b) =>
                          adReportSort === 'ctr' ? b.ctr - a.ctr : b.impressions - a.impressions
                        );
                        const header = 'Name,Placement,Impressions,Unique Impressions,Clicks,Unique Clicks,CTR';
                        const rows = sorted.map(ad =>
                          `"${ad.ad_name}","${ad.placement}",${ad.impressions},${ad.unique_impressions},${ad.clicks},${ad.unique_clicks},${ad.ctr}`
                        );
                        rows.push(`"Total","",${adReport.totals.impressions},,${adReport.totals.clicks},,${adReport.totals.ctr}`);
                        const csv = [header, ...rows].join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `ad-report-${adReportConference || 'all'}-${adReportRange}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      Export CSV
                    </button>

                    {/* Generate Report */}
                    <button
                      onClick={() => {
                        const sorted = [...adReport.ads].sort((a, b) =>
                          adReportSort === 'ctr' ? b.ctr - a.ctr : b.impressions - a.impressions
                        );
                        const startDate = new Date(adReport.period.start);
                        const endDate = new Date(adReport.period.end);
                        const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                        const conferenceLine = adReportConference || 'All Conferences';
                        let report = `\uD83D\uDCCA Ad Performance Report \u2014 ${conferenceLine}\n`;
                        report += `Period: ${fmtDate(startDate)} \u2013 ${fmtDate(endDate)}\n\n`;

                        for (const ad of sorted) {
                          const placementLabel = ad.placement === 'native-ad' ? 'Native Ad'
                            : ad.placement === 'sponsor-ticker' ? 'Sponsor Ticker'
                            : ad.placement === 'featured-event' ? 'Featured Event'
                            : ad.placement;
                          report += `${ad.ad_name} (${placementLabel})\n`;
                          report += `  Impressions: ${ad.impressions.toLocaleString()} (${ad.unique_impressions.toLocaleString()} unique)\n`;
                          report += `  Clicks: ${ad.clicks.toLocaleString()} (${ad.unique_clicks.toLocaleString()} unique)\n`;
                          report += `  CTR: ${ad.ctr.toFixed(2)}%\n\n`;
                        }

                        report += `[Total across all ads]\n`;
                        report += `  Impressions: ${adReport.totals.impressions.toLocaleString()}\n`;
                        report += `  Clicks: ${adReport.totals.clicks.toLocaleString()}\n`;
                        report += `  CTR: ${adReport.totals.ctr.toFixed(2)}%\n\n`;
                        report += `Generated by plan.wtf`;

                        navigator.clipboard.writeText(report).then(() => {
                          setAdReportCopied(true);
                          setTimeout(() => setAdReportCopied(false), 2000);
                        });
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                    >
                      {adReportCopied ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <ClipboardCopy className="w-4 h-4" />
                          Generate Report
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* Tab 9: Event Analytics                                        */}
        {/* ============================================================ */}
        {activeTab === 'eventAnalytics' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <MousePointer className="w-5 h-5" />
              Event Click &amp; Impression Analytics
            </h2>

            {/* Filters row */}
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs text-stone-400 mb-1">Conference</label>
                <select
                  value={eventReportConference}
                  onChange={e => setEventReportConference(e.target.value)}
                  className={inputClass + ' w-48'}
                >
                  <option value="">All Conferences</option>
                  {allConferenceTabs.map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-400 mb-1">Date Range</label>
                <select
                  value={eventReportRange}
                  onChange={e => setEventReportRange(e.target.value as typeof eventReportRange)}
                  className={inputClass + ' w-36'}
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="all">All time</option>
                </select>
              </div>
              <button
                onClick={fetchEventReport}
                disabled={eventReportLoading}
                className={btnPrimary + ' flex items-center gap-2'}
              >
                {eventReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                Load Report
              </button>
            </div>

            {/* Results */}
            {eventReport && (
              <div className="space-y-4">
                {/* Period info */}
                <p className="text-xs text-stone-400">
                  Period: {new Date(eventReport.period.start).toLocaleDateString()} &ndash; {new Date(eventReport.period.end).toLocaleDateString()}
                  {eventReportConference && <> &middot; Conference: {eventReportConference}</>}
                </p>

                {/* Table */}
                {eventReport.events.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-stone-400 border-b border-stone-700">
                          <th className="py-2 pr-4"><button className="cursor-pointer hover:text-white" onClick={() => setEventReportSort('event_name')}>Event Name{eventReportSort === 'event_name' ? ' ▼' : ''}</button></th>
                          <th className="py-2 pr-4"><button className="cursor-pointer hover:text-white" onClick={() => setEventReportSort('conference')}>Conference{eventReportSort === 'conference' ? ' ▼' : ''}</button></th>
                          <th className="py-2 pr-4 text-right"><button className="cursor-pointer hover:text-white" onClick={() => setEventReportSort('clicks')}>Clicks{eventReportSort === 'clicks' ? ' ▼' : ''}</button></th>
                          <th className="py-2 pr-4 text-right"><button className="cursor-pointer hover:text-white" onClick={() => setEventReportSort('list_clicks')}>List{eventReportSort === 'list_clicks' ? ' ▼' : ''}</button></th>
                          <th className="py-2 pr-4 text-right"><button className="cursor-pointer hover:text-white" onClick={() => setEventReportSort('table_clicks')}>Table{eventReportSort === 'table_clicks' ? ' ▼' : ''}</button></th>
                          <th className="py-2 pr-4 text-right"><button className="cursor-pointer hover:text-white" onClick={() => setEventReportSort('map_popup_clicks')}>Map{eventReportSort === 'map_popup_clicks' ? ' ▼' : ''}</button></th>
                          <th className="py-2 pr-4 text-right"><button className="cursor-pointer hover:text-white" onClick={() => setEventReportSort('pin_clicks')}>Pin{eventReportSort === 'pin_clicks' ? ' ▼' : ''}</button></th>
                          <th className="py-2 pr-4 text-right"><button className="cursor-pointer hover:text-white" onClick={() => setEventReportSort('impressions')}>Impressions{eventReportSort === 'impressions' ? ' ▼' : ''}</button></th>
                          <th className="py-2 pr-4 text-right"><button className="cursor-pointer hover:text-white" onClick={() => setEventReportSort('ctr')}>CTR{eventReportSort === 'ctr' ? ' ▼' : ''}</button></th>
                          <th className="py-2 text-right"><button className="cursor-pointer hover:text-white" onClick={() => setEventReportSort('last_seen')}>Last Seen{eventReportSort === 'last_seen' ? ' ▼' : ''}</button></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortEvents(eventReport.events)
                          .map(ev => (
                          <tr key={ev.event_id} className="border-b border-stone-800 text-white">
                            <td className="py-2 pr-4 font-medium max-w-[250px] truncate" title={ev.event_name}>{ev.event_name}</td>
                            <td className="py-2 pr-4 text-stone-400 text-xs max-w-[150px] truncate" title={ev.conference}>{ev.conference}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{ev.clicks.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-stone-400">{ev.list_clicks.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-stone-400">{ev.table_clicks.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-stone-400">{ev.map_popup_clicks.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-stone-400">{ev.pin_clicks.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{ev.impressions.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right tabular-nums font-medium text-amber-400">{ev.ctr.toFixed(2)}%</td>
                            <td className="py-2 text-right text-stone-400 text-xs whitespace-nowrap">{ev.last_seen ? new Date(ev.last_seen).toLocaleDateString() : '-'}</td>
                          </tr>
                        ))}
                        {/* Totals row */}
                        <tr className="border-t-2 border-stone-600 text-white font-bold">
                          <td className="py-2 pr-4" colSpan={2}>Total</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{eventReport.totals.clicks.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-stone-400">{eventReport.totals.listClicks.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-stone-400">{eventReport.totals.tableClicks.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-stone-400">{eventReport.totals.mapPopupClicks.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-stone-400">{eventReport.totals.pinClicks.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{eventReport.totals.impressions.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-amber-400">{eventReport.totals.ctr.toFixed(2)}%</td>
                          <td className="py-2"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-stone-500 text-sm py-4">No event tracking data found for this period.</p>
                )}

                {/* Action buttons */}
                {eventReport.events.length > 0 && (
                  <div className="flex flex-wrap gap-3 pt-2">
                    {/* Export CSV */}
                    <button
                      onClick={() => {
                        const sorted = sortEvents(eventReport.events);
                        const header = 'Event Name,Conference,Clicks,List,Table,Map Popup,Pin Clicks,Impressions,Unique Impressions,CTR,Last Seen';
                        const rows = sorted.map(ev =>
                          `"${ev.event_name}","${ev.conference}",${ev.clicks},${ev.list_clicks},${ev.table_clicks},${ev.map_popup_clicks},${ev.pin_clicks},${ev.impressions},${ev.unique_impressions},${ev.ctr},"${ev.last_seen ? new Date(ev.last_seen).toLocaleDateString() : ''}"`
                        );
                        rows.push(`"Total","",${eventReport.totals.clicks},${eventReport.totals.listClicks},${eventReport.totals.tableClicks},${eventReport.totals.mapPopupClicks},${eventReport.totals.pinClicks},${eventReport.totals.impressions},,${eventReport.totals.ctr},`);
                        const csv = [header, ...rows].join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `event-report-${eventReportConference || 'all'}-${eventReportRange}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      Export CSV
                    </button>

                    {/* Generate Report */}
                    <button
                      onClick={() => {
                        const sorted = sortEvents(eventReport.events);
                        const startDate = new Date(eventReport.period.start);
                        const endDate = new Date(eventReport.period.end);
                        const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                        const conferenceLine = eventReportConference || 'All Conferences';
                        let report = `Event Analytics Report \u2014 ${conferenceLine}\n`;
                        report += `Period: ${fmtDate(startDate)} \u2013 ${fmtDate(endDate)}\n\n`;

                        for (const ev of sorted) {
                          report += `${ev.event_name}${ev.conference ? ` (${ev.conference})` : ''}\n`;
                          report += `  Clicks: ${ev.clicks.toLocaleString()} (${ev.unique_clicks.toLocaleString()} unique)\n`;
                          report += `    List: ${ev.list_clicks.toLocaleString()} | Table: ${ev.table_clicks.toLocaleString()} | Map: ${ev.map_popup_clicks.toLocaleString()}\n`;
                          report += `  Pin Clicks: ${ev.pin_clicks.toLocaleString()}\n`;
                          report += `  Impressions: ${ev.impressions.toLocaleString()} (${ev.unique_impressions.toLocaleString()} unique)\n`;
                          report += `  CTR: ${ev.ctr.toFixed(2)}%\n\n`;
                        }

                        report += `[Total across all events]\n`;
                        report += `  Clicks: ${eventReport.totals.clicks.toLocaleString()}\n`;
                        report += `    List: ${eventReport.totals.listClicks.toLocaleString()} | Table: ${eventReport.totals.tableClicks.toLocaleString()} | Map: ${eventReport.totals.mapPopupClicks.toLocaleString()}\n`;
                        report += `  Pin Clicks: ${eventReport.totals.pinClicks.toLocaleString()}\n`;
                        report += `  Impressions: ${eventReport.totals.impressions.toLocaleString()}\n`;
                        report += `  CTR: ${eventReport.totals.ctr.toFixed(2)}%\n\n`;
                        report += `Generated by plan.wtf`;

                        navigator.clipboard.writeText(report).then(() => {
                          setEventReportCopied(true);
                          setTimeout(() => setEventReportCopied(false), 2000);
                        });
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                    >
                      {eventReportCopied ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <ClipboardCopy className="w-4 h-4" />
                          Generate Report
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sponsorData' && (
          <SponsorDataTab allConferenceTabs={allConferenceTabs} password={password} />
        )}
      </div>
    </div>
  );
}
