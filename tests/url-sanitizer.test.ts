import { describe, expect, it } from 'vitest';
import { sanitizeUrl } from '../src/core/url-sanitizer';

describe('URL sanitizer', () => {
  it('removes known tracking keys while preserving useful state', () => {
    const result = sanitizeUrl('https://example.com/p?q=book&utm_source=news&fbclid=abc#chapter');
    expect(result.changed).toBe(true);
    expect(result.removed).toEqual(['utm_source', 'fbclid']);
    expect(result.url).toBe('https://example.com/p?q=book#chapter');
  });

  it('handles relative URLs and repeated parameters', () => {
    const result = sanitizeUrl('/p?utm_medium=a&utm_medium=b&id=7', 'https://example.com/home');
    expect(result.url).toBe('https://example.com/p?id=7');
  });

  it('does not rewrite non-web or invalid URLs', () => {
    expect(sanitizeUrl('mailto:user@example.com').changed).toBe(false);
    expect(sanitizeUrl('not a url').changed).toBe(false);
  });
});
