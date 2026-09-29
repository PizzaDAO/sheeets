'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { FALLBACK_TABS } from '@/lib/constants';
import { THEME_OPTIONS, type ThemeId } from '@/lib/themes';
import type { AdminConfig } from '@/lib/types';
import type { TabConfig } from '@/lib/conferences';
import type { SaveConfigFn } from './hooks/useAdminConfigEditor';
import { inputClass, btnPrimary } from './styles';

interface Props {
  adminConfig: AdminConfig | null;
  allConferenceTabs: TabConfig[];
  saving: boolean;
  saveMessage: string;
  saveConfig: SaveConfigFn;
}

export default function ThemeTab({ adminConfig, allConferenceTabs, saving, saveMessage, saveConfig }: Props) {
  const [themeConference, setThemeConference] = useState(FALLBACK_TABS[0]?.name || '');
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>('dark');

  // Load per-conference theme when themeConference changes
  useEffect(() => {
    if (!adminConfig) return;
    const t = adminConfig[`theme:${themeConference}`] as string | undefined;
    const validIds = THEME_OPTIONS.map(o => o.id) as string[];
    if (t && validIds.includes(t)) {
      setSelectedTheme(t as ThemeId);
    } else {
      setSelectedTheme('dark');
    }
  }, [themeConference, adminConfig]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white">Theme per Conference</h2>

      {/* Conference selector */}
      <div>
        <label className="block text-sm text-stone-400 mb-2">Conference</label>
        <select
          value={themeConference}
          onChange={(e) => setThemeConference(e.target.value)}
          className={inputClass + ' max-w-xs'}
        >
          {allConferenceTabs.map(tab => (
            <option key={tab.name} value={tab.name}>{tab.name}</option>
          ))}
        </select>
      </div>

      {/* Theme radio buttons */}
      <div>
        <label className="block text-sm text-stone-400 mb-3">Active Theme for {themeConference}</label>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 max-w-4xl">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSelectedTheme(opt.id)}
              className={`relative rounded-lg border-2 p-4 text-center cursor-pointer transition-all ${
                selectedTheme === opt.id
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-stone-700 hover:border-stone-500'
              }`}
            >
              {/* Theme preview swatch */}
              <div className="flex gap-1 justify-center mb-2">
                {opt.id === 'dark' && (
                  <>
                    <span className="w-5 h-5 rounded" style={{ background: '#0c0a09' }} />
                    <span className="w-5 h-5 rounded" style={{ background: '#1c1917' }} />
                    <span className="w-5 h-5 rounded" style={{ background: '#f59e0b' }} />
                  </>
                )}
                {opt.id === 'paper' && (
                  <>
                    <span className="w-5 h-5 rounded border border-stone-600" style={{ background: '#f5f0e8' }} />
                    <span className="w-5 h-5 rounded border border-stone-600" style={{ background: '#faf7f2' }} />
                    <span className="w-5 h-5 rounded" style={{ background: '#c47a2a' }} />
                  </>
                )}
                {opt.id === 'light' && (
                  <>
                    <span className="w-5 h-5 rounded border border-stone-600" style={{ background: '#fafafa' }} />
                    <span className="w-5 h-5 rounded border border-stone-600" style={{ background: '#ffffff' }} />
                    <span className="w-5 h-5 rounded" style={{ background: '#ef4444' }} />
                  </>
                )}
                {opt.id === 'light-blue' && (
                  <>
                    <span className="w-5 h-5 rounded border border-stone-600" style={{ background: '#fafafa' }} />
                    <span className="w-5 h-5 rounded border border-stone-600" style={{ background: '#ffffff' }} />
                    <span className="w-5 h-5 rounded" style={{ background: '#1c4586' }} />
                  </>
                )}
                {opt.id === 'sxsw' && (
                  <>
                    <span className="w-5 h-5 rounded" style={{ background: '#0a1410' }} />
                    <span className="w-5 h-5 rounded" style={{ background: '#111f18' }} />
                    <span className="w-5 h-5 rounded" style={{ background: '#d8fc30' }} />
                  </>
                )}
                {opt.id === 'sxsw2' && (
                  <>
                    <span className="w-5 h-5 rounded" style={{ background: '#0a0a0a' }} />
                    <span className="w-5 h-5 rounded" style={{ background: '#F9CB0D' }} />
                    <span className="w-5 h-5 rounded" style={{ background: '#F2A6D1' }} />
                  </>
                )}
                {opt.id === 'gdc' && (
                  <>
                    <span className="w-5 h-5 rounded" style={{ background: '#0e1525' }} />
                    <span className="w-5 h-5 rounded" style={{ background: '#EF0000' }} />
                    <span className="w-5 h-5 rounded" style={{ background: '#f5a0c0' }} />
                  </>
                )}
                {opt.id === 'ethcc' && (
                  <>
                    <span className="w-5 h-5 rounded" style={{ background: '#152066' }} />
                    <span className="w-5 h-5 rounded" style={{ background: '#6b9de8' }} />
                    <span className="w-5 h-5 rounded" style={{ background: '#f06b6b' }} />
                  </>
                )}
              </div>
              <span className={`text-sm font-semibold ${selectedTheme === opt.id ? 'text-blue-400' : 'text-stone-300'}`}>
                {opt.label}
              </span>
              {selectedTheme === opt.id && (
                <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Save + status */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => saveConfig(`theme:${themeConference}`, selectedTheme)}
          disabled={saving}
          className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Theme
        </button>
        {saveMessage && <span className="text-sm text-green-400">{saveMessage}</span>}
      </div>
    </div>
  );
}
