import { describe, expect, it } from 'vitest';
import { cosmeticBucket, domainToMatchPattern, hostnameSuffixes, isHostnameCovered, normalizeHostname } from '../src/core/domain';

describe('domain utilities', () => {
  it('normalizes URLs, case and wildcard hostnames', () => {
    expect(normalizeHostname(' HTTPS://WWW.Example.COM/path ')).toBe('www.example.com');
    expect(normalizeHostname('*.example.com')).toBe('example.com');
    expect(normalizeHostname('https://☃.net')).toBe('xn--n3h.net');
  });

  it('rejects malformed or dangerously broad input', () => {
    expect(normalizeHostname('com')).toBeNull();
    expect(normalizeHostname('-bad.example')).toBeNull();
    expect(normalizeHostname('https://exa mple.com')).toBeNull();
    expect(normalizeHostname('999.1.1.1')).toBeNull();
  });

  it('covers exact domains and their subdomains only', () => {
    expect(isHostnameCovered('a.example.com', ['example.com'])).toBe(true);
    expect(isHostnameCovered('notexample.com', ['example.com'])).toBe(false);
  });

  it('produces stable suffixes, patterns and buckets', () => {
    expect(hostnameSuffixes('a.b.example.com')).toEqual(['a.b.example.com', 'b.example.com', 'example.com']);
    expect(domainToMatchPattern('example.com')).toBe('*://*.example.com/*');
    expect(cosmeticBucket('example.com')).toMatch(/^[0-3][0-9a-f]$/u);
    expect(cosmeticBucket('example.com')).toBe(cosmeticBucket('example.com'));
  });
});
