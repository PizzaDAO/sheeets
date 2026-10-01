#!/usr/bin/env node

/**
 * GA4 HTML Dashboard Generator
 *
 * Generates a self-contained HTML analytics dashboard with Chart.js visualizations.
 * Pulls data from GA4 Data API + Admin API and opens the result in the browser.
 *
 * Usage: node scripts/ga4-dashboard.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const PROPERTY_ID = '524531628';
const TOKEN_PATH = join(homedir(), '.claude', 'ga4-tokens.json');

const DATA_BASE = `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}`;
const ADMIN_BASE = `https://analyticsadmin.googleapis.com/v1alpha/properties/${PROPERTY_ID}`;

// ---------- Token refresh ----------

async function refreshAccessToken() {
  const tokens = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));

  const clientId = process.env.GA4_CLIENT_ID || tokens.client_id;
  const clientSecret = process.env.GA4_CLIENT_SECRET || tokens.client_secret;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing client credentials. Set GA4_CLIENT_ID/GA4_CLIENT_SECRET env vars ' +
        'or add client_id/client_secret to ' +
        TOKEN_PATH,
    );
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  const updated = { ...tokens, ...data };
  writeFileSync(TOKEN_PATH, JSON.stringify(updated, null, 2));
  return data.access_token;
}

// ---------- API helpers ----------

async function runReport(accessToken, body) {
  const res = await fetch(`${DATA_BASE}:runReport`, {
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

async function adminGet(accessToken, path) {
  const res = await fetch(`${ADMIN_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Admin API failed: ${res.status} ${err}`);
  }

  return res.json();
}

// ---------- Data helpers ----------

function extractRows(report) {
  if (!report.rows) return [];
  return report.rows.map((row) => [
    ...row.dimensionValues.map((d) => d.value),
    ...row.metricValues.map((m) => m.value),
  ]);
}

function fmt(n) {
  return Number(n).toLocaleString('en-US');
}

function fmtPct(n) {
  return (Number(n) * 100).toFixed(1) + '%';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- Data fetchers ----------

async function fetchTotals(accessToken) {
  const report = await runReport(accessToken, {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'newUsers' },
      { name: 'bounceRate' },
    ],
  });
  const row = report.rows?.[0];
  if (!row) return { sessions: 0, users: 0, newUsers: 0, bounceRate: 0 };
  return {
    sessions: Number(row.metricValues[0].value),
    users: Number(row.metricValues[1].value),
    newUsers: Number(row.metricValues[2].value),
    bounceRate: Number(row.metricValues[3].value),
  };
}

async function fetchTraffic(accessToken) {
  const report = await runReport(accessToken, {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'sessionSourceMedium' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 15,
  });
  return extractRows(report); // [[source, sessions], ...]
}

async function fetchEvents(accessToken) {
  const report = await runReport(accessToken, {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  });
  return extractRows(report); // [[eventName, count, users], ...]
}

async function fetchFunnelData(accessToken, events) {
  const report = await runReport(accessToken, {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'totalUsers' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: events },
      },
    },
  });
  const rows = extractRows(report);
  const map = Object.fromEntries(rows.map((r) => [r[0], Number(r[1])]));
  // Return in funnel order
  return events.map((e) => ({ step: e, users: map[e] || 0 }));
}

async function fetchConversions(accessToken) {
  const conversionEvents = [
    'auth_success',
    'itinerary',
    'check_in',
    'submit_event_success',
    'onboarding_complete',
    'ad_click',
    'rsvp_confirm',
  ];
  const report = await runReport(accessToken, {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: conversionEvents },
      },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
  });
  return extractRows(report); // [[eventName, count], ...]
}

async function fetchTimeSeries(accessToken) {
  const report = await runReport(accessToken, {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  });
  return extractRows(report); // [[YYYYMMDD, sessions], ...]
}

async function fetchPages(accessToken) {
  const report = await runReport(accessToken, {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 15,
  });
  return extractRows(report); // [[pagePath, views], ...]
}

async function fetchDevices(accessToken) {
  const report = await runReport(accessToken, {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  });
  return extractRows(report); // [[device, sessions], ...]
}

async function fetchAudiences(accessToken) {
  const data = await adminGet(accessToken, 'audiences');
  const allAudiences = data.audiences || [];
  // Filter out built-in audiences (audiences/0 = All Users, audiences/1 = Purchasers)
  return allAudiences.filter(
    (a) => !a.name.includes('audiences/0') && !a.name.includes('audiences/1'),
  );
}

// ---------- HTML generation ----------

function formatDate(yyyymmdd) {
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return `${m}/${d}`;
}

function buildFunnelHtml(title, steps, color) {
  if (!steps || steps.length === 0) {
    return `<div class="card"><h2>${escapeHtml(title)}</h2><p style="color:#64748b;">No data</p></div>`;
  }
  const maxUsers = steps[0].users || 1;
  const bars = steps
    .map((s, i) => {
      const pctOfFirst = maxUsers > 0 ? ((s.users / maxUsers) * 100).toFixed(1) : '0.0';
      const widthPct = Math.max(Number(pctOfFirst), 2); // min 2% so it's visible
      const convLabel = i === 0 ? '100%' : pctOfFirst + '%';
      return `
      <div class="funnel-bar">
        <div class="label">${escapeHtml(s.step)}</div>
        <div class="bar-container">
          <div class="bar" style="width: ${widthPct}%; background: ${color};">${fmt(s.users)} users</div>
        </div>
        <div class="stats">${convLabel}</div>
      </div>`;
    })
    .join('');

  return `<div class="card"><h2>${escapeHtml(title)}</h2>${bars}</div>`;
}

function buildHtml(data) {
  const {
    totals,
    traffic,
    events,
    onboardingFunnel,
    authFunnel,
    engagementFunnel,
    conversions,
    timeSeries,
    pages,
    devices,
    audiences,
  } = data;

  const now = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Prepare chart data
  const tsLabels = JSON.stringify((timeSeries || []).map((r) => formatDate(r[0])));
  const tsValues = JSON.stringify((timeSeries || []).map((r) => Number(r[1])));

  const trafficTop10 = (traffic || []).slice(0, 10);
  const trafficLabels = JSON.stringify(trafficTop10.map((r) => r[0]));
  const trafficValues = JSON.stringify(trafficTop10.map((r) => Number(r[1])));

  const convLabels = JSON.stringify((conversions || []).map((r) => r[0]));
  const convValues = JSON.stringify((conversions || []).map((r) => Number(r[1])));

  const deviceLabels = JSON.stringify((devices || []).map((r) => r[0]));
  const deviceValues = JSON.stringify((devices || []).map((r) => Number(r[1])));
  const deviceColors = JSON.stringify(
    (devices || []).map((_, i) => ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'][i % 5]),
  );

  // Events table (top 20)
  const eventsTop20 = (events || []).slice(0, 20);
  const eventsTableRows = eventsTop20
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r[0])}</td><td style="text-align:right">${fmt(r[1])}</td><td style="text-align:right">${fmt(r[2])}</td></tr>`,
    )
    .join('');

  // Pages table
  const pagesTableRows = (pages || [])
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r[0])}</td><td style="text-align:right">${fmt(r[1])}</td></tr>`,
    )
    .join('');

  // Audiences table
  const audiencesTableRows = (audiences || [])
    .map((a) => {
      const displayName = a.displayName || '';
      const desc = a.description || '';
      const duration = a.membershipDurationDays
        ? a.membershipDurationDays + ' days'
        : 'Unlimited';
      return `<tr><td>${escapeHtml(displayName)}</td><td>${escapeHtml(desc)}</td><td style="text-align:right">${escapeHtml(duration)}</td></tr>`;
    })
    .join('');

  // Funnel HTML
  const onboardingFunnelHtml = buildFunnelHtml('Onboarding Funnel', onboardingFunnel, '#3b82f6');
  const authFunnelHtml = buildFunnelHtml('Auth Funnel', authFunnel, '#8b5cf6');
  const engagementFunnelHtml = buildFunnelHtml('Engagement Funnel', engagementFunnel, '#10b981');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>plan.wtf Analytics Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0f172a; color: #e2e8f0; font-family: system-ui, -apple-system, sans-serif; padding: 24px; }
    .grid { display: grid; gap: 20px; margin-bottom: 20px; }
    .grid-2 { grid-template-columns: 1fr 1fr; }
    .grid-3 { grid-template-columns: 1fr 1fr 1fr; }
    .grid-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
    .card { background: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; }
    .scorecard { text-align: center; }
    .scorecard .value { font-size: 2.5rem; font-weight: 700; color: #3b82f6; }
    .scorecard .label { font-size: 0.875rem; color: #94a3b8; margin-top: 4px; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    .subtitle { color: #64748b; font-size: 0.875rem; margin-bottom: 24px; }
    h2 { font-size: 1rem; color: #94a3b8; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; padding: 8px; color: #94a3b8; border-bottom: 1px solid #334155; }
    td { padding: 8px; border-bottom: 1px solid #1e293b; }
    tr:hover td { background: #334155; }
    .funnel-bar { display: flex; align-items: center; margin-bottom: 8px; }
    .funnel-bar .label { width: 160px; font-size: 0.8rem; color: #94a3b8; flex-shrink: 0; }
    .funnel-bar .bar-container { flex: 1; height: 28px; background: #334155; border-radius: 4px; position: relative; overflow: hidden; }
    .funnel-bar .bar { height: 100%; border-radius: 4px; display: flex; align-items: center; padding-left: 8px; font-size: 0.75rem; font-weight: 600; white-space: nowrap; min-width: fit-content; }
    .funnel-bar .stats { width: 60px; text-align: right; font-size: 0.8rem; color: #94a3b8; flex-shrink: 0; margin-left: 8px; }
    .chart-container { position: relative; width: 100%; }
    .no-data { color: #64748b; font-style: italic; }
    @media (max-width: 768px) {
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <h1>plan.wtf Analytics Dashboard</h1>
  <p class="subtitle">Generated ${escapeHtml(now)} &mdash; Last 30 days</p>

  <!-- Row 1: Scorecards -->
  <div class="grid grid-4">
    <div class="card scorecard">
      <div class="value">${totals ? fmt(totals.sessions) : '--'}</div>
      <div class="label">Total Sessions</div>
    </div>
    <div class="card scorecard">
      <div class="value">${totals ? fmt(totals.users) : '--'}</div>
      <div class="label">Total Users</div>
    </div>
    <div class="card scorecard">
      <div class="value">${totals ? fmt(totals.newUsers) : '--'}</div>
      <div class="label">New Users</div>
    </div>
    <div class="card scorecard">
      <div class="value">${totals ? fmtPct(totals.bounceRate) : '--'}</div>
      <div class="label">Bounce Rate</div>
    </div>
  </div>

  <!-- Row 2: Sessions Over Time + Traffic Sources -->
  <div class="grid grid-2">
    <div class="card">
      <h2>Sessions Over Time</h2>
      <div class="chart-container"><canvas id="sessionsChart"></canvas></div>
    </div>
    <div class="card">
      <h2>Traffic Sources (Top 10)</h2>
      <div class="chart-container"><canvas id="trafficChart"></canvas></div>
    </div>
  </div>

  <!-- Row 3: Funnels -->
  <div class="grid grid-3">
    ${onboardingFunnelHtml}
    ${authFunnelHtml}
    ${engagementFunnelHtml}
  </div>

  <!-- Row 4: Events + Pages tables -->
  <div class="grid grid-2">
    <div class="card">
      <h2>Top Events</h2>
      ${
        eventsTableRows
          ? `<div style="max-height:500px;overflow-y:auto;">
        <table>
          <thead><tr><th>Event Name</th><th style="text-align:right">Count</th><th style="text-align:right">Users</th></tr></thead>
          <tbody>${eventsTableRows}</tbody>
        </table>
      </div>`
          : '<p class="no-data">No data</p>'
      }
    </div>
    <div class="card">
      <h2>Top Pages</h2>
      ${
        pagesTableRows
          ? `<div style="max-height:500px;overflow-y:auto;">
        <table>
          <thead><tr><th>Page Path</th><th style="text-align:right">Views</th></tr></thead>
          <tbody>${pagesTableRows}</tbody>
        </table>
      </div>`
          : '<p class="no-data">No data</p>'
      }
    </div>
  </div>

  <!-- Row 5: Conversions + Device Split -->
  <div class="grid grid-2">
    <div class="card">
      <h2>Conversions</h2>
      <div class="chart-container"><canvas id="conversionsChart"></canvas></div>
    </div>
    <div class="card">
      <h2>Device Split</h2>
      <div class="chart-container" style="max-width:350px;margin:0 auto;"><canvas id="devicesChart"></canvas></div>
    </div>
  </div>

  <!-- Row 6: Audiences -->
  <div class="grid">
    <div class="card">
      <h2>Audiences</h2>
      ${
        audiencesTableRows
          ? `<table>
          <thead><tr><th>Name</th><th>Description</th><th style="text-align:right">Membership Duration</th></tr></thead>
          <tbody>${audiencesTableRows}</tbody>
        </table>`
          : '<p class="no-data">No custom audiences found</p>'
      }
    </div>
  </div>

  <script>
    const chartDefaults = {
      color: '#94a3b8',
      borderColor: '#334155',
    };
    Chart.defaults.color = chartDefaults.color;
    Chart.defaults.borderColor = chartDefaults.borderColor;

    // Sessions Over Time - Line Chart
    new Chart(document.getElementById('sessionsChart'), {
      type: 'line',
      data: {
        labels: ${tsLabels},
        datasets: [{
          label: 'Sessions',
          data: ${tsValues},
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: { grid: { color: '#334155' }, ticks: { maxRotation: 45 } },
          y: { grid: { color: '#334155' }, beginAtZero: true },
        },
      },
    });

    // Traffic Sources - Horizontal Bar Chart
    new Chart(document.getElementById('trafficChart'), {
      type: 'bar',
      data: {
        labels: ${trafficLabels},
        datasets: [{
          label: 'Sessions',
          data: ${trafficValues},
          backgroundColor: '#3b82f6',
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: { grid: { color: '#334155' }, beginAtZero: true },
          y: { grid: { display: false } },
        },
      },
    });

    // Conversions - Bar Chart
    new Chart(document.getElementById('conversionsChart'), {
      type: 'bar',
      data: {
        labels: ${convLabels},
        datasets: [{
          label: 'Event Count',
          data: ${convValues},
          backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f97316'],
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 45 } },
          y: { grid: { color: '#334155' }, beginAtZero: true },
        },
      },
    });

    // Devices - Doughnut Chart
    new Chart(document.getElementById('devicesChart'), {
      type: 'doughnut',
      data: {
        labels: ${deviceLabels},
        datasets: [{
          data: ${deviceValues},
          backgroundColor: ${deviceColors},
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 16, usePointStyle: true },
          },
        },
      },
    });
  </script>
</body>
</html>`;
}

// ---------- Main ----------

async function main() {
  console.log('Refreshing access token...');
  const accessToken = await refreshAccessToken();
  console.log('Token refreshed.\n');

  console.log('Fetching GA4 data (all requests in parallel)...');

  // Fetch all data in parallel with error resilience
  const [
    totals,
    traffic,
    events,
    onboardingFunnel,
    authFunnel,
    engagementFunnel,
    conversions,
    timeSeries,
    pages,
    devices,
    audiences,
  ] = await Promise.all([
    fetchTotals(accessToken).catch((e) => {
      console.warn('  Warning: failed to fetch totals:', e.message);
      return null;
    }),
    fetchTraffic(accessToken).catch((e) => {
      console.warn('  Warning: failed to fetch traffic:', e.message);
      return [];
    }),
    fetchEvents(accessToken).catch((e) => {
      console.warn('  Warning: failed to fetch events:', e.message);
      return [];
    }),
    fetchFunnelData(accessToken, [
      'session_start',
      'onboarding_start',
      'onboarding_step',
      'onboarding_complete',
    ]).catch((e) => {
      console.warn('  Warning: failed to fetch onboarding funnel:', e.message);
      return [];
    }),
    fetchFunnelData(accessToken, ['auth_prompt', 'auth_success']).catch((e) => {
      console.warn('  Warning: failed to fetch auth funnel:', e.message);
      return [];
    }),
    fetchFunnelData(accessToken, [
      'session_start',
      'event_click',
      'itinerary',
      'check_in',
    ]).catch((e) => {
      console.warn('  Warning: failed to fetch engagement funnel:', e.message);
      return [];
    }),
    fetchConversions(accessToken).catch((e) => {
      console.warn('  Warning: failed to fetch conversions:', e.message);
      return [];
    }),
    fetchTimeSeries(accessToken).catch((e) => {
      console.warn('  Warning: failed to fetch time series:', e.message);
      return [];
    }),
    fetchPages(accessToken).catch((e) => {
      console.warn('  Warning: failed to fetch pages:', e.message);
      return [];
    }),
    fetchDevices(accessToken).catch((e) => {
      console.warn('  Warning: failed to fetch devices:', e.message);
      return [];
    }),
    fetchAudiences(accessToken).catch((e) => {
      console.warn('  Warning: failed to fetch audiences:', e.message);
      return [];
    }),
  ]);

  console.log('Data fetched successfully.\n');

  console.log('Generating HTML dashboard...');
  const html = buildHtml({
    totals,
    traffic,
    events,
    onboardingFunnel,
    authFunnel,
    engagementFunnel,
    conversions,
    timeSeries,
    pages,
    devices,
    audiences,
  });

  const outPath = join(process.cwd(), 'ga4-dashboard.html');
  writeFileSync(outPath, html);
  console.log(`Dashboard written to ${outPath}`);

  // Open in browser
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      execSync(`start "" "${outPath}"`, { shell: true });
    } else if (platform === 'darwin') {
      execSync(`open "${outPath}"`);
    } else {
      execSync(`xdg-open "${outPath}"`);
    }
    console.log('Opened in browser.');
  } catch {
    console.log('Could not open browser automatically. Open the file manually.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
