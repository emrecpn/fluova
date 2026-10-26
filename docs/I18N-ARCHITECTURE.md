# Multilingual site

Languages: **English, Turkish and Spanish**. The Spanish interface is machine-drafted and still needs a native-speaker review, and answer explanations exist in English and Turkish only. Portuguese (BR), Arabic, Vietnamese and Indonesian will follow based on demand.

## URLs: one subfolder per language
```
/        English (x-default); shows a small "switch to your language" banner if the browser language differs
/en/     English
/tr/     Turkish
/es/     Spanish
```
- **No automatic redirect.** Redirects send search bots and VPN users to the wrong language. We show a suggestion banner instead and remember the visitor's choice.
- Subfolders keep one domain and one build. Client-side-only language switching was rejected because search engines would never see the second language.

## Prerendered page per language
- One template (`site/index.html`) plus dictionaries (`site/i18n.js`). `site/build.js` writes `dist/<lang>/index.html`.
- Each page gets its own `<html lang>`, title, description and Open Graph text, along with `hreflang` links for every language plus `x-default`, and a canonical URL.
- The language switcher is a plain link (`/tr/` ↔ `/en/`).
- A missing key prints a build warning and falls back to English.

## Never translated
- **"TOEFL®"**: no translation and no suffixes (an ETS rule). Write "TOEFL® sınavına", not "TOEFL'a".
- **Task names** such as *Complete the Words* and *Build a Sentence*. They appear in English on the real test, and learners need to recognise them.
- **Test content**: passages, questions, options and audio are always in English.
- Band scale and CEFR levels.

## What gets localised (cheapest first)
1. UI strings: machine draft plus a one-time check by a native speaker.
2. Landing copy: rewritten for each language rather than translated word for word.
3. Answer explanations (`why` fields): `{"en": "...", "tr": "..."}` per question.
4. Native-language coaching, e.g. "Turkish speakers often drop articles". This needs error data.

## Layout must survive every language
- Spanish and German text runs 20–30% longer than English, and Turkish has very long single words. Headings use `overflow-wrap` and `hyphens`, and `tools/layout_audit.js` checks **every language at every width** after each build.
- The fonts cover Latin Extended. Vietnamese and Arabic need extra fonts.
- RTL (Arabic): write new CSS with logical properties (`margin-inline-start`, etc.).
- `text-transform: uppercase` turns "i" into "İ" in Turkish, so English labels get `lang="en"`.

## Adding a language
1. Copy the `en` block in `site/i18n.js` (and the engine dictionary once it exists) and translate it.
2. Run `node site/build.js`, then `node tools/layout_audit.js`.
3. Ask a native speaker to review, then open a PR.
