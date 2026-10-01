import { describe, it, expect } from 'vitest';
import fixtureJson from './fixtures/luma-event.json';
import {
  extractMirrorText,
  findVerificationCode,
  textContainsCode,
  getLumaEventApiId,
  getLumaRegistrationCount,
  snapshotHosts,
  normalizeHandle,
  type LumaEventPayload,
  type MirrorNode,
} from '../luma';
import { generateVerificationCode } from '../luma-server';

const CODE = 'planwtf-K7Q2M9XD';

/** Fresh deep copy of the recorded Luma payload (api.lu.ma/url → data). */
function fixture(): LumaEventPayload {
  return JSON.parse(JSON.stringify(fixtureJson.data)) as LumaEventPayload;
}

function withParagraph(payload: LumaEventPayload, content: MirrorNode[]): LumaEventPayload {
  payload.description_mirror!.content!.push({ type: 'paragraph', content });
  return payload;
}

describe('recorded Luma fixture', () => {
  it('has the shape the verifier relies on', () => {
    const p = fixture();
    expect(getLumaEventApiId(p)).toMatch(/^evt-/);
    expect(p.hosts!.length).toBeGreaterThan(0);
    expect(p.description_mirror?.type).toBe('doc');
    expect(getLumaRegistrationCount(p)).toBeGreaterThan(0);
    expect('guest_data' in (fixtureJson.data as object)).toBe(false);
  });

  it('extracts readable description text', () => {
    const text = extractMirrorText(fixture().description_mirror);
    expect(text).toContain('Espresso martini');
    expect(text).toContain('Chat with our co-founders');
  });

  it('does not match a code that is not present', () => {
    expect(findVerificationCode(fixture(), CODE)).toBeNull();
  });

  it('matches a code inserted into the description', () => {
    const p = withParagraph(fixture(), [{ type: 'text', text: `Verification: ${CODE}` }]);
    expect(findVerificationCode(p, CODE)).toEqual({ matched_in: 'description' });
  });

  it('matches a code inserted into a host bio and reports which host', () => {
    const p = fixture();
    p.hosts![1].bio_short = `${p.hosts![1].bio_short} ${CODE}`;
    expect(findVerificationCode(p, CODE)).toEqual({
      matched_in: 'host_bio',
      host_api_id: p.hosts![1].api_id,
      host_name: p.hosts![1].name,
    });
  });

  it('prefers the description over a host bio (description never grants host-wide)', () => {
    const p = withParagraph(fixture(), [{ type: 'text', text: CODE }]);
    p.hosts![0].bio_short = CODE;
    expect(findVerificationCode(p, CODE)?.matched_in).toBe('description');
  });

  it('snapshots hosts without bios/avatars', () => {
    const snap = snapshotHosts(fixture());
    expect(snap[0]).toEqual({
      api_id: 'usr-cAqsoa41hhkQxPs',
      name: 'Espresso Systems',
      username: null,
      twitter_handle: 'espressosys',
    });
    expect(Object.keys(snap[0])).not.toContain('bio_short');
  });
});

