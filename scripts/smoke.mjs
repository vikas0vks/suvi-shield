import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const extensionPath = path.join(root, 'dist');
const executablePath = process.env.AEGIS_CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const server = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  if (request.url?.startsWith('/youtube-fixture')) {
    response.end(`<!doctype html><html><body>
      <ytd-ad-slot-renderer id="promoted-slot">Promoted</ytd-ad-slot-renderer>
      <div id="movie_player" class="html5-video-player">
        <video id="test-video"></video>
        <button class="ytp-ad-skip-button-modern" onclick="document.body.dataset.skipClicked='true'">Skip ad</button>
      </div>
      <script>
        const video = document.querySelector('#test-video');
        const state = { muted: false, playbackRate: 1, currentTime: 0 };
        Object.defineProperties(video, {
          duration: { configurable: true, get: () => 20 },
          muted: { configurable: true, get: () => state.muted, set: (value) => { state.muted = value; } },
          playbackRate: { configurable: true, get: () => state.playbackRate, set: (value) => { state.playbackRate = value; } },
          currentTime: { configurable: true, get: () => state.currentTime, set: (value) => { state.currentTime = value; } }
        });
      </script>
    </body></html>`);
    return;
  }
  response.end(`<!doctype html><html><body>
    <div class="cookie-banner">Tracking banner</div>
    <a id="tracked" href="/next?utm_source=smoke&id=7" ping="https://tracker.invalid/ping" target="_blank">next</a>
    <a id="blank-link" href="#same-tab" target="_blank">same-tab navigation</a>
    <a id="ctrl-link" href="#ctrl-route">ctrl navigation</a>
    <a id="middle-link" href="#middle-route">middle navigation</a>
    <form id="blank-form" action="/form-result" target="_blank"><button type="submit">submit</button></form>
    <button id="popup-button" onclick="document.body.dataset.gesturePopupBlocked=String(window.open('https://example.com')===null)">popup</button>
    <script>setTimeout(() => { document.body.dataset.popupBlocked = String(window.open('https://example.com') === null); }, 10);</script>
  </body></html>`);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Unable to start smoke-test server');
const origin = `http://127.0.0.1:${address.port}`;

const browser = await puppeteer.launch({ executablePath, headless: true, pipe: true, enableExtensions: [extensionPath] });

