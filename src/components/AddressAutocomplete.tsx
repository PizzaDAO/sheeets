'use client';

import { useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onCoordsChange?: (coords: { lat: number; lng: number } | null) => void;
  placeholder?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onCoordsChange,
  placeholder = '1234 Market St, Denver',
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const onCoordsChangeRef = useRef(onCoordsChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onCoordsChangeRef.current = onCoordsChange;
  }, [onCoordsChange]);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    const initAutocomplete = () => {
      if (!inputRef.current || !window.google?.maps?.places) return;

      const autocomplete = new window.google.maps.places.Autocomplete(
        inputRef.current,
        {
          types: ['geocode', 'establishment'],
          fields: ['formatted_address', 'name', 'geometry'],
        }
      );

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const address = place.formatted_address || place.name || '';
        if (address) onChangeRef.current(address);

        // Extract coordinates from geometry if available
        const location = place.geometry?.location;
        if (location && onCoordsChangeRef.current) {
          onCoordsChangeRef.current({
            lat: location.lat(),
            lng: location.lng(),
          });
        }
      });
    };

    // Already loaded
    if (window.google?.maps?.places) {
      initAutocomplete();
      return;
    }

    // Script tag exists but still loading
    const existing = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    if (existing) {
      const wait = () => {
        if (window.google?.maps?.places) initAutocomplete();
        else setTimeout(wait, 100);
      };
      wait();
      return;
    }

    // Load script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=Function.prototype`;
    script.async = true;
    script.defer = true;
    script.onload = () => initAutocomplete();
    document.head.appendChild(script);
  }, []);

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-muted)] pointer-events-none z-10" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // Clear coords when user types manually (no longer from autocomplete)
          if (onCoordsChange) onCoordsChange(null);
        }}
        placeholder={placeholder}
        className="w-full bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg text-[var(--theme-text-primary)] text-sm pl-9 pr-3 py-2 focus:border-[var(--theme-accent)] focus:outline-none placeholder:text-[var(--theme-text-muted)]"
      />
    </div>
  );
}
