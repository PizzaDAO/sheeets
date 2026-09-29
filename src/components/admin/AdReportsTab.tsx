'use client';

import { useState, useCallback } from 'react';
import { Loader2, BarChart3, Download, ClipboardCopy, Check } from 'lucide-react';
import type { TabConfig } from '@/lib/conferences';
import { inputClass, btnPrimary } from './styles';

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

interface Props {
  password: string;
  allConferenceTabs: TabConfig[];
}

export default function AdReportsTab({ password, allConferenceTabs }: Props) {
  const [adReport, setAdReport] = useState<AdReportData | null>(null);
  const [adReportLoading, setAdReportLoading] = useState(false);
  const [adReportConference, setAdReportConference] = useState('');
  const [adReportRange, setAdReportRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [adReportSort, setAdReportSort] = useState<'impressions' | 'ctr'>('impressions');
  const [adReportCopied, setAdReportCopied] = useState(false);

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

  return (
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
  );
}
