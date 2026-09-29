export function parseDateToISO(dateStr: string): string {
  if (!dateStr) return '';
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04',
    may: '05', jun: '06', jul: '07', aug: '08',
    sep: '09', oct: '10', nov: '11', dec: '12',
  };
  // Match the month token (handles "Sep 2", "September 2", and "Wed, September 2"),
  // then normalize to its first three letters so full names and abbreviations both resolve.
  const match = dateStr.match(/([A-Za-z]+)\s+(\d+)/);
  if (!match) return '';
  const month = months[match[1].slice(0, 3).toLowerCase()];
  if (!month) return '';
  const day = match[2].padStart(2, '0');
  return `2026-${month}-${day}`;
}

export function parseTimeToHour(timeStr: string): number | null {
  if (!timeStr) return null;
  const normalized = timeStr.toLowerCase().trim();
  if (normalized === 'all day' || normalized === 'tbd') return null;

  const match = normalized.match(/(\d{1,2}):?(\d{2})?\s*(am?|pm?)?/i);
  if (!match) return null;

  let hour = parseInt(match[1]);
  const isPM = match[3] && match[3].startsWith('p');
  const isAM = match[3] && match[3].startsWith('a');

  if (isPM && hour !== 12) hour += 12;
  if (isAM && hour === 12) hour = 0;

  return hour;
}

export function getTimeOfDay(timeStr: string): 'morning' | 'afternoon' | 'evening' | 'night' | 'all-day' {
  const hour = parseTimeToHour(timeStr);
  if (hour === null) return 'all-day';
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export function isFreeEvent(cost: string): boolean {
  if (!cost) return true;
  const lower = cost.toLowerCase().trim();
  return lower === 'free' || lower === '' || lower === '0' || lower === '$0';
}

export function normalizeAddress(address: string): string {
  return address.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,]+$/, '');
}

/**
 * Shorten a full address to just the venue name or street address.
 * Strips city, state, ZIP, and country suffixes.
 * "Improper City 3201 Walnut St #107, Denver, CO 80205, USA" → "Improper City 3201 Walnut St #107"
 * "4850 National Western Dr Denver, CO 80216, USA" → "4850 National Western Dr"
 * "CSU Spur Hydro Building" → "CSU Spur Hydro Building"
 */
export function shortenAddress(address: string): string {
  if (!address) return '';

  // Split on common separators: comma, middle dot, pipe
  const parts = address.split(/[,·|]/).map(s => s.trim());

  // Take the first segment — it's usually "Venue Name Street Address"
  let short = parts[0];

  // Strip trailing city name if it's glued on without comma
  // Pattern: "... St Denver" or "... Dr Denver" — street suffix followed by city
  const streetSuffixCity = short.match(/^(.+?\b(?:st|street|ave|avenue|blvd|boulevard|dr|drive|rd|road|way|pl|place|ct|court|ln|lane|cir|circle|pkwy|parkway|hwy|highway)\b(?:\s+(?:#|ste|suite|unit|apt|bldg|floor|fl)\s*\S+)?)\s+([a-zA-Z][a-zA-Z\s]+)$/i);
  if (streetSuffixCity) {
    const possibleCity = streetSuffixCity[2].trim().toLowerCase();
    // Common city names and state abbreviations to strip
    const cities = ['denver', 'boulder', 'miami', 'austin', 'new york', 'san francisco', 'las vegas', 'edgewater', 'paris', 'prague', 'london', 'lisbon', 'singapore', 'dubai', 'hong kong', 'bangkok', 'istanbul', 'barcelona'];
    if (cities.includes(possibleCity) || /^[a-z]{2}$/.test(possibleCity)) {
      short = streetSuffixCity[1];
    }
  }

  return short;
}

export function formatDateLabel(isoDate: string): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(isoDate + 'T12:00:00');
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

/**
 * True if `url` is an absolute http(s) URL. Use before rendering untrusted
 * links (sheet/event links, ad links, CTA URLs, profile URLs) as href so
 * `javascript:` / `data:` etc. can never become clickable.
 */
export function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Like isSafeHttpUrl, but also allows mailto: links (e.g. "Get in touch" CTAs). */
export function isSafeLinkUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  try {
    const protocol = new URL(url.trim()).protocol;
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}
