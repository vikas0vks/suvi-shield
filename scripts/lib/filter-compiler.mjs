import { domainToASCII } from 'node:url';

const TYPE_MAP = new Map([
  ['document', 'main_frame'],
  ['subdocument', 'sub_frame'],
  ['frame', 'sub_frame'],
  ['stylesheet', 'stylesheet'],
  ['script', 'script'],
  ['image', 'image'],
  ['font', 'font'],
  ['object', 'object'],
  ['xmlhttprequest', 'xmlhttprequest'],
  ['xhr', 'xmlhttprequest'],
  ['ping', 'ping'],
  ['media', 'media'],
  ['websocket', 'websocket'],
  ['webtransport', 'webtransport'],
  ['other', 'other']
]);

const UNSUPPORTED_OPTIONS = new Set([
  'badfilter', 'csp', 'denyallow', 'elemhide', 'genericblock', 'generichide', 'header', 'inline-script',
  'ipaddress', 'permissions', 'popup', 'popunder', 'redirect', 'redirect-rule', 'removeparam', 'replace',
  'specifichide', 'urlskip', 'uritransform'
]);

const PROCEDURAL_SELECTOR = /(?:\+js\(|:has-text\(|:matches-(?:attr|css)\(|:min-text-length\(|:others\(|:remove\(|:style\(|:upward\(|:watch-attr\(|:xpath\(|\{\{)/iu;
const COSMETIC_MARKER = /#@?[?$%]?#/u;
const DOMAIN_FILTER = /^\|\|(?:\*\.)?([a-z0-9._-]+)\^$/iu;
const HOSTS_FILTER = /^(?:0\.0\.0\.0|127\.0\.0\.1)\s+([^\s#]+)$/u;

function normalizeDomain(value) {
  const ascii = domainToASCII(value.trim().toLowerCase().replace(/^\*\./u, '').replace(/\.$/u, ''));
  if (!ascii || ascii.length > 253 || !ascii.includes('.')) return null;
  if (!ascii.split('.').every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/u.test(label))) return null;
  return ascii;
}

function cleanCondition(condition) {
  return Object.fromEntries(Object.entries(condition).filter(([, value]) => value !== undefined && (!Array.isArray(value) || value.length > 0)));
}

export function parseNetworkFilter(rawLine) {
  let line = rawLine.trim();
  if (!line || line.startsWith('!') || line.startsWith('[') || COSMETIC_MARKER.test(line)) return null;

  const hosts = line.match(HOSTS_FILTER);
  if (hosts) {
    const domain = normalizeDomain(hosts[1]);
    return domain ? { action: 'block', priority: 10, domain, condition: {} } : null;
  }

  const exception = line.startsWith('@@');
  if (exception) line = line.slice(2);
  const dollarIndex = line.indexOf('$');
  const pattern = (dollarIndex >= 0 ? line.slice(0, dollarIndex) : line).trim();
  const optionText = dollarIndex >= 0 ? line.slice(dollarIndex + 1) : '';
  if (!pattern || pattern === '*' || pattern.length > 1_900 || /[^\x20-\x7e]/u.test(pattern) || (pattern.startsWith('/') && pattern.endsWith('/'))) return null;

  const resourceTypes = [];
  const excludedResourceTypes = [];
  const initiatorDomains = [];
  const excludedInitiatorDomains = [];
  let domainType;
  let caseSensitive = false;
  let important = false;

  for (const rawOption of optionText.split(',').filter(Boolean)) {
    const negated = rawOption.startsWith('~');
    const option = negated ? rawOption.slice(1) : rawOption;
    const [name, value] = option.split('=', 2);
    const normalizedName = name.toLowerCase();
    if (UNSUPPORTED_OPTIONS.has(normalizedName)) return null;
    if (TYPE_MAP.has(normalizedName)) {
      (negated ? excludedResourceTypes : resourceTypes).push(TYPE_MAP.get(normalizedName));
      continue;
    }
    if (normalizedName === 'third-party' || normalizedName === '3p') {
      domainType = negated ? 'firstParty' : 'thirdParty';
      continue;
    }
    if (normalizedName === 'first-party' || normalizedName === '1p') {
      domainType = negated ? 'thirdParty' : 'firstParty';
      continue;
    }
    if (normalizedName === 'domain' && value) {
      for (const rawDomain of value.split('|')) {
        const excluded = rawDomain.startsWith('~');
        const domain = normalizeDomain(excluded ? rawDomain.slice(1) : rawDomain);
        if (domain) (excluded ? excludedInitiatorDomains : initiatorDomains).push(domain);
      }
      continue;
    }
    if (normalizedName === 'match-case') { caseSensitive = !negated; continue; }
    if (normalizedName === 'important') { important = !negated; continue; }
    if (normalizedName === 'all') continue;
    if (['sitekey', 'method'].includes(normalizedName) || value !== undefined) return null;
  }

  const domainMatch = pattern.match(DOMAIN_FILTER);
  const domain = domainMatch ? normalizeDomain(domainMatch[1]) : null;
  const includedTypes = [...new Set(resourceTypes)].filter((type) => !excludedResourceTypes.includes(type));
  if (resourceTypes.length > 0 && includedTypes.length === 0) return null;
  const condition = cleanCondition({
    resourceTypes: includedTypes.length ? includedTypes : undefined,
    excludedResourceTypes: resourceTypes.length === 0 && excludedResourceTypes.length ? [...new Set(excludedResourceTypes)] : undefined,
    initiatorDomains: initiatorDomains.length ? [...new Set(initiatorDomains)] : undefined,
    excludedInitiatorDomains: excludedInitiatorDomains.length ? [...new Set(excludedInitiatorDomains)] : undefined,
    domainType,
    isUrlFilterCaseSensitive: !domain && caseSensitive ? true : undefined
  });
  return {
    action: exception ? 'allow' : 'block',
    priority: important ? (exception ? 2_000 : 1_000) : (exception ? 100 : 10),
    ...(domain ? { domain } : { urlFilter: pattern }),
    condition
  };
}

export function parseCosmeticFilter(rawLine) {
  const line = rawLine.trim();
  if (!line || line.startsWith('!')) return null;
  let marker = null;
  let unhide = false;
  if (line.includes('#@#')) { marker = '#@#'; unhide = true; }
  else if (line.includes('##')) marker = '##';
  if (!marker) return null;
  const [domainText, selectorText] = line.split(marker, 2);
  const selector = selectorText?.trim();
  if (!selector || selector.length > 800 || PROCEDURAL_SELECTOR.test(selector) || /[{}]/u.test(selector)) return null;

  const domains = [];
  const excludedDomains = [];
  for (const item of domainText.split(',').filter(Boolean)) {
    const excluded = item.startsWith('~');
    const domain = normalizeDomain(excluded ? item.slice(1) : item);
    if (domain) (excluded ? excludedDomains : domains).push(domain);
  }
  if (unhide && domains.length === 0) return null;
  return { selector, unhide, domains, excludedDomains };
}

function signatureFor(parsed) {
  return JSON.stringify({ action: parsed.action, priority: parsed.priority, condition: parsed.condition });
}

export function compileNetworkRules(lines, maximumRules = 25_000) {
  const groups = new Map();
  const direct = [];
  let parsedCount = 0;
  let skippedCount = 0;

  for (const line of lines) {
    const parsed = parseNetworkFilter(line);
    if (!parsed) { skippedCount += 1; continue; }
    parsedCount += 1;
    if (parsed.domain) {
      const signature = signatureFor(parsed);
      const group = groups.get(signature) ?? { parsed, domains: new Set() };
      group.domains.add(parsed.domain);
      groups.set(signature, group);
    } else {
      direct.push(parsed);
    }
  }

  const rules = [];
  const seen = new Set();
  const pushRule = (rule) => {
    const signature = JSON.stringify(rule);
    if (seen.has(signature) || rules.length >= maximumRules) return;
    seen.add(signature);
    rules.push(rule);
  };

  for (const { parsed, domains } of groups.values()) {
    const sorted = [...domains].sort();
    for (let offset = 0; offset < sorted.length; offset += 800) {
      pushRule({
        priority: parsed.priority,
        action: { type: parsed.action },
        condition: { ...parsed.condition, requestDomains: sorted.slice(offset, offset + 800) }
      });
    }
  }
  for (const parsed of direct) {
    pushRule({
      priority: parsed.priority,
      action: { type: parsed.action },
      condition: { ...parsed.condition, urlFilter: parsed.urlFilter }
    });
  }

  return {
    rules: rules.map((rule, index) => ({ id: index + 1, ...rule })),
    stats: { inputLines: lines.length, parsed: parsedCount, skipped: skippedCount, emitted: rules.length, capped: rules.length >= maximumRules }
  };
}

export function compileCosmeticData(lines, genericLimit = 5_000) {
  const generic = new Set();
  const domains = new Map();
  let parsed = 0;
  for (const line of lines) {
    const rule = parseCosmeticFilter(line);
    if (!rule) continue;
    parsed += 1;
    if (rule.domains.length === 0 && !rule.unhide && rule.excludedDomains.length === 0) {
      if (generic.size < genericLimit) generic.add(rule.selector);
      continue;
    }
    for (const domain of rule.domains) {
      const entry = domains.get(domain) ?? { hide: new Set(), unhide: new Set() };
      (rule.unhide ? entry.unhide : entry.hide).add(rule.selector);
      domains.set(domain, entry);
    }
  }
  return { generic, domains, parsed };
}
