import { describe, expect, it } from 'vitest';
import { isClientMessage } from '../src/core/messages';

describe('privileged message validation', () => {
  it('accepts documented messages', () => {
    expect(isClientMessage({ type: 'GET_STATUS', tabId: 2 })).toBe(true);
    expect(isClientMessage({ type: 'SET_SITE_TRUST', hostname: 'example.com', trusted: true })).toBe(true);
    expect(isClientMessage({ type: 'UPDATE_SETTINGS', patch: { ads: false } })).toBe(true);
  });

  it('rejects malformed messages', () => {
    expect(isClientMessage({ type: 'GET_STATUS', tabId: '2' })).toBe(false);
    expect(isClientMessage({ type: 'SET_MASTER', enabled: 'yes' })).toBe(false);
    expect(isClientMessage({ type: 'OPEN_URL', url: 'https://attacker.test' })).toBe(false);
  });
});
