// Shared types for the event-ingestion theme classifier (Phase 1a).
// DB-backed types (ingest_candidates, ingest_sources, ...) arrive in Phase 1b;
// this file only covers what the classifier and eval harness need today.
import { z } from 'zod';
import { TAG_GROUPS, TYPE_TAGS } from '../tags';

/** Groups conferences for few-shot sharing and default theme presets (§6, §9.1). */
export type ThemeKey = 'crypto' | 'ai' | 'gaming' | 'art' | 'music' | 'tech' | 'custom';

/**
 * Per-conference theme profile. In Phase 1a this lives in code (DEFAULT_THEME_PROFILES
 * in `profiles.ts`); Phase 1b moves it into the `ingest_profiles` table (§6) with the
 * same shape plus routing/runtime fields (thresholds, radius, caps, enabled flags).
 */
export interface ThemeProfile {
  themeKey: ThemeKey;
  /** Short display name, e.g. "Crypto / Web3". Shown in the admin config UI (§9.1). */
  themeName: string;
  /** Free-text rubric description injected into the classifier system prompt. */
  themeDescription: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  /** score >= publish - 15 required to ever auto-publish (§5.4). */
  publishThreshold: number;
  reviewThreshold: number;
}

/** Tags the classifier is allowed to suggest — the fixed list from `tags.ts` (§5.5). */
export const ALLOWED_TAGS = Array.from(
  new Set<string>([...TAG_GROUPS.flatMap((g) => g.tags), ...TYPE_TAGS])
) as [string, ...string[]];

export const CLASSIFIER_FLAGS = [
  'private_or_invite_only',
  'sold_out',
  'online_only',
  'spam_or_promo',
  'instructions_in_content',
] as const;

export type ClassifierFlag = (typeof CLASSIFIER_FLAGS)[number];

/** Structured-output schema the classifier asks Claude to fill in (§5.5). */
export const ClassifierOutputSchema = z.object({
  is_event: z.boolean(),
  score: z.number().int().min(0).max(100),
  reason: z.string().max(160),
  suggested_tags: z.array(z.enum(ALLOWED_TAGS)).max(4),
  flags: z.array(z.enum(CLASSIFIER_FLAGS)).max(5),
});

export type ClassifierOutput = z.infer<typeof ClassifierOutputSchema>;

/** The subset of a normalized event the classifier (and the eval harness) need. */
export interface ClassifierEventInput {
  name: string;
  hosts?: string[];
  calendarName?: string | null;
  organizer?: string | null;
  venue?: string | null;
  city?: string | null;
  dateISO?: string | null;
  startTime?: string | null;
  cost?: string | null;
  platform?: string | null;
  /** Plain-text description excerpt. Untrusted — never treated as instructions. */
  descriptionText?: string | null;
}

export interface ClassifierConferenceContext {
  name: string;
  city?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

/** One few-shot example for the system prompt (learning loop lands in Phase 2, §5.6). */
export interface FewShotExample {
  summary: string; // "name | hosts | 1-line summary"
  label: 'on_theme' | 'off_theme';
  reason: string;
}
