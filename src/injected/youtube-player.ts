(() => {
  const marker = Symbol.for('suvi.youtubeCleanPlayer');
  const markedWindow = window as Window & { [marker]?: boolean };
  if (markedWindow[marker]) return;
  markedWindow[marker] = true;

  const PLAYER_SELECTOR = '#movie_player, .html5-video-player';
  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-slot button',
    'button[class*="ytp-ad-skip"]'
  ];
  const CLOSE_SELECTORS = ['.ytp-ad-overlay-close-button', 'button[aria-label="Close ad"]'];
  const DISPLAY_AD_SELECTOR = [
    'ytd-ad-slot-renderer',
    'ytd-display-ad-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-video-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-video-masthead-ad-v3-renderer',
    'ytd-action-companion-ad-renderer',
    'ytm-promoted-sparkles-web-renderer',
    'ytm-companion-ad-renderer',
    '#masthead-ad',
    '#player-ads'
  ].join(',');

  interface PlaybackState {
    muted: boolean;
    playbackRate: number;
  }

  const savedState = new WeakMap<HTMLVideoElement, PlaybackState>();
  const managedVideos = new Set<HTMLVideoElement>();
  let scanQueued = false;

  const isAdActive = (player: Element): boolean =>
    player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting') ||
    Boolean(player.querySelector('.ytp-ad-player-overlay, .ytp-ad-text, .ytp-ad-preview-container'));

  const clickControls = (player: Element, selectors: readonly string[]): void => {
    for (const selector of selectors) {
      for (const element of player.querySelectorAll<HTMLElement>(selector)) {
        if (element instanceof HTMLButtonElement && (element.disabled || element.getAttribute('aria-disabled') === 'true')) continue;
        try { element.click(); } catch { /* A renamed control must never interrupt content playback. */ }
      }
    }
  };

  const restoreVideo = (video: HTMLVideoElement): void => {
    const state = savedState.get(video);
    if (!state) return;
    try { video.muted = state.muted; } catch { /* The player may replace the media element during navigation. */ }
    try { video.playbackRate = state.playbackRate; } catch { /* Keep YouTube's replacement state if restoration is rejected. */ }
    savedState.delete(video);
    managedVideos.delete(video);
  };

  const accelerateAd = (player: Element, video: HTMLVideoElement): void => {
    if (!savedState.has(video)) {
      savedState.set(video, { muted: video.muted, playbackRate: video.playbackRate });
      managedVideos.add(video);
    }
    try { video.muted = true; } catch { /* Best-effort ad muting. */ }
    try { video.playbackRate = 16; } catch { /* Some streams restrict playback rate. */ }
    const duration = video.duration;
    if (Number.isFinite(duration) && duration > 0.25) {
      const end = Math.max(0, duration - 0.05);
      try {
        if (video.currentTime < end) video.currentTime = end;
      } catch {
        // Live/server-stitched streams may reject seeks; accelerated muted playback remains the fallback.
      }
    }
    clickControls(player, SKIP_SELECTORS);
    clickControls(player, CLOSE_SELECTORS);
  };

  const scan = (): void => {
    scanQueued = false;
    document.querySelectorAll<HTMLElement>(DISPLAY_AD_SELECTOR).forEach((element) => {
      element.hidden = true;
      element.setAttribute('aria-hidden', 'true');
    });

    const activeVideos = new Set<HTMLVideoElement>();
    for (const player of document.querySelectorAll<HTMLElement>(PLAYER_SELECTOR)) {
      const video = player.querySelector<HTMLVideoElement>('video');
      if (!video) continue;
      if (isAdActive(player)) {
        activeVideos.add(video);
        accelerateAd(player, video);
      } else {
        restoreVideo(video);
      }
    }
    for (const video of [...managedVideos]) {
      if (!video.isConnected || !activeVideos.has(video)) restoreVideo(video);
    }
  };

  const queueScan = (): void => {
    if (scanQueued) return;
    scanQueued = true;
    queueMicrotask(scan);
  };

  const observer = new MutationObserver(queueScan);
  observer.observe(document, { attributes: true, attributeFilter: ['class', 'aria-label'], childList: true, subtree: true });
  document.addEventListener('yt-navigate-start', () => {
    for (const video of [...managedVideos]) restoreVideo(video);
  }, true);
  document.addEventListener('yt-navigate-finish', queueScan, true);
  document.addEventListener('visibilitychange', queueScan, true);
  window.addEventListener('pagehide', () => {
    for (const video of [...managedVideos]) restoreVideo(video);
  }, { once: true });
  window.setInterval(scan, 500);
  queueScan();
})();
