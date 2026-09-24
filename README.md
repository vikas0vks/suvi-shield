<p align="center">
  <img src="src/assets/icon-128.png" width="112" height="112" alt="Suvi Shield logo">
</p>

<h1 align="center">Suvi Shield</h1>

<p align="center">
  A local-first Chrome ad blocker, tracker blocker and privacy extension built for Manifest V3.
</p>

<p align="center">
  <a href="https://github.com/vikas0vks/suvi-shield/releases/latest"><img src="https://img.shields.io/github/v/release/vikas0vks/suvi-shield?label=release" alt="Latest release"></a>
  <a href="https://github.com/vikas0vks/suvi-shield/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/vikas0vks/suvi-shield/ci.yml?branch=main&label=build" alt="Build status"></a>
  <img src="https://img.shields.io/badge/Chrome-120%2B-4285F4" alt="Chrome 120 or newer">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="GPL 3.0 license"></a>
</p>

Suvi Shield blocks ads, trackers, malicious domains, popups, tracking links and common browser abuse while keeping all protection logic on the device. It includes dedicated YouTube ad handling, four protection profiles, per-site controls and more than 26,000 compiled browser rules.

The default profile is **Hard**. It provides strict protection without enabling the most breakage-prone Extreme network restrictions. Users can switch profiles at any time from the extension popup.

## Download

Download the current Chromium package from the [latest release](https://github.com/vikas0vks/suvi-shield/releases/latest).

## Main features

- Browser-native Manifest V3 network filtering
- Ad, tracker, analytics and beacon blocking
- Malicious URL and badware domain protection
- YouTube promoted-content cleanup and in-player ad handling
- Popup, popunder and unwanted new-tab prevention
- Tracking parameter removal and safer outbound links
- Cookie banner, overlay and page-annoyance filtering
- Per-site pause and custom domain blocking
- WebRTC IP protection
- Canvas, WebGL and hardware fingerprint normalization
- No telemetry, accounts, remote executable code or acceptable-ads program

## Protection profiles

| Profile | Protection | Compatibility |
| --- | --- | --- |
| Normal | Ads, trackers, threats, YouTube Clean Player, cosmetic filtering and link cleanup | Highest |
| Medium | Normal plus annoyance filtering and WebRTC protection | High |
| Hard | Medium plus new-tab lockdown, strict headers and fingerprint protection | Recommended default |
| Extreme | Hard plus third-party active-content blocking and capability restrictions | Lowest |

Changing an individual setting creates a Custom profile. Trusted sites and custom blocked domains are preserved when a named profile is selected.

## YouTube protection

YouTube Clean Player removes known promoted surfaces and reacts only when the player reports an active ad. It can press available skip controls, mute and accelerate ad media, and restore the original playback state when the ad ends. Normal video playback is not modified when no ad state is present.

YouTube changes frequently, so no browser extension can promise permanent coverage for every ad format. The implementation avoids response-body rewriting because that approach can damage normal playback and autoplay behavior.

## Install in Chrome

1. Download `suvi-shield-0.4.0-chromium.zip` from the latest release.
2. Extract the ZIP file to a permanent folder.
3. Open `chrome://extensions` in Chrome or another Chromium browser.
4. Enable Developer mode.
5. Select Load unpacked and choose the extracted folder.

Chrome does not load an unpacked extension directly from a ZIP file. Keep the extracted folder after installation.

## Build from source

Requirements:

- Node.js 22 or newer
- npm 10 or newer
- Google Chrome 120 or newer for browser tests

```powershell
npm install
npm run rules:update
npm run check
npm run smoke
npm run package
```

The unpacked extension is written to `dist/`. The release archive is written to `release/`.

For an offline development build, use `npm run rules:starter`. Public release builds must use the maintained filter sources and pass `npm run validate:release`.

## Quality checks

The release pipeline verifies:

- ESLint and strict TypeScript checks
- Unit tests for settings, domains, messages and URL cleanup
- Manifest resources and static DNR limits
- Protection profile registration and Custom mode
- Popup and unwanted new-tab blocking paths
- YouTube ad-state handling and playback-state restoration
- Live YouTube content playback when the optional network test is enabled
- Release filter integrity and fallback detection

Run the optional live playback check with:

```powershell
$env:SUVI_LIVE_YOUTUBE='1'
npm run smoke
```

## Permissions

| Permission | Purpose |
| --- | --- |
| `declarativeNetRequest` | Apply packaged network protection rules |
| `scripting` | Register protection scripts and cosmetic styles |
| `storage` | Save local settings, trusted sites and custom blocks |
| `privacy` | Apply the optional WebRTC IP handling policy |
| `activeTab` | Read the current site for popup controls |
| `alarms` | Support event-driven extension maintenance |
| All sites | Apply network, cosmetic and link protection on visited pages |

## Privacy

Suvi Shield processes URLs and page elements locally. It does not collect browsing history, page content, account information, telemetry or rule-match logs. See [PRIVACY.md](PRIVACY.md) for the complete policy.

## Security

Security issues should be reported privately according to [SECURITY.md](SECURITY.md). Do not include credentials or unrelated browsing data in reports.

## Author

Suvi Shield is created and maintained by [vikas0vks](https://github.com/vikas0vks).

## License

The source code is licensed under GPL-3.0-or-later. Compiled filter data keeps the licenses and attribution requirements of its original projects. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
