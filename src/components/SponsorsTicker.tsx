'use client';

import { memo, useEffect, useRef } from 'react';
import { SponsorEntry } from '@/lib/types';
import { trackAdClick, trackAdImpression } from '@/lib/analytics';
import { trackAdEvent, slugifySponsor } from '@/lib/ad-tracking';
import { isSafeHttpUrl } from '@/lib/utils';

const defaultSponsors: SponsorEntry[] = [
  {
    beforeText: 'Supported by ',
    linkText: 'Stand With Crypto',
    afterText: '. Join the Fight for Sensible Crypto Policy!',
    url: 'https://www.standwithcrypto.org/join/BtPHAB2fFkJP?utm_source=swc-hub&utm_medium=referral&utm_campaign=eth-denver-2026',
  },
];

interface SponsorsTickerProps {
  sponsors?: SponsorEntry[];
  /** Which conference context this ticker is shown in */
  conference?: string;
  /** Called when the ticker becomes visible (for A/B impression tracking) */
  onImpression?: () => void;
  /** Called when a sponsor link is clicked (for A/B click tracking) */
  onSponsorClick?: (url: string) => void;
}

export const SponsorsTicker = memo(function SponsorsTicker({ sponsors, conference, onImpression, onSponsorClick }: SponsorsTickerProps) {
  const sponsorList = sponsors && sponsors.length > 0 ? sponsors : defaultSponsors;

  const tickerRef = useRef<HTMLDivElement>(null);
  const impressionTracked = useRef(false);

  // Track impression via IntersectionObserver
  useEffect(() => {
    const el = tickerRef.current;
    if (!el || impressionTracked.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !impressionTracked.current) {
          impressionTracked.current = true;
          // GA4 tracking (existing)
          trackAdImpression('sponsor-ticker');
          // Supabase per-sponsor tracking (new) -- fire for each sponsor
          for (const s of sponsorList) {
            trackAdEvent({
              ad_id: slugifySponsor(s.linkText),
              ad_name: s.linkText,
              placement: 'sponsor-ticker',
              event_type: 'impression',
              conference,
            });
          }
          onImpression?.();
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [onImpression, sponsorList, conference]);

  const item = (
    <span className="inline-flex items-center">
      {sponsorList.map((s, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-6 text-[var(--theme-text-faint)]">&#10022;</span>}
          {s.beforeText} <a
            href={isSafeHttpUrl(s.url) ? s.url : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[var(--theme-text-muted)] underline-offset-2 hover:text-[var(--theme-text-primary)] hover:decoration-[var(--theme-text-secondary)] transition-colors"
            onClick={() => {
              // GA4 tracking (existing)
              trackAdClick('sponsor-ticker', s.url);
              // Supabase per-sponsor tracking (new)
              trackAdEvent({
                ad_id: slugifySponsor(s.linkText),
                ad_name: s.linkText,
                placement: 'sponsor-ticker',
                event_type: 'click',
                url: s.url,
                conference,
              });
              onSponsorClick?.(s.url);
            }}
          >{s.linkText}</a>{s.afterText}
        </span>
      ))}
      <span className="mx-6 text-[var(--theme-text-faint)]">&#10022;</span>
    </span>
  );

  return (
    <div ref={tickerRef} className="w-full overflow-hidden border-b border-[var(--theme-ticker-border)] py-1.5 bg-[var(--theme-ticker-bg)] shrink-0">
      <div className="sponsors-scroll inline-flex whitespace-nowrap text-xs text-[var(--theme-text-secondary)]">
        {item}{item}{item}{item}{item}{item}{item}{item}
      </div>
    </div>
  );
});