describe('extractMirrorText', () => {
  it('joins a code split across nested marks (bold / italic / link)', () => {
    const doc: MirrorNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Code: plan' },
            { type: 'text', text: 'wtf-K7Q2', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'M9XD', marks: [{ type: 'italic' }, { type: 'link', attrs: { href: 'https://x.com' } }] },
          ],
        },
      ],
    };
    expect(extractMirrorText(doc)).toContain('Code: planwtf-K7Q2M9XD');
  });

  it('includes link hrefs from marks and node attrs', () => {
    const doc: MirrorNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'our site', marks: [{ type: 'link', attrs: { href: `https://example.com/?v=${CODE}` } }] },
          ],
        },
        { type: 'image', attrs: { src: 'https://img.example.com/a.png' } },
      ],
    };
    const text = extractMirrorText(doc);
    expect(text).toContain(`https://example.com/?v=${CODE}`);
    expect(text).toContain('https://img.example.com/a.png');
    expect(textContainsCode(text, CODE)).toBe(true);
  });

  it('separates block nodes so words from adjacent paragraphs do not merge into a code', () => {
    const doc: MirrorNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'planwtf-K7Q2' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'M9XD' }] },
      ],
    };
    expect(textContainsCode(extractMirrorText(doc), CODE)).toBe(false);
  });

  it('handles deeply nested lists and hard breaks', () => {
    const doc: MirrorNode = {
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [
            {
              type: 'list_item',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'first' }, { type: 'hard_break' }, { type: 'text', text: CODE }],
                },
              ],
            },
          ],
        },
      ],
    };
    const text = extractMirrorText(doc);
    expect(text).toBe(`first\n${CODE}`);
  });

  it('tolerates null / malformed input', () => {
    expect(extractMirrorText(null)).toBe('');
    expect(extractMirrorText(undefined)).toBe('');
    expect(extractMirrorText({ type: 'doc', content: null })).toBe('');
    expect(extractMirrorText({ type: 'doc', content: [null as unknown as MirrorNode] })).toBe('');
  });
});

describe('textContainsCode', () => {
  it('is case-insensitive', () => {
    expect(textContainsCode('see PLANWTF-k7q2m9xd here', CODE)).toBe(true);
  });

  it('matches at boundaries (punctuation, line edges)', () => {
    expect(textContainsCode(CODE, CODE)).toBe(true);
    expect(textContainsCode(`(${CODE}).`, CODE)).toBe(true);
    expect(textContainsCode(`code:${CODE}\nmore`, CODE)).toBe(true);
  });

  it('rejects partial codes and codes glued to other alphanumerics', () => {
    expect(textContainsCode('planwtf-K7Q2M9X', CODE)).toBe(false); // truncated
    expect(textContainsCode('planwtf-K7Q2M9XDZ', CODE)).toBe(false); // longer code
    expect(textContainsCode('xplanwtf-K7Q2M9XD', CODE)).toBe(false);
    expect(textContainsCode('planwtf-K7Q2M9XE', CODE)).toBe(false);
    expect(textContainsCode('planwtfK7Q2M9XD', CODE)).toBe(false);
  });

  it('does not treat the code as a regex', () => {
    expect(textContainsCode('planwtfXK7Q2M9XD', 'planwtf.K7Q2M9XD')).toBe(false);
  });

  it('returns false on empty inputs', () => {
    expect(textContainsCode('', CODE)).toBe(false);
    expect(textContainsCode(null, CODE)).toBe(false);
    expect(textContainsCode('anything', '')).toBe(false);
  });
});

describe('findVerificationCode', () => {
  it('ignores hosts without an api_id', () => {
    const p: LumaEventPayload = { hosts: [{ bio_short: CODE } as never], description_mirror: null };
    expect(findVerificationCode(p, CODE)).toBeNull();
  });

  it('returns null for empty payload or code', () => {
    expect(findVerificationCode(null, CODE)).toBeNull();
    expect(findVerificationCode(fixture(), '')).toBeNull();
  });
});

describe('generateVerificationCode', () => {
  it('produces planwtf- + 8 Crockford base32 chars', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateVerificationCode()).toMatch(/^planwtf-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    }
  });

  it('is random', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateVerificationCode()));
    expect(codes.size).toBe(200);
  });
});

describe('normalizeHandle', () => {
  it('normalizes @, case and profile URLs', () => {
    expect(normalizeHandle('@EspressoSys')).toBe('espressosys');
    expect(normalizeHandle('https://x.com/espressosys')).toBe('espressosys');
    expect(normalizeHandle('https://twitter.com/espressosys/')).toBe('espressosys');
    expect(normalizeHandle('')).toBeNull();
    expect(normalizeHandle(null)).toBeNull();
  });
});
