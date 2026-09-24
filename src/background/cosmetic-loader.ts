import { cosmeticBucket, hostnameSuffixes } from '../core/domain';

interface CosmeticBucketData {
  [domain: string]: { hide?: string[]; unhide?: string[] };
}

const cache = new Map<string, Promise<unknown>>();

function readJson<T>(relativePath: string): Promise<T> {
  let pending = cache.get(relativePath) as Promise<T> | undefined;
  if (!pending) {
    pending = fetch(chrome.runtime.getURL(relativePath)).then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load ${relativePath}`);
      return (await response.json()) as T;
    });
    cache.set(relativePath, pending);
  }
  return pending;
}

export async function getCosmeticSelectors(hostname: string): Promise<{ hide: string[]; unhide: string[] }> {
  const suffixes = hostnameSuffixes(hostname);
  if (suffixes.length === 0) return { hide: [], unhide: [] };
  const bucketNames = [...new Set(suffixes.map(cosmeticBucket))];
  const buckets = await Promise.all(bucketNames.map((bucket) =>
    readJson<CosmeticBucketData>(`generated/cosmetic/${bucket}.json`).catch((): CosmeticBucketData => ({}))
  ));

  const hidden = new Set<string>();
  const unhidden = new Set<string>();
  for (const bucket of buckets) {
    for (const suffix of suffixes) {
      const entry = bucket[suffix];
      for (const selector of entry?.hide ?? []) hidden.add(selector);
      for (const selector of entry?.unhide ?? []) unhidden.add(selector);
    }
  }
  for (const selector of unhidden) hidden.delete(selector);
  return { hide: [...hidden], unhide: [...unhidden] };
}
