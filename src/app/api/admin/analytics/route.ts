import { NextRequest, NextResponse } from 'next/server';
import { isAdminPassword } from '@/lib/admin-auth';

const PROPERTY_ID = '524531628';
const DATA_API = `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}`;
const ADMIN_API = `https://analyticsadmin.googleapis.com/v1alpha/properties/${PROPERTY_ID}`;

async function refreshAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GA4_CLIENT_ID!,
      client_secret: process.env.GA4_CLIENT_SECRET!,
      refresh_token: process.env.GA4_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function runReport(accessToken: string, body: Record<string, unknown>) {
  const res = await fetch(`${DATA_API}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`runReport failed: ${res.status} ${err}`);
  }
  return res.json();
}

interface DimensionValue {
  value: string;
}

interface MetricValue {
  value: string;
}

interface ReportRow {
  dimensionValues?: DimensionValue[];
  metricValues?: MetricValue[];
}

interface Report {
  rows?: ReportRow[];
}

function extractRows(report: Report): string[][] {
  if (!report.rows) return [];
  return report.rows.map((row) => [
    ...(row.dimensionValues ?? []).map((d) => d.value),
    ...(row.metricValues ?? []).map((m) => m.value),
  ]);
}

const dateRange = {
  dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
};

export async function GET(req: NextRequest) {
  const password = req.nextUrl.searchParams.get('password');
  if (!isAdminPassword(password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const accessToken = await refreshAccessToken();

    const [
      totalsReport,
      trafficReport,
      eventsReport,
      funnelsReport,
      conversionsReport,
      timeSeriesReport,
      pagesReport,
      devicesReport,
      audiencesRes,
      realtimeActiveRes,
      realtimeMinutesRes,
      realtimeTopPagesRes,
    ] = await Promise.all([
      // a. Totals
      runReport(accessToken, {
        ...dateRange,
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' },
        ],
      }),
      // b. Traffic
      runReport(accessToken, {
        ...dateRange,
        dimensions: [{ name: 'sessionSourceMedium' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'bounceRate' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 20,
      }),
      // c. Events
      runReport(accessToken, {
        ...dateRange,
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 50,
      }),
      // d. Funnels
      runReport(accessToken, {
        ...dateRange,
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: {
              values: [
                'session_start',
                'onboarding_start',
                'onboarding_complete',
                'auth_prompt',
                'auth_success',
                'itinerary',
                'check_in',
                'submit_event_open',
                'submit_event_success',
              ],
            },
          },
        },
      }),
      // e. Conversions
      runReport(accessToken, {
        ...dateRange,
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: {
              values: [
                'auth_success',
                'itinerary',
                'check_in',
                'submit_event_success',
                'onboarding_complete',
                'ad_click',
                'rsvp_confirm',
              ],
            },
          },
        },
      }),
      // f. Time Series
      runReport(accessToken, {
        ...dateRange,
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      // g. Pages
      runReport(accessToken, {
        ...dateRange,
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
        orderBys: [
          { metric: { metricName: 'screenPageViews' }, desc: true },
        ],
        limit: 20,
      }),
      // h. Devices
      runReport(accessToken, {
        ...dateRange,
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      }),
      // i. Audiences (Admin API)
      fetch(`${ADMIN_API}/audiences`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      // j. Realtime: active users
      fetch(`${DATA_API}:runRealtimeReport`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metrics: [{ name: 'activeUsers' }],
        }),
      }),
      // k. Realtime: minutes ago sparkline
      fetch(`${DATA_API}:runRealtimeReport`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dimensions: [{ name: 'minutesAgo' }],
          metrics: [{ name: 'activeUsers' }],
          orderBys: [{ dimension: { dimensionName: 'minutesAgo' } }],
        }),
      }),
      // l. Realtime: top pages
      fetch(`${DATA_API}:runRealtimeReport`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dimensions: [{ name: 'unifiedScreenName' }],
          metrics: [{ name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: 10,
        }),
      }),
    ]);

    // Process audiences
    let audiences = [];
    if (audiencesRes.ok) {
      const audiencesData = await audiencesRes.json();
      audiences = audiencesData.audiences ?? [];
    }

    // Process realtime data (graceful fallback if unavailable)
    let realtime = null;
    try {
      if (realtimeActiveRes.ok && realtimeMinutesRes.ok && realtimeTopPagesRes.ok) {
        const realtimeActiveData: Report = await realtimeActiveRes.json();
        const realtimeMinutesData: Report = await realtimeMinutesRes.json();
        const realtimeTopPagesData: Report = await realtimeTopPagesRes.json();

        const activeUsersRow = realtimeActiveData.rows?.[0]?.metricValues;
        realtime = {
          activeUsers: parseInt(activeUsersRow?.[0]?.value ?? '0', 10),
          minutesAgo: extractRows(realtimeMinutesData),
          topPages: extractRows(realtimeTopPagesData),
        };
      }
    } catch {
      // Realtime API may not be available — leave as null
      realtime = null;
    }

    // Extract totals from first row
    const totalsRow = totalsReport.rows?.[0]?.metricValues ?? [];
    const totals = {
      activeUsers: totalsRow[0]?.value ?? '0',
      sessions: totalsRow[1]?.value ?? '0',
      pageViews: totalsRow[2]?.value ?? '0',
      avgSessionDuration: totalsRow[3]?.value ?? '0',
      bounceRate: totalsRow[4]?.value ?? '0',
    };

    return NextResponse.json({
      totals,
      traffic: extractRows(trafficReport),
      events: extractRows(eventsReport),
      funnels: extractRows(funnelsReport),
      conversions: extractRows(conversionsReport),
      timeSeries: extractRows(timeSeriesReport),
      pages: extractRows(pagesReport),
      devices: extractRows(devicesReport),
      audiences,
      realtime,
    });
  } catch (err) {
    console.error('GA4 analytics error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
