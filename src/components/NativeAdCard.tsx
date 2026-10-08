'use client';

import { useEffect, useRef, useCallback } from 'react';
import { ArrowRight, Users, DollarSign } from 'lucide-react';
import { NativeAd } from '@/lib/types';
import { trackAdClick, trackAdImpression } from '@/lib/analytics';
import { trackAdEvent } from '@/lib/ad-tracking';
import { isSafeHttpUrl } from '@/lib/utils';

interface NativeAdCardProps {
  ad: NativeAd;
  /** Which conference context this ad is shown in */
  conference?: string;
  /** Called when the ad becomes visible in the viewport */
  onImpression?: (adId: string) => void;
  /** Called when the user clicks the ad */
  onClick?: (adId: string) => void;
}

const SOCIAL_STATS = [
  { icon: Users, label: '1K+ users' },
  { icon: DollarSign, label: 'From $200' },
];

export default function NativeAdCard({ ad, conference, onImpression, onClick }: NativeAdCardProps) {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const impressionTracked = useRef(false);

  // IntersectionObserver for impression tracking
  useEffect(() => {
    const el = cardRef.current;
    if (!el || impressionTracked.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !impressionTracked.current) {
          impressionTracked.current = true;
          // GA4 tracking (existing)
          trackAdImpression('native-ad');
          // Supabase per-ad tracking (new)
          trackAdEvent({
            ad_id: ad.id,
            ad_name: ad.title,
            placement: 'native-ad',
            event_type: 'impression',
            conference,
          });
          onImpression?.(ad.id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 } // 50% visible
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [ad.id, ad.title, conference, onImpression]);

  const handleClick = useCallback(() => {
    // GA4 tracking (existing)
    trackAdClick('native-ad', ad.link);
    // Supabase per-ad tracking (new)
    trackAdEvent({
      ad_id: ad.id,
      ad_name: ad.title,
      placement: 'native-ad',
      event_type: 'click',
      url: ad.link,
      conference,
    });
    onClick?.(ad.id);
  }, [ad.id, ad.title, ad.link, conference, onClick]);

  return (
    <a
      ref={cardRef}
      href={isSafeHttpUrl(ad.link) ? ad.link : undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
      onClick={handleClick}
    >
      <div className="bg-[var(--theme-bg-card)] border border-[var(--theme-border-primary)] rounded-lg p-4 transition-colors hover:border-[var(--theme-accent)]">
        <div className="flex gap-4">
          {ad.imageUrl && (
            <div className="w-[90px] h-[90px] flex-shrink-0 rounded-lg overflow-hidden bg-[var(--theme-bg-tertiary)]">
              <img
                src={ad.imageUrl}
                alt={ad.title}
                className="w-full h-full object-contain"
                loading="lazy"
                decoding="async"
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Top: Title + Ad badge */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-[var(--theme-text-primary)] truncate">
                {ad.title}
              </span>
              <span className="flex-shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--theme-accent-muted)] text-[var(--theme-accent)] border border-[var(--theme-accent-muted)]">
                Ad
              </span>
            </div>

            {/* Middle: Social proof stat pills */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {SOCIAL_STATS.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--theme-bg-tertiary)] text-[10px] text-[var(--theme-text-secondary)] border border-[var(--theme-border-primary)]"
                >
                  <Icon className="w-2.5 h-2.5" />
                  {label}
                </span>
              ))}
            </div>

            {/* Bottom: Description + CTA */}
            <p className="text-xs text-[var(--theme-text-secondary)] line-clamp-2 mb-2">
              {ad.description}
            </p>
            <span className="inline-flex items-center gap-1 text-[var(--theme-accent)] hover:text-[var(--theme-accent-hover)] text-xs font-medium transition-colors">
              {ad.badge || 'Learn more'}
              <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
