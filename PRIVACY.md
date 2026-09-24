# Privacy policy

Suvi Shield processes page URLs and DOM content locally to provide blocking and privacy protection. It stores protection preferences, trusted domains and user-blocked domains in the browser's local extension storage.

Suvi Shield does not collect telemetry, browsing history, page content, account information or rule-match logs. It does not sell or share user data. The extension's build process downloads public filter lists; the installed extension does not transmit browsing activity to those list providers.

Exported settings are created only after a user action and remain under the user's control. Browser extension storage is not encrypted, so users should treat exported trusted/block domain lists as potentially sensitive.

The required all-sites permission is used to apply cosmetic filtering and local link protection. `declarativeNetRequest` enforces packaged rules without exposing request contents to extension JavaScript. The `privacy` permission is used only when the user enables WebRTC IP protection.
