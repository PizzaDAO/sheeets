'use client';

import { useState, useCallback } from 'react';
import { Loader2, BarChart3, MousePointer, Download, ClipboardCopy, Check } from 'lucide-react';
import type { TabConfig } from '@/lib/conferences';
import { inputClass, btnPrimary } from './styles';

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
type EventReportSortKey = 'clicks' | 'ctr' | 'pin_clicks' | 'list_clicks' | 'table_clicks' | 'map_popup_clicks' | 'impressions' | 'last_seen' | 'event_name' | 'conference';

interface Props {
  password: string;
  allConferenceTabs: TabConfig[];
}

export default function EventAnalyticsTab({ password, allConferenceTabs }: Props) {
  const [eventReport, setEventReport] = useState<EventReportData | null>(null);
  const [eventReportLoading, setEventReportLoading] = useState(false);
  const [eventReportConference, setEventReportConference] = useState('');
  const [eventReportRange, setEventReportRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
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

  return (
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
  );
}
