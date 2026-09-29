'use client';

import { useState, useMemo } from 'react';
import { Search, ExternalLink, ChevronDown, ChevronUp, Building2, Users, Presentation } from 'lucide-react';
import { isSafeHttpUrl } from '@/lib/utils';

interface AggregatedSponsor {
  name: string;
  sponsorUrl: string | null;
  logoUrl: string | null;
  eventCount: number;
  conferences: string[];
  types: string[];
  events: Array<{ name: string; url: string; conference: string }>;
}

interface Props {
  sponsors: AggregatedSponsor[];
  conferences: string[];
  totalEvents: number;
}

function typeIcon(types: string[]) {
  if (types.includes('host')) return <Users className="w-3.5 h-3.5" />;
  if (types.includes('presenter')) return <Presentation className="w-3.5 h-3.5" />;
  return <Building2 className="w-3.5 h-3.5" />;
}

function typeLabel(types: string[]): string {
  if (types.includes('host') && types.includes('sponsor')) return 'Host & Sponsor';
  if (types.includes('host')) return 'Host';
  if (types.includes('sponsor')) return 'Sponsor';
  if (types.includes('partner')) return 'Partner';
  if (types.includes('presenter')) return 'Presenter';
  return types[0] || 'Sponsor';
}

export function OrgsContent({ sponsors, conferences, totalEvents }: Props) {
  const [search, setSearch] = useState('');
  const [conferenceFilter, setConferenceFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedSponsor, setExpandedSponsor] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return sponsors.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (conferenceFilter !== 'all' && !s.conferences.includes(conferenceFilter)) return false;
      if (typeFilter !== 'all' && !s.types.includes(typeFilter)) return false;
      return true;
    });
  }, [sponsors, search, conferenceFilter, typeFilter]);

  const stats = useMemo(() => {
    const uniqueSponsors = filtered.length;
    const totalAssociations = filtered.reduce((sum, s) => sum + s.eventCount, 0);
    const hostCount = filtered.filter((s) => s.types.includes('host')).length;
    return { uniqueSponsors, totalAssociations, hostCount };
  }, [filtered]);

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-lg border border-[var(--theme-border-primary)] p-3 text-center">
          <div className="text-2xl font-bold text-[var(--theme-text-primary)]">
            {totalEvents}
          </div>
          <div className="text-xs text-[var(--theme-text-secondary)]">Events</div>
        </div>
        <div className="rounded-lg border border-[var(--theme-border-primary)] p-3 text-center">
          <div className="text-2xl font-bold text-[var(--theme-text-primary)]">
            {stats.uniqueSponsors}
          </div>
          <div className="text-xs text-[var(--theme-text-secondary)]">Organizations</div>
        </div>
        <div className="rounded-lg border border-[var(--theme-border-primary)] p-3 text-center">
          <div className="text-2xl font-bold text-[var(--theme-text-primary)]">
            {conferences.length}
          </div>
          <div className="text-xs text-[var(--theme-text-secondary)]">Conferences</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-secondary)]" />
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-secondary)]"
          />
        </div>
        <select
          value={conferenceFilter}
          onChange={(e) => setConferenceFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)]"
        >
          <option value="all">All Conferences</option>
          {conferences.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)]"
        >
          <option value="all">All Types</option>
          <option value="host">Hosts</option>
          <option value="sponsor">Sponsors</option>
          <option value="partner">Partners</option>
          <option value="presenter">Presenters</option>
        </select>
      </div>

      {/* Sponsor List */}
      <div className="space-y-1">
        {filtered.slice(0, 100).map((sponsor) => {
          const isExpanded = expandedSponsor === sponsor.name;
          return (
            <div
              key={sponsor.name}
              className="rounded-lg border border-[var(--theme-border-primary)] overflow-hidden"
            >
              <button
                onClick={() => setExpandedSponsor(isExpanded ? null : sponsor.name)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--theme-bg-secondary)] transition-colors"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)]">
                  {typeIcon(sponsor.types)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-[var(--theme-text-primary)] truncate">
                      {sponsor.name}
                    </span>
                    {isSafeHttpUrl(sponsor.sponsorUrl) && (
                      <a
                        href={sponsor.sponsorUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--theme-text-secondary)]">
                    <span>{typeLabel(sponsor.types)}</span>
                    <span>·</span>
                    <span>{sponsor.eventCount} event{sponsor.eventCount !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>{sponsor.conferences.join(', ')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-[var(--theme-text-primary)]">
                    {sponsor.eventCount}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-[var(--theme-text-secondary)]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[var(--theme-text-secondary)]" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-3 border-t border-[var(--theme-border-primary)]">
                  <div className="pt-2 space-y-1">
                    {sponsor.events.map((event, i) => (
                      <a
                        key={i}
                        href={isSafeHttpUrl(event.url) ? event.url : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 py-1.5 px-2 rounded text-xs hover:bg-[var(--theme-bg-secondary)] transition-colors"
                      >
                        <ExternalLink className="w-3 h-3 text-[var(--theme-text-secondary)] flex-shrink-0" />
                        <span className="text-[var(--theme-text-primary)] truncate flex-1">
                          {event.name}
                        </span>
                        <span className="text-[var(--theme-text-secondary)] flex-shrink-0">
                          {event.conference}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length > 100 && (
        <p className="text-center text-sm text-[var(--theme-text-secondary)] mt-4">
          Showing top 100 of {filtered.length} results. Use search to narrow down.
        </p>
      )}

      {filtered.length === 0 && (
        <p className="text-center text-sm text-[var(--theme-text-secondary)] py-12">
          No organizations found matching your filters.
        </p>
      )}
    </main>
  );
}
