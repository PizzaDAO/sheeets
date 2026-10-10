import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildEventDataContent, sanitizeDescription } from '../ingest/prompt';
import { computeSignals } from '../ingest/signals';
import { DEFAULT_THEME_PROFILES } from '../ingest/profiles';
import type { ClassifierEventInput, ThemeKey } from '../ingest/types';

interface EvalExample {
  id: string;
  conference: string;
  themeKey: ThemeKey;
  label: 'on_theme' | 'off_theme';
  source: string;
  event: ClassifierEventInput;
}

// Small (<=50 row) committed sample of the full eval set built by
// `scripts/ingest-eval.ts build-fixture` (real public Luma/sheet data for
// positives, a hand-picked hard-negative seed for negatives). The full
// fixture is gitignored — regenerate it locally, don't commit it (§13.2).
const SAMPLE_PATH = path.join(__dirname, '..', '..', '..', 'scripts', 'fixtures', 'ingest-eval-sample.json');

describe('ingest eval sample fixture', () => {
  const raw = fs.readFileSync(SAMPLE_PATH, 'utf8');
  const examples: EvalExample[] = JSON.parse(raw);

  it('is a non-empty sample of at most 50 rows with the expected shape', () => {
    expect(examples.length).toBeGreaterThan(0);
    expect(examples.length).toBeLessThanOrEqual(50);
    for (const ex of examples) {
      expect(typeof ex.id).toBe('string');
      expect(typeof ex.conference).toBe('string');
      expect(['on_theme', 'off_theme']).toContain(ex.label);
      expect(typeof ex.event.name).toBe('string');
      expect(ex.event.name.length).toBeGreaterThan(0);
    }
  });

  it('has both labels represented', () => {
    expect(examples.some((e) => e.label === 'on_theme')).toBe(true);
    expect(examples.some((e) => e.label === 'off_theme')).toBe(true);
  });

  it('builds valid, parseable <event_data> content for every real example (no tag breakout, no crash)', () => {
    for (const ex of examples) {
      const content = buildEventDataContent(ex.event);
      expect(content.startsWith('<event_data>\n')).toBe(true);
      expect(content.endsWith('\n</event_data>')).toBe(true);
      const lines = content.split('\n');
      expect(lines).toHaveLength(3);
      expect(() => JSON.parse(lines[1])).not.toThrow();
    }
  });

  it('sanitizes every real description without throwing and respects the length cap', () => {
    for (const ex of examples) {
      const out = sanitizeDescription(ex.event.descriptionText);
      expect(out.length).toBeLessThanOrEqual(1501); // 1500 + ellipsis
    }
  });

  it('computes signals against the matching theme profile for every example without throwing', () => {
    for (const ex of examples) {
      const profile = ex.themeKey === 'custom' ? DEFAULT_THEME_PROFILES.tech : DEFAULT_THEME_PROFILES[ex.themeKey];
      const text = `${ex.event.name} ${(ex.event.hosts ?? []).join(' ')} ${ex.event.organizer ?? ''} ${ex.event.descriptionText ?? ''}`;
      const result = computeSignals({ text, includeKeywords: profile.includeKeywords, excludeKeywords: profile.excludeKeywords });
      expect(typeof result.total).toBe('number');
    }
  });
});
