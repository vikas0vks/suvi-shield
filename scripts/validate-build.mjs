import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
const errors = [];
const releaseMode = process.argv.includes('--release');

const required = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_page,
  ...Object.values(manifest.icons ?? {}),
  ...(manifest.content_scripts ?? []).flatMap((item) => [...(item.js ?? []), ...(item.css ?? [])]),
  ...(manifest.declarative_net_request?.rule_resources ?? []).map((item) => item.path),
  'injected/main-world.js',
  'injected/fingerprint-world.js',
  'injected/capability-world.js',
  'injected/youtube-player.js',
  'injected/youtube-player.css',
  'generated/cosmetic/generic.css'
].filter(Boolean);

for (const relativePath of required) {
  try {
    await access(path.join(dist, relativePath));
  } catch {
    errors.push(`Missing manifest resource: ${relativePath}`);
  }
}

let totalRules = 0;
const seenRuleIds = new Map();
for (const ruleset of manifest.declarative_net_request?.rule_resources ?? []) {
  const rules = JSON.parse(await readFile(path.join(dist, ruleset.path), 'utf8'));
  if (!Array.isArray(rules)) errors.push(`${ruleset.path} must contain an array`);
  const localIds = new Set();
  let regexRules = 0;
  for (const rule of rules) {
    if (!Number.isInteger(rule.id) || rule.id < 1) errors.push(`${ruleset.path} has invalid rule id`);
    if (localIds.has(rule.id)) errors.push(`${ruleset.path} contains duplicate rule id ${rule.id}`);
    localIds.add(rule.id);
    if (!['allow', 'allowAllRequests', 'block', 'modifyHeaders', 'redirect', 'upgradeScheme'].includes(rule.action?.type)) {
      errors.push(`${ruleset.path} rule ${rule.id} has an invalid action`);
    }
    const condition = rule.condition ?? {};
    if (condition.regexFilter) regexRules += 1;
    if (condition.resourceTypes && condition.excludedResourceTypes) {
      errors.push(`${ruleset.path} rule ${rule.id} combines resourceTypes and excludedResourceTypes`);
    }
    if (condition.urlFilter && condition.regexFilter) {
      errors.push(`${ruleset.path} rule ${rule.id} combines urlFilter and regexFilter`);
    }
    if (condition.isUrlFilterCaseSensitive && !condition.urlFilter && !condition.regexFilter) {
      errors.push(`${ruleset.path} rule ${rule.id} has case sensitivity without a URL filter`);
    }
  }
  if (regexRules > 1_000) errors.push(`${ruleset.path} exceeds the 1,000-regex-rule limit`);
  seenRuleIds.set(ruleset.id, localIds.size);
  totalRules += rules.length;
}
if (totalRules > 30_000) errors.push(`Static rules exceed Chrome's guaranteed 30,000-rule budget: ${totalRules}`);

if (releaseMode) {
  const report = JSON.parse(await readFile(path.join(dist, 'generated', 'rules-report.json'), 'utf8'));
  if (report.starterOnly) errors.push('Release build used starter-only filter data');
  for (const source of report.sources ?? []) {
    if (source.fallback) errors.push(`Release filter source used fallback data: ${source.id}`);
  }
}

const worker = await readFile(path.join(dist, manifest.background.service_worker), 'utf8');
if (/\beval\s*\(|\bnew Function\s*\(/u.test(worker)) errors.push('Forbidden dynamic code execution in service worker');

const packageSize = (await stat(path.join(dist, 'manifest.json'))).size;
if (packageSize === 0) errors.push('Manifest is empty');

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${required.length} resources and ${totalRules} DNR rules across ${seenRuleIds.size} rulesets${releaseMode ? ' for release' : ''}.`);
}
