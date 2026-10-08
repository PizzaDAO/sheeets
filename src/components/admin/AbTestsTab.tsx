'use client';

import { useState, useCallback } from 'react';
import { Loader2, Plus, Trash2, Pencil, Save, FlaskConical, Play, Pause, Trophy, BarChart3, Eye, MousePointer } from 'lucide-react';
import type { AdminConfig, ABTest, ABTestStatus, ABVariantResult } from '@/lib/types';
import type { TabConfig } from '@/lib/conferences';
import { useConfigState, type SaveConfigFn } from './hooks/useAdminConfigEditor';
import { inputClass, btnPrimary } from './styles';

const AB_PLACEMENTS = [
  { value: 'native-ad-content', label: 'Native Ad Content', hint: 'Test different ad creatives (title, description, image, link)' },
  { value: 'sponsor-copy', label: 'Sponsor Ticker Copy', hint: 'Test different sponsor messaging' },
  { value: 'ad-frequency', label: 'Ad Frequency (ListView)', hint: 'Test how often ads appear in the list' },
  { value: 'hero-copy', label: 'Hero Copy (/ads)', hint: 'Test /ads page headline and CTA' },
  { value: 'tier-layout', label: 'Tier Layout (/ads)', hint: 'Test tier grid layout on /ads page' },
  { value: 'custom', label: 'Custom', hint: 'Custom placement with JSON config' },
];

interface Props {
  adminConfig: AdminConfig | null;
  allConferenceTabs: TabConfig[];
  saving: boolean;
  saveMessage: string;
  saveConfig: SaveConfigFn;
}

