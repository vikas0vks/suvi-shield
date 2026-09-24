import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compileCosmeticData, compileNetworkRules } from './lib/filter-compiler.mjs';

const root = path.resolve(import.meta.dirname, '..');
const starterOnly = process.argv.includes('--starter');
const sources = JSON.parse(await readFile(path.join(root, 'config', 'filter-sources.json'), 'utf8'));
const baseline = JSON.parse(await readFile(path.join(root, 'config', 'baseline-filters.json'), 'utf8'));
const sourceTexts = [];
const sourceReports = [];
const categoryBudgets = { ads: 12_000, privacy: 6_500, annoyances: 5_000, security: 3_000 };

async function download(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(source.url, { headers: { 'user-agent': 'Suvi-Shield-Build/0.2' }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

const downloads = await Promise.all(sources.map(async (source) => {
  let text = (baseline[source.category] ?? []).join('\n');
  let fallback = true;
  if (!starterOnly) {
    try {
      text = await download(source);
      fallback = false;
    } catch (error) {
      console.warn(`Using starter fallback for ${source.id}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return { source: { ...source, text }, report: {
    id: source.id,
    title: source.title,
    category: source.category,
    url: source.url,
    homepage: source.homepage,
    license: source.license,
    fallback,
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex')
  }};
}));
for (const item of downloads) {
  sourceTexts.push(item.source);
  sourceReports.push(item.report);
}

function interleaveSourceLines(relevant, batchSize = 64) {
  const lists = relevant.map((source) => source.text.split(/\r?\n/u));
  const result = [];
  for (let offset = 0; lists.some((lines) => offset < lines.length); offset += batchSize) {
    for (const lines of lists) result.push(...lines.slice(offset, offset + batchSize));
  }
  return result;
}

const rulesDir = path.join(root, 'src', 'rules');
const cosmeticDir = path.join(root, 'src', 'generated', 'cosmetic');
await mkdir(rulesDir, { recursive: true });
await mkdir(cosmeticDir, { recursive: true });

const categoryFiles = new Map([
  ['ads', 'ads.json'],
  ['privacy', 'privacy.json'],
  ['annoyances', 'annoyances.json'],
  ['security', 'security.json']
]);
const compileReports = {};
for (const [category, filename] of categoryFiles) {
  const relevant = sourceTexts.filter((source) => source.category === category);
  const lines = [...(baseline[category] ?? []), ...interleaveSourceLines(relevant)];
  const maximum = categoryBudgets[category];
  const compiled = compileNetworkRules(lines, maximum);
  compileReports[category] = compiled.stats;
  await writeFile(path.join(rulesDir, filename), `${JSON.stringify(compiled.rules)}\n`);
}

const cosmeticLines = [
  ...(baseline.ads ?? []),
  ...(baseline.annoyances ?? []),
  ...sourceTexts
    .filter((source) => ['ads', 'annoyances'].includes(source.category))
    .flatMap((source) => source.text.split(/\r?\n/u))
];
const cosmetic = compileCosmeticData(cosmeticLines);
await writeFile(path.join(cosmeticDir, 'generic.json'), `${JSON.stringify({ hide: [...cosmetic.generic].sort() })}\n`);
await writeFile(
  path.join(cosmeticDir, 'generic.css'),
  `${[...cosmetic.generic].sort().map((selector) => `${selector}{display:none!important}`).join('\n')}\n`
);

const buckets = Array.from({ length: 64 }, () => ({}));
function bucketFor(domain) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < domain.length; index += 1) {
    hash ^= domain.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash & 63;
}
for (const [domain, entry] of cosmetic.domains) {
  buckets[bucketFor(domain)][domain] = {
    ...(entry.hide.size ? { hide: [...entry.hide].sort() } : {}),
    ...(entry.unhide.size ? { unhide: [...entry.unhide].sort() } : {})
  };
}
for (let index = 0; index < buckets.length; index += 1) {
  const filename = index.toString(16).padStart(2, '0');
  await writeFile(path.join(cosmeticDir, `${filename}.json`), `${JSON.stringify(buckets[index])}\n`);
}

const report = {
  generatedAt: new Date().toISOString(),
  starterOnly,
  sources: sourceReports,
  network: compileReports,
  cosmetic: { parsed: cosmetic.parsed, generic: cosmetic.generic.size, domains: cosmetic.domains.size }
};
await writeFile(path.join(root, 'src', 'generated', 'rules-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
