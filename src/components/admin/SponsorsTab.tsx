'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2, Pencil, Save, GripVertical } from 'lucide-react';
import type { AdminConfig, SponsorEntry } from '@/lib/types';
import { useConfigState, type SaveConfigFn } from './hooks/useAdminConfigEditor';
import { useListDragReorder } from './hooks/useListDragReorder';
import { inputClass, btnPrimary } from './styles';

interface Props {
  adminConfig: AdminConfig | null;
  configLoading: boolean;
  saving: boolean;
  saveConfig: SaveConfigFn;
}

export default function SponsorsTab({ adminConfig, configLoading, saving, saveConfig }: Props) {
  const [sponsors, setSponsors] = useConfigState<SponsorEntry[]>(adminConfig, (c) => c?.sponsors || []);
  const [editingSponsorIndex, setEditingSponsorIndex] = useState<number | null>(null);
  const { dragIndex, dragOverIndex, getDragProps } = useListDragReorder(sponsors, setSponsors);

  // Per-card A/B variant view state
  const [abVariantView, setAbVariantView] = useState<Record<number, 'a' | 'b'>>({});

  return (
    <div className="space-y-6">
      {configLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading config...
        </div>
      ) : (
        <>
          <div className="bg-stone-900 rounded-xl p-4 border border-stone-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Sponsors</h3>
                <p className="text-xs text-stone-500 mt-0.5">Each sponsor shows as: before text + <span className="text-blue-400">link text</span> + after text</p>
              </div>
              <button
                onClick={() => {
                  setSponsors([...sponsors, { beforeText: '', linkText: '', afterText: '', url: '' }]);
                  setEditingSponsorIndex(sponsors.length);
                }}
                className={`${btnPrimary} flex items-center gap-1.5`}
              >
                <Plus className="w-4 h-4" />
                Add Sponsor
              </button>
            </div>

            {sponsors.length === 0 && (
              <p className="text-stone-500 text-sm py-4 text-center">No sponsors added yet</p>
            )}

            <div className="space-y-3">
              {sponsors.map((sponsor, idx) => (
                <div
                  key={idx}
                  className={`p-3 bg-stone-800 rounded-lg border transition-colors ${
                    dragOverIndex === idx && dragIndex !== idx
                      ? 'border-amber-500 border-t-2'
                      : 'border-stone-600'
                  } ${dragIndex === idx ? 'opacity-40' : ''}`}
                  draggable={editingSponsorIndex !== idx}
                  {...getDragProps(idx)}
                >
                  {editingSponsorIndex === idx ? (() => {
                    const viewingB = sponsor.ab?.enabled && abVariantView[idx] === 'b';
                    const currentBefore = viewingB ? (sponsor.ab?.b.beforeText ?? '') : sponsor.beforeText;
                    const currentLink = viewingB ? (sponsor.ab?.b.linkText ?? '') : sponsor.linkText;
                    const currentAfter = viewingB ? (sponsor.ab?.b.afterText ?? '') : sponsor.afterText;
                    const currentUrl = viewingB ? (sponsor.ab?.b.url ?? '') : sponsor.url;
                    const handleFieldChange = (field: string, value: string) => {
                      const updated = [...sponsors];
                      if (viewingB) {
                        updated[idx] = { ...updated[idx], ab: { ...updated[idx].ab!, b: { ...updated[idx].ab!.b, [field]: value } } };
                      } else {
                        updated[idx] = { ...updated[idx], [field]: value };
                      }
                      setSponsors(updated);
                    };
                    return (
                    <div className="space-y-3">
                      {/* A/B Toggle */}
                      <div className="flex items-center gap-3 mb-3 pb-3 border-b border-stone-700">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!sponsor.ab?.enabled}
                            onChange={(e) => {
                              const updated = [...sponsors];
                              if (e.target.checked) {
                                updated[idx] = { ...updated[idx], ab: updated[idx].ab || { b: { beforeText: '', linkText: '', afterText: '', url: '' }, weightA: 50, weightB: 50, enabled: true } };
                                updated[idx] = { ...updated[idx], ab: { ...updated[idx].ab!, enabled: true } };
                              } else {
                                updated[idx] = { ...updated[idx], ab: updated[idx].ab ? { ...updated[idx].ab!, enabled: false } : undefined };
                              }
                              setSponsors(updated);
                            }}
                            className="w-4 h-4 rounded"
                          />
                          <span className="text-sm text-stone-300">A/B Test</span>
                        </label>
                        {sponsor.ab?.enabled && (
                          <>
                            <div className="flex items-center gap-1 ml-auto">
                              <button
                                onClick={() => setAbVariantView({ ...abVariantView, [idx]: 'a' })}
                                className={`px-2 py-0.5 text-xs rounded-l-lg border ${(abVariantView[idx] || 'a') === 'a' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-stone-800 border-stone-600 text-stone-400'} cursor-pointer`}
                              >A</button>
                              <button
                                onClick={() => setAbVariantView({ ...abVariantView, [idx]: 'b' })}
                                className={`px-2 py-0.5 text-xs rounded-r-lg border ${abVariantView[idx] === 'b' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-stone-800 border-stone-600 text-stone-400'} cursor-pointer`}
                              >B</button>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-stone-400">
                              <input type="number" min={0} max={100} value={sponsor.ab?.weightA ?? 50} onChange={(e) => {
                                const updated = [...sponsors];
                                updated[idx] = { ...updated[idx], ab: { ...updated[idx].ab!, weightA: Number(e.target.value) } };
                                setSponsors(updated);
                              }} className="w-12 bg-stone-800 border border-stone-600 rounded px-1 py-0.5 text-center text-xs text-white" />
                              <span>/</span>
                              <input type="number" min={0} max={100} value={sponsor.ab?.weightB ?? 50} onChange={(e) => {
                                const updated = [...sponsors];
                                updated[idx] = { ...updated[idx], ab: { ...updated[idx].ab!, weightB: Number(e.target.value) } };
                                setSponsors(updated);
                              }} className="w-12 bg-stone-800 border border-stone-600 rounded px-1 py-0.5 text-center text-xs text-white" />
                            </div>
                          </>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Before Text</label>
                          <input
                            type="text"
                            value={currentBefore}
                            onChange={(e) => handleFieldChange('beforeText', e.target.value)}
                            placeholder="Supported by "
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-stone-400 mb-1">Link Text</label>
                          <input
                            type="text"
                            value={currentLink}
                            onChange={(e) => handleFieldChange('linkText', e.target.value)}
                            placeholder="Stand With Crypto"
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-stone-400 mb-1">After Text</label>
                        <input
                          type="text"
                          value={currentAfter}
                          onChange={(e) => handleFieldChange('afterText', e.target.value)}
                          placeholder=". Join the Fight for Sensible Crypto Policy!"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-stone-400 mb-1">URL</label>
                        <input
                          type="url"
                          value={currentUrl}
                          onChange={(e) => handleFieldChange('url', e.target.value)}
                          placeholder="https://..."
                          className={inputClass}
                        />
                      </div>
                      {/* Inline preview */}
                      <div className="text-xs text-stone-500 bg-stone-950/50 rounded-lg px-3 py-2">
                        Preview{viewingB ? ' (B)' : ''}: <span className="text-stone-300">{currentBefore}<span className="text-blue-400 underline">{currentLink}</span>{currentAfter}</span>
                      </div>
                      <button
                        onClick={() => setEditingSponsorIndex(null)}
                        className="text-green-400 hover:text-green-300 cursor-pointer p-1 flex items-center gap-1 text-sm"
                      >
                        <Save className="w-4 h-4" />
                        Done
                      </button>
                    </div>
                    );
                  })() : (
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-stone-500 cursor-grab shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-stone-300 truncate">
                          {sponsor.beforeText}<span className="font-medium text-white">{sponsor.linkText || '(no link text)'}</span>{sponsor.afterText}
                        </p>
                        <p className="text-xs text-stone-500 truncate mt-0.5">{sponsor.url || '(no url)'}</p>
                      </div>
                      {sponsor.ab?.enabled && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-purple-500/20 text-purple-400 rounded-full border border-purple-500/30">A/B</span>
                      )}
                      <button
                        onClick={() => setEditingSponsorIndex(idx)}
                        className="text-stone-400 hover:text-white cursor-pointer p-1"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setSponsors(sponsors.filter((_, i) => i !== idx))}
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

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => saveConfig('sponsors', sponsors)}
              disabled={saving}
              className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Sponsors
            </button>
          </div>

        </>
      )}
    </div>
  );
}
