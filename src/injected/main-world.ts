(() => {
  const marker = Symbol.for('aegis.popupDefense');
  const markedWindow = window as Window & { [marker]?: boolean };
  if (markedWindow[marker]) return;
  markedWindow[marker] = true;

  const isSameContextTarget = (target: string | null): boolean => {
    const normalized = (target ?? '').trim().toLowerCase();
    return normalized === '' || normalized === '_self' || normalized === '_top' || normalized === '_parent';
  };

  const hardenAnchor = (anchor: HTMLAnchorElement): void => {
    anchor.removeAttribute('ping');
    anchor.relList.add('noopener', 'noreferrer');
    if (!isSameContextTarget(anchor.getAttribute('target'))) anchor.target = '_self';
  };

  const hardenTarget = (element: Element): void => {
    if (element instanceof HTMLAnchorElement) hardenAnchor(element);
    if (element instanceof HTMLFormElement && !isSameContextTarget(element.getAttribute('target'))) element.target = '_self';
    if (element instanceof HTMLBaseElement && !isSameContextTarget(element.getAttribute('target'))) element.target = '_self';
  };

  const scan = (node: Node): void => {
    if (node instanceof Element) hardenTarget(node);
    if (node instanceof Element || node instanceof Document || node instanceof DocumentFragment) {
      node.querySelectorAll('a[target], a[ping], form[target], base[target]').forEach(hardenTarget);
    }
  };

  const navigateInPlace = (anchor: HTMLAnchorElement): void => {
    let destination: URL;
    try {
      destination = new URL(anchor.href, location.href);
    } catch {
      return;
    }
    if (destination.protocol === 'http:' || destination.protocol === 'https:') location.assign(destination.href);
  };

  const blockNewContextClick = (event: MouseEvent): void => {
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!anchor) return;
    const requestedNewContext = event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
      !isSameContextTarget(anchor.getAttribute('target'));
    hardenAnchor(anchor);
    if (!requestedNewContext) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.isTrusted && event.button === 0) navigateInPlace(anchor);
  };

  // Fortress mode denies every page-created browsing context, including popups on trusted clicks.
  const blockedOpen: typeof window.open = function () { return null; };
  Object.defineProperty(blockedOpen, 'name', { value: 'open' });
  try {
    Object.defineProperty(window, 'open', { configurable: false, writable: false, value: blockedOpen });
  } catch {
    window.open = blockedOpen;
  }

  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (this === window && type.toLowerCase() === 'beforeunload') return;
    nativeAddEventListener.call(this, type, callback, options);
  };
  try {
    Object.defineProperty(window, 'onbeforeunload', { configurable: false, get: () => null, set: () => undefined });
  } catch {
    window.onbeforeunload = null;
  }

  const nativeSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function (): void {
    if (!isSameContextTarget(this.getAttribute('target'))) this.target = '_self';
    nativeSubmit.call(this);
  };
  const nativeRequestSubmit = HTMLFormElement.prototype.requestSubmit;
  if (nativeRequestSubmit) {
    HTMLFormElement.prototype.requestSubmit = function (submitter?: HTMLElement | null): void {
      if (!isSameContextTarget(this.getAttribute('target'))) this.target = '_self';
      nativeRequestSubmit.call(this, submitter);
    };
  }

  window.addEventListener('click', blockNewContextClick, true);
  window.addEventListener('auxclick', blockNewContextClick, true);
  window.addEventListener('submit', (event) => {
    if (event.target instanceof HTMLFormElement && !isSameContextTarget(event.target.getAttribute('target'))) {
      event.target.target = '_self';
    }
  }, true);

  scan(document);
  document.addEventListener('DOMContentLoaded', () => scan(document), { once: true });
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof Element) hardenTarget(record.target);
      record.addedNodes.forEach(scan);
    }
  }).observe(document, { attributes: true, attributeFilter: ['target', 'ping'], childList: true, subtree: true });
})();
