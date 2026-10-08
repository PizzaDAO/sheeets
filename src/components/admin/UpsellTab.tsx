'use client';

import { Loader2 } from 'lucide-react';
import type { AdminConfig, UpsellCopy } from '@/lib/types';
import { useConfigState, type SaveConfigFn } from './hooks/useAdminConfigEditor';
import { inputClass, btnPrimary } from './styles';

interface Props {
  adminConfig: AdminConfig | null;
  configLoading: boolean;
  saving: boolean;
  saveConfig: SaveConfigFn;
}

export default function UpsellTab({ adminConfig, configLoading, saving, saveConfig }: Props) {
  const [upsellCopy, setUpsellCopy] = useConfigState<UpsellCopy>(
    adminConfig,
    (c) => c?.upsell_copy || { heading: '', body: '', cta_text: '', cta_url: '' },
  );

  return (
    <div className="space-y-6">
      {configLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading config...
        </div>
      ) : (
        <>
          <div className="bg-stone-900 rounded-xl p-4 border border-stone-700 space-y-4">
            <h3 className="text-sm font-semibold text-white">Upsell Copy (shown after event submission)</h3>

            <div>
              <label className="block text-xs text-stone-400 mb-1">Heading</label>
              <input
                type="text"
                value={upsellCopy.heading}
                onChange={(e) => setUpsellCopy({ ...upsellCopy, heading: e.target.value })}
                placeholder="Want more visibility?"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs text-stone-400 mb-1">Body</label>
              <textarea
                value={upsellCopy.body}
                onChange={(e) => setUpsellCopy({ ...upsellCopy, body: e.target.value })}
                placeholder="Highlight your event and get featured placement..."
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-stone-400 mb-1">CTA Text</label>
                <input
                  type="text"
                  value={upsellCopy.cta_text}
                  onChange={(e) => setUpsellCopy({ ...upsellCopy, cta_text: e.target.value })}
                  placeholder="Learn More — $500"
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-stone-400 mb-1">CTA URL</label>
                <input
                  type="url"
                  value={upsellCopy.cta_url}
                  onChange={(e) => setUpsellCopy({ ...upsellCopy, cta_url: e.target.value })}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="bg-stone-900 rounded-xl p-4 border border-stone-700">
            <h3 className="text-sm font-semibold text-white mb-3">Preview</h3>
            <div className="max-w-md mx-auto">
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/10 border border-amber-500/30">
                <h4 className="text-sm font-semibold text-amber-300 mb-1">
                  {upsellCopy.heading || 'Heading...'}
                </h4>
                <p className="text-xs text-stone-400 mb-3">
                  {upsellCopy.body || 'Body text...'}
                </p>
                <a
                  href={upsellCopy.cta_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-stone-900 rounded-lg transition-colors"
                >
                  {upsellCopy.cta_text || 'CTA Text'}
                </a>
              </div>
            </div>
          </div>

          <button
            onClick={() => saveConfig('upsell_copy', upsellCopy)}
            disabled={saving}
            className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Upsell Copy
          </button>
        </>
      )}
    </div>
  );
}
