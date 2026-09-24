import { SETTINGS_KEY } from '../core/constants';
import { normalizeHostname } from '../core/domain';
import { isClientMessage, type ExtensionStatus, type ServerResponse } from '../core/messages';
import { applyProtectionPreset, DEFAULT_SETTINGS, mergeSettings, sanitizeSettings } from '../core/settings';
import { getSettings, setSettings } from '../core/storage';
import { applyProtection } from './protection';
import { getCosmeticSelectors } from './cosmetic-loader';

const MAINTENANCE_ALARM = 'aegis-maintenance';
let protectionQueue: Promise<void> = Promise.resolve();

function queueProtection(settings: ReturnType<typeof sanitizeSettings>): Promise<void> {
  protectionQueue = protectionQueue.catch(() => undefined).then(() => applyProtection(settings));
  return protectionQueue;
}

async function ensureInitialized(): Promise<void> {
  const settings = await getSettings();
  await setSettings(settings);
  await queueProtection(settings);
  const existing = await chrome.alarms.get(MAINTENANCE_ALARM);
  if (!existing) await chrome.alarms.create(MAINTENANCE_ALARM, { periodInMinutes: 1_440 });
}

async function getStatus(tabId: number): Promise<ExtensionStatus> {
  const [settings, enabledRulesets, availableStaticRules] = await Promise.all([
    getSettings(),
    chrome.declarativeNetRequest.getEnabledRulesets(),
    chrome.declarativeNetRequest.getAvailableStaticRuleCount()
  ]);

  let recentTabActions: number | null = null;
  try {
    const matches = await chrome.declarativeNetRequest.getMatchedRules({
      tabId,
      minTimeStamp: Date.now() - 5 * 60 * 1_000
    });
    recentTabActions = matches.rulesMatchedInfo.length;
  } catch {
    // Exact match feedback is permission- and gesture-bound. The browser badge remains authoritative.
  }
  return { settings, enabledRulesets, availableStaticRules, recentTabActions };
}

async function handleMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<ServerResponse> {
  if (!isClientMessage(message)) return { ok: false, error: 'Invalid message' };
  try {
    switch (message.type) {
      case 'GET_STATUS':
        return { ok: true, status: await getStatus(message.tabId) };
      case 'GET_COSMETIC': {
        const hostname = normalizeHostname(message.hostname);
        let senderHostname: string | null = null;
        try {
          senderHostname = sender.url ? normalizeHostname(new URL(sender.url).hostname) : null;
        } catch {
          senderHostname = null;
        }
        if (!hostname || !sender.tab || senderHostname !== hostname) return { ok: false, error: 'Invalid cosmetic request context' };
        return { ok: true, cosmetic: await getCosmeticSelectors(hostname) };
      }
      case 'SET_MASTER': {
        const next = mergeSettings(await getSettings(), { blockingEnabled: message.enabled });
        return { ok: true, settings: await setSettings(next) };
      }
      case 'SET_PROTECTION_LEVEL': {
        const next = await setSettings(applyProtectionPreset(await getSettings(), message.level));
        await queueProtection(next);
        return { ok: true, settings: next };
      }
      case 'SET_SITE_TRUST': {
        const hostname = normalizeHostname(message.hostname);
        if (!hostname) return { ok: false, error: 'Invalid hostname' };
        const current = await getSettings();
        const allowlist = new Set(current.allowlist);
        if (message.trusted) allowlist.add(hostname);
        else allowlist.delete(hostname);
        return { ok: true, settings: await setSettings(mergeSettings(current, { allowlist: [...allowlist] })) };
      }
      case 'UPDATE_SETTINGS': {
        const next = mergeSettings(await getSettings(), message.patch);
        return { ok: true, settings: await setSettings(next) };
      }
      case 'RESET_SETTINGS':
        return { ok: true, settings: await setSettings({ ...DEFAULT_SETTINGS, allowlist: [], customBlockedDomains: [] }) };
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unexpected extension error' };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureInitialized();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureInitialized();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MAINTENANCE_ALARM) void ensureInitialized();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !(SETTINGS_KEY in changes)) return;
  void queueProtection(sanitizeSettings(changes[SETTINGS_KEY]?.newValue)).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (response: ServerResponse) => void) => {
  void handleMessage(message, sender).then(sendResponse);
  return true;
});

void ensureInitialized();
