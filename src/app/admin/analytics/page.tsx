'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Script from 'next/script';
import Link from 'next/link';

const SESSION_KEY = 'sheeets-admin-auth';

interface Audience {
  displayName?: string;
  description?: string;
}

interface PopularEvent {
  event_name: string;
  conference: string;
  clicks: number;
  impressions: number;
  ctr: number;
}

interface EventReportData {
  events: PopularEvent[];
  totals: { clicks: number; impressions: number; ctr: number };
}

interface AnalyticsData {
  totals: {
    activeUsers: string;
    sessions: string;
    pageViews: string;
    avgSessionDuration: string;
    bounceRate: string;
  };
  traffic: string[][];
  events: string[][];
  funnels: string[][];
  conversions: string[][];
  timeSeries: string[][];
  pages: string[][];
  devices: string[][];
  audiences: Audience[];
  realtime: {
    activeUsers: number;
    minutesAgo: string[][];
    topPages: string[][];
  } | null;
}

const FUNNEL_ORDER = [
  'session_start',
  'onboarding_start',
  'onboarding_complete',
  'auth_prompt',
  'auth_success',
  'itinerary',
  'check_in',
  'submit_event_open',
  'submit_event_success',
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export default function AnalyticsPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [popularEvents, setPopularEvents] = useState<EventReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const timeSeriesCanvasRef = useRef<HTMLCanvasElement>(null);
  const devicesCanvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timeSeriesChartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const devicesChartRef = useRef<any>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved && saved !== 'true') {
      setAuthed(true);
      setPassword(saved);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsRes, eventsRes] = await Promise.all([
        fetch(`/api/admin/analytics?password=${encodeURIComponent(password)}`),
        fetch(`/api/events/report?password=${encodeURIComponent(password)}`),
      ]);
      if (!analyticsRes.ok) {
        const err = await analyticsRes.json();
        throw new Error(err.error || `HTTP ${analyticsRes.status}`);
      }
      const json = await analyticsRes.json();
      setData(json);
      if (eventsRes.ok) {
        const eventsJson = await eventsRes.json();
        setPopularEvents(eventsJson);
      }
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    if (authed) {
      fetchData();
    }
  }, [authed, fetchData]);

  // Time series chart
  useEffect(() => {
    if (!chartReady || !data?.timeSeries || !timeSeriesCanvasRef.current) return;

    // Destroy previous chart
    if (timeSeriesChartRef.current) {
      timeSeriesChartRef.current.destroy();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Chart = (window as any).Chart;
    if (!Chart) return;

    const labels = data.timeSeries.map((row) => {
      const d = row[0];
      return `${d.slice(4, 6)}/${d.slice(6, 8)}`;
    });
    const users = data.timeSeries.map((row) => parseInt(row[1], 10));
    const sessions = data.timeSeries.map((row) => parseInt(row[2], 10));

    timeSeriesChartRef.current = new Chart(timeSeriesCanvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Users',
            data: users,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.1)',
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Sessions',
            data: sessions,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.1)',
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#fff' } },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#fff' },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#fff' },
          },
        },
      },
    });

    return () => {
      if (timeSeriesChartRef.current) {
        timeSeriesChartRef.current.destroy();
        timeSeriesChartRef.current = null;
      }
    };
  }, [chartReady, data?.timeSeries]);

  // Devices chart
  useEffect(() => {
    if (!chartReady || !data?.devices || !devicesCanvasRef.current) return;

    if (devicesChartRef.current) {
      devicesChartRef.current.destroy();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Chart = (window as any).Chart;
    if (!Chart) return;

    const labels = data.devices.map((row) => row[0]);
    const sessions = data.devices.map((row) => parseInt(row[1], 10));
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    devicesChartRef.current = new Chart(devicesCanvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Sessions',
            data: sessions,
            backgroundColor: colors.slice(0, labels.length),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#fff' },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#fff' },
          },
        },
      },
    });

    return () => {
      if (devicesChartRef.current) {
        devicesChartRef.current.destroy();
        devicesChartRef.current = null;
      }
    };
  }, [chartReady, data?.devices]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) {
      setAuthed(true);
      sessionStorage.setItem(SESSION_KEY, password);
    } else {
      setError('Wrong password');
    }
  }

  // Login form
  if (!authed) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="bg-stone-900 border border-stone-700 rounded-xl p-6 w-full max-w-sm"
        >
          <h1 className="text-lg font-bold text-white mb-4">
            Analytics Dashboard
          </h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2 rounded-lg bg-stone-800 border border-stone-600 text-white placeholder-stone-400 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors"
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  // Loading state
  if (loading && !data) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-stone-400 text-sm">Loading analytics...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-red-700 rounded-xl p-6 w-full max-w-md text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Build sorted funnel data
  const funnelMap = new Map(
    data.funnels.map((row) => [row[0], { count: row[1], users: row[2] }])
  );
  const sortedFunnel = FUNNEL_ORDER.filter((name) => funnelMap.has(name)).map(
    (name) => ({
      name,
      ...funnelMap.get(name)!,
    })
  );
  const maxFunnelCount = Math.max(
    ...sortedFunnel.map((f) => parseInt(f.count, 10)),
    1
  );

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <Script
        src="https://cdn.jsdelivr.net/npm/chart.js"
        onLoad={() => setChartReady(true)}
      />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link
                href="/admin"
                className="text-stone-400 hover:text-white transition-colors text-sm"
              >
                &larr; Admin
              </Link>
            </div>
            <h1 className="text-2xl font-bold">GA4 Analytics Dashboard</h1>
          </div>
          {lastUpdated && (
            <p className="text-stone-400 text-sm">
              Updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Live Activity */}
        {data.realtime && (
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-4 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <h2 className="text-lg font-semibold">Live</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Active users now */}
              <div className="text-center">
                <p className="text-4xl font-bold text-green-400">{data.realtime.activeUsers}</p>
                <p className="text-stone-400 text-sm mt-1">active users right now</p>
              </div>

              {/* Minutes ago sparkline - simple bar chart */}
              <div>
                <p className="text-xs text-stone-400 uppercase tracking-wide mb-2">Active Users (last 30 min)</p>
                <div className="flex items-end gap-px h-16">
                  {data.realtime.minutesAgo.slice(0, 30).reverse().map((row, i) => {
                    const count = parseInt(row[1], 10);
                    const max = Math.max(...data.realtime!.minutesAgo.map(r => parseInt(r[1], 10)), 1);
                    const height = (count / max) * 100;
                    return (
                      <div
                        key={i}
                        className="flex-1 bg-green-500/60 rounded-t-sm min-h-[2px]"
                        style={{ height: `${height}%` }}
                        title={`${row[0]} min ago: ${count} users`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Top pages right now */}
              <div>
                <p className="text-xs text-stone-400 uppercase tracking-wide mb-2">Top Pages Now</p>
                <div className="space-y-1">
                  {data.realtime.topPages.slice(0, 5).map((row, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs truncate mr-2">{row[0]}</span>
                      <span className="text-green-400 font-medium shrink-0">{row[1]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scorecards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-4">
            <p className="text-stone-400 text-xs uppercase tracking-wide mb-1">
              Active Users
            </p>
            <p className="text-2xl font-bold">
              {parseInt(data.totals.activeUsers, 10).toLocaleString()}
            </p>
          </div>
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-4">
            <p className="text-stone-400 text-xs uppercase tracking-wide mb-1">
              Sessions
            </p>
            <p className="text-2xl font-bold">
              {parseInt(data.totals.sessions, 10).toLocaleString()}
            </p>
          </div>
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-4">
            <p className="text-stone-400 text-xs uppercase tracking-wide mb-1">
              Page Views
            </p>
            <p className="text-2xl font-bold">
              {parseInt(data.totals.pageViews, 10).toLocaleString()}
            </p>
          </div>
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-4">
            <p className="text-stone-400 text-xs uppercase tracking-wide mb-1">
              Avg Session
            </p>
            <p className="text-2xl font-bold">
              {formatDuration(parseFloat(data.totals.avgSessionDuration))}
            </p>
          </div>
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-4">
            <p className="text-stone-400 text-xs uppercase tracking-wide mb-1">
              Bounce Rate
            </p>
            <p className="text-2xl font-bold">
              {formatPercent(parseFloat(data.totals.bounceRate))}
            </p>
          </div>
        </div>

        {/* Popular Listed Events */}
        {popularEvents && popularEvents.events.length > 0 && (
          <div className="bg-stone-900 rounded-xl overflow-hidden mb-8">
            <div className="px-4 py-3 border-b border-stone-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Popular Listed Events</h2>
              <span className="text-xs text-stone-400">
                {popularEvents.totals.clicks.toLocaleString()} total clicks &middot;{' '}
                {popularEvents.totals.impressions.toLocaleString()} impressions &middot;{' '}
                {popularEvents.totals.ctr}% CTR
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-800 text-stone-400 text-left">
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">Event Name</th>
                    <th className="px-4 py-2">Conference</th>
                    <th className="px-4 py-2 text-right">Clicks</th>
                    <th className="px-4 py-2 text-right">Impressions</th>
                    <th className="px-4 py-2 text-right">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {popularEvents.events
                    .sort((a, b) => b.clicks - a.clicks)
                    .slice(0, 25)
                    .map((evt, i) => (
                      <tr
                        key={i}
                        className={
                          i % 2 === 0 ? 'bg-stone-900' : 'bg-stone-900/50'
                        }
                      >
                        <td className="px-4 py-2 text-stone-500 text-xs">
                          {i + 1}
                        </td>
                        <td className="px-4 py-2 text-xs max-w-xs truncate">
                          {evt.event_name}
                        </td>
                        <td className="px-4 py-2 text-xs text-stone-400">
                          {evt.conference}
                        </td>
                        <td className="px-4 py-2 text-right font-medium">
                          {evt.clicks.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right text-stone-400">
                          {evt.impressions.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right text-stone-400">
                          {evt.ctr}%
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Traffic Sources */}
        <div className="bg-stone-900 rounded-xl overflow-hidden mb-8">
          <h2 className="text-lg font-semibold px-4 py-3 border-b border-stone-700">
            Traffic Sources
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-800 text-stone-400 text-left">
                  <th className="px-4 py-2">Source / Medium</th>
                  <th className="px-4 py-2 text-right">Sessions</th>
                  <th className="px-4 py-2 text-right">Users</th>
                  <th className="px-4 py-2 text-right">Bounce Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.traffic.map((row, i) => (
                  <tr
                    key={i}
                    className={
                      i % 2 === 0 ? 'bg-stone-900' : 'bg-stone-900/50'
                    }
                  >
                    <td className="px-4 py-2 font-mono text-xs">{row[0]}</td>
                    <td className="px-4 py-2 text-right">
                      {parseInt(row[1], 10).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {parseInt(row[2], 10).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatPercent(parseFloat(row[3]))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Time Series Chart */}
        <div className="bg-stone-900 border border-stone-700 rounded-xl p-4 mb-8">
          <h2 className="text-lg font-semibold mb-4">
            Users &amp; Sessions (30 days)
          </h2>
          <div className="h-72">
            <canvas ref={timeSeriesCanvasRef} />
          </div>
        </div>

        {/* Funnel */}
        <div className="bg-stone-900 border border-stone-700 rounded-xl p-4 mb-8">
          <h2 className="text-lg font-semibold mb-4">Funnel</h2>
          <div className="space-y-2">
            {sortedFunnel.map((step, i) => {
              const count = parseInt(step.count, 10);
              const prevCount =
                i > 0 ? parseInt(sortedFunnel[i - 1].count, 10) : count;
              const conversionRate =
                i > 0 && prevCount > 0 ? count / prevCount : 1;
              const barWidth = (count / maxFunnelCount) * 100;

              return (
                <div key={step.name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-mono text-xs">{step.name}</span>
                    <span className="text-stone-400 text-xs">
                      {count.toLocaleString()} events &middot;{' '}
                      {parseInt(step.users, 10).toLocaleString()} users
                      {i > 0 && (
                        <span className="ml-2 text-yellow-400">
                          {formatPercent(conversionRate)} from prev
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="w-full bg-stone-800 rounded-full h-3">
                    <div
                      className="bg-blue-500 h-3 rounded-full transition-all"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Events Table */}
        <div className="bg-stone-900 rounded-xl overflow-hidden mb-8">
          <h2 className="text-lg font-semibold px-4 py-3 border-b border-stone-700">
            Top Events
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-800 text-stone-400 text-left">
                  <th className="px-4 py-2">Event Name</th>
                  <th className="px-4 py-2 text-right">Count</th>
                  <th className="px-4 py-2 text-right">Users</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((row, i) => (
                  <tr
                    key={i}
                    className={
                      i % 2 === 0 ? 'bg-stone-900' : 'bg-stone-900/50'
                    }
                  >
                    <td className="px-4 py-2 font-mono text-xs">{row[0]}</td>
                    <td className="px-4 py-2 text-right">
                      {parseInt(row[1], 10).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {parseInt(row[2], 10).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Pages */}
        <div className="bg-stone-900 rounded-xl overflow-hidden mb-8">
          <h2 className="text-lg font-semibold px-4 py-3 border-b border-stone-700">
            Top Pages
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-800 text-stone-400 text-left">
                  <th className="px-4 py-2">Page Path</th>
                  <th className="px-4 py-2 text-right">Views</th>
                  <th className="px-4 py-2 text-right">Users</th>
                </tr>
              </thead>
              <tbody>
                {data.pages.map((row, i) => (
                  <tr
                    key={i}
                    className={
                      i % 2 === 0 ? 'bg-stone-900' : 'bg-stone-900/50'
                    }
                  >
                    <td className="px-4 py-2 font-mono text-xs">{row[0]}</td>
                    <td className="px-4 py-2 text-right">
                      {parseInt(row[1], 10).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {parseInt(row[2], 10).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Conversions */}
        <div className="bg-stone-900 border border-stone-700 rounded-xl p-4 mb-8">
          <h2 className="text-lg font-semibold mb-4">Conversions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.conversions.map((row, i) => (
              <div
                key={i}
                className="bg-stone-800 rounded-lg p-3 flex items-center justify-between"
              >
                <span className="font-mono text-xs">{row[0]}</span>
                <div className="text-right">
                  <p className="text-sm font-bold">
                    {parseInt(row[1], 10).toLocaleString()}
                  </p>
                  <p className="text-xs text-stone-400">
                    {parseInt(row[2], 10).toLocaleString()} users
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Devices */}
        <div className="bg-stone-900 border border-stone-700 rounded-xl p-4 mb-8">
          <h2 className="text-lg font-semibold mb-4">Devices</h2>
          <div className="h-48">
            <canvas ref={devicesCanvasRef} />
          </div>
        </div>

        {/* Audiences */}
        {data.audiences.length > 0 && (
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-4 mb-8">
            <h2 className="text-lg font-semibold mb-4">Audiences</h2>
            <div className="space-y-3">
              {data.audiences.map((audience, i) => (
                <div key={i} className="bg-stone-800 rounded-lg p-3">
                  <p className="font-medium text-sm">
                    {audience.displayName ?? 'Unnamed audience'}
                  </p>
                  {audience.description && (
                    <p className="text-xs text-stone-400 mt-1">
                      {audience.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
