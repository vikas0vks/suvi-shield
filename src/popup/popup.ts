import { isHostnameCovered, normalizeHostname } from '../core/domain';
import type { ClientMessage, ExtensionStatus, ServerResponse } from '../core/messages';
import { PROTECTION_LEVELS, type ProtectionLevel, type SelectableProtectionLevel } from '../core/settings';

const PROFILE_DETAILS: Record<ProtectionLevel, { title: string; description: string; features: string[]; tradeoff: string }> = {
  normal: {
    title: 'Fast & compatible',
    description: 'Core blocking with the lowest chance of breaking websites.',
    features: ['Ads', 'Trackers', 'Threats', 'YouTube Clean Player'],
    tradeoff: 'Allows site popups, third-party active content and browser capability prompts.'
  },
  medium: {
    title: 'Daily privacy',
    description: 'Balanced everyday protection with annoyance and WebRTC defenses.',
    features: ['Core filters', 'YouTube Clean Player', 'Annoyances', 'WebRTC shield'],
    tradeoff: 'New-tab lockdown, fingerprint normalization and strict cookie stripping stay off.'
  },
  hard: {
    title: 'Strict browser shield',
    description: 'Stops every page-created new tab and reduces cross-site identity leakage.',
    features: ['YouTube Clean Player', 'New-tab lock', 'Strict headers', 'Fingerprint shield'],
    tradeoff: 'OAuth popups, payments, calls or graphics tools may need a per-site pause.'
  },
  extreme: {
    title: 'Maximum lockdown',
    description: 'Adds third-party active-content blocking and dangerous capability denial.',
    features: ['YouTube Clean Player', 'Everything in Hard', '3P scripts & frames', 'Capability lock'],
    tradeoff: 'Highest breakage risk. Use trusted-site pause for apps you intentionally trust.'
  },
  custom: {
    title: 'Custom configuration',
    description: 'Your individual Control Center switches no longer match a preset.',
    features: ['Manual rules', 'Your selected layers'],
    tradeoff: 'Choose a preset above anytime to restore a tested protection profile.'
  }
};

const elements = {
  master: document.querySelector<HTMLInputElement>('#master-toggle')!,
  site: document.querySelector<HTMLElement>('#site-name')!,
  siteToggle: document.querySelector<HTMLButtonElement>('#site-toggle')!,
  protectionLabel: document.querySelector<HTMLElement>('#protection-label')!,
  actionCount: document.querySelector<HTMLElement>('#action-count')!,
  rulesetCount: document.querySelector<HTMLElement>('#ruleset-count')!,
  mode: document.querySelector<HTMLElement>('#mode-label')!,
  profiles: document.querySelector<HTMLElement>('.profiles')!,
  profileButtons: [...document.querySelectorAll<HTMLButtonElement>('[data-profile]')],
  profileExplainer: document.querySelector<HTMLElement>('#profile-explainer')!,
  profileTitle: document.querySelector<HTMLElement>('#profile-title')!,
  profileDescription: document.querySelector<HTMLElement>('#profile-description')!,
  profileFeatures: document.querySelector<HTMLElement>('#profile-features')!,
  profileTradeoff: document.querySelector<HTMLElement>('#profile-tradeoff')!,
  error: document.querySelector<HTMLElement>('#error')!,
  openOptions: document.querySelector<HTMLButtonElement>('#open-options')!
};

let tabId = -1;
let hostname: string | null = null;
let status: ExtensionStatus | null = null;

async function send(message: ClientMessage): Promise<ServerResponse> {
  return chrome.runtime.sendMessage(message);
}

function showError(message: string): void {
  elements.error.textContent = message;
  elements.error.hidden = false;
}

function renderProfile(level: ProtectionLevel): void {
  const details = PROFILE_DETAILS[level];
  elements.mode.textContent = level.charAt(0).toUpperCase() + level.slice(1);
  elements.profileExplainer.dataset.profile = level;
  elements.profileTitle.textContent = details.title;
  elements.profileDescription.textContent = details.description;
  elements.profileTradeoff.textContent = details.tradeoff;
  elements.profileFeatures.replaceChildren(...details.features.map((feature) => {
    const chip = document.createElement('span');
    chip.textContent = feature;
    return chip;
  }));
  for (const button of elements.profileButtons) {
    button.setAttribute('aria-checked', String(button.dataset.profile === level));
  }
}

function render(next: ExtensionStatus): void {
  status = next;
  const trusted = hostname ? isHostnameCovered(hostname, next.settings.allowlist) : false;
  const active = next.settings.blockingEnabled && !trusted;
  document.body.classList.toggle('paused', !active);
  elements.master.checked = next.settings.blockingEnabled;
  elements.protectionLabel.textContent = active ? 'Protection active' : trusted ? 'Paused for this site' : 'Protection paused';
  elements.siteToggle.textContent = trusted ? 'Resume on this site' : 'Pause on this site';
  elements.siteToggle.disabled = !hostname || !next.settings.blockingEnabled;
  elements.actionCount.textContent = next.recentTabActions === null ? 'Live' : String(next.recentTabActions);
  elements.rulesetCount.textContent = String(next.enabledRulesets.length);
  renderProfile(next.settings.protectionLevel);
  document.querySelectorAll<HTMLElement>('[data-layer]').forEach((element) => {
    const key = element.dataset.layer as keyof typeof next.settings;
    element.classList.toggle('active', active && next.settings[key] === true);
  });
}

async function refresh(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? -1;
  if (tab?.url) {
    try {
      hostname = normalizeHostname(new URL(tab.url).hostname);
    } catch {
      hostname = null;
    }
  }
  elements.site.textContent = hostname ?? 'Protected browser';
  const response = await send({ type: 'GET_STATUS', tabId, ...(tab?.url ? { url: tab.url } : {}) });
  if (!response.ok || !('status' in response)) {
    showError(response.ok ? 'Status unavailable' : response.error);
    return;
  }
  render(response.status);
}

async function toggleMaster(): Promise<void> {
  const response = await send({ type: 'SET_MASTER', enabled: elements.master.checked });
  if (!response.ok) showError(response.error);
  await refresh();
}

async function toggleSite(): Promise<void> {
  if (!hostname || !status) return;
  const trusted = isHostnameCovered(hostname, status.settings.allowlist);
  const response = await send({ type: 'SET_SITE_TRUST', hostname, trusted: !trusted });
  if (!response.ok) showError(response.error);
  else if (tabId >= 0) await chrome.tabs.reload(tabId);
  window.close();
}

async function setProtectionLevel(level: SelectableProtectionLevel): Promise<void> {
  elements.profiles.classList.add('applying');
  elements.error.hidden = true;
  try {
    const response = await send({ type: 'SET_PROTECTION_LEVEL', level });
    if (!response.ok || !('settings' in response)) {
      showError(response.ok ? 'Unable to apply protection level' : response.error);
      return;
    }
    if (status) render({ ...status, settings: response.settings });
    await refresh();
  } finally {
    elements.profiles.classList.remove('applying');
  }
}

elements.master.addEventListener('change', () => { void toggleMaster(); });
elements.siteToggle.addEventListener('click', () => { void toggleSite(); });
for (const button of elements.profileButtons) {
  button.addEventListener('click', () => {
    const level = button.dataset.profile;
    if (PROTECTION_LEVELS.includes(level as SelectableProtectionLevel)) void setProtectionLevel(level as SelectableProtectionLevel);
  });
}

elements.openOptions.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

void refresh().catch((error: unknown) => showError(error instanceof Error ? error.message : 'Unable to load Suvi Shield'));
