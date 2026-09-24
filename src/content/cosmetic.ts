import type { ServerResponse } from '../core/messages';

const STYLE_ID = 'aegis-cosmetic-style';

function selectorListSupported(selectors: readonly string[]): boolean {
  try {
    return CSS.supports(`selector(${selectors.join(',')})`);
  } catch {
    return false;
  }
}

function keepSupported(selectors: readonly string[]): string[] {
  if (selectors.length === 0) return [];
  if (selectorListSupported(selectors)) return [...selectors];
  if (selectors.length === 1) return [];
  const middle = Math.floor(selectors.length / 2);
  return [...keepSupported(selectors.slice(0, middle)), ...keepSupported(selectors.slice(middle))];
}

function toCss(selectors: Iterable<string>, declaration: string): string {
  const unique = [...new Set(selectors)];
  const chunks: string[] = [];
  for (let offset = 0; offset < unique.length; offset += 128) {
    const valid = keepSupported(unique.slice(offset, offset + 128));
    if (valid.length > 0) chunks.push(`${valid.join(',\n')} { ${declaration} }`);
  }
  return chunks.join('\n');
}

export async function installCosmeticFiltering(hostname: string): Promise<void> {
  const response: ServerResponse = await chrome.runtime.sendMessage({ type: 'GET_COSMETIC', hostname });
  if (!response.ok || !('cosmetic' in response)) return;
  const css = [
    toCss(response.cosmetic.hide, 'display: none !important;'),
    toCss(response.cosmetic.unhide, 'display: revert !important;')
  ].filter(Boolean).join('\n');
  if (!css) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  (document.documentElement ?? document).append(style);
}
