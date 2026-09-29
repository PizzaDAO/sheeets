'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2, Pencil, X, GripVertical } from 'lucide-react';
import type { AdminConfig, NativeAd } from '@/lib/types';
import type { TabConfig } from '@/lib/conferences';
import { useConfigState, type SaveConfigFn } from './hooks/useAdminConfigEditor';
import { useListDragReorder } from './hooks/useListDragReorder';
import { inputClass, btnPrimary } from './styles';

interface Props {
  adminConfig: AdminConfig | null;
  allConferenceTabs: TabConfig[];
  configLoading: boolean;
  saving: boolean;
  saveConfig: SaveConfigFn;
}

export default function NativeAdsTab({ adminConfig, allConferenceTabs, configLoading, saving, saveConfig }: Props) {
  const [nativeAds, setNativeAds] = useConfigState<NativeAd[]>(adminConfig, (c) => c?.native_ads || []);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const { dragIndex, dragOverIndex, getDragProps } = useListDragReorder(nativeAds, setNativeAds);

  // Per-card A/B variant view state
  const [adAbVariantView, setAdAbVariantView] = useState<Record<string, 'a' | 'b'>>({});

  return (
    <div className="space-y-6">
      {configLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading config...
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Native Ads ({nativeAds.length})</h3>
            <button
              onClick={() => {
                const newAd: NativeAd = {
                  id: crypto.randomUUID(),
                  title: '',
                  description: '',
                  link: '',
                  imageUrl: '',
                  conference: allConferenceTabs[0]?.name || '',
                  badge: 'Sponsored',
                  active: true,
                };
                setNativeAds([...nativeAds, newAd]);
                setEditingAdId(newAd.id);
              }}
              className={`${btnPrimary} flex items-center gap-1.5`}
            >
              <Plus className="w-4 h-4" />
              Add Ad
            </button>
          </div>

          {nativeAds.length === 0 && (
            <p className="text-stone-500 text-sm py-4 text-center">No native ads configured</p>
          )}

          <div className="space-y-4">
            {nativeAds.map((ad, adIdx) => (
              <div
                key={ad.id}
                className={`bg-stone-900 rounded-xl p-4 border transition-colors ${
                  dragOverIndex === adIdx && dragIndex !== adIdx
                    ? 'border-amber-500 border-t-2'
                    : 'border-stone-700'
                } ${dragIndex === adIdx ? 'opacity-40' : ''}`}
                draggable={editingAdId !== ad.id}
                {...getDragProps(adIdx)}
              >
                {editingAdId === ad.id ? (() => {
                  const adViewingB = ad.ab?.enabled && adAbVariantView[ad.id] === 'b';
                  const currentTitle = adViewingB ? (ad.ab?.b.title ?? '') : ad.title;
                  const currentDesc = adViewingB ? (ad.ab?.b.description ?? '') : ad.description;
                  const currentLink = adViewingB ? (ad.ab?.b.link ?? '') : ad.link;
                  const currentImage = adViewingB ? (ad.ab?.b.imageUrl ?? '') : ad.imageUrl;
                  const currentBadge = adViewingB ? (ad.ab?.b.badge ?? '') : ad.badge;
                  const handleAdFieldChange = (field: string, value: string) => {
                    if (adViewingB) {
                      setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, ab: { ...a.ab!, b: { ...a.ab!.b, [field]: value } } } : a));
                    } else {
                      setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, [field]: value } : a));
                    }
                  };
                  return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-stone-500 font-mono">{ad.id.slice(0, 8)}...</span>
                      <button
                        onClick={() => setEditingAdId(null)}
                        className="text-stone-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {/* A/B Toggle */}
                    <div className="flex items-center gap-3 mb-3 pb-3 border-b border-stone-700">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!ad.ab?.enabled}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, ab: a.ab || { b: { title: '', description: '', link: '', imageUrl: '', badge: '' }, weightA: 50, weightB: 50, enabled: true }, ...(a.ab ? {} : {})} : a));
                              setNativeAds(prev => prev.map(a => a.id === ad.id ? { ...a, ab: { ...(a.ab || { b: { title: '', description: '', link: '', imageUrl: '', badge: '' }, weightA: 50, weightB: 50, enabled: false }), enabled: true } } : a));
                            } else {
                              setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, ab: a.ab ? { ...a.ab, enabled: false } : undefined } : a));
                            }
                          }}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm text-stone-300">A/B Test</span>
                      </label>
                      {ad.ab?.enabled && (
                        <>
                          <div className="flex items-center gap-1 ml-auto">
                            <button
                              onClick={() => setAdAbVariantView({ ...adAbVariantView, [ad.id]: 'a' })}
                              className={`px-2 py-0.5 text-xs rounded-l-lg border ${(adAbVariantView[ad.id] || 'a') === 'a' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-stone-800 border-stone-600 text-stone-400'} cursor-pointer`}
                            >A</button>
                            <button
                              onClick={() => setAdAbVariantView({ ...adAbVariantView, [ad.id]: 'b' })}
                              className={`px-2 py-0.5 text-xs rounded-r-lg border ${adAbVariantView[ad.id] === 'b' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-stone-800 border-stone-600 text-stone-400'} cursor-pointer`}
                            >B</button>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-stone-400">
                            <input type="number" min={0} max={100} value={ad.ab?.weightA ?? 50} onChange={(e) => {
                              setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, ab: { ...a.ab!, weightA: Number(e.target.value) } } : a));
                            }} className="w-12 bg-stone-800 border border-stone-600 rounded px-1 py-0.5 text-center text-xs text-white" />
                            <span>/</span>
                            <input type="number" min={0} max={100} value={ad.ab?.weightB ?? 50} onChange={(e) => {
                              setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, ab: { ...a.ab!, weightB: Number(e.target.value) } } : a));
                            }} className="w-12 bg-stone-800 border border-stone-600 rounded px-1 py-0.5 text-center text-xs text-white" />
                          </div>
                        </>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Title</label>
                      <input
                        type="text"
                        value={currentTitle}
                        onChange={(e) => handleAdFieldChange('title', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Description</label>
                      <textarea
                        value={currentDesc}
                        onChange={(e) => handleAdFieldChange('description', e.target.value)}
                        rows={2}
                        className={`${inputClass} resize-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Link</label>
                      <input
                        type="url"
                        value={currentLink}
                        onChange={(e) => handleAdFieldChange('link', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Image URL</label>
                      <input
                        type="url"
                        value={currentImage}
                        onChange={(e) => handleAdFieldChange('imageUrl', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-stone-400 mb-1">Conference</label>
                        <select
                          value={ad.conference}
                          onChange={(e) => setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, conference: e.target.value } : a))}
                          className={inputClass}
                        >
                          <option value="">All Conferences</option>
                          {allConferenceTabs.map((t) => (
                            <option key={t.gid} value={t.name}>{t.name}</option>
                          ))}
                          {ad.conference && !allConferenceTabs.some(t => t.name === ad.conference) && (
                            <option value={ad.conference}>{ad.conference} (legacy)</option>
                          )}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-stone-400 mb-1">Badge Text</label>
                        <input
                          type="text"
                          value={currentBadge}
                          onChange={(e) => handleAdFieldChange('badge', e.target.value)}
                          placeholder="Sponsored"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ad.active}
                          onChange={(e) => setNativeAds(nativeAds.map(a => a.id === ad.id ? { ...a, active: e.target.checked } : a))}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm text-stone-300">Active</span>
                      </label>
                    </div>
                  </div>
                  );
                })() : (
                  <div className="flex items-start gap-4">
                    <GripVertical className="w-4 h-4 text-stone-500 cursor-grab shrink-0 mt-1" />
                    {ad.imageUrl && (
                      <div className="w-[80px] h-[60px] flex-shrink-0 rounded-lg overflow-hidden bg-stone-800">
                        <img src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white truncate">{ad.title || '(untitled)'}</span>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ad.active ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-[10px] text-stone-500">{ad.active ? 'Active' : 'Inactive'}</span>
                        {ad.ab?.enabled && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-purple-500/20 text-purple-400 rounded-full border border-purple-500/30">A/B</span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400 line-clamp-1">{ad.description || '(no description)'}</p>
                      <p className="text-xs text-stone-500 mt-0.5">{ad.conference} &middot; {ad.badge || 'Sponsored'}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditingAdId(ad.id)}
                        className="text-stone-400 hover:text-white cursor-pointer p-1"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setNativeAds(nativeAds.filter(a => a.id !== ad.id))}
                        className="text-red-400 hover:text-red-300 cursor-pointer p-1"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => saveConfig('native_ads', nativeAds)}
            disabled={saving}
            className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Native Ads
          </button>

        </>
      )}
    </div>
  );
}
