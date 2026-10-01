import { describe, it, expect } from 'vitest';
import { parseCspReports, readCappedBody, stripUrl } from '../csp-report';

function stream(s: string) {
  return new Response(s).body;
}

describe('parseCspReports', () => {
  it('parses legacy application/csp-report bodies', () => {
    const raw = JSON.stringify({
      'csp-report': {
        'document-uri': 'https://plan.wtf/kbw2026?x=secret',
        'violated-directive': 'script-src-elem',
        'blocked-uri': 'https://evil.example/a.js?token=1',
        'source-file': 'https://plan.wtf/_next/x.js',
        'line-number': 12,
      },
    });
    expect(parseCspReports(raw)).toEqual([
      {
        directive: 'script-src-elem',
        blocked: 'https://evil.example/a.js',
        page: 'https://plan.wtf/kbw2026',
        source: 'https://plan.wtf/_next/x.js:12',
      },
    ]);
  });

  it('parses application/reports+json arrays and ignores other report types', () => {
    const raw = JSON.stringify([
      { type: 'deprecation', body: { id: 'x' } },
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://plan.wtf/',
          effectiveDirective: 'img-src',
          blockedURL: 'inline',
          disposition: 'report',
        },
      },
    ]);
    expect(parseCspReports(raw)).toEqual([
      { directive: 'img-src', blocked: 'inline', page: 'https://plan.wtf/', disposition: 'report' },
    ]);
  });

  it('returns [] for garbage', () => {
    expect(parseCspReports('not json')).toEqual([]);
    expect(parseCspReports('{"foo":1}')).toEqual([]);
    expect(parseCspReports('[1,null,"x"]')).toEqual([]);
  });

  it('truncates long fields', () => {
    const raw = JSON.stringify({ 'csp-report': { 'violated-directive': 'a'.repeat(1000) } });
    expect(parseCspReports(raw)[0].directive.length).toBe(200);
  });
});

describe('stripUrl', () => {
  it('leaves non-URLs alone', () => {
    expect(stripUrl('inline')).toBe('inline');
  });
});

describe('readCappedBody', () => {
  it('reads small bodies', async () => {
    expect(await readCappedBody(stream('hello'))).toBe('hello');
  });
  it('returns null for oversized bodies', async () => {
    expect(await readCappedBody(stream('x'.repeat(20)), 10)).toBeNull();
  });
});
