import { describe, expect, it } from 'vitest';
// The compiler is an ESM build script with intentionally dependency-free exports.
// @ts-expect-error JavaScript build helper has no declaration file.
import { compileCosmeticData, compileNetworkRules, parseNetworkFilter } from '../scripts/lib/filter-compiler.mjs';

describe('filter compiler', () => {
  it('normalizes redundant wildcard domain anchors for Chrome DNR', () => {
    expect(parseNetworkFilter('||*.libaishuo.com^$third-party')).toMatchObject({ domain: 'libaishuo.com' });
  });

  it('rejects extended cosmetic exceptions and non-ASCII URL filters', () => {
    expect(parseNetworkFilter('example.com#@?#div:-abp-has(span)')).toBeNull();
    expect(parseNetworkFilter('||example.test/広告')).toBeNull();
  });
  it('maps ABP domains, parties, types and exceptions to DNR', () => {
    expect(parseNetworkFilter('||tracker.example^$third-party,script')).toMatchObject({
      action: 'block',
      domain: 'tracker.example',
      condition: { domainType: 'thirdParty', resourceTypes: ['script'] }
    });
    expect(parseNetworkFilter('@@||cdn.example^$domain=shop.example')).toMatchObject({
      action: 'allow',
      priority: 100,
      condition: { initiatorDomains: ['shop.example'] }
    });
  });

  it('compresses compatible domain filters and assigns deterministic ids', () => {
    const output = compileNetworkRules(['||a.example^', '||b.example^', '||a.example^'], 100);
    expect(output.rules).toHaveLength(1);
    expect(output.rules[0]).toMatchObject({ id: 1, condition: { requestDomains: ['a.example', 'b.example'] } });
  });

  it('keeps safe CSS and rejects procedural scriptlets', () => {
    const output = compileCosmeticData(['##.ad', 'example.com##.sponsor', 'example.com##+js(abort-on-property-read, ads)']);
    expect([...output.generic]).toEqual(['.ad']);
    expect([...output.domains.get('example.com').hide]).toEqual(['.sponsor']);
    expect(output.parsed).toBe(2);
  });
});
