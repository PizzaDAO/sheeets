// Date/time/cost formatting helpers shared by the event extractors
// (`event-extractors.ts`) and, eventually, the ingestion normalizer.
// Moved verbatim out of `src/app/api/fetch-event/route.ts` — no behavior change.

/** Format an ISO date string as "YYYY-MM-DD" in the given timezone */
export function formatDateISO(isoDate: string, timezone: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    const parts = d.toLocaleDateString('en-CA', { timeZone: timezone }).split('-');
    return parts.join('-');
  } catch {
    return '';
  }
}

/** Format an ISO date string as "HH:mm" (24h) in the given timezone */
export function formatTime24(isoDate: string, timezone: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    });
  } catch {
    return '';
  }
}

/** Parse cost from cents integer */
export function formatCost(priceCents: number | null | undefined): string {
  if (!priceCents || priceCents === 0) return 'Free';
  const dollars = priceCents / 100;
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
}

/** Try to guess a timezone from an ISO 8601 offset like "+05:30" or "-06:00".
 *  Returns a representative IANA timezone or the provided default. */
export function guessTimezoneFromOffset(isoDate: string, fallback: string): string {
  // Common offset -> IANA timezone mapping (covers major US/EU/Asia offsets)
  const offsetMap: Record<string, string> = {
    '-12:00': 'Etc/GMT+12',
    '-11:00': 'Pacific/Pago_Pago',
    '-10:00': 'Pacific/Honolulu',
    '-09:00': 'America/Anchorage',
    '-08:00': 'America/Los_Angeles',
    '-07:00': 'America/Denver',
    '-06:00': 'America/Chicago',
    '-05:00': 'America/New_York',
    '-04:00': 'America/Santiago',
    '-03:00': 'America/Sao_Paulo',
    '-02:00': 'Etc/GMT+2',
    '-01:00': 'Atlantic/Azores',
    '+00:00': 'UTC',
    '+01:00': 'Europe/Paris',
    '+02:00': 'Europe/Helsinki',
    '+03:00': 'Europe/Moscow',
    '+04:00': 'Asia/Dubai',
    '+05:00': 'Asia/Karachi',
    '+05:30': 'Asia/Kolkata',
    '+06:00': 'Asia/Dhaka',
    '+07:00': 'Asia/Bangkok',
    '+08:00': 'Asia/Singapore',
    '+09:00': 'Asia/Tokyo',
    '+10:00': 'Australia/Sydney',
    '+11:00': 'Pacific/Guadalcanal',
    '+12:00': 'Pacific/Auckland',
  };

  const m = isoDate.match(/([+-]\d{2}:\d{2})$/);
  if (m) {
    return offsetMap[m[1]] || fallback;
  }
  // Z means UTC
  if (isoDate.endsWith('Z')) return 'UTC';
  return fallback;
}
