'use client';

import { useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useAdminConfig } from '@/hooks/useAdminConfig';
import { useABTest } from '@/hooks/useABTest';
import { EVENT_TABS } from '@/lib/constants';
import { isSafeLinkUrl } from '@/lib/utils';
import type { ABTest, AdInventoryItem, AdvertisePageConfig, SponsorshipTier } from '@/lib/types';
import { Check, ArrowRight, Loader2, MapPin, ChevronDown } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Defaults (used when no admin config exists yet)                    */
/* ------------------------------------------------------------------ */

const DEFAULT_PAGE_CONFIG: AdvertisePageConfig = {
  heroHeading: 'Reach Crypto Conference Attendees',
  heroSubheading:
    'plan.wtf is the go-to guide for thousands of attendees at every major crypto conference. Put your brand, event, or product in front of the people who matter most.',
  statsLine: '10,000+ monthly users across ETH Denver, Consensus, ETHCC, and more',
  ctaText: 'Get in Touch',
  ctaUrl: 'mailto:ads@plan.wtf',
  ctaSecondaryText: 'View Media Kit',
  ctaSecondaryUrl: '',
  footerText: 'Questions? Reach out at ads@plan.wtf',
  tiersEnabled: true,
  tiers: [
    {
      name: 'Silver',
      price: '$500',
      features: [
        'Sponsor ticker listing',
        '1 sponsored event card',
        'Logo on site during conference',
      ],
      highlighted: false,
    },
    {
      name: 'Gold',
      price: '$2,000',
      features: [
        'Sponsor ticker (prominent)',
        '3 sponsored event cards',
        '1 sponsored map pin',
        'Brand in shared itineraries',
      ],
      highlighted: true,
    },
    {
      name: 'Presenting',
      price: '$5,000+',
      features: [
        'Top billing in ticker',
        '5 sponsored event cards',
        '3 sponsored map pins',
        'Itinerary banner',
        'Logo on shared itineraries',
        'Custom placement options',
      ],
      highlighted: false,
    },
  ],
};

const DEFAULT_INVENTORY: AdInventoryItem[] = [
  {
    id: 'sponsor-ticker',
    title: 'Sponsor Ticker',
    slug: 'sponsor-ticker',
    description:
      'Scrolling banner at the top of every page. High visibility with minimal disruption. Your brand message + clickable link seen by every user.',
    price: 'From $500',
    priceNote: 'per conference',
    stats: 'Seen by 100% of users',
    features: [
      'Custom message + link',
      'Runs across all pages',
      'Per-conference targeting',
    ],
    available: true,
    sortOrder: 1,
  },
  {
    id: 'sponsored-event-card',
    title: 'Sponsored Event Card',
    slug: 'sponsored-event-card',
    description:
      'Native ad that blends into the event listing. Same layout as real events with a subtle "Sponsored" badge. Highest engagement placement.',
    price: 'From $200',
    priceNote: 'per card per conference',
    stats: 'Avg 3.2% CTR',
    features: [
      'Native look and feel',
      'Image, title, description, CTA',
      'Inserted into event listings',
      'Per-conference or global',
    ],
    available: true,
    sortOrder: 2,
  },
  {
    id: 'sponsored-map-pin',
    title: 'Sponsored Map Pin',
    slug: 'sponsored-map-pin',
    description:
      'Branded pin on the interactive map. Perfect for venues, afterparties, and nearby businesses. Clicking opens a rich popup with your details.',
    price: 'From $300',
    priceNote: 'per pin per conference',
    stats: 'Location-aware targeting',
    features: [
      'Branded map marker',
      'Rich popup with CTA',
      'Location-based relevance',
      'Limited to 5 per conference',
    ],
    available: true,
    sortOrder: 3,
  },
  {
    id: 'featured-event',
    title: 'Featured Event Listing',
    slug: 'featured-event',
    description:
      'Boost your event to the top of all listings with a highlighted card and star badge. Shown first in search results and date groups.',
    price: '$50',
    priceNote: 'per event',
    features: [
      'Priority positioning',
      'Star badge highlight',
      'Boosted in search results',
    ],
    available: true,
    sortOrder: 4,
  },
  {
    id: 'itinerary-banner',
    title: 'Itinerary Sponsor Banner',
    slug: 'itinerary-banner',
    description:
      'Banner on the itinerary page and shared itinerary links. Your brand travels with every shared itinerary -- viral distribution built in.',
    price: '$1,000',
    priceNote: 'per conference',
    stats: 'Viral via shared links',
    features: [
      'Shown on personal itineraries',
      'Included in shared links',
      'Full-width banner format',
    ],
    available: true,
    sortOrder: 5,
  },
  {
    id: 'custom-package',
    title: 'Custom Package',
    slug: 'custom',
    description:
      'Need something specific? We work with sponsors to create custom integrations and placements that fit your goals and budget.',
    price: 'Custom',
    features: [
      'Tailored to your needs',
      'Multi-conference deals',
      'Analytics & reporting',
      'Dedicated support',
    ],
    badge: 'Contact Us',
    available: true,
    sortOrder: 99,
  },
];

