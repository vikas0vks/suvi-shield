export const SETTINGS_KEY = 'aegis.settings.v1';
export const SETTINGS_SCHEMA_VERSION = 4;
export const MANAGED_DYNAMIC_RULE_MIN = 100_000;
export const MANAGED_DYNAMIC_RULE_MAX = 199_999;
export const MANAGED_SCRIPT_IDS = [
  'aegis-popup-defense',
  'aegis-fingerprint-defense',
  'aegis-cosmetic-base',
  'aegis-capability-lockdown',
  'suvi-youtube-clean-player'
] as const;

export const ALL_RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other'
] as unknown as chrome.declarativeNetRequest.ResourceType[];

export const FRAME_RESOURCE_TYPES = ['main_frame', 'sub_frame'] as unknown as chrome.declarativeNetRequest.ResourceType[];

export const TRACKING_PARAMETERS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  'yclid',
  '_ga',
  '_gl',
  'igshid',
  'vero_conv',
  'vero_id',
  'wickedid',
  'oly_anon_id',
  'oly_enc_id',
  'rb_clickid',
  's_cid',
  'vero_conv'
]);

export const RULESET_IDS = {
  extremeMode: 'extreme_network',
  ads: 'ads_core',
  trackers: 'privacy_core',
  annoyances: 'annoyances',
  malware: 'security',
  trackingParams: 'tracking_params',
  strictCookies: 'strict_headers'
} as const;
