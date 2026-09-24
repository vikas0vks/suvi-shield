import { SETTINGS_KEY } from './constants';
import { DEFAULT_SETTINGS, sanitizeSettings, type AegisSettings } from './settings';

export async function getSettings(): Promise<AegisSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  if (!(SETTINGS_KEY in stored)) return { ...DEFAULT_SETTINGS, allowlist: [], customBlockedDomains: [] };
  return sanitizeSettings(stored[SETTINGS_KEY]);
}

export async function setSettings(settings: AegisSettings): Promise<AegisSettings> {
  const clean = sanitizeSettings(settings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: clean });
  return clean;
}
