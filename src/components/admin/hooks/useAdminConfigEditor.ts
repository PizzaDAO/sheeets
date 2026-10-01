'use client';

import { useState, useEffect } from 'react';
import { FALLBACK_TABS } from '@/lib/constants';
import type { AdminConfig, ConferenceConfig } from '@/lib/types';

export type SaveConfigFn = (key: string, value: unknown) => Promise<void>;

/**
 * Admin-side config state: loads /api/admin/config once authed and exposes
 * saveConfig(key, value), which POSTs to /api/admin/config with the admin
 * password and drives the shared saving/saveMessage indicators.
 *
 * (Named to avoid clashing with the public read-only `@/hooks/useAdminConfig`.)
 *
 * `conferences` lives here rather than in the Conferences tab because the
 * merged conference tab list derived from it is used by most other tabs, and
 * edits are reflected there immediately (before saving).
 *
 * Note: adminConfig reflects the config as loaded; saveConfig does not
 * mutate it (matches the pre-refactor behavior).
 */
export function useAdminConfigEditor(authed: boolean, password: string) {
  const [adminConfig, setAdminConfig] = useState<AdminConfig | null>(null);
  // Loading while authed and the (single) config fetch hasn't settled yet.
  const [configSettled, setConfigSettled] = useState(false);
  const configLoading = authed && !configSettled;
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [conferences, setConferences] = useState<ConferenceConfig[]>([]);

  // Fetch admin config when authed
  useEffect(() => {
    if (!authed) return;
    fetch('/api/admin/config')
      .then(res => res.json())
      .then((data: AdminConfig) => {
        setAdminConfig(data);
        const savedConfs = (data.conferences as ConferenceConfig[]) || [];
        if (savedConfs.length > 0) {
          setConferences(savedConfs);
        } else {
          // Pre-populate from fallback tabs so admin sees existing conferences
          setConferences(FALLBACK_TABS.map(t => ({
            gid: t.gid,
            name: t.name,
            slug: t.slug,
            timezone: t.timezone,
            startDate: t.dates[0],
            endDate: t.dates[t.dates.length - 1],
            center: t.center,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setConfigSettled(true));
  }, [authed]);

  async function saveConfig(key: string, value: unknown) {
    setSaving(true);
    setSaveMessage('');
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, key, value }),
      });
      if (res.ok) {
        setSaveMessage('Saved!');
        setTimeout(() => setSaveMessage(''), 2000);
      } else {
        const data = await res.json();
        setSaveMessage(`Error: ${data.error}`);
      }
    } catch {
      setSaveMessage('Failed to save');
    }
    setSaving(false);
  }

  return {
    adminConfig,
    configLoading,
    saving,
    saveMessage,
    saveConfig,
    conferences,
    setConferences,
  };
}

/**
 * Local editable copy of a slice of the admin config. Initialized from the
 * loaded config and re-initialized whenever the loaded config object changes
 * (i.e. when it first arrives), so a tab mounted before the config finishes
 * loading still picks it up.
 */
export function useConfigState<T>(
  adminConfig: AdminConfig | null,
  select: (config: AdminConfig | null) => T,
) {
  const [value, setValue] = useState<T>(() => select(adminConfig));
  const [syncedConfig, setSyncedConfig] = useState(adminConfig);
  if (syncedConfig !== adminConfig) {
    setSyncedConfig(adminConfig);
    setValue(select(adminConfig));
  }
  return [value, setValue] as const;
}
