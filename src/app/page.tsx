import Image from 'next/image';
import { getConferenceTabs, getUpcomingConferences } from '@/lib/get-conferences';
import { fetchEventsCached } from '@/lib/fetch-events-cached';
import { NotifyForm } from '@/components/NotifyForm';

// Revalidate every 60s so new conferences appear without a redeploy
export const revalidate = 60;

export const metadata = {
  title: 'plan.wtf — Conference Side Events',
  description:
    'Browse side events for crypto and tech conferences. Filter by date, time, tags, and more.',
};

/**
 * Format a date range from an array of ISO date strings.
 * e.g. ["2026-04-11", ..., "2026-04-17"] -> "Apr 11 – 17, 2026"
 */
function formatDateRange(dates: string[]): string {
  if (dates.length === 0) return '';

  const first = new Date(dates[0] + 'T12:00:00');
  const last = new Date(dates[dates.length - 1] + 'T12:00:00');

  const startMonth = first.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = last.toLocaleDateString('en-US', { month: 'short' });
  const startDay = first.getDate();
  const endDay = last.getDate();
  const year = last.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}\u2013${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} \u2013 ${endMonth} ${endDay}, ${year}`;
}

/** Format start/end ISO dates as a range string */
function formatConfDateRange(startDate: string, endDate: string): string {
  const first = new Date(startDate + 'T12:00:00');
  const last = new Date(endDate + 'T12:00:00');

  const startMonth = first.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = last.toLocaleDateString('en-US', { month: 'short' });
  const startDay = first.getDate();
  const endDay = last.getDate();
  const year = last.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}\u2013${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} \u2013 ${endMonth} ${endDay}, ${year}`;
}

/**
 * Derive a city name from the conference center coordinates.
 */
function getCity(center: { lat: number; lng: number }, timezone: string): string {
  const { lat, lng } = center;

  const cities: [number, number, string][] = [
    [48.8566, 2.3522, 'Paris'],
    [36.1699, -115.1398, 'Las Vegas'],
    [25.7617, -80.1918, 'Miami'],
    [39.7392, -104.9903, 'Denver'],
    [30.2672, -97.7431, 'Austin'],
    [40.7128, -74.006, 'New York'],
    [37.7749, -122.4194, 'San Francisco'],
    [1.3521, 103.8198, 'Singapore'],
    [51.5074, -0.1278, 'London'],
    [52.52, 13.405, 'Berlin'],
    [41.3874, 2.1686, 'Barcelona'],
    [35.6762, 139.6503, 'Tokyo'],
    [13.7563, 100.5018, 'Bangkok'],
    [22.3193, 114.1694, 'Hong Kong'],
    [43.6532, -79.3832, 'Toronto'],
    [47.6062, -122.3321, 'Seattle'],
    [34.0522, -118.2437, 'Los Angeles'],
  ];

  for (const [cLat, cLng, name] of cities) {
    if (Math.abs(lat - cLat) < 0.5 && Math.abs(lng - cLng) < 0.5) return name;
  }

  const city = timezone.split('/').pop()?.replace(/_/g, ' ');
  return city || '';
}

/** Calculate days from now until a date string. Negative = in the past. */
function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Get a human-friendly "days away" label */
function getDaysAwayLabel(startDate: string, endDate: string): string | null {
  const daysToStart = daysUntil(startDate);
  const daysToEnd = daysUntil(endDate);

  if (daysToStart > 0) {
    if (daysToStart === 1) return 'Starts tomorrow';
    return `${daysToStart} days away`;
  }
  if (daysToEnd >= 0) {
    return 'Happening now';
  }
  return null;
}