export default function AbTestsTab({ adminConfig, allConferenceTabs, saving, saveMessage, saveConfig }: Props) {
  const [abTests, setAbTests] = useConfigState<ABTest[]>(adminConfig, (c) => (c?.ab_tests as ABTest[]) || []);
  const [abEditingId, setAbEditingId] = useState<string | null>(null);
  const [abViewResults, setAbViewResults] = useState<string | null>(null);
  const [abResults, setAbResults] = useState<Record<string, ABVariantResult[]>>({});
  const [abResultsLoading, setAbResultsLoading] = useState(false);
  const [abNewTest, setAbNewTest] = useState<ABTest | null>(null);

  // A/B Test helpers
  function createEmptyTest(): ABTest {
    const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return {
      id,
      name: '',
      description: '',
      status: 'draft',
      placement: 'ad-frequency',
      conference: '',
      variants: [
        { id: 'control', name: 'Control', weight: 50, config: {} },
        { id: 'variant-a', name: 'Variant A', weight: 50, config: {} },
      ],
      created_at: new Date().toISOString(),
    };
  }

  async function saveAbTests(tests: ABTest[]) {
    setAbTests(tests);
    await saveConfig('ab_tests', tests);
  }

  function updateTestStatus(testId: string, status: ABTestStatus, winnerId?: string) {
    const updated = abTests.map(t => {
      if (t.id !== testId) return t;
      const patch: Partial<ABTest> = { status };
      if (status === 'running' && !t.started_at) patch.started_at = new Date().toISOString();
      if (status === 'completed') {
        patch.completed_at = new Date().toISOString();
        if (winnerId) patch.winnerId = winnerId;
      }
      return { ...t, ...patch };
    });
    saveAbTests(updated);
  }

  const fetchResults = useCallback(async (testId: string) => {
    setAbResultsLoading(true);
    try {
      const res = await fetch(`/api/ab/results?test_id=${testId}`);
      if (res.ok) {
        const data = await res.json();
        setAbResults(prev => ({ ...prev, [testId]: data.variants }));
      }
    } catch { /* ignore */ }
    setAbResultsLoading(false);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <FlaskConical className="w-5 h-5" />
          A/B Tests
        </h2>
        <button
          onClick={() => setAbNewTest(createEmptyTest())}
          className={`${btnPrimary} flex items-center gap-2`}
        >
          <Plus className="w-4 h-4" />
          New Test
        </button>
      </div>

      {/* Create / Edit Test Form */}
      {abNewTest && (
        <div className="bg-stone-800/50 border border-stone-600 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            {abEditingId ? 'Edit Test' : 'Create New Test'}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-stone-400 mb-1">Name</label>
              <input
                className={inputClass}
                value={abNewTest.name}
                onChange={e => setAbNewTest({ ...abNewTest, name: e.target.value })}
                placeholder="e.g. Ad Frequency Test"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Placement</label>
              <select
                className={inputClass}
                value={abNewTest.placement}
                onChange={e => setAbNewTest({ ...abNewTest, placement: e.target.value })}
              >
                {AB_PLACEMENTS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-400 mb-1">Description</label>
            <input
              className={inputClass}
              value={abNewTest.description}
              onChange={e => setAbNewTest({ ...abNewTest, description: e.target.value })}
              placeholder="What are we testing?"
            />
          </div>

          <div>
            <label className="block text-xs text-stone-400 mb-1">Conference (leave empty for global)</label>
            <select
              className={inputClass + ' max-w-xs'}
              value={abNewTest.conference}
              onChange={e => setAbNewTest({ ...abNewTest, conference: e.target.value })}
            >
              <option value="">Global (all conferences)</option>
              {allConferenceTabs.map(tab => (
                <option key={tab.name} value={tab.name}>{tab.name}</option>
              ))}
            </select>
          </div>

          {/* Variants */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-stone-400 font-medium">Variants</label>
              <button
                onClick={() => {
                  const newId = `variant-${String.fromCharCode(97 + abNewTest.variants.length - 1)}`;
                  setAbNewTest({
                    ...abNewTest,
                    variants: [
                      ...abNewTest.variants,
                      { id: newId, name: `Variant ${String.fromCharCode(65 + abNewTest.variants.length - 1)}`, weight: 0, config: {} },
                    ],
                  });
                }}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                + Add Variant
              </button>
            </div>
            <div className="space-y-2">
              {abNewTest.variants.map((v, vi) => {
                const updateConfig = (key: string, val: string) => {
                  const updated = [...abNewTest.variants];
                  updated[vi] = { ...updated[vi], config: { ...updated[vi].config, [key]: val } };
                  setAbNewTest({ ...abNewTest, variants: updated });
                };
                const updateAdField = (idx: number, key: string, val: string) => {
                  const ads = [...((v.config.ads as Record<string, string>[]) || [{ id: `ad-${vi}`, title: '', description: '', link: '', imageUrl: '', badge: 'Sponsored' }])];
                  ads[idx] = { ...ads[idx], [key]: val };
                  const updated = [...abNewTest.variants];
                  updated[vi] = { ...updated[vi], config: { ...updated[vi].config, ads } };
                  setAbNewTest({ ...abNewTest, variants: updated });
                };
                const updateSponsorField = (idx: number, key: string, val: string) => {
                  const sponsors = [...((v.config.sponsors as Record<string, string>[]) || [{ beforeText: '', linkText: '', afterText: '', url: '' }])];
                  sponsors[idx] = { ...sponsors[idx], [key]: val };
                  const updated = [...abNewTest.variants];
                  updated[vi] = { ...updated[vi], config: { ...updated[vi].config, sponsors } };
                  setAbNewTest({ ...abNewTest, variants: updated });
                };
                const ads = (v.config.ads as Record<string, string>[]) || [];
                const sponsors = (v.config.sponsors as Record<string, string>[]) || [];

                return (
                <div key={v.id} className="bg-stone-900/50 rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      className={inputClass + ' flex-1'}
                      value={v.name}
                      onChange={e => {
                        const updated = [...abNewTest.variants];
                        updated[vi] = { ...updated[vi], name: e.target.value };
                        setAbNewTest({ ...abNewTest, variants: updated });
                      }}
                      placeholder="Variant name"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        className={inputClass + ' w-16 text-center'}
                        value={v.weight}
                        onChange={e => {
                          const updated = [...abNewTest.variants];
                          updated[vi] = { ...updated[vi], weight: Number(e.target.value) || 0 };
                          setAbNewTest({ ...abNewTest, variants: updated });
                        }}
                      />
                      <span className="text-xs text-stone-500">%</span>
                    </div>
                    {abNewTest.variants.length > 2 && (
                      <button
                        onClick={() => setAbNewTest({
                          ...abNewTest,
                          variants: abNewTest.variants.filter((_, i) => i !== vi),
                        })}
                        className="text-red-400 hover:text-red-300 cursor-pointer p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Native Ad Content fields */}
                  {abNewTest.placement === 'native-ad-content' && (
                    <div className="space-y-2 border-t border-stone-700 pt-2">
                      {(ads.length === 0 ? [{ id: `ad-${vi}`, title: '', description: '', link: '', imageUrl: '', badge: 'Sponsored' }] : ads).map((ad, ai) => (
                        <div key={ai} className="grid grid-cols-2 gap-2">
                          <input className={inputClass} value={ad.title || ''} onChange={e => updateAdField(ai, 'title', e.target.value)} placeholder="Ad title" />
                          <input className={inputClass} value={ad.badge || ''} onChange={e => updateAdField(ai, 'badge', e.target.value)} placeholder="Badge (e.g. Sponsored)" />
                          <input className={inputClass + ' col-span-2'} value={ad.description || ''} onChange={e => updateAdField(ai, 'description', e.target.value)} placeholder="Description" />
                          <input className={inputClass} value={ad.link || ''} onChange={e => updateAdField(ai, 'link', e.target.value)} placeholder="Destination URL" />
                          <input className={inputClass} value={ad.imageUrl || ''} onChange={e => updateAdField(ai, 'imageUrl', e.target.value)} placeholder="Image URL" />
                          <input className={inputClass} value={ad.id || ''} onChange={e => updateAdField(ai, 'id', e.target.value)} placeholder="Ad ID (unique)" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sponsor Copy fields */}
                  {abNewTest.placement === 'sponsor-copy' && (
                    <div className="space-y-2 border-t border-stone-700 pt-2">
                      {(sponsors.length === 0 ? [{ beforeText: '', linkText: '', afterText: '', url: '' }] : sponsors).map((sp, si) => (
                        <div key={si} className="grid grid-cols-2 gap-2">
                          <input className={inputClass} value={sp.beforeText || ''} onChange={e => updateSponsorField(si, 'beforeText', e.target.value)} placeholder="Before text (e.g. 'Supported by ')" />
                          <input className={inputClass} value={sp.linkText || ''} onChange={e => updateSponsorField(si, 'linkText', e.target.value)} placeholder="Link text (sponsor name)" />
                          <input className={inputClass} value={sp.afterText || ''} onChange={e => updateSponsorField(si, 'afterText', e.target.value)} placeholder="After text (e.g. '. Learn more!')" />
                          <input className={inputClass} value={sp.url || ''} onChange={e => updateSponsorField(si, 'url', e.target.value)} placeholder="Destination URL" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ad Frequency field */}
                  {abNewTest.placement === 'ad-frequency' && (
                    <div className="border-t border-stone-700 pt-2">
                      <label className="text-xs text-stone-400">Show ad every N events</label>
                      <input type="number" min="1" max="50" className={inputClass + ' w-24 mt-1'} value={(v.config.frequency as number) || 8} onChange={e => updateConfig('frequency', e.target.value)} />
                    </div>
                  )}

                  {/* Hero Copy fields */}
                  {abNewTest.placement === 'hero-copy' && (
                    <div className="space-y-2 border-t border-stone-700 pt-2">
                      <input className={inputClass} value={(v.config.heroHeading as string) || ''} onChange={e => updateConfig('heroHeading', e.target.value)} placeholder="Hero heading" />
                      <input className={inputClass} value={(v.config.heroSubheading as string) || ''} onChange={e => updateConfig('heroSubheading', e.target.value)} placeholder="Hero subheading" />
                      <input className={inputClass} value={(v.config.ctaText as string) || ''} onChange={e => updateConfig('ctaText', e.target.value)} placeholder="CTA button text" />
                    </div>
                  )}

                  {/* Tier Layout field */}
                  {abNewTest.placement === 'tier-layout' && (
                    <div className="border-t border-stone-700 pt-2">
                      <label className="text-xs text-stone-400">Grid columns</label>
                      <select className={inputClass + ' w-24 mt-1'} value={(v.config.columns as number) || 2} onChange={e => updateConfig('columns', e.target.value)}>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                      </select>
                    </div>
                  )}

                  {/* Custom / fallback: raw JSON */}
                  {abNewTest.placement === 'custom' && (
                    <div className="border-t border-stone-700 pt-2">
                      <input
                        className={inputClass}
                        value={JSON.stringify(v.config)}
                        onChange={e => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            const updated = [...abNewTest.variants];
                            updated[vi] = { ...updated[vi], config: parsed };
                            setAbNewTest({ ...abNewTest, variants: updated });
                          } catch { /* ignore invalid JSON while typing */ }
                        }}
                        placeholder='{"key": "value"}'
                        title="Variant config (JSON)"
                      />
                    </div>
                  )}
                </div>
                );
              })}
            </div>
            {(() => {
              const totalWeight = abNewTest.variants.reduce((s, v) => s + v.weight, 0);
              return totalWeight !== 100 ? (
                <p className="text-xs text-amber-400 mt-1">
                  Weights sum to {totalWeight}% (should be 100%)
                </p>
              ) : null;
            })()}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => {
                if (!abNewTest.name.trim()) return;
                if (abEditingId) {
                  // Update existing
                  const updated = abTests.map(t => t.id === abEditingId ? abNewTest : t);
                  saveAbTests(updated);
                } else {
                  // Create new
                  saveAbTests([...abTests, abNewTest]);
                }
                setAbNewTest(null);
                setAbEditingId(null);
              }}
              disabled={!abNewTest.name.trim() || saving}
              className={`${btnPrimary} flex items-center gap-2 ${!abNewTest.name.trim() || saving ? 'opacity-50' : ''}`}
            >
              <Save className="w-4 h-4" />
              {abEditingId ? 'Update Test' : 'Create Test'}
            </button>
            <button
              onClick={() => { setAbNewTest(null); setAbEditingId(null); }}
              className="text-sm text-stone-400 hover:text-stone-300 cursor-pointer"
            >
              Cancel
            </button>
            {saveMessage && <span className="text-sm text-green-400">{saveMessage}</span>}
          </div>
        </div>
      )}

      {/* Test List */}
      {abTests.length === 0 && !abNewTest && (
        <div className="text-center py-12 text-stone-500">
          <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No A/B tests yet. Create one to get started.</p>
        </div>
      )}

      <div className="space-y-3">
        {abTests.map(test => (
          <div key={test.id} className="bg-stone-800/50 border border-stone-700 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-bold text-white truncate">{test.name}</h3>
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${
                    test.status === 'running'
                      ? 'bg-green-500/20 text-green-400 border-green-500/30'
                      : test.status === 'paused'
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : test.status === 'completed'
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      : 'bg-stone-500/20 text-stone-400 border-stone-500/30'
                  }`}>
                    {test.status}
                  </span>
                  {test.winnerId && (
                    <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30">
                      <Trophy className="w-3 h-3" />
                      {test.variants.find(v => v.id === test.winnerId)?.name || test.winnerId}
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-400 mb-1">{test.description}</p>
                <div className="flex items-center gap-3 text-[11px] text-stone-500">
                  <span>Placement: {AB_PLACEMENTS.find(p => p.value === test.placement)?.label || test.placement}</span>
                  {test.conference && <span>Conference: {test.conference}</span>}
                  <span>{test.variants.length} variants</span>
                  {test.started_at && <span>Started: {new Date(test.started_at).toLocaleDateString()}</span>}
                </div>

                {/* Variant summary */}
                <div className="flex gap-2 mt-2">
                  {test.variants.map(v => (
                    <span key={v.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-stone-900/50 rounded text-[11px] text-stone-300">
                      {v.name} <span className="text-stone-500">{v.weight}%</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {test.status === 'draft' && (
                  <button
                    onClick={() => updateTestStatus(test.id, 'running')}
                    className="p-1.5 rounded hover:bg-green-500/20 text-green-400 cursor-pointer"
                    title="Start test"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                )}
                {test.status === 'running' && (
                  <button
                    onClick={() => updateTestStatus(test.id, 'paused')}
                    className="p-1.5 rounded hover:bg-amber-500/20 text-amber-400 cursor-pointer"
                    title="Pause test"
                  >
                    <Pause className="w-4 h-4" />
                  </button>
                )}
                {test.status === 'paused' && (
                  <button
                    onClick={() => updateTestStatus(test.id, 'running')}
                    className="p-1.5 rounded hover:bg-green-500/20 text-green-400 cursor-pointer"
                    title="Resume test"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                )}
                {(test.status === 'running' || test.status === 'paused') && (
                  <button
                    onClick={() => {
                      setAbViewResults(abViewResults === test.id ? null : test.id);
                      if (abViewResults !== test.id) fetchResults(test.id);
                    }}
                    className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 cursor-pointer"
                    title="View results"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>
                )}
                {test.status !== 'completed' && (
                  <button
                    onClick={() => {
                      setAbEditingId(test.id);
                      setAbNewTest(structuredClone(test));
                    }}
                    className="p-1.5 rounded hover:bg-stone-700 text-stone-400 cursor-pointer"
                    title="Edit test"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm(`Delete test "${test.name}"?`)) {
                      saveAbTests(abTests.filter(t => t.id !== test.id));
                    }
                  }}
                  className="p-1.5 rounded hover:bg-red-500/20 text-red-400 cursor-pointer"
                  title="Delete test"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Results panel */}
            {abViewResults === test.id && (
              <div className="mt-4 pt-4 border-t border-stone-700">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Results
                  </h4>
                  <button
                    onClick={() => fetchResults(test.id)}
                    className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                  >
                    Refresh
                  </button>
                </div>

                {abResultsLoading ? (
                  <div className="flex items-center gap-2 text-stone-400 text-sm py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading results...
                  </div>
                ) : abResults[test.id] ? (
                  <div className="space-y-3">
                    <div className="grid gap-2">
                      {abResults[test.id].map(r => {
                        const maxImpressions = Math.max(...abResults[test.id].map(v => v.impressions), 1);
                        const barWidth = (r.impressions / maxImpressions) * 100;
                        return (
                          <div key={r.variant_id} className="bg-stone-900/50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-white">{r.variant_name}</span>
                              <span className="text-xs text-stone-500">{r.variant_id}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-center mb-2">
                              <div>
                                <div className="flex items-center justify-center gap-1 text-xs text-stone-400 mb-0.5">
                                  <Eye className="w-3 h-3" />
                                  Impressions
                                </div>
                                <span className="text-lg font-bold text-white">{r.impressions.toLocaleString()}</span>
                              </div>
                              <div>
                                <div className="flex items-center justify-center gap-1 text-xs text-stone-400 mb-0.5">
                                  <MousePointer className="w-3 h-3" />
                                  Clicks
                                </div>
                                <span className="text-lg font-bold text-white">{r.clicks.toLocaleString()}</span>
                              </div>
                              <div>
                                <div className="text-xs text-stone-400 mb-0.5">CTR</div>
                                <span className="text-lg font-bold text-amber-400">{(r.ctr * 100).toFixed(2)}%</span>
                              </div>
                            </div>
                            {/* Bar */}
                            <div className="h-2 bg-stone-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Complete test with winner selection */}
                    {(test.status === 'running' || test.status === 'paused') && (
                      <div className="flex items-center gap-2 pt-2">
                        <span className="text-xs text-stone-400">Complete test with winner:</span>
                        {test.variants.map(v => (
                          <button
                            key={v.id}
                            onClick={() => {
                              if (confirm(`Complete test and declare "${v.name}" as winner?`)) {
                                updateTestStatus(test.id, 'completed', v.id);
                                setAbViewResults(null);
                              }
                            }}
                            className="px-3 py-1 text-xs font-medium bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 border border-amber-500/30 cursor-pointer"
                          >
                            <Trophy className="w-3 h-3 inline mr-1" />
                            {v.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-stone-500 py-2">No results data available. The ab_events table may need to be created in Supabase.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
