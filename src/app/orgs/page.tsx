import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { OrgsContent } from './OrgsContent';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Organizations Directory | plan.wtf',
  description:
    'Discover the organizations behind crypto conference side events. See who sponsors the most events across conferences.',
};

interface AggregatedSponsor {
  name: string;
  sponsorUrl: string | null;
  logoUrl: string | null;
  eventCount: number;
  conferences: string[];
  types: string[];
  events: Array<{ name: string; url: string; conference: string }>;
}

async function getSponsorsData(): Promise<{
  sponsors: AggregatedSponsor[];
  conferences: string[];
  totalEvents: number;
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase
    .from('event_sponsors')
    .select('sponsor_name, sponsor_url, sponsor_logo_url, sponsor_type, event_name, event_url, conference')
    .neq('sponsor_type', 'individual')
    .neq('extraction_method', 'description')
    .order('sponsor_name');

  if (error || !data) return { sponsors: [], conferences: [], totalEvents: 0 };

  // Aggregate by normalized sponsor name
  const map = new Map<string, AggregatedSponsor>();
  const conferenceSet = new Set<string>();
  const eventUrlSet = new Set<string>();

  for (const row of data) {
    conferenceSet.add(row.conference);
    eventUrlSet.add(row.event_url);
    const key = row.sponsor_name.toLowerCase().trim();

    if (!map.has(key)) {
      map.set(key, {
        name: row.sponsor_name,
        sponsorUrl: row.sponsor_url,
        logoUrl: row.sponsor_logo_url,
        eventCount: 0,
        conferences: [],
        types: [],
        events: [],
      });
    }

    const entry = map.get(key)!;
    entry.eventCount++;
    if (row.sponsor_url && !entry.sponsorUrl) entry.sponsorUrl = row.sponsor_url;
    if (row.sponsor_logo_url && !entry.logoUrl) entry.logoUrl = row.sponsor_logo_url;
    if (!entry.conferences.includes(row.conference)) entry.conferences.push(row.conference);
    if (!entry.types.includes(row.sponsor_type)) entry.types.push(row.sponsor_type);
    entry.events.push({
      name: row.event_name,
      url: row.event_url,
      conference: row.conference,
    });
  }

  const sponsors = [...map.values()].sort((a, b) => b.eventCount - a.eventCount);

  return { sponsors, conferences: [...conferenceSet].sort(), totalEvents: eventUrlSet.size };
}

export default async function OrgsPage() {
  const { sponsors, conferences, totalEvents } = await getSponsorsData();

  return (
    <div className="min-h-screen bg-[var(--theme-bg-primary)]">
      <header className="sticky top-0 z-50 flex items-center gap-3 px-4 py-3 bg-[var(--theme-bg-primary)] border-b border-[var(--theme-border-primary)]">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="plan.wtf" width={28} height={28} />
        </Link>
        <span className="text-sm font-medium text-[var(--theme-text-primary)]">
          Organizations
        </span>
      </header>

      <OrgsContent sponsors={sponsors} conferences={conferences} totalEvents={totalEvents} />
    </div>
  );
}
