const HOST_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/u;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/u;

export function normalizeHostname(input: string): string | null {
  const candidate = input.trim().toLowerCase().replace(/^\*\./u, '').replace(/\.$/u, '');
  if (!candidate) return null;

  let hostname = candidate;
  try {
    const parsed = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
    hostname = parsed.hostname.toLowerCase().replace(/\.$/u, '');
  } catch {
    return null;
  }

  if (hostname === 'localhost') return hostname;
  if (IPV4.test(hostname)) {
    const octets = hostname.split('.').map(Number);
    return octets.every((octet) => octet >= 0 && octet <= 255) ? hostname : null;
  }

  if (hostname.length > 253 || !hostname.includes('.')) return null;
  return hostname.split('.').every((label) => HOST_LABEL.test(label)) ? hostname : null;
}

export function isHostnameCovered(hostname: string, domains: readonly string[]): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  return domains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

export function hostnameSuffixes(hostname: string): string[] {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return [];
  if (normalized === 'localhost' || IPV4.test(normalized)) return [normalized];
  const labels = normalized.split('.');
  const suffixes: string[] = [];
  for (let index = 0; index <= labels.length - 2; index += 1) {
    suffixes.push(labels.slice(index).join('.'));
  }
  return suffixes;
}

export function domainToMatchPattern(domain: string): string {
  if (domain === 'localhost' || IPV4.test(domain)) return `*://${domain}/*`;
  return `*://*.${domain}/*`;
}

export function cosmeticBucket(domain: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < domain.length; index += 1) {
    hash ^= domain.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash & 63).toString(16).padStart(2, '0');
}