try {
  const workerTarget = await browser.waitForTarget(
    (target) => target.type() === 'service_worker' && target.url().startsWith('chrome-extension://'),
    { timeout: 15_000 }
  );
  const extensionId = new URL(workerTarget.url()).host;
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html`, { waitUntil: 'domcontentloaded' });
  const title = await page.title();
  if (title !== 'Suvi Shield | Control Center') throw new Error(`Unexpected options title: ${title}`);

  const extensionState = await page.evaluate(async () => {
    const registeredScripts = await chrome.scripting.getRegisteredContentScripts();
    return {
      rulesets: await chrome.declarativeNetRequest.getEnabledRulesets(),
      scripts: registeredScripts.map(({ id }) => id),
      youtubeScript: registeredScripts.find(({ id }) => id === 'suvi-youtube-clean-player'),
      settings: await chrome.storage.local.get('aegis.settings.v1')
    };
  });
  for (const id of ['ads_core', 'privacy_core', 'annoyances', 'security', 'tracking_params', 'strict_headers']) {
    if (!extensionState.rulesets.includes(id)) throw new Error(`Expected enabled ruleset ${id}`);
  }
  if (extensionState.rulesets.includes('extreme_network')) throw new Error('Fresh install unexpectedly enabled the Extreme network ruleset');
  if (!extensionState.scripts.includes('aegis-popup-defense')) throw new Error('Popup defense script was not registered');
  if (!extensionState.scripts.includes('aegis-cosmetic-base')) throw new Error('Generic cosmetic stylesheet was not registered');
  if (extensionState.scripts.includes('aegis-capability-lockdown')) throw new Error('Fresh install unexpectedly registered capability lockdown');
  if (!extensionState.scripts.includes('suvi-youtube-clean-player')) throw new Error('YouTube Clean Player script was not registered');
  if (!extensionState.youtubeScript?.matches?.includes('*://*.youtube.com/*') ||
      !extensionState.youtubeScript?.matches?.includes('*://*.youtube-nocookie.com/*') ||
      !extensionState.youtubeScript?.css?.includes('injected/youtube-player.css')) {
    throw new Error(`YouTube Clean Player registration is incomplete: ${JSON.stringify(extensionState.youtubeScript)}`);
  }
  if (!extensionState.settings['aegis.settings.v1']) throw new Error('Default settings were not persisted');
  await page.waitForFunction(() => document.querySelector('input[data-setting="ads"]')?.checked === true);
  await page.waitForFunction(() => document.querySelector('input[data-setting="youtubeProtection"]')?.checked === true);
  if (process.env.AEGIS_SMOKE_SCREENSHOT) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const screenshotPath = path.resolve(process.env.AEGIS_SMOKE_SCREENSHOT);
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.screenshot({ path: screenshotPath, fullPage: false });
  }

  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'domcontentloaded' });
  await popup.waitForFunction(() => document.querySelector('[data-profile="hard"]')?.getAttribute('aria-checked') === 'true');
  if (process.env.SUVI_POPUP_SCREENSHOT) {
    await popup.setViewport({ width: 370, height: 820, deviceScaleFactor: 2 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const screenshotPath = path.resolve(process.env.SUVI_POPUP_SCREENSHOT);
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await popup.screenshot({ path: screenshotPath, fullPage: true });
  }
  const selectProfile = async (level, expectedRulesets, expectedScripts) => {
    await popup.click(`[data-profile="${level}"]`);
    await popup.waitForFunction(
      (selectedLevel) => document.querySelector(`[data-profile="${selectedLevel}"]`)?.getAttribute('aria-checked') === 'true',
      {},
      level
    );
    const profileState = await popup.evaluate(async () => {
      const stored = await chrome.storage.local.get('aegis.settings.v1');
      return {
        settings: stored['aegis.settings.v1'],
        rulesets: (await chrome.declarativeNetRequest.getEnabledRulesets()).sort(),
        scripts: (await chrome.scripting.getRegisteredContentScripts()).map(({ id }) => id).sort(),
        title: document.querySelector('#profile-title')?.textContent,
        description: document.querySelector('#profile-description')?.textContent,
        featureCount: document.querySelectorAll('#profile-features span').length
      };
    });
    if (profileState.settings?.protectionLevel !== level || !profileState.title || !profileState.description || profileState.featureCount < 2) {
      throw new Error(`Protection profile UI/state mismatch for ${level}: ${JSON.stringify(profileState)}`);
    }
    if (JSON.stringify(profileState.rulesets) !== JSON.stringify([...expectedRulesets].sort())) {
      throw new Error(`Protection ruleset mismatch for ${level}: ${JSON.stringify(profileState.rulesets)}`);
    }
    if (JSON.stringify(profileState.scripts) !== JSON.stringify([...expectedScripts].sort())) {
      throw new Error(`Protection script mismatch for ${level}: ${JSON.stringify(profileState.scripts)}`);
    }
  };

  await selectProfile('normal',
    ['ads_core', 'privacy_core', 'security', 'tracking_params'],
    ['aegis-cosmetic-base', 'suvi-youtube-clean-player']);
  await selectProfile('medium',
    ['ads_core', 'privacy_core', 'annoyances', 'security', 'tracking_params'],
    ['aegis-cosmetic-base', 'suvi-youtube-clean-player']);
  await selectProfile('hard',
    ['ads_core', 'privacy_core', 'annoyances', 'security', 'tracking_params', 'strict_headers'],
    ['aegis-popup-defense', 'aegis-fingerprint-defense', 'aegis-cosmetic-base', 'suvi-youtube-clean-player']);

  const customResponse = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', patch: { trackers: false } }));
  if (!customResponse.ok || customResponse.settings?.protectionLevel !== 'custom') throw new Error('Manual settings did not produce Custom mode');
  await popup.reload({ waitUntil: 'domcontentloaded' });
  await popup.waitForFunction(() => document.querySelector('#mode-label')?.textContent === 'Custom');
  const selectedAfterCustom = await popup.$$eval('[data-profile][aria-checked="true"]', (buttons) => buttons.length);
  if (selectedAfterCustom !== 0) throw new Error('Custom mode incorrectly selected a named preset');

  await selectProfile('extreme',
    ['ads_core', 'privacy_core', 'annoyances', 'security', 'tracking_params', 'extreme_network', 'strict_headers'],
    ['aegis-popup-defense', 'aegis-fingerprint-defense', 'aegis-cosmetic-base', 'aegis-capability-lockdown', 'suvi-youtube-clean-player']);
  await popup.close();

  const youtubeFixture = await browser.newPage();
  await youtubeFixture.goto(`${origin}/youtube-fixture`, { waitUntil: 'domcontentloaded' });
  await youtubeFixture.addStyleTag({ path: path.join(extensionPath, 'injected', 'youtube-player.css') });
  await youtubeFixture.addScriptTag({ path: path.join(extensionPath, 'injected', 'youtube-player.js') });
  await youtubeFixture.waitForFunction(() => window[Symbol.for('suvi.youtubeCleanPlayer')] === true);
  const normalPlayback = await youtubeFixture.evaluate(() => {
    const video = document.querySelector('#test-video');
    const promoted = document.querySelector('#promoted-slot');
    return {
      muted: video.muted,
      playbackRate: video.playbackRate,
      currentTime: video.currentTime,
      promotedHidden: promoted.hidden && getComputedStyle(promoted).display === 'none'
    };
  });
  if (normalPlayback.muted || normalPlayback.playbackRate !== 1 || normalPlayback.currentTime !== 0 || !normalPlayback.promotedHidden) {
    throw new Error(`YouTube layer changed normal playback or missed a promoted surface: ${JSON.stringify(normalPlayback)}`);
  }
  await youtubeFixture.$eval('#movie_player', (player) => player.classList.add('ad-showing'));
  await youtubeFixture.waitForFunction(() => {
    const video = document.querySelector('#test-video');
    return document.body.dataset.skipClicked === 'true' && video.muted && video.playbackRate === 16 && video.currentTime > 19;
  });
  await youtubeFixture.$eval('#movie_player', (player) => player.classList.remove('ad-showing'));
  await youtubeFixture.waitForFunction(() => {
    const video = document.querySelector('#test-video');
    return video.muted === false && video.playbackRate === 1;
  });
  const restoredPlayback = await youtubeFixture.$eval('#test-video', (video) => ({
    muted: video.muted,
    playbackRate: video.playbackRate,
    currentTime: video.currentTime
  }));
  if (restoredPlayback.muted || restoredPlayback.playbackRate !== 1 || restoredPlayback.currentTime <= 19) {
    throw new Error(`YouTube layer did not restore the original playback state: ${JSON.stringify(restoredPlayback)}`);
  }
  await youtubeFixture.close();

  await page.goto(`${origin}/page?ok=1&utm_source=smoke`, { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).searchParams.has('utm_source')) throw new Error('Tracking parameter DNR redirect did not run');
  try {
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.cookie-banner')).display === 'none', { timeout: 5_000 });
  } catch {
    const diagnostics = await page.evaluate(() => ({
      href: location.href,
      readyState: document.readyState,
      stylePresent: Boolean(document.querySelector('#aegis-cosmetic-style')),
      bannerDisplay: getComputedStyle(document.querySelector('.cookie-banner')).display
    }));
    throw new Error(`Cosmetic filtering did not activate: ${JSON.stringify(diagnostics)}`);
  }
  try {
    await page.waitForFunction(() => !document.querySelector('#tracked').hasAttribute('ping'), { timeout: 3_000 });
  } catch {
    const diagnostics = await page.$eval('#tracked', (anchor) => ({ href: anchor.href, html: anchor.outerHTML }));
    throw new Error(`Link sanitizer did not remove ping: ${JSON.stringify(diagnostics)}`);
  }
  const cleanedHref = await page.$eval('#tracked', (anchor) => anchor.href);
  if (new URL(cleanedHref).searchParams.has('utm_source')) throw new Error('Content link sanitizer did not run');
  await page.waitForFunction(() => document.body.dataset.popupBlocked !== undefined);
  const popupState = await page.evaluate(() => ({
    blocked: document.body.dataset.popupBlocked === 'true',
    marker: window[Symbol.for('aegis.popupDefense')] === true,
    capabilityMarker: window[Symbol.for('aegis.capabilityLockdown')] === true,
    beaconBlocked: navigator.sendBeacon('/beacon', 'blocked') === false,
    activation: { active: navigator.userActivation?.isActive, ever: navigator.userActivation?.hasBeenActive }
  }));
  if (!popupState.blocked) throw new Error(`Ungestured page popup was not blocked: ${JSON.stringify(popupState)}`);
  if (!popupState.capabilityMarker || !popupState.beaconBlocked) throw new Error(`Capability lockdown did not activate: ${JSON.stringify(popupState)}`);

  const pagesBeforeClick = (await browser.pages()).length;
  await page.click('#popup-button');
  await page.waitForFunction(() => document.body.dataset.gesturePopupBlocked === 'true');
  await new Promise((resolve) => setTimeout(resolve, 150));
  if ((await browser.pages()).length !== pagesBeforeClick) throw new Error('Trusted-click window.open created a new tab');
  await page.click('#blank-link');
  await page.waitForFunction(() => location.hash === '#same-tab');
  if ((await browser.pages()).length !== pagesBeforeClick) throw new Error('target=_blank created a new tab');
  await page.keyboard.down('Control');
  await page.click('#ctrl-link');
  await page.keyboard.up('Control');
  await page.waitForFunction(() => location.hash === '#ctrl-route');
  if ((await browser.pages()).length !== pagesBeforeClick) throw new Error('Ctrl-click created a new tab');
  await page.click('#middle-link', { button: 'middle' });
  await new Promise((resolve) => setTimeout(resolve, 100));
  if ((await browser.pages()).length !== pagesBeforeClick || new URL(page.url()).hash === '#middle-route') {
    throw new Error('Middle-click was not contained');
  }
  await page.click('#blank-form button');
  await page.waitForFunction(() => location.pathname === '/form-result');
  if ((await browser.pages()).length !== pagesBeforeClick) throw new Error('target=_blank form created a new tab');

  const control = await browser.newPage();
  await control.goto(`chrome-extension://${extensionId}/options/options.html`, { waitUntil: 'domcontentloaded' });
  const trustResponse = await control.evaluate(() => chrome.runtime.sendMessage({
    type: 'SET_SITE_TRUST', hostname: '127.0.0.1', trusted: true
  }));
  if (!trustResponse.ok) throw new Error(`Unable to trust smoke-test site: ${trustResponse.error}`);
  await control.waitForFunction(async () => {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    return scripts
      .filter(({ id }) => id.startsWith('aegis-') || id.startsWith('suvi-'))
      .every(({ excludeMatches }) => excludeMatches?.includes('*://127.0.0.1/*'));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const pausedState = await page.evaluate(() => ({
    bannerDisplay: getComputedStyle(document.querySelector('.cookie-banner')).display,
    popupMarker: window[Symbol.for('aegis.popupDefense')] === true,
    capabilityMarker: window[Symbol.for('aegis.capabilityLockdown')] === true
  }));
  if (pausedState.bannerDisplay === 'none' || pausedState.popupMarker || pausedState.capabilityMarker) {
    throw new Error(`Site pause did not disable every page layer: ${JSON.stringify(pausedState)}`);
  }
  await control.evaluate(() => chrome.runtime.sendMessage({ type: 'SET_SITE_TRUST', hostname: '127.0.0.1', trusted: false }));
  await control.close();

  if (process.env.SUVI_LIVE_YOUTUBE === '1') {
    const liveYoutube = await browser.newPage();
    await liveYoutube.goto('https://www.youtube.com/watch?v=M7lc1UVf-VE', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await liveYoutube.waitForFunction(() => {
      const video = document.querySelector('video');
      return Boolean(video && video.readyState >= 2 && Number.isFinite(video.duration) && !video.error);
    }, { timeout: 45_000 });
    const startingTime = await liveYoutube.$eval('video', (video) => video.currentTime);
    const player = await liveYoutube.$('#movie_player');
    if (!player) throw new Error('Live YouTube player was not found');
    await player.click();
    await liveYoutube.waitForFunction((initialTime) => {
      const video = document.querySelector('video');
      return Boolean(video && !video.paused && video.readyState >= 2 && !video.error && video.currentTime > initialTime + 0.5);
    }, { timeout: 20_000 }, startingTime);
    const liveState = await liveYoutube.$eval('video', (video) => ({
      readyState: video.readyState,
      paused: video.paused,
      currentTime: video.currentTime,
      duration: video.duration,
      error: video.error?.code ?? null
    }));
    if (liveState.paused || liveState.readyState < 2 || liveState.currentTime <= startingTime + 0.5 || liveState.error !== null) {
      throw new Error(`Live YouTube content playback failed: ${JSON.stringify(liveState)}`);
    }
    console.log(`Live YouTube playback passed at ${liveState.currentTime.toFixed(2)}s / ${liveState.duration.toFixed(2)}s.`);
    await liveYoutube.close();
  }

  let badwareBlocked = false;
  try {
    await page.goto('https://malware.test/', { timeout: 10_000 });
  } catch (error) {
    badwareBlocked = error instanceof Error && error.message.includes('ERR_BLOCKED_BY_CLIENT');
  }
  if (!badwareBlocked) throw new Error('Security ruleset did not block the canary domain');
  console.log(`Smoke test passed for Suvi Shield ${extensionId}: four protection profiles, Custom mode, YouTube playback restoration, rules, DOM, new-tab paths, capabilities and badware canary verified.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
