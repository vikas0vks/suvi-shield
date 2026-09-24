import { PROTECTION_LEVELS, type AegisSettings, type SelectableProtectionLevel } from './settings';

export type ClientMessage =
  | { type: 'GET_STATUS'; tabId: number; url?: string }
  | { type: 'GET_COSMETIC'; hostname: string }
  | { type: 'SET_MASTER'; enabled: boolean }
  | { type: 'SET_PROTECTION_LEVEL'; level: SelectableProtectionLevel }
  | { type: 'SET_SITE_TRUST'; hostname: string; trusted: boolean }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<AegisSettings> }
  | { type: 'RESET_SETTINGS' };

export interface ExtensionStatus {
  settings: AegisSettings;
  enabledRulesets: string[];
  availableStaticRules: number;
  recentTabActions: number | null;
}

export type ServerResponse =
  | { ok: true; status: ExtensionStatus }
  | { ok: true; settings: AegisSettings }
  | { ok: true; cosmetic: { hide: string[]; unhide: string[] } }
  | { ok: false; error: string };

export function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  if (typeof message.type !== 'string') return false;
  switch (message.type) {
    case 'GET_STATUS':
      return Number.isInteger(message.tabId) && (message.url === undefined || typeof message.url === 'string');
    case 'GET_COSMETIC':
      return typeof message.hostname === 'string';
    case 'SET_MASTER':
      return typeof message.enabled === 'boolean';
    case 'SET_PROTECTION_LEVEL':
      return typeof message.level === 'string' && PROTECTION_LEVELS.includes(message.level as SelectableProtectionLevel);
    case 'SET_SITE_TRUST':
      return typeof message.hostname === 'string' && typeof message.trusted === 'boolean';
    case 'UPDATE_SETTINGS':
      return typeof message.patch === 'object' && message.patch !== null && !Array.isArray(message.patch);
    case 'RESET_SETTINGS':
      return true;
    default:
      return false;
  }
}
