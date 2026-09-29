/**
 * Luma form field scanner — fetches registration questions for a Luma event.
 *
 * Uses the public Luma API: GET https://api.lu.ma/url?url={slug}
 * Returns the event's registration_questions[], event api_id, and name_requirement.
 */

import type { LumaRegistrationQuestion } from './types';
import { safeFetch } from './safe-fetch';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENT = 'Mozilla/5.0 (compatible; SheetsEventBot/1.0; +https://sheeets.com)';
const FETCH_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScannedFormResult {
  eventApiId: string;
  eventName: string;
  nameRequirement: string | null;     // 'full-name' | 'first-last'
  questions: LumaRegistrationQuestion[];
}

// ---------------------------------------------------------------------------
// Scan form fields for a Luma event slug
// ---------------------------------------------------------------------------

export async function scanLumaFormFields(slug: string): Promise<ScannedFormResult> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(slug)) {
    throw new Error('Invalid Luma slug');
  }

  // Server-side fetches of user-influenced URLs go through safeFetch
  // (SSRF guard, per-hop redirect validation, timeout, body size cap).
  const res = await safeFetch(`https://api.lu.ma/url?url=${encodeURIComponent(slug)}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    timeoutMs: FETCH_TIMEOUT_MS,
    maxBytes: 1024 * 1024,
  });

  if (!res.ok) {
    throw new Error(`Luma API returned HTTP ${res.status} for slug "${slug}"`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try {
    data = JSON.parse(res.text);
  } catch {
    throw new Error(`Luma API returned invalid JSON for slug "${slug}"`);
  }

  if (data.kind !== 'event' || !data.data?.event) {
    throw new Error(`Slug "${slug}" does not point to a Luma event`);
  }

  const event = data.data.event;
  const eventApiId: string = event.api_id || '';
  const eventName: string = event.name || slug;
  const nameRequirement: string | null = data.data.name_requirement || null;

  // Parse registration_questions from the API response
  const rawQuestions: unknown[] = data.data.registration_questions || [];
  const questions: LumaRegistrationQuestion[] = rawQuestions
    .filter((q): q is Record<string, unknown> => q !== null && typeof q === 'object')
    .map((q) => ({
      id: String(q.id || ''),
      label: String(q.label || q.question || ''),
      question_type: mapQuestionType(String(q.type || q.question_type || 'text')),
      is_required: Boolean(q.is_required ?? q.required ?? false),
      options: Array.isArray(q.options) ? q.options.map(String) : undefined,
      terms_content: q.terms_content ? String(q.terms_content) : undefined,
      job_title_label: q.job_title_label ? String(q.job_title_label) : undefined,
    }));

  return { eventApiId, eventName, nameRequirement, questions };
}

// ---------------------------------------------------------------------------
// Map Luma question type strings to our normalized set
// ---------------------------------------------------------------------------

function mapQuestionType(raw: string): LumaRegistrationQuestion['question_type'] {
  const normalized = raw.toLowerCase().replace(/[-_\s]/g, '');
  switch (normalized) {
    case 'company':
      return 'company';
    case 'linkedin':
      return 'linkedin';
    case 'twitter':
    case 'x':
      return 'twitter';
    case 'dropdown':
    case 'select':
      return 'dropdown';
    case 'multiselect':
    case 'multi_select':
    case 'checkbox':
      return 'multi-select';
    case 'terms':
    case 'tos':
      return 'terms';
    default:
      return 'text';
  }
}

// ---------------------------------------------------------------------------
// Map a question to a profile field name for auto-fill
// ---------------------------------------------------------------------------

export function mapQuestionToProfileField(
  q: LumaRegistrationQuestion
): string | null {
  const label = q.label.toLowerCase();

  // Type-based mapping first
  switch (q.question_type) {
    case 'company':
      return 'company';
    case 'linkedin':
      return 'linkedin_url';
    case 'twitter':
      return 'x_handle';
  }

  // Label-based mapping
  if (/company|organization|org\b/i.test(label)) return 'company';
  if (/job\s*title|role|position/i.test(label)) return 'job_title';
  if (/linkedin/i.test(label)) return 'linkedin_url';
  if (/twitter|x\s*handle|x\.com/i.test(label)) return 'x_handle';
  if (/telegram/i.test(label)) return 'telegram_handle';
  if (/phone|mobile|cell/i.test(label)) return 'phone';
  if (/website|url|homepage/i.test(label)) return 'website';

  return null;
}
