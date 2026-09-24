import { isHostnameCovered } from '../core/domain';
import { getSettings } from '../core/storage';
import { sanitizeUrl } from '../core/url-sanitizer';
import { installCosmeticFiltering } from './cosmetic';

function cleanAnchor(anchor: HTMLAnchorElement): void {
  anchor.removeAttribute('ping');
  const result = sanitizeUrl(anchor.href, location.href);
  if (result.changed) anchor.href = result.url;
  if (anchor.target === '_blank') {
    const rel = new Set(anchor.rel.split(/\s+/u).filter(Boolean));
    rel.add('noopener');
    rel.add('noreferrer');
    anchor.rel = [...rel].join(' ');
  }
}

function scanNode(node: Node): void {
  if (node instanceof HTMLAnchorElement) cleanAnchor(node);
  if (node instanceof Element || node instanceof Document || node instanceof DocumentFragment) {
    node.querySelectorAll('a[href]').forEach((anchor) => cleanAnchor(anchor as HTMLAnchorElement));
  }
}

function installLinkSanitizer(): void {
  scanNode(document);
  document.addEventListener('DOMContentLoaded', () => { scanNode(document); }, { once: true });
  document.addEventListener('click', (event) => {
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (anchor) cleanAnchor(anchor);
  }, { capture: true, passive: true });
  const observer = new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(scanNode);
  });
  observer.observe(document, { childList: true, subtree: true });
}

async function start(): Promise<void> {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  const settings = await getSettings();
  if (!settings.blockingEnabled || isHostnameCovered(location.hostname, settings.allowlist)) return;

  if (settings.linkSanitization) installLinkSanitizer();
  if (settings.cosmeticFiltering) {
    try {
      await installCosmeticFiltering(location.hostname);
    } catch {
      // Network blocking still works if a generated cosmetic bucket is unavailable.
    }
  }
}

void start();
