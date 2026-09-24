import { describe, expect, it } from 'vitest';
import { applyProtectionPreset, DEFAULT_SETTINGS, mergeSettings, sanitizeSettings } from '../src/core/settings';

describe('settings validation', () => {
  it('uses safe defaults for unknown input', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({
      protectionLevel: 'hard',
      extremeMode: false,
      popupDefense: true,
      fingerprintDefense: true,
      youtubeProtection: true
    });
    expect(sanitizeSettings({ ads: 'yes', strictCookies: true }).ads).toBe(true);
    expect(sanitizeSettings({ strictCookies: true }).strictCookies).toBe(true);
  });

  it('normalizes, deduplicates and caps domain data', () => {
    const settings = sanitizeSettings({
      allowlist: ['Example.com', 'https://example.com/page', 'invalid'],
      customBlockedDomains: ['tracker.test', 'example.com']
    });
    expect(settings.allowlist).toEqual(['example.com']);
    expect(settings.customBlockedDomains).toEqual(['tracker.test']);
  });

  it('merges a partial patch without resetting unrelated values', () => {
    const current = sanitizeSettings({ ads: false, trackers: false });
    const next = mergeSettings(current, { strictCookies: true });
    expect(next.ads).toBe(false);
    expect(next.trackers).toBe(false);
    expect(next.strictCookies).toBe(true);
  });

  it('migrates version-one installs into hardened defaults', () => {
    const migrated = sanitizeSettings({ schemaVersion: 1, ads: false, strictCookies: false, popupDefense: false });
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.ads).toBe(false);
    expect(migrated.extremeMode).toBe(false);
    expect(migrated.strictCookies).toBe(true);
    expect(migrated.popupDefense).toBe(true);
    expect(migrated.protectionLevel).toBe('custom');
  });

  it('applies every named protection preset atomically while preserving site rules', () => {
    const current = sanitizeSettings({ allowlist: ['example.com'], customBlockedDomains: ['tracker.test'] });
    const normal = applyProtectionPreset(current, 'normal');
    expect(normal).toMatchObject({
      protectionLevel: 'normal', blockingEnabled: true, extremeMode: false, annoyances: false,
      strictCookies: false, popupDefense: false, fingerprintDefense: false, webrtcProtection: false,
      youtubeProtection: true
    });
    expect(normal.allowlist).toEqual(['example.com']);
    expect(normal.customBlockedDomains).toEqual(['tracker.test']);

    const medium = applyProtectionPreset(normal, 'medium');
    expect(medium).toMatchObject({ protectionLevel: 'medium', annoyances: true, webrtcProtection: true, popupDefense: false, youtubeProtection: true });

    const hard = applyProtectionPreset(medium, 'hard');
    expect(hard).toMatchObject({ protectionLevel: 'hard', extremeMode: false, strictCookies: true, popupDefense: true, fingerprintDefense: true, youtubeProtection: true });

    const extreme = applyProtectionPreset(hard, 'extreme');
    expect(extreme).toMatchObject({ protectionLevel: 'extreme', extremeMode: true, youtubeProtection: true });
  });

  it('labels manual boolean combinations as custom', () => {
    const hard = applyProtectionPreset(sanitizeSettings(null), 'hard');
    expect(mergeSettings(hard, { trackers: false }).protectionLevel).toBe('custom');
  });
});
