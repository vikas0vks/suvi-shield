import {
  ALL_RESOURCE_TYPES,
  FRAME_RESOURCE_TYPES,
  MANAGED_DYNAMIC_RULE_MAX,
  MANAGED_DYNAMIC_RULE_MIN,
  MANAGED_SCRIPT_IDS,
  RULESET_IDS
} from '../core/constants';
import { domainToMatchPattern } from '../core/domain';
import type { AegisSettings } from '../core/settings';

function desiredRulesets(settings: AegisSettings): string[] {
  if (!settings.blockingEnabled) return [];
  return (Object.entries(RULESET_IDS) as Array<[keyof typeof RULESET_IDS, string]>)
    .filter(([key]) => settings[key])
    .map(([, ruleset]) => ruleset);
}

async function syncStaticRules(settings: AegisSettings): Promise<void> {
  const current = await chrome.declarativeNetRequest.getEnabledRulesets();
  const desired = desiredRulesets(settings);
  const manifestRulesets: string[] = Object.values(RULESET_IDS);
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: desired.filter((id) => !current.includes(id)),
    disableRulesetIds: current.filter((id) => manifestRulesets.includes(id) && !desired.includes(id))
  });
}

function createDynamicRules(settings: AegisSettings): chrome.declarativeNetRequest.Rule[] {
  if (!settings.blockingEnabled) return [];
  const rules: chrome.declarativeNetRequest.Rule[] = [];
  let id = MANAGED_DYNAMIC_RULE_MIN;

  for (const domain of settings.allowlist) {
    rules.push({
      id: id++,
      priority: 100_000,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: [domain], resourceTypes: FRAME_RESOURCE_TYPES }
    });
    rules.push({
      id: id++,
      priority: 100_000,
      action: { type: 'allow' },
      condition: { initiatorDomains: [domain], resourceTypes: ALL_RESOURCE_TYPES }
    });
  }

  for (let offset = 0; offset < settings.customBlockedDomains.length; offset += 500) {
    rules.push({
      id: id++,
      priority: 5_000,
      action: { type: 'block' },
      condition: {
        requestDomains: settings.customBlockedDomains.slice(offset, offset + 500),
        resourceTypes: ALL_RESOURCE_TYPES
      }
    });
  }

  if (id > MANAGED_DYNAMIC_RULE_MAX) throw new Error('Managed dynamic rule range exhausted');
  return rules;
}

async function syncDynamicRules(settings: AegisSettings): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .map((rule) => rule.id)
    .filter((id) => id >= MANAGED_DYNAMIC_RULE_MIN && id <= MANAGED_DYNAMIC_RULE_MAX);
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: createDynamicRules(settings) });
}

async function syncMainWorldScripts(settings: AegisSettings): Promise<void> {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [...MANAGED_SCRIPT_IDS] });
  if (existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: existing.map(({ id }) => id) });
  }

  if (!settings.blockingEnabled) return;
  const excludeMatches = settings.allowlist.map(domainToMatchPattern);
  const scripts: chrome.scripting.RegisteredContentScript[] = [];

  if (settings.popupDefense) {
    scripts.push({
      id: MANAGED_SCRIPT_IDS[0],
      js: ['injected/main-world.js'],
      matches: ['<all_urls>'],
      excludeMatches,
      allFrames: true,
      persistAcrossSessions: true,
      runAt: 'document_start',
      world: 'MAIN'
    });
  }
  if (settings.fingerprintDefense) {
    scripts.push({
      id: MANAGED_SCRIPT_IDS[1],
      js: ['injected/fingerprint-world.js'],
      matches: ['<all_urls>'],
      excludeMatches,
      allFrames: true,
      persistAcrossSessions: true,
      runAt: 'document_start',
      world: 'MAIN'
    });
  }
  if (settings.cosmeticFiltering) {
    scripts.push({
      id: MANAGED_SCRIPT_IDS[2],
      css: ['generated/cosmetic/generic.css'],
      matches: ['<all_urls>'],
      excludeMatches,
      allFrames: true,
      persistAcrossSessions: true,
      runAt: 'document_start'
    });
  }
  if (settings.extremeMode) {
    scripts.push({
      id: MANAGED_SCRIPT_IDS[3],
      js: ['injected/capability-world.js'],
      matches: ['<all_urls>'],
      excludeMatches,
      allFrames: true,
      persistAcrossSessions: true,
      runAt: 'document_start',
      world: 'MAIN'
    });
  }
  if (settings.youtubeProtection) {
    scripts.push({
      id: MANAGED_SCRIPT_IDS[4],
      js: ['injected/youtube-player.js'],
      css: ['injected/youtube-player.css'],
      matches: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'],
      excludeMatches,
      allFrames: true,
      persistAcrossSessions: true,
      runAt: 'document_start'
    });
  }
  if (scripts.length > 0) await chrome.scripting.registerContentScripts(scripts);
}

async function syncWebRtc(settings: AegisSettings): Promise<void> {
  if (settings.blockingEnabled && settings.webrtcProtection) {
    await chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: 'disable_non_proxied_udp' });
  } else {
    await chrome.privacy.network.webRTCIPHandlingPolicy.clear({});
  }
}

export async function applyProtection(settings: AegisSettings): Promise<void> {
  await Promise.all([
    syncStaticRules(settings),
    syncDynamicRules(settings),
    syncMainWorldScripts(settings),
    syncWebRtc(settings),
    chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true })
  ]);
  await chrome.action.setBadgeBackgroundColor({ color: '#1BCB91' });
}