export default async function Home() {
  const tabs = await getConferenceTabs();
  const upcoming = await getUpcomingConferences();
  const allEvents = await fetchEventsCached();

  // Count events per conference
  const eventCounts = new Map<string, number>();
  for (const event of allEvents) {
    eventCounts.set(event.conference, (eventCounts.get(event.conference) || 0) + 1);
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-16 sm:py-24"
      style={{ backgroundColor: 'var(--theme-bg-primary)' }}
    >
      {/* Logo */}
      <div className="mb-3">
        <Image
          src="/logo.png"
          alt="plan.wtf"
          width={200}
          height={55}
          style={{ filter: 'var(--theme-logo-filter)' }}
          priority
        />
      </div>

      {/* Tagline */}
      <p
        className="text-lg sm:text-xl mb-4 tracking-wide"
        style={{ color: 'var(--theme-text-secondary)' }}
      >
        Conference Side Events
      </p>

      {/* Social links */}
      <div className="flex gap-5 mb-12">
        <a
          href="https://x.com/planwtf"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-opacity hover:opacity-80"
          style={{ color: 'var(--theme-text-muted)' }}
          aria-label="X (Twitter)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
        <a
          href="https://instagram.com/plan.wtf"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-opacity hover:opacity-80"
          style={{ color: 'var(--theme-text-muted)' }}
          aria-label="Instagram"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
        </a>
        <a
          href="https://t.me/+UyEIcianG0djMmFh"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-opacity hover:opacity-80"
          style={{ color: 'var(--theme-text-muted)' }}
          aria-label="Telegram"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
        </a>
        <a
          href="https://www.linkedin.com/company/planwtf/"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-opacity hover:opacity-80"
          style={{ color: 'var(--theme-text-muted)' }}
          aria-label="LinkedIn"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
        </a>
      </div>

      {/* Active conferences */}
      {tabs.length > 0 && (
        <div className="w-full max-w-3xl mb-16">
          <h2
            className="text-sm font-semibold uppercase tracking-wider mb-4"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            Browse Events
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tabs.map((tab) => {
              const city = getCity(tab.center, tab.timezone);
              const dateRange = formatDateRange(tab.dates);
              const count = eventCounts.get(tab.name) || 0;
              const startDate = tab.dates[0];
              const endDate = tab.dates[tab.dates.length - 1];
              const daysLabel = getDaysAwayLabel(startDate, endDate);

              return (
                <a
                  key={tab.slug}
                  href={`/${tab.slug}`}
                  className="group block rounded-xl border p-5 transition-all duration-200 hover:scale-[1.02]"
                  style={{
                    backgroundColor: 'var(--theme-landing-card-bg)',
                    borderColor: 'var(--theme-landing-card-border)',
                  }}
                >
                  <h3
                    className="text-lg font-semibold transition-colors duration-200 mb-1"
                    style={{ color: 'var(--theme-landing-card-text)' }}
                  >
                    <span className="group-hover:opacity-80">{tab.name}</span>
                  </h3>
                  {daysLabel && (
                    <span
                      className="inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-2"
                      style={{
                        backgroundColor: 'transparent',
                        border: daysLabel === 'Happening now'
                          ? '1px solid var(--theme-landing-card-accent)'
                          : '1px solid var(--theme-landing-card-secondary)',
                        color: daysLabel === 'Happening now'
                          ? 'var(--theme-landing-card-accent)'
                          : 'var(--theme-landing-card-secondary)',
                      }}
                    >
                      {daysLabel}
                    </span>
                  )}

                  {dateRange && (
                    <p className="text-sm mb-1" style={{ color: 'var(--theme-landing-card-secondary)' }}>
                      {dateRange}
                    </p>
                  )}

                  {city && (
                    <p className="text-sm" style={{ color: 'var(--theme-landing-card-muted)' }}>
                      {city}
                    </p>
                  )}

                  {count > 0 && (
                    <p
                      className="text-sm font-medium mt-3"
                      style={{ color: 'var(--theme-landing-card-accent)' }}
                    >
                      {count} events
                    </p>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Spreadsheet link */}
      <p className="text-sm mb-8" style={{ color: 'var(--theme-text-muted)' }}>
        Looking for the old sheeets.xyz?{' '}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /data is a redirect (next.config.ts) to an external Google Sheet, so it needs a full-page navigation */}
        <a href="/data" className="underline hover:opacity-80 transition-opacity" style={{ color: 'var(--theme-text-secondary)' }}>
          Find it at plan.wtf/data
        </a>
      </p>

      {/* Upcoming conferences */}
      {upcoming.length > 0 && (
        <div className="w-full max-w-3xl">
          <h2
            className="text-sm font-semibold uppercase tracking-wider mb-4"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            Upcoming
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcoming.map((conf) => {
              const city = getCity(conf.center, conf.timezone);
              const dateRange = formatConfDateRange(conf.startDate, conf.endDate);
              const daysLabel = getDaysAwayLabel(conf.startDate, conf.endDate);

              return (
                <div
                  key={conf.slug}
                  className="rounded-xl border p-5"
                  style={{
                    backgroundColor: 'var(--theme-bg-card)',
                    borderColor: 'var(--theme-border-primary)',
                  }}
                >
                  <h3
                    className="text-lg font-semibold mb-1"
                    style={{ color: 'var(--theme-text-primary)' }}
                  >
                    {conf.name}
                  </h3>
                  {daysLabel && (
                    <span
                      className="inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-2"
                      style={{
                        backgroundColor: 'var(--theme-bg-primary)',
                        color: 'var(--theme-text-secondary)',
                      }}
                    >
                      {daysLabel}
                    </span>
                  )}

                  {dateRange && (
                    <p className="text-sm mb-1" style={{ color: 'var(--theme-text-secondary)' }}>
                      {dateRange}
                    </p>
                  )}

                  {city && (
                    <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                      {city}
                    </p>
                  )}

                  <NotifyForm conferenceSlug={conf.slug} conferenceName={conf.name} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
