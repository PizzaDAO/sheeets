'use client';

import { useState } from 'react';
import { MapPin, MapPinCheck } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import type { LocationSettings as LocationSettingsFields } from '@/lib/types';

interface ToggleRowProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow({ id, icon, label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-[var(--theme-text-muted)] shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <label htmlFor={id} className="block text-sm text-[var(--theme-text-primary)] cursor-pointer">
          {label}
        </label>
        <p className="text-xs text-[var(--theme-text-muted)] leading-snug mt-0.5">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
          checked ? 'bg-green-600' : 'bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-primary)]'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </button>
    </div>
  );
}

/** Opt-in location settings (both default OFF), shown in the user menu. */
export function LocationSettings() {
  const { profile, updateLocationSettings } = useProfile();
  const [saving, setSaving] = useState<keyof LocationSettingsFields | null>(null);

  if (!profile) return null;

  const update = async (key: keyof LocationSettingsFields, value: boolean) => {
    setSaving(key);
    await updateLocationSettings({ [key]: value });
    setSaving(null);
  };

  return (
    <div className="border-t border-[var(--theme-border-primary)] pt-4 space-y-3">
      <p className="text-xs font-medium text-[var(--theme-text-muted)] uppercase tracking-wide">Location</p>
      <ToggleRow
        id="share-live-location"
        icon={<MapPin className="w-4 h-4" />}
        label="Share my live location with friends"
        description="Friends see your approximate position on the map, updated while plan.wtf is open. Turning this off deletes your stored location. Events you check in to are always shown to friends at the venue."
        checked={!!profile.share_live_location}
        disabled={saving === 'share_live_location'}
        onChange={(v) => update('share_live_location', v)}
      />
      <ToggleRow
        id="auto-check-in"
        icon={<MapPinCheck className="w-4 h-4" />}
        label="Auto check-in at events in my plan"
        description="Checks you in after ~90 seconds within 150m of a live event in your plan (friends will see you there). Only works while plan.wtf is open, and you can undo each one."
        checked={!!profile.auto_check_in}
        disabled={saving === 'auto_check_in'}
        onChange={(v) => update('auto_check_in', v)}
      />
    </div>
  );
}
