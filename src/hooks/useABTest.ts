'use client';

import { useMemo, useEffect, useRef, useCallback } from 'react';
import type { ABTest, ABTestVariant } from '@/lib/types';
import { getVisitorId, assignVariant, trackImpressionOnce, trackABEvent } from '@/lib/ab-testing';

interface UseABTestOptions {
  /** The test definition (from admin config) */
  test: ABTest | undefined | null;
  /** Whether to auto-track an impression when the variant is assigned */
  trackImpression?: boolean;
}

interface UseABTestResult {
  /** The assigned variant for this visitor, or null if test isn't running */
  variant: ABTestVariant | null;
  /** The variant's config values */
  config: Record<string, unknown>;
  /** Track a click event for this test+variant */
  trackClick: (metadata?: Record<string, unknown>) => void;
  /** Track a conversion event for this test+variant */
  trackConversion: (metadata?: Record<string, unknown>) => void;
  /** Whether the test is actively running */
  isActive: boolean;
}

/**
 * React hook for A/B testing.
 *
 * Deterministically assigns the current visitor to a variant and provides
 * tracking callbacks for clicks/conversions. Impressions are tracked
 * automatically (once per test per page session) when `trackImpression` is true.
 */
export function useABTest({ test, trackImpression = true }: UseABTestOptions): UseABTestResult {
  const visitorId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return getVisitorId();
  }, []);

  const variant = useMemo(() => {
    if (!test || test.status !== 'running' || !visitorId) return null;
    return assignVariant(test.id, visitorId, test.variants);
  }, [test, visitorId]);

  const isActive = !!variant;

  // Track impression once on mount (when variant is assigned)
  const hasTrackedRef = useRef(false);
  useEffect(() => {
    if (trackImpression && variant && test && !hasTrackedRef.current) {
      hasTrackedRef.current = true;
      trackImpressionOnce(test.id, variant.id);
    }
  }, [trackImpression, variant, test]);

  const config = useMemo(() => variant?.config ?? {}, [variant]);

  const testId = test?.id;
  const variantId = variant?.id;

  const trackClick = useCallback(
    (metadata?: Record<string, unknown>) => {
      if (!testId || !variantId) return;
      trackABEvent(testId, variantId, 'click', metadata);
    },
    [testId, variantId]
  );

  const trackConversion = useCallback(
    (metadata?: Record<string, unknown>) => {
      if (!testId || !variantId) return;
      trackABEvent(testId, variantId, 'conversion', metadata);
    },
    [testId, variantId]
  );

  return { variant, config, trackClick, trackConversion, isActive };
}
