# Changelog

## Unreleased
- Answer keys checked by an independent solver that never saw them: 0 disagreements in 192 questions; 12 unclear items fixed
- Correct options are no longer usually the longest (60% → 20% in `pilot-01`, 49% → 17% in `practice-02`); the linter now checks this and the A–D balance
- Answer explanations in Spanish
- Complete the Words boxes are wide enough for their letters on phones and desktops
- After a reload, a notice says the clock was paused while the page was closed
- Strict Content-Security-Policy on every page; fonts served from the repository; favicon
- Browser smoke test in headless Chrome (`npm run e2e`) on every pull request
- Scoring, answer checking and adaptive routing moved to `engine/js/scoring.js` with unit tests; the review page now checks answers with the same rules as the test
- `sitemap.xml` for search engines

## 0.1.0 — 2026-10-27
First public release.
- Test engine with adaptive Reading and Listening, Writing and Speaking, in English, Turkish and Spanish
- Question bank (128 units) with a form assembler and single-task practice sets
- Two fixed tests: `pilot-01`, `practice-02`
- Quality gate (validator, fidelity linter, unit tests) on every pull request
- Feedback and study-plan prompts for any AI chatbot; optional on-device Whisper transcription for Speaking
