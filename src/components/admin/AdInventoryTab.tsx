'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, Trash2, Pencil, X, Copy, MapPin, ChevronDown } from 'lucide-react';
import { FALLBACK_TABS } from '@/lib/constants';
import type { AdminConfig, AdInventoryItem, AdvertisePageConfig } from '@/lib/types';
import type { TabConfig } from '@/lib/conferences';
import type { SaveConfigFn } from './hooks/useAdminConfigEditor';
import { inputClass, btnPrimary } from './styles';

interface Props {
  adminConfig: AdminConfig | null;
  allConferenceTabs: TabConfig[];
  configLoading: boolean;
  saving: boolean;
  saveConfig: SaveConfigFn;
}

export default function AdInventoryTab({ adminConfig, allConferenceTabs, configLoading, saving, saveConfig }: Props) {
  const [adConference, setAdConference] = useState(FALLBACK_TABS[0]?.name || '');
  const [adInventory, setAdInventory] = useState<AdInventoryItem[]>([]);
  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);
  const [adPageConfig, setAdPageConfig] = useState<AdvertisePageConfig>({
    heroHeading: '',
    heroSubheading: '',
    statsLine: '',
    ctaText: '',
    ctaUrl: '',
    ctaSecondaryText: '',
    ctaSecondaryUrl: '',
    footerText: '',
    tiersEnabled: true,
    tiers: [],
  });
  const [showCopyFrom, setShowCopyFrom] = useState(false);
  const [adConfOpen, setAdConfOpen] = useState(false);

  // Conference list for ad inventory tab (allConferenceTabs + any from config keys)
  const adConferenceList = useMemo(() => {
    const names = new Set(allConferenceTabs.map(t => t.name));
    if (adminConfig) {
      for (const key of Object.keys(adminConfig)) {
        const match = key.match(/^(?:ad_inventory|advertise_page):(.+)$/);
        if (match) names.add(match[1]);
      }
    }
    return Array.from(names);
  }, [adminConfig, allConferenceTabs]);

  // Other conferences that have saved config (for copy-from)
  const copyFromConferences = useMemo(() => {
    if (!adminConfig) return [];
    return adConferenceList.filter(c => c !== adConference && (
      adminConfig[`ad_inventory:${c}`] || adminConfig[`advertise_page:${c}`]
    ));
  }, [adminConfig, adConference, adConferenceList]);

  // Load per-conference ad config when conference changes
  useEffect(() => {
    if (!adminConfig) return;
    const inv = adminConfig[`ad_inventory:${adConference}`] as AdInventoryItem[] | undefined;
    setAdInventory(inv && Array.isArray(inv) ? inv : []);
    const page = adminConfig[`advertise_page:${adConference}`] as AdvertisePageConfig | undefined;
    setAdPageConfig(page || {
      heroHeading: '', heroSubheading: '', statsLine: '',
      ctaText: '', ctaUrl: '', ctaSecondaryText: '', ctaSecondaryUrl: '',
      footerText: '', tiersEnabled: true, tiers: [],
    });
    setEditingInventoryId(null);
    setShowCopyFrom(false);
  }, [adConference, adminConfig]);

  function handleCopyFrom(sourceConf: string) {
    if (!adminConfig) return;
    const inv = adminConfig[`ad_inventory:${sourceConf}`] as AdInventoryItem[] | undefined;
    const page = adminConfig[`advertise_page:${sourceConf}`] as AdvertisePageConfig | undefined;
    if (inv) setAdInventory(structuredClone(inv));
    if (page) setAdPageConfig(structuredClone(page));
    setShowCopyFrom(false);
  }

  return (
    <div className="space-y-8">
      {configLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading config...
        </div>
      ) : (
        <>
          {/* Conference selector dropdown */}
          <div className="relative inline-block">
            <button
              onClick={() => setAdConfOpen(!adConfOpen)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-stone-900 text-sm font-semibold cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">{adConference}</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            </button>
            {adConfOpen && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setAdConfOpen(false)} />
                <div className="absolute left-0 top-full mt-1 bg-stone-900 border border-stone-700 rounded-lg shadow-xl overflow-hidden min-w-[180px] z-[70]">
                  {adConferenceList.map((name) => (
                    <button
                      key={name}
                      onClick={() => { setAdConference(name); setAdConfOpen(false); }}
                      className={`w-full text-left px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                        adConference === name
                          ? 'bg-amber-500 text-stone-900'
                          : 'text-stone-300 hover:bg-stone-800'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Section A: Page Settings */}
          <div className="bg-stone-900 rounded-xl p-4 border border-stone-700 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Advertise Page Settings</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Configure the /ads page for {adConference}. Leave blank to use defaults.
                </p>
              </div>
              {copyFromConferences.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowCopyFrom(!showCopyFrom)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-300 bg-stone-800 border border-stone-600 rounded-lg hover:border-stone-500 transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy from...
                  </button>
                  {showCopyFrom && (
                    <div className="absolute right-0 top-full mt-1 bg-stone-800 border border-stone-600 rounded-lg shadow-xl z-10 py-1 min-w-[160px]">
                      {copyFromConferences.map(c => (
                        <button
                          key={c}
                          onClick={() => handleCopyFrom(c)}
                          className="w-full text-left px-3 py-2 text-sm text-stone-300 hover:bg-stone-700 cursor-pointer"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-stone-400 mb-1">Hero Heading</label>
              <input
                type="text"
                value={adPageConfig.heroHeading}
                onChange={(e) => setAdPageConfig({ ...adPageConfig, heroHeading: e.target.value })}
                placeholder="Reach Crypto Conference Attendees"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs text-stone-400 mb-1">Hero Subheading</label>
              <textarea
                value={adPageConfig.heroSubheading}
                onChange={(e) => setAdPageConfig({ ...adPageConfig, heroSubheading: e.target.value })}
                placeholder="plan.wtf is the go-to guide for thousands of attendees..."
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div>
              <label className="block text-xs text-stone-400 mb-1">Stats Line</label>
              <input
                type="text"
                value={adPageConfig.statsLine}
                onChange={(e) => setAdPageConfig({ ...adPageConfig, statsLine: e.target.value })}
                placeholder="10,000+ monthly users across ETH Denver, Consensus, ETHCC..."
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-stone-400 mb-1">CTA Text</label>
                <input
                  type="text"
                  value={adPageConfig.ctaText}
                  onChange={(e) => setAdPageConfig({ ...adPageConfig, ctaText: e.target.value })}
                  placeholder="Get in Touch"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-stone-400 mb-1">CTA URL</label>
                <input
                  type="text"
                  value={adPageConfig.ctaUrl}
                  onChange={(e) => setAdPageConfig({ ...adPageConfig, ctaUrl: e.target.value })}
                  placeholder="mailto:ads@plan.wtf"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-stone-400 mb-1">Secondary CTA Text</label>
                <input
                  type="text"
                  value={adPageConfig.ctaSecondaryText}
                  onChange={(e) => setAdPageConfig({ ...adPageConfig, ctaSecondaryText: e.target.value })}
                  placeholder="View Media Kit"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-stone-400 mb-1">Secondary CTA URL</label>
                <input
                  type="text"
                  value={adPageConfig.ctaSecondaryUrl}
                  onChange={(e) => setAdPageConfig({ ...adPageConfig, ctaSecondaryUrl: e.target.value })}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-stone-400 mb-1">Footer Text</label>
              <input
                type="text"
                value={adPageConfig.footerText}
                onChange={(e) => setAdPageConfig({ ...adPageConfig, footerText: e.target.value })}
                placeholder="Questions? Reach out at ads@plan.wtf"
                className={inputClass}
              />
            </div>

            {/* Tiers Toggle */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-stone-400">Show Sponsorship Tiers</label>
              <button
                type="button"
                onClick={() => setAdPageConfig({ ...adPageConfig, tiersEnabled: !adPageConfig.tiersEnabled })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${adPageConfig.tiersEnabled ? 'bg-amber-500' : 'bg-stone-600'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${adPageConfig.tiersEnabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* Tiers Editor */}
            {adPageConfig.tiersEnabled && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-stone-400">Sponsorship Tiers ({adPageConfig.tiers.length})</label>
                  <button
                    type="button"
                    onClick={() => setAdPageConfig({
                      ...adPageConfig,
                      tiers: [...adPageConfig.tiers, { name: '', price: '', features: [''], highlighted: false }],
                    })}
                    className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    + Add Tier
                  </button>
                </div>
                {adPageConfig.tiers.map((tier, ti) => (
                  <div key={ti} className="bg-stone-800 rounded-lg p-3 space-y-2 border border-stone-700">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-stone-500">Tier {ti + 1}</span>
                      <button
                        type="button"
                        onClick={() => setAdPageConfig({
                          ...adPageConfig,
                          tiers: adPageConfig.tiers.filter((_, i) => i !== ti),
                        })}
                        className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-stone-500 mb-0.5">Name</label>
                        <input
                          type="text"
                          value={tier.name}
                          onChange={(e) => {
                            const tiers = [...adPageConfig.tiers];
                            tiers[ti] = { ...tiers[ti], name: e.target.value };
                            setAdPageConfig({ ...adPageConfig, tiers });
                          }}
                          placeholder="Gold Sponsor"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-stone-500 mb-0.5">Price</label>
                        <input
                          type="text"
                          value={tier.price}
                          onChange={(e) => {
                            const tiers = [...adPageConfig.tiers];
                            tiers[ti] = { ...tiers[ti], price: e.target.value };
                            setAdPageConfig({ ...adPageConfig, tiers });
                          }}
                          placeholder="$2,500"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={tier.highlighted}
                        onChange={(e) => {
                          const tiers = [...adPageConfig.tiers];
                          tiers[ti] = { ...tiers[ti], highlighted: e.target.checked };
                          setAdPageConfig({ ...adPageConfig, tiers });
                        }}
                        className="accent-amber-500"
                      />
                      <label className="text-xs text-stone-400">Highlighted (featured styling)</label>
                    </div>
                    <div>
                      <label className="block text-xs text-stone-500 mb-1">Features (one per line)</label>
                      <textarea
                        value={tier.features.join('\n')}
                        onChange={(e) => {
                          const tiers = [...adPageConfig.tiers];
                          tiers[ti] = { ...tiers[ti], features: e.target.value.split('\n') };
                          setAdPageConfig({ ...adPageConfig, tiers });
                        }}
                        rows={4}
                        placeholder={"Logo on homepage ticker\nFeatured event badge\n1 native ad slot"}
                        className={inputClass}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => saveConfig(`advertise_page:${adConference}`, adPageConfig)}
              disabled={saving}
              className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Page Settings
            </button>
          </div>

          {/* Section B: Inventory Items */}
          <div className="bg-stone-900 rounded-xl p-4 border border-stone-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Inventory Items ({adInventory.length})</h3>
                <p className="text-xs text-stone-500 mt-0.5">Ad placements shown on the /ads page</p>
              </div>
              <button
                onClick={() => {
                  const newItem: AdInventoryItem = {
                    id: crypto.randomUUID(),
                    title: '',
                    slug: '',
                    description: '',
                    price: '',
                    features: [],
                    available: true,
                    sortOrder: adInventory.length + 1,
                  };
                  setAdInventory([...adInventory, newItem]);
                  setEditingInventoryId(newItem.id);
                }}
                className={`${btnPrimary} flex items-center gap-1.5`}
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>

            {adInventory.length === 0 && (
              <p className="text-stone-500 text-sm py-4 text-center">
                No inventory items. Default items will be shown on the page.
              </p>
            )}

            <div className="space-y-3">
              {adInventory.map((item) => (
                <div key={item.id} className="p-3 bg-stone-800 rounded-lg border border-stone-600">
                  {editingInventoryId === item.id ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-stone-500 font-mono">{item.id.slice(0, 8)}...</span>
                        <button
                          onClick={() => setEditingInventoryId(null)}
                          className="text-stone-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Title</label>
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, title: e.target.value } : i))}
                            placeholder="Sponsor Ticker"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Slug</label>
                          <input
                            type="text"
                            value={item.slug}
                            onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, slug: e.target.value } : i))}
                            placeholder="sponsor-ticker"
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-stone-400 mb-1">Description</label>
                        <textarea
                          value={item.description}
                          onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, description: e.target.value } : i))}
                          rows={2}
                          className={`${inputClass} resize-none`}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Price</label>
                          <input
                            type="text"
                            value={item.price}
                            onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, price: e.target.value } : i))}
                            placeholder="$500"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Price Note</label>
                          <input
                            type="text"
                            value={item.priceNote || ''}
                            onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, priceNote: e.target.value } : i))}
                            placeholder="per conference"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Sort Order</label>
                          <input
                            type="number"
                            value={item.sortOrder}
                            onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, sortOrder: parseInt(e.target.value) || 0 } : i))}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Stats</label>
                          <input
                            type="text"
                            value={item.stats || ''}
                            onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, stats: e.target.value } : i))}
                            placeholder="Seen by 100% of users"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Badge</label>
                          <input
                            type="text"
                            value={item.badge || ''}
                            onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, badge: e.target.value } : i))}
                            placeholder="Popular"
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-stone-400 mb-1">Image URL</label>
                        <input
                          type="url"
                          value={item.imageUrl || ''}
                          onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, imageUrl: e.target.value } : i))}
                          placeholder="https://..."
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-stone-400 mb-1">
                          Features (one per line)
                        </label>
                        <textarea
                          value={item.features.join('\n')}
                          onChange={(e) => setAdInventory(adInventory.map(i =>
                            i.id === item.id
                              ? { ...i, features: e.target.value.split('\n').filter(f => f.trim()) }
                              : i
                          ))}
                          rows={3}
                          placeholder="Custom message + link&#10;Runs across all pages&#10;Per-conference targeting"
                          className={`${inputClass} resize-none`}
                        />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.available}
                          onChange={(e) => setAdInventory(adInventory.map(i => i.id === item.id ? { ...i, available: e.target.checked } : i))}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm text-stone-300">Available</span>
                      </label>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-white truncate">{item.title || '(untitled)'}</span>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.available ? 'bg-green-500' : 'bg-red-500'}`} />
                          {item.badge && (
                            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">{item.badge}</span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 truncate">
                          {item.price}{item.priceNote ? ` (${item.priceNote})` : ''} &middot; {item.features.length} features &middot; sort: {item.sortOrder}
                        </p>
                      </div>
                      <button
                        onClick={() => setEditingInventoryId(item.id)}
                        className="text-stone-400 hover:text-white cursor-pointer p-1"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setAdInventory(adInventory.filter(i => i.id !== item.id))}
                        className="text-red-400 hover:text-red-300 cursor-pointer p-1"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => saveConfig(`ad_inventory:${adConference}`, adInventory)}
            disabled={saving}
            className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Inventory Items
          </button>
        </>
      )}
    </div>
  );
}
