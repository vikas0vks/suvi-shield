import { normalizeHostname } from './domain';

export const PROTECTION_LEVELS = ['normal', 'medium', 'hard', 'extreme'] as const;
export type SelectableProtectionLevel = (typeof PROTECTION_LEVELS)[number];
export type ProtectionLevel = SelectableProtectionLevel | 'custom';

const PRESET_KEYS = [
  'extremeMode',
  'ads',
  'trackers',
  'annoyances',
  'malware',
  'trackingParams',
  'strictCookies',
  'cosmeticFiltering',
  'popupDefense',
  'fingerprintDefense',
  'linkSanitization',
  'webrtcProtection',
  'youtubeProtection'
] as const;

type PresetKey = (typeof PRESET_KEYS)[number];
type ProtectionPreset = Readonly<Record<PresetKey, boolean>>;

export const PROTECTION_PRESETS: Readonly<Record<SelectableProtectionLevel, ProtectionPreset>> = Object.freeze({
  normal: Object.freeze({
    extremeMode: false,
    ads: true,
    trackers: true,
    annoyances: false,
    malware: true,
    trackingParams: true,
    strictCookies: false,
    cosmeticFiltering: true,
    popupDefense: false,
    fingerprintDefense: false,
    linkSanitization: true,
    webrtcProtection: false,
    youtubeProtection: true
  }),
  medium: Object.freeze({
    extremeMode: false,
    ads: true,
    trackers: true,
    annoyances: true,
    malware: true,
    trackingParams: true,
    strictCookies: false,
    cosmeticFiltering: true,
    popupDefense: false,
    fingerprintDefense: false,
    linkSanitization: true,
    webrtcProtection: true,
    youtubeProtection: true
  }),
  hard: Object.freeze({
    extremeMode: false,
    ads: true,
    trackers: true,
    annoyances: true,
    malware: true,
    trackingParams: true,
    strictCookies: true,
    cosmeticFiltering: true,
    popupDefense: true,
    fingerprintDefense: true,
    linkSanitization: true,
    webrtcProtection: true,
    youtubeProtection: true
  }),
  extreme: Object.freeze({
    extremeMode: true,
    ads: true,
    trackers: true,
    annoyances: true,
    malware: true,
    trackingParams: true,
    strictCookies: true,
    cosmeticFiltering: true,
    popupDefense: true,
    fingerprintDefense: true,
    linkSanitization: true,
    webrtcProtection: true,
    youtubeProtection: true
  })
});

export interface AegisSettings {
  schemaVersion: 4;
  protectionLevel: ProtectionLevel;
  blockingEnabled: boolean;
  extremeMode: boolean;
  ads: boolean;
  trackers: boolean;
  annoyances: boolean;
  malware: boolean;
  trackingParams: boolean;
  strictCookies: boolean;
  cosmeticFiltering: boolean;
  popupDefense: boolean;
  fingerprintDefense: boolean;
  linkSanitization: boolean;
  webrtcProtection: boolean;
  youtubeProtection: boolean;
  allowlist: string[];
  customBlockedDomains: string[];
}

export const DEFAULT_SETTINGS: Readonly<AegisSettings> = Object.freeze({
  schemaVersion: 4,
  protectionLevel: 'hard',
  blockingEnabled: true,
  ...PROTECTION_PRESETS.hard,
  allowlist: [],
  customBlockedDomains: []
});

const BOOLEAN_KEYS = ['blockingEnabled', ...PRESET_KEYS] as const;

function cleanDomains(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value.slice(0, maximum)) {
    if (typeof item !== 'string') continue;
    const domain = normalizeHostname(item);
    if (domain) unique.add(domain);
  }
  return [...unique].sort();
}

export function inferProtectionLevel(settings: Pick<AegisSettings, PresetKey>): ProtectionLevel {
  for (const level of PROTECTION_LEVELS) {
    const preset = PROTECTION_PRESETS[level];
    if (PRESET_KEYS.every((key) => settings[key] === preset[key])) return level;
  }
  return 'custom';
}

export function sanitizeSettings(value: unknown): AegisSettings {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const result: AegisSettings = { ...DEFAULT_SETTINGS, allowlist: [], customBlockedDomains: [] };
  for (const key of BOOLEAN_KEYS) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  result.allowlist = cleanDomains(source.allowlist, 2_000);
  result.customBlockedDomains = cleanDomains(source.customBlockedDomains, 20_000).filter(
    (domain) => !result.allowlist.includes(domain)
  );
  // Version-one installs predate the hardened defaults; preserve their category choices but close old protection gaps.
  if (source.schemaVersion === 1) {
    result.strictCookies = true;
    result.fingerprintDefense = true;
    result.webrtcProtection = true;
    result.popupDefense = true;
  }
  result.protectionLevel = inferProtectionLevel(result);
  return result;
}

export function mergeSettings(current: AegisSettings, patch: Partial<AegisSettings>): AegisSettings {
  return sanitizeSettings({ ...current, ...patch, schemaVersion: 4 });
}

export function applyProtectionPreset(current: AegisSettings, level: SelectableProtectionLevel): AegisSettings {
  return sanitizeSettings({
    ...current,
    ...PROTECTION_PRESETS[level],
    schemaVersion: 4,
    protectionLevel: level,
    blockingEnabled: true
  });
}
