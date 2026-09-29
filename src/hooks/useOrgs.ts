'use client';

import { useState, useEffect } from 'react';
import { STORAGE_KEYS } from '@/lib/storage-keys';

export interface OrgMapping {
  orgs: Array<{ name: string; eventIds: string[] }>;
  eventOrgs: Record<string, string[]>;
}

const STALENESS_MS = 10 * 60 * 1000; // 10 minutes

function cacheKey(conference: string) {
  return `${STORAGE_KEYS.ORGS_CACHE}:${conference}`;
}
function cacheKeyTs(conference: string) {
  return `${STORAGE_KEYS.ORGS_CACHE_TS}:${conference}`;
}

function readCache(conference: string): OrgMapping | null {
  try {
    const ts = sessionStorage.getItem(cacheKeyTs(conference));
    if (!ts || Date.now() - Number(ts) > STALENESS_MS) return null;
    const raw = sessionStorage.getItem(cacheKey(conference));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(conference: string, data: OrgMapping) {
  try {
    sessionStorage.setItem(cacheKey(conference), JSON.stringify(data));
    sessionStorage.setItem(cacheKeyTs(conference), String(Date.now()));
  } catch {
    // ignore
  }
}

export function useOrgs(conference: string) {
  const [orgMapping, setOrgMapping] = useState<OrgMapping>({ orgs: [], eventOrgs: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const cached = readCache(conference);
      if (cached) {
        setOrgMapping(cached);
        setLoading(false);
        return;
      }

      try {
        const params = conference ? `?conference=${encodeURIComponent(conference)}` : '';
        const res = await fetch(`/api/orgs/mapping${params}`);
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data: OrgMapping = await res.json();
        if (!cancelled) {
          writeCache(conference, data);
          setOrgMapping(data);
        }
      } catch {
        // silently fail -- org filtering just won't work
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    load();
    return () => { cancelled = true; };
  }, [conference]);

  return { orgMapping, loading };
}
