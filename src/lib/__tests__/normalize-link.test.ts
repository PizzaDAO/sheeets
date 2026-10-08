import { describe, it, expect } from 'vitest';
import { normalizeEventLink, getValidLumaSlug, isLumaUrl } from '../luma';

describe('normalizeEventLink', () => {
  it('maps every Luma host to luma:<slug>', () => {
    expect(normalizeEventLink('https://lu.ma/espresso-hh')).toBe('luma:espresso-hh');
    expect(normalizeEventLink('https://luma.com/espresso-hh')).toBe('luma:espresso-hh');
    expect(normalizeEventLink('https://www.luma.com/espresso-hh/')).toBe('luma:espresso-hh');
    expect(normalizeEventLink('https://lu.ma/Espresso-HH?utm_source=x#top')).toBe('luma:espresso-hh');
  });

  it('returns null for a Luma link without a slug', () => {
    expect(normalizeEventLink('https://lu.ma/')).toBeNull();
  });

  it('lowercases host + path and drops www, query, hash and trailing slash', () => {
    expect(normalizeEventLink('https://WWW.Eventbrite.com/e/My-Event-123/?aff=x#a')).toBe('eventbrite.com/e/my-event-123');
    expect(normalizeEventLink('http://example.com')).toBe('example.com');
    expect(normalizeEventLink('https://example.com/a//')).toBe('example.com/a');
  });

  it('treats http and https the same', () => {
    expect(normalizeEventLink('http://example.com/x')).toBe(normalizeEventLink('https://example.com/x'));
  });

  it('accepts scheme-less links', () => {
    expect(normalizeEventLink('lu.ma/abc')).toBe('luma:abc');
    expect(normalizeEventLink('partiful.com/e/xyz')).toBe('partiful.com/e/xyz');
  });

  it('decodes percent-encoding in the path', () => {
    expect(normalizeEventLink('https://example.com/%E2%9C%93')).toBe('example.com/✓');
  });

  it('returns null for empty, invalid and non-http links', () => {
    expect(normalizeEventLink('')).toBeNull();
    expect(normalizeEventLink('   ')).toBeNull();
    expect(normalizeEventLink(null)).toBeNull();
    expect(normalizeEventLink(undefined)).toBeNull();
    expect(normalizeEventLink('mailto:a@b.com')).toBeNull();
    expect(normalizeEventLink('javascript:alert(1)')).toBeNull();
    expect(normalizeEventLink('https://')).toBeNull();
  });
});

describe('getValidLumaSlug', () => {
  it('returns safe slugs only', () => {
    expect(getValidLumaSlug('https://luma.com/espresso-hh')).toBe('espresso-hh');
    expect(getValidLumaSlug('https://lu.ma/abc_123')).toBe('abc_123');
    expect(getValidLumaSlug('https://lu.ma/a%2F..')).toBeNull();
    expect(getValidLumaSlug('https://lu.ma/' + 'a'.repeat(101))).toBeNull();
    expect(getValidLumaSlug('https://evil.com/espresso-hh')).toBeNull();
    expect(getValidLumaSlug('https://lu.ma.evil.com/x')).toBeNull();
    expect(getValidLumaSlug('')).toBeNull();
    expect(getValidLumaSlug(null)).toBeNull();
  });
});

describe('isLumaUrl', () => {
  it('recognizes Luma hosts', () => {
    expect(isLumaUrl('https://lu.ma/x')).toBe(true);
    expect(isLumaUrl('https://luma.com/x')).toBe(true);
    expect(isLumaUrl('https://www.luma.com/x')).toBe(true);
    expect(isLumaUrl('https://notluma.com/x')).toBe(false);
    expect(isLumaUrl('not a url')).toBe(false);
  });
});
