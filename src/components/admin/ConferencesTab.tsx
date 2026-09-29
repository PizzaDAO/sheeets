'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2, Pencil, Save, X, ChevronDown, Eye } from 'lucide-react';
import { PlaceLookup } from '@/components/PlaceLookup';
import type { ConferenceConfig } from '@/lib/types';
import { isConferencePast } from '@/lib/conferences';
import type { SaveConfigFn } from './hooks/useAdminConfigEditor';
import { inputClass, btnPrimary } from './styles';

const KNOWN_GIDS: { gid: number; name: string }[] = [
  { gid: 621468538, name: 'ETHDenver 2025' },
  { gid: 213147189, name: 'CES LAS VEGAS 2025' },
  { gid: 1199055119, name: 'Token2049 Dubai 2025' },
  { gid: 1389731314, name: 'NFT Paris 2025' },
  { gid: 246719283, name: 'Consensus 2025' },
  { gid: 733250516, name: 'NFC Summit Lisbon 2025' },
  { gid: 2000776073, name: 'NFT NYC / Permissionless 2025' },
  { gid: 377806756, name: 'CONSENSUS HK 2026' },
  { gid: 356217373, name: 'ETH DENVER 2026' },
  { gid: 666597336, name: 'DAS 2026' },
  { gid: 437576609, name: 'ETHCC 2026' },
  { gid: 1543768695, name: 'SXSW 2026' },
  { gid: 1965015727, name: 'TEAMZ 2026' },
  { gid: 1604258025, name: 'PBW 2026' },
  { gid: 1002070994, name: 'Bitcoin Vegas' },
  { gid: 2092019144, name: 'Consensus Miami' },
  { gid: 2043780918, name: 'CES LAS VEGAS 2026' },
  { gid: 100522285, name: 'ETHCC 2025' },
  { gid: 1138663114, name: 'Berlin Blockchain Week 2025' },
  { gid: 881139194, name: 'Malaysia Blockchain Week 2025' },
  { gid: 2048840578, name: 'WebX 2025' },
  { gid: 1893526059, name: 'Bitcoin Asia 2025' },
  { gid: 1049919215, name: 'TBW 2025' },
  { gid: 120573008, name: 'KBW 2025' },
  { gid: 1050529252, name: 'Token 2049' },
  { gid: 218449335, name: 'ADE 2025' },
  { gid: 1292905087, name: 'Art Basel Miami 2024' },
  { gid: 1380177749, name: 'Devcon 2025' },
  { gid: 1932321572, name: 'SXSW 2025' },
  { gid: 102931368, name: 'Art Basel Miami' },
  { gid: 1672479012, name: 'GDC 2026' },
];

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
];

interface Props {
  conferences: ConferenceConfig[];
  setConferences: React.Dispatch<React.SetStateAction<ConferenceConfig[]>>;
  configLoading: boolean;
  saving: boolean;
  saveConfig: SaveConfigFn;
}

