import { TRACKING_PARAMETERS } from './constants';

export interface SanitizedUrl {
  changed: boolean;
  removed: string[];
  url: string;
}

export function sanitizeUrl(rawUrl: string, baseUrl?: string): SanitizedUrl {
  let url: URL;
  try {
    url = new URL(rawUrl, baseUrl);
  } catch {
    return { changed: false, removed: [], url: rawUrl };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { changed: false, removed: [], url: rawUrl };
  }

  const removed: string[] = [];
  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith('utm_') || TRACKING_PARAMETERS.has(normalized)) {
      url.searchParams.delete(key);
      removed.push(key);
    }
  }

  return { changed: removed.length > 0, removed, url: url.toString() };
}
