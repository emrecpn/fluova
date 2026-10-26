# Security

Fluova is a static site: there is no server, no account system and no database. Results are stored in the visitor's browser (`localStorage`).

## What we protect against
- **Malicious test content.** Tests and bank units are rendered as HTML. `tools/validate.js` rejects any tag other than `strong, em, b, i, u, br, sub, sup`, any attribute, and any `javascript:` URL, and it runs on every pull request. The engine also strips everything else when it loads a test (`engine/js/loader.js`).
- **Third-party code.** The only external script is transformers.js (pinned version, from jsDelivr), loaded only when a visitor chooses on-device Whisper transcription.

## Reporting a vulnerability
Please **do not** open a public issue. Use GitHub's private vulnerability reporting (Security tab → "Report a vulnerability"), or contact [@emrecpn](https://github.com/emrecpn) privately. You will get an answer within a week.