export default function ConferencesTab({ conferences, setConferences, configLoading, saving, saveConfig }: Props) {
  const [editingConfIdx, setEditingConfIdx] = useState<number | null>(null);
  const [addingConference, setAddingConference] = useState(false);
  const [newConference, setNewConference] = useState<ConferenceConfig>({
    gid: 0, name: '', slug: '', timezone: 'America/New_York',
    startDate: '', endDate: '', center: { lat: 0, lng: 0 },
  });
  const [showGidDropdown, setShowGidDropdown] = useState(false);
  const [newConfShowGidDropdown, setNewConfShowGidDropdown] = useState(false);

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
                <h3 className="text-sm font-semibold text-white">Conferences</h3>
                <p className="text-xs text-stone-500 mt-0.5">Manage conference tabs. Sorted by start date. Past conferences auto-hide.</p>
              </div>
              <button
                onClick={() => {
                  setAddingConference(true);
                  setNewConference({
                    gid: 0, name: '', slug: '', timezone: 'America/New_York',
                    startDate: '', endDate: '', center: { lat: 0, lng: 0 },
                  });
                }}
                className={`${btnPrimary} flex items-center gap-1.5`}
              >
                <Plus className="w-4 h-4" />
                Add Conference
              </button>
            </div>

            {/* Add Conference Form */}
            {addingConference && (
              <div className="mb-4 p-4 bg-stone-800 rounded-lg border border-blue-500/50 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-blue-400">New Conference</h4>
                  <button onClick={() => setAddingConference(false)} className="text-stone-400 hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Name</label>
                    <input
                      type="text"
                      value={newConference.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-')[0] || '';
                        setNewConference({ ...newConference, name, slug });
                      }}
                      placeholder="ETHDenver 2027"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Slug</label>
                    <input
                      type="text"
                      value={newConference.slug}
                      onChange={(e) => setNewConference({ ...newConference, slug: e.target.value })}
                      placeholder="ethdenver"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <label className="block text-xs text-stone-400 mb-1">GID (Sheet Tab ID)</label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        value={newConference.gid || ''}
                        onChange={(e) => setNewConference({ ...newConference, gid: Number(e.target.value) })}
                        placeholder="123456789"
                        className={inputClass}
                      />
                      <button
                        onClick={() => setNewConfShowGidDropdown(!newConfShowGidDropdown)}
                        className="shrink-0 px-2 py-1 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-lg text-xs cursor-pointer"
                        title="Select from known GIDs"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                    {newConfShowGidDropdown && (
                      <div className="absolute z-20 mt-1 left-0 right-0 bg-stone-800 border border-stone-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {KNOWN_GIDS.map((kg) => (
                          <button
                            key={kg.gid}
                            onClick={() => {
                              setNewConference({ ...newConference, gid: kg.gid, name: newConference.name || kg.name });
                              setNewConfShowGidDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-stone-700 cursor-pointer"
                          >
                            {kg.name} <span className="text-stone-500">({kg.gid})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Timezone</label>
                    <select
                      value={newConference.timezone}
                      onChange={(e) => setNewConference({ ...newConference, timezone: e.target.value })}
                      className={inputClass}
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={newConference.startDate}
                      onChange={(e) => setNewConference({ ...newConference, startDate: e.target.value })}
                      className={inputClass}
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-400 mb-1">End Date</label>
                    <input
                      type="date"
                      value={newConference.endDate}
                      onChange={(e) => setNewConference({ ...newConference, endDate: e.target.value })}
                      className={inputClass}
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                </div>
                <PlaceLookup
                  value={newConference.center}
                  onChange={(center) => setNewConference({ ...newConference, center })}
                  inputClass={inputClass}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (!newConference.name || !newConference.gid || !newConference.startDate || !newConference.endDate) return;
                      const updated = [...conferences, newConference].sort((a, b) => a.startDate.localeCompare(b.startDate));
                      setConferences(updated);
                      setAddingConference(false);
                    }}
                    disabled={!newConference.name || !newConference.gid || !newConference.startDate || !newConference.endDate}
                    className={`${btnPrimary} flex items-center gap-1.5 ${(!newConference.name || !newConference.gid || !newConference.startDate || !newConference.endDate) ? 'opacity-50' : ''}`}
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                  <button onClick={() => setAddingConference(false)} className="text-stone-400 hover:text-white text-sm cursor-pointer px-3">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {conferences.length === 0 && !addingConference && (
              <p className="text-stone-500 text-sm py-4 text-center">No conferences configured. Using fallback defaults.</p>
            )}

            {/* Conference List */}
            <div className="space-y-2">
              {(() => {
                const activeConfs = conferences.filter((c) => !c.hidden && !isConferencePast(c));
                const pastOrHidden = conferences.filter((c) => c.hidden || isConferencePast(c));
                const sortedActive = [...activeConfs].sort((a, b) => a.startDate.localeCompare(b.startDate));
                const sortedPast = [...pastOrHidden].sort((a, b) => b.startDate.localeCompare(a.startDate));

                return (
                  <>
                    {sortedActive.map((conf) => {
                      const idx = conferences.indexOf(conf);
                      const isEditing = editingConfIdx === idx;
                      return (
                        <div
                          key={`${conf.gid}-${conf.slug}`}
                          className="p-3 bg-stone-800 rounded-lg border border-stone-600"
                        >
                          {isEditing ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs text-stone-400 mb-1">Name</label>
                                  <input
                                    type="text"
                                    value={conf.name}
                                    onChange={(e) => {
                                      const updated = [...conferences];
                                      updated[idx] = { ...updated[idx], name: e.target.value };
                                      setConferences(updated);
                                    }}
                                    className={inputClass}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-stone-400 mb-1">Slug</label>
                                  <input
                                    type="text"
                                    value={conf.slug}
                                    onChange={(e) => {
                                      const updated = [...conferences];
                                      updated[idx] = { ...updated[idx], slug: e.target.value };
                                      setConferences(updated);
                                    }}
                                    className={inputClass}
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="relative">
                                  <label className="block text-xs text-stone-400 mb-1">GID</label>
                                  <div className="flex gap-1">
                                    <input
                                      type="number"
                                      value={conf.gid || ''}
                                      onChange={(e) => {
                                        const updated = [...conferences];
                                        updated[idx] = { ...updated[idx], gid: Number(e.target.value) };
                                        setConferences(updated);
                                      }}
                                      className={inputClass}
                                    />
                                    <button
                                      onClick={() => setShowGidDropdown(showGidDropdown ? false : true)}
                                      className="shrink-0 px-2 py-1 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-lg text-xs cursor-pointer"
                                    >
                                      <ChevronDown className="w-3 h-3" />
                                    </button>
                                  </div>
                                  {showGidDropdown && editingConfIdx === idx && (
                                    <div className="absolute z-20 mt-1 left-0 right-0 bg-stone-800 border border-stone-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                      {KNOWN_GIDS.map((kg) => (
                                        <button
                                          key={kg.gid}
                                          onClick={() => {
                                            const updated = [...conferences];
                                            updated[idx] = { ...updated[idx], gid: kg.gid };
                                            setConferences(updated);
                                            setShowGidDropdown(false);
                                          }}
                                          className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-stone-700 cursor-pointer"
                                        >
                                          {kg.name} <span className="text-stone-500">({kg.gid})</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <label className="block text-xs text-stone-400 mb-1">Timezone</label>
                                  <select
                                    value={conf.timezone}
                                    onChange={(e) => {
                                      const updated = [...conferences];
                                      updated[idx] = { ...updated[idx], timezone: e.target.value };
                                      setConferences(updated);
                                    }}
                                    className={inputClass}
                                  >
                                    {COMMON_TIMEZONES.map((tz) => (
                                      <option key={tz} value={tz}>{tz}</option>
                                    ))}
                                    {!COMMON_TIMEZONES.includes(conf.timezone) && (
                                      <option value={conf.timezone}>{conf.timezone}</option>
                                    )}
                                  </select>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs text-stone-400 mb-1">Start Date</label>
                                  <input
                                    type="date"
                                    value={conf.startDate}
                                    onChange={(e) => {
                                      const updated = [...conferences];
                                      updated[idx] = { ...updated[idx], startDate: e.target.value };
                                      setConferences(updated);
                                    }}
                                    className={inputClass}
                                    style={{ colorScheme: 'dark' }}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-stone-400 mb-1">End Date</label>
                                  <input
                                    type="date"
                                    value={conf.endDate}
                                    onChange={(e) => {
                                      const updated = [...conferences];
                                      updated[idx] = { ...updated[idx], endDate: e.target.value };
                                      setConferences(updated);
                                    }}
                                    className={inputClass}
                                    style={{ colorScheme: 'dark' }}
                                  />
                                </div>
                              </div>
                              <PlaceLookup
                                value={conf.center}
                                onChange={(center) => {
                                  const updated = [...conferences];
                                  updated[idx] = { ...updated[idx], center };
                                  setConferences(updated);
                                }}
                                inputClass={inputClass}
                              />
                              <button
                                onClick={() => { setEditingConfIdx(null); setShowGidDropdown(false); }}
                                className="text-green-400 hover:text-green-300 cursor-pointer p-1 flex items-center gap-1 text-sm"
                              >
                                <Save className="w-4 h-4" />
                                Done
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-white">{conf.name}</p>
                                </div>
                                <p className="text-xs text-stone-400 mt-0.5">
                                  /{conf.slug} &middot; GID: {conf.gid} &middot; {conf.startDate} to {conf.endDate} &middot; {conf.timezone}
                                </p>
                                <p className="text-xs text-stone-500 mt-0.5">
                                  Center: {conf.center.lat}, {conf.center.lng}
                                </p>
                              </div>
                              <button
                                onClick={() => { setEditingConfIdx(idx); setShowGidDropdown(false); }}
                                className="text-stone-400 hover:text-white cursor-pointer p-1"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  const updated = [...conferences];
                                  updated[idx] = { ...updated[idx], hidden: true };
                                  setConferences(updated);
                                }}
                                className="text-stone-400 hover:text-amber-400 cursor-pointer p-1"
                                title="Hide"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  const updated = conferences.filter((_, i) => i !== idx);
                                  setConferences(updated);
                                }}
                                className="text-red-400 hover:text-red-300 cursor-pointer p-1"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Past / Hidden section */}
                    {sortedPast.length > 0 && (
                      <>
                        <div className="text-xs text-stone-500 uppercase tracking-wider pt-3 pb-1 border-t border-stone-700 mt-3">
                          Past / Hidden
                        </div>
                        {sortedPast.map((conf) => {
                          const idx = conferences.indexOf(conf);
                          const past = isConferencePast(conf);
                          return (
                            <div
                              key={`${conf.gid}-${conf.slug}`}
                              className="p-3 bg-stone-800/50 rounded-lg border border-stone-700 opacity-60"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-stone-400">{conf.name}</p>
                                    {past && (
                                      <span className="text-[10px] font-bold uppercase bg-stone-700 text-stone-400 px-1.5 py-0.5 rounded-full">Past</span>
                                    )}
                                    {conf.hidden && (
                                      <span className="text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">Hidden</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-stone-500 mt-0.5">
                                    /{conf.slug} &middot; GID: {conf.gid} &middot; {conf.startDate} to {conf.endDate}
                                  </p>
                                </div>
                                <button
                                  onClick={() => {
                                    const updated = [...conferences];
                                    updated[idx] = { ...updated[idx], hidden: false };
                                    setConferences(updated);
                                  }}
                                  className="text-stone-400 hover:text-green-400 cursor-pointer px-2 py-1 text-xs border border-stone-600 rounded-lg"
                                  title="Restore"
                                >
                                  Restore
                                </button>
                                <button
                                  onClick={() => {
                                    const updated = conferences.filter((_, i) => i !== idx);
                                    setConferences(updated);
                                  }}
                                  className="text-red-400 hover:text-red-300 cursor-pointer p-1"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => saveConfig('conferences', conferences)}
              disabled={saving}
              className={`${btnPrimary} flex items-center gap-2 ${saving ? 'opacity-50' : ''}`}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Conferences
            </button>
            {conferences.length === 0 && (
              <span className="text-xs text-stone-500">No conferences saved — using fallback defaults</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
