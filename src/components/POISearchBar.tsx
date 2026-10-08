'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MapPin, BedDouble, Utensils, Wine, Laptop, Users,
  Search, X, Plus, Loader2, Check,
} from 'lucide-react';
import type { MapRef } from 'react-map-gl/mapbox';
import { useAuth } from '@/contexts/AuthContext';
import { useGeocoder } from '@/hooks/useGeocoder';
import { trackPoiAdd, trackPoiCategorySelect, trackPoiShareToggle } from '@/lib/analytics';
import type { GeocoderResult } from '@/hooks/useGeocoder';
import { POI_CATEGORIES } from '@/lib/constants';
import type { POICategory } from '@/lib/types';

function inferCategory(poiCategories: string[]): POICategory {
  const cats = poiCategories.map(c => c.toLowerCase());
  if (cats.some(c => ['hotel', 'lodging', 'motel', 'hostel', 'inn', 'bed and breakfast'].includes(c))) return 'hotel';
  if (cats.some(c => ['restaurant', 'food', 'cafe', 'coffee', 'bakery', 'diner', 'pizza', 'fast food', 'breakfast'].includes(c))) return 'food';
  if (cats.some(c => ['bar', 'pub', 'brewery', 'winery', 'nightlife', 'cocktail', 'beer', 'lounge', 'wine bar'].includes(c))) return 'drink';
  if (cats.some(c => ['coworking', 'office', 'coworking space', 'business center', 'library'].includes(c))) return 'work';
  return 'pin';
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  MapPin,
  BedDouble,
  Utensils,
  Wine,
  Laptop,
  Users,
};

interface POISearchBarProps {
  onAddPOI?: (poi: {
    name: string;
    lat: number;
    lng: number;
    address?: string | null;
    category: POICategory;
    note?: string | null;
    is_public?: boolean;
  }) => Promise<unknown>;
  mapRef?: React.RefObject<MapRef | null>;
  onSignIn?: () => void;
}

export function POISearchBar({ onAddPOI, mapRef, onSignIn }: POISearchBarProps) {
  const { user } = useAuth();
  const { query, search, results, loading, select, clear } = useGeocoder();

  const [expanded, setExpanded] = useState(false);
  const [selectedResult, setSelectedResult] = useState<{
    text: string;
    place_name: string;
    full_address: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [category, setCategory] = useState<POICategory>('pin');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [isPublic, setIsPublic] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus input when expanded
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const handleClose = useCallback(() => {
    setExpanded(false);
    setSelectedResult(null);
    setCategory('pin');
    setName('');
    setIsPublic(false);
    clear();
  }, [clear]);

  // Close on Escape
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expanded, handleClose]);

  const handleSelectResult = useCallback(
    async (result: GeocoderResult) => {
      const resolved = await select(result.mapbox_id);
      if (resolved) {
        setSelectedResult(resolved);
        setName(resolved.text);
        setCategory(inferCategory(resolved.poi_categories));
      }
      clear();
    },
    [select, clear]
  );

  const handleConfirm = useCallback(async () => {
    if (!selectedResult || !name.trim() || !onAddPOI) return;
    setSaving(true);
    await onAddPOI({
      name: name.trim(),
      lat: selectedResult.lat,
      lng: selectedResult.lng,
      address: selectedResult.full_address || selectedResult.place_name,
      category,
      is_public: isPublic,
    });
    trackPoiAdd(category);
    setSaving(false);
    handleClose();
  }, [selectedResult, name, category, isPublic, onAddPOI, handleClose]);

  if (!expanded) {
    return (
      <div className="absolute top-2 left-12 z-10">
        <button
          onClick={() => user ? setExpanded(true) : onSignIn?.()}
          className="flex items-center gap-1.5 px-3 py-2 bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-lg text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] active:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer shadow-lg"
        >
          <Plus className="w-3.5 h-3.5" />
          Add pin
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute top-2 left-12 z-10 w-72 bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-lg shadow-xl"
    >
      {/* Search input or selected result form */}
      {!selectedResult ? (
        <div className="relative">
          <div className="flex items-center gap-2 px-3 py-2">
            <Search className="w-4 h-4 text-[var(--theme-text-secondary)] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                const map = mapRef?.current;
                const center = map ? { lng: map.getCenter().lng, lat: map.getCenter().lat } : undefined;
                const bounds = map?.getBounds();
                const bbox = bounds ? [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()] as [number, number, number, number] : undefined;
                search(e.target.value, { proximity: center, bbox });
              }}
              placeholder="Search for a place..."
              className="flex-1 bg-transparent text-sm text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-muted)] outline-none"
            />
            {loading && <Loader2 className="w-4 h-4 text-[var(--theme-text-secondary)] animate-spin shrink-0" />}
            <button
              onClick={handleClose}
              className="p-0.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors"
              aria-label="Close search"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Results dropdown */}
          {results.length > 0 && (
            <div className="border-t border-[var(--theme-border-primary)] max-h-52 overflow-y-auto">
              {results.map((result, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectResult(result)}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--theme-bg-tertiary)] active:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer"
                >
                  <p className="text-sm text-[var(--theme-text-primary)] truncate">{result.text}</p>
                  <p className="text-xs text-[var(--theme-text-secondary)] truncate">{result.place_name}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-3 space-y-3">
          {/* Name input */}
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pin name"
              className="w-full bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-primary)] rounded px-2.5 py-1.5 text-sm text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[var(--theme-text-muted)]"
              maxLength={60}
            />
            <p className="text-xs text-[var(--theme-text-muted)] mt-1 truncate">{selectedResult.place_name}</p>
          </div>

          {/* Category picker */}
          <div className="flex items-center gap-1.5">
            {POI_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.icon];
              const isActive = category === cat.value;
              return (
                <button
                  key={cat.value}
                  onClick={() => { trackPoiCategorySelect(cat.value); setCategory(cat.value as POICategory); }}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors cursor-pointer ${
                    isActive
                      ? 'border-white/30 bg-[var(--theme-bg-tertiary)]'
                      : 'border-[var(--theme-border-primary)] bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-tertiary)]'
                  }`}
                  title={cat.label}
                  aria-label={cat.label}
                >
                  {Icon && <span style={{ color: cat.color }}><Icon className="w-4 h-4" /></span>}
                </button>
              );
            })}
          </div>

          {/* Share toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--theme-text-secondary)]">Share with friends</span>
            <button
              type="button"
              onClick={() => setIsPublic(v => { trackPoiShareToggle(!v); return !v; })}
              className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                isPublic ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-border-primary)]'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                isPublic ? 'translate-x-4' : ''
              }`} />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleConfirm}
              disabled={!name.trim() || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] active:bg-[var(--theme-accent-hover)] disabled:opacity-50 text-[var(--theme-accent-text)] text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Add
            </button>
            <button
              onClick={handleClose}
              className="px-3 py-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