/* ------------------------------------------------------------------ */
/*  Inventory Card                                                     */
/* ------------------------------------------------------------------ */

function InventoryCard({ item }: { item: AdInventoryItem }) {
  return (
    <div
      className={`relative bg-stone-900/60 border rounded-xl p-5 flex flex-col transition-colors hover:border-amber-500/40 ${
        item.available
          ? 'border-stone-700'
          : 'border-stone-800 opacity-60'
      }`}
    >
      {item.badge && (
        <span className="absolute -top-2.5 right-4 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-stone-900 rounded-full">
          {item.badge}
        </span>
      )}

      <h3 className="text-lg font-semibold text-white mb-1">
        {item.title}
      </h3>

      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-xl font-bold text-amber-400">
          {item.price}
        </span>
        {item.priceNote && (
          <span className="text-xs text-stone-500">{item.priceNote}</span>
        )}
      </div>

      {item.stats && (
        <p className="text-xs text-amber-400/80 font-medium mb-3">
          {item.stats}
        </p>
      )}

      <p className="text-sm text-stone-400 mb-4 flex-1">
        {item.description}
      </p>

      <ul className="space-y-1.5 mb-4">
        {item.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-stone-300">
            <Check className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {!item.available && (
        <span className="text-xs text-stone-500 font-medium uppercase tracking-wider">
          Sold Out
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tier Card                                                          */
/* ------------------------------------------------------------------ */

function TierCard({ tier }: { tier: SponsorshipTier }) {
  return (
    <div
      className={`rounded-xl p-5 border flex flex-col ${
        tier.highlighted
          ? 'bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/20'
          : 'bg-stone-900/50 border-stone-700'
      }`}
    >
      {tier.highlighted && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2">
          Most Popular
        </span>
      )}
      <h3 className="text-lg font-bold text-white mb-1">{tier.name}</h3>
      <p className="text-2xl font-bold text-amber-400 mb-4">{tier.price}</p>
      <ul className="space-y-2 flex-1">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-stone-300">
            <Check className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Content                                                       */
/* ------------------------------------------------------------------ */

export function AdvertiseContent() {
  const { config, loading } = useAdminConfig();
  const [selectedConference, setSelectedConference] = useState(EVENT_TABS[0]?.name || '');
  const [confOpen, setConfOpen] = useState(false);
  const confBtnRef = useRef<HTMLButtonElement | null>(null);

  // A/B Testing: find running hero-copy and tier-layout tests
  const abTests = useMemo(() => {
    const tests = (config as Record<string, unknown>)?.ab_tests as ABTest[] | undefined;
    return tests || [];
  }, [config]);

  const heroCopyTest = useMemo(
    () => abTests.find(t => t.placement === 'hero-copy' && t.status === 'running'),
    [abTests]
  );
  const tierLayoutTest = useMemo(
    () => abTests.find(t => t.placement === 'tier-layout' && t.status === 'running'),
    [abTests]
  );

  const { config: heroConfig, trackClick: trackHeroClick, isActive: heroActive } = useABTest({ test: heroCopyTest });
  const { config: tierConfig, trackClick: trackTierClick, isActive: tierActive } = useABTest({ test: tierLayoutTest });

  // Load per-conference config, falling back to defaults
  const rawPageConfig = config?.[`advertise_page:${selectedConference}`] as AdvertisePageConfig | undefined;
  const basePageConfig: AdvertisePageConfig = {
    ...DEFAULT_PAGE_CONFIG,
    ...(rawPageConfig || {}),
  };

  // Apply hero copy A/B variant overrides
  const pageConfig: AdvertisePageConfig = heroActive ? {
    ...basePageConfig,
    ...(heroConfig.heroHeading ? { heroHeading: heroConfig.heroHeading as string } : {}),
    ...(heroConfig.heroSubheading ? { heroSubheading: heroConfig.heroSubheading as string } : {}),
    ...(heroConfig.ctaText ? { ctaText: heroConfig.ctaText as string } : {}),
    ...(heroConfig.statsLine ? { statsLine: heroConfig.statsLine as string } : {}),
  } : basePageConfig;

  const rawInventory = config?.[`ad_inventory:${selectedConference}`] as AdInventoryItem[] | undefined;
  const inventory: AdInventoryItem[] =
    rawInventory && rawInventory.length > 0
      ? [...rawInventory].sort((a, b) => a.sortOrder - b.sortOrder)
      : DEFAULT_INVENTORY;

  const tiers = pageConfig.tiers.length > 0
    ? pageConfig.tiers
    : DEFAULT_PAGE_CONFIG.tiers;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 gap-2 text-stone-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-24">
      {/* ============================================================ */}
      {/*  Hero                                                        */}
      {/* ============================================================ */}
      <div className="mb-16">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 max-w-3xl">
          {pageConfig.heroHeading}
        </h1>
        <p className="text-lg text-stone-400 max-w-2xl mb-4">
          {pageConfig.heroSubheading}
        </p>
        {pageConfig.statsLine && (
          <p className="text-sm text-amber-400/80 font-medium mb-6">
            {pageConfig.statsLine}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {isSafeLinkUrl(pageConfig.ctaUrl) && (
            <a
              href={pageConfig.ctaUrl}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-900 text-sm font-medium rounded-lg transition-colors"
              onClick={() => heroActive && trackHeroClick({ cta: 'primary' })}
            >
              {pageConfig.ctaText || 'Get in Touch'}
              <ArrowRight className="w-4 h-4" />
            </a>
          )}
          {isSafeLinkUrl(pageConfig.ctaSecondaryUrl) && (
            <a
              href={pageConfig.ctaSecondaryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 text-sm font-medium rounded-lg transition-colors"
              onClick={() => heroActive && trackHeroClick({ cta: 'secondary' })}
            >
              {pageConfig.ctaSecondaryText || 'Learn More'}
            </a>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/*  Ad Inventory Grid                                           */}
      {/* ============================================================ */}
      <section className="mb-16">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl font-bold text-white">
            Ad Inventory
          </h2>
          {EVENT_TABS.length > 0 && (
            <div className="relative">
              <button
                ref={(el) => { confBtnRef.current = el; }}
                onClick={() => setConfOpen(!confOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-stone-900 text-sm font-semibold cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">{selectedConference}</span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              </button>
              {confOpen && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setConfOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 bg-stone-900 border border-stone-700 rounded-lg shadow-xl overflow-hidden min-w-[180px] z-[70]">
                    {EVENT_TABS.map((tab) => (
                      <button
                        key={tab.gid}
                        onClick={() => { setSelectedConference(tab.name); setConfOpen(false); }}
                        className={`w-full text-left px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                          selectedConference === tab.name
                            ? 'bg-amber-500 text-stone-900'
                            : 'text-stone-300 hover:bg-stone-800'
                        }`}
                      >
                        {tab.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <p className="text-sm text-stone-400 mb-8">
          Choose from a range of placement options to match your goals and budget.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {inventory.map((item) => (
            <InventoryCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/*  Sponsorship Packages                                        */}
      {/* ============================================================ */}
      {pageConfig.tiersEnabled && tiers.length > 0 && (
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-2">
            Sponsorship Packages
          </h2>
          <p className="text-sm text-stone-400 mb-8">
            Bundle placements into a conference sponsorship package for the best value.
          </p>

          <div className={`grid gap-4 ${
            tierActive && tierConfig.columns === 2
              ? 'sm:grid-cols-2'
              : tierActive && tierConfig.columns === 1
              ? 'max-w-lg mx-auto'
              : 'sm:grid-cols-2 lg:grid-cols-3'
          }`}>
            {tiers.map((tier) => (
              <div key={tier.name} onClick={() => tierActive && trackTierClick({ tier: tier.name })}>
                <TierCard tier={tier} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/*  Bottom CTA                                                  */}
      {/* ============================================================ */}
      <section className="bg-stone-900/50 border border-stone-700 rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-3">
          Ready to reach your audience?
        </h2>
        <p className="text-sm text-stone-400 mb-6 max-w-lg mx-auto">
          {pageConfig.footerText ||
            'Get in touch to discuss sponsorship opportunities and custom packages.'}
        </p>
        {isSafeLinkUrl(pageConfig.ctaUrl) && (
          <a
            href={pageConfig.ctaUrl}
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-stone-900 font-medium rounded-lg transition-colors"
          >
            {pageConfig.ctaText || 'Get in Touch'}
            <ArrowRight className="w-4 h-4" />
          </a>
        )}
      </section>

      {/* ============================================================ */}
      {/*  Footer                                                      */}
      {/* ============================================================ */}
      <div className="mt-16 pt-8 border-t border-stone-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-stone-400">
            Built by{' '}
            <a
              href="https://plan.wtf"
              className="text-amber-400 hover:underline"
            >
              plan.wtf
            </a>
          </p>
          <div className="flex gap-4">
            <Link
              href="/api"
              className="text-sm text-stone-400 hover:text-amber-400 transition-colors"
            >
              API Docs
            </Link>
            <Link
              href="/"
              className="text-sm text-stone-400 hover:text-amber-400 transition-colors"
            >
              Back to App
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
