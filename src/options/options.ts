import { normalizeHostname } from '../core/domain';
import type { ClientMessage, ServerResponse } from '../core/messages';
import { DEFAULT_SETTINGS, type AegisSettings } from '../core/settings';

const errorElement = document.querySelector<HTMLElement>('#error')!;
const saveState = document.querySelector<HTMLElement>('#save-state')!;
const allowlist = document.querySelector<HTMLUListElement>('#allowlist')!;
const blocklist = document.querySelector<HTMLUListElement>('#blocklist')!;
const filterCatalog = document.querySelector<HTMLElement>('#filter-catalog')!;
const filterSummary = document.querySelector<HTMLElement>('#filter-summary')!;
const toggles = [...document.querySelectorAll<HTMLInputElement>('input[data-setting]')];
let settings: AegisSettings = { ...DEFAULT_SETTINGS, allowlist: [], customBlockedDomains: [] };
type FilterCategory = 'ads' | 'privacy' | 'annoyances' | 'security';
interface FilterReport {
  generatedAt: string;
  sources: Array<{ id: string; title?: string; category: FilterCategory; bytes: number; fallback: boolean }>;
}
let filterReport: FilterReport | null = null;

function isFilterReport(value: unknown): value is FilterReport {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { generatedAt?: unknown; sources?: unknown };
  return typeof candidate.generatedAt === 'string' && Array.isArray(candidate.sources) && candidate.sources.every((source: unknown) => {
    if (typeof source !== 'object' || source === null) return false;
    const item = source as Record<string, unknown>;
    return typeof item.id === 'string' && typeof item.bytes === 'number' && typeof item.fallback === 'boolean' &&
      ['ads', 'privacy', 'annoyances', 'security'].includes(String(item.category));
  });
}

async function send(message: ClientMessage): Promise<ServerResponse> {
  return chrome.runtime.sendMessage(message);
}

function showError(message: string): void {
  errorElement.textContent = message;
  errorElement.hidden = false;
}

function announce(message: string): void {
  saveState.textContent = message;
  window.setTimeout(() => { saveState.textContent = 'Protected locally'; }, 1_600);
}

function renderList(element: HTMLUListElement, domains: string[], kind: 'allow' | 'block'): void {
  element.replaceChildren();
  for (const domain of domains) {
    const item = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = domain;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${domain}`);
    remove.addEventListener('click', () => {
      const key = kind === 'allow' ? 'allowlist' : 'customBlockedDomains';
      void update({ [key]: settings[key].filter((itemDomain) => itemDomain !== domain) });
    });
    item.append(text, remove);
    element.append(item);
  }
}

function render(): void {
  for (const input of toggles) {
    const key = input.dataset.setting as keyof AegisSettings;
    input.checked = settings[key] === true;
  }
  renderList(allowlist, settings.allowlist, 'allow');
  renderList(blocklist, settings.customBlockedDomains, 'block');
  renderFilterCatalog();
}

function renderFilterCatalog(): void {
  if (!filterReport) return;
  const categorySetting = { ads: 'ads', privacy: 'trackers', annoyances: 'annoyances', security: 'malware' } as const;
  filterCatalog.replaceChildren();
  for (const source of filterReport.sources) {
    const active = settings.blockingEnabled && settings[categorySetting[source.category]];
    const card = document.createElement('article');
    card.className = `filter-card${active ? ' active' : ''}`;
    const icon = document.createElement('i');
    const body = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = source.title ?? source.id;
    const details = document.createElement('small');
    details.textContent = `${source.category} | ${(source.bytes / 1024).toFixed(source.bytes > 1024 * 1024 ? 0 : 1)} KB${source.fallback ? ' | fallback' : ' | verified build'}`;
    const state = document.createElement('b');
    state.textContent = active ? 'ON' : 'OFF';
    body.append(name, details);
    card.append(icon, body, state);
    filterCatalog.append(card);
  }
  const activeCount = filterReport.sources.filter((source) => settings.blockingEnabled && settings[categorySetting[source.category]]).length;
  filterSummary.textContent = `${activeCount}/${filterReport.sources.length} active`;
}

async function update(patch: Partial<AegisSettings>): Promise<void> {
  const response = await send({ type: 'UPDATE_SETTINGS', patch });
  if (!response.ok || !('settings' in response)) {
    showError(response.ok ? 'Unable to save settings' : response.error);
    return;
  }
  settings = response.settings;
  render();
  announce('Saved on this device');
}

for (const input of toggles) {
  input.addEventListener('change', () => {
    const key = input.dataset.setting as keyof AegisSettings;
    void update({ [key]: input.checked });
  });
}

function bindDomainForm(formSelector: string, inputSelector: string, key: 'allowlist' | 'customBlockedDomains'): void {
  const form = document.querySelector<HTMLFormElement>(formSelector)!;
  const input = document.querySelector<HTMLInputElement>(inputSelector)!;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const domain = normalizeHostname(input.value);
    if (!domain) {
      showError('Enter a valid hostname such as example.com.');
      return;
    }
    errorElement.hidden = true;
    input.value = '';
    void update({ [key]: [...settings[key], domain] });
  });
}

bindDomainForm('#allowlist-form', '#allowlist-input', 'allowlist');
bindDomainForm('#blocklist-form', '#blocklist-input', 'customBlockedDomains');

document.querySelector<HTMLButtonElement>('#export')!.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ product: 'Suvi Shield', exportedAt: new Date().toISOString(), settings }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `suvi-shield-settings-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

async function importSettings(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text()) as { settings?: unknown };
    if (typeof imported.settings !== 'object' || imported.settings === null) throw new Error('Missing settings object');
    await update(imported.settings);
  } catch (error) {
    showError(error instanceof Error ? `Import failed: ${error.message}` : 'Import failed');
  } finally {
    input.value = '';
  }
}

document.querySelector<HTMLInputElement>('#import')!.addEventListener('change', (event) => {
  void importSettings(event);
});

async function resetSettings(): Promise<void> {
  if (!confirm('Reset all Suvi Shield settings, trusted sites and custom blocks?')) return;
  const response = await send({ type: 'RESET_SETTINGS' });
  if (response.ok && 'settings' in response) {
    settings = response.settings;
    render();
    announce('Defaults restored');
  } else showError(response.ok ? 'Reset failed' : response.error);
}

document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => {
  void resetSettings();
});

document.querySelector<HTMLElement>('#version')!.textContent = chrome.runtime.getManifest().version;

async function initialize(): Promise<void> {
  const [[tab], reportResponse] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    fetch('../generated/rules-report.json')
  ]);
  if (reportResponse.ok) {
    const reportData: unknown = await reportResponse.json();
    if (isFilterReport(reportData)) filterReport = reportData;
  }
  const response = await send({ type: 'GET_STATUS', tabId: tab?.id ?? -1 });
  if (!response.ok || !('status' in response)) throw new Error(response.ok ? 'Status unavailable' : response.error);
  settings = response.status.settings;
  render();
}

void initialize().catch((error: unknown) => showError(error instanceof Error ? error.message : 'Unable to load Suvi Shield'));
