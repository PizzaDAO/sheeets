// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isBlockedIp, parsePublicHttpUrl, safeFetch } from '../safe-fetch';

describe('isBlockedIp', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '::ffff:a9fe:a9fe',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'fe80::1%lo0',
    'ff02::1',
    '64:ff9b::a00:1',
    '2002:7f00:1::',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.32.0.1',
    '100.128.0.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
  ])('allows %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

describe('parsePublicHttpUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(parsePublicHttpUrl('https://lu.ma/abc').hostname).toBe('lu.ma');
  });

  it.each([
    'file:///etc/passwd',
    'ftp://example.com',
    'gopher://example.com',
    'javascript:alert(1)',
    'http://user:pass@example.com',
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/latest/meta-data',
    'not a url',
  ])('rejects %s', (url) => {
    expect(() => parsePublicHttpUrl(url)).toThrow();
  });
});

describe('safeFetch', () => {
  it('refuses hostnames resolving to loopback', async () => {
    await expect(safeFetch('http://localhost:1/')).rejects.toThrow(
      /private or reserved/
    );
  });
});
