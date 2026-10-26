# Contributing to Fluova

Thanks for helping! The most useful contribution is new questions for the bank (section 2).

## 1. Report a problem
Open an issue and include the test id (e.g. `pilot-01`), the question id (visible in the review page or the JSON), and what looks wrong. Reports that say "this felt easier or harder than the real test" are valuable too. Please mention your real score if you have one.

<a id="question-bank"></a>
## 2. Add questions to the question bank (the most useful contribution)

Every test on Fluova is assembled from a shared **question bank**. One new unit — a single reading passage with its questions, one conversation, one Build a Sentence item — immediately makes every "New test" more varied for everyone. You do not need to write a whole test.

A unit is one small JSON file in `content/bank/units/<section>/<task>/<id>.json`:

```json
{
  "id": "dl_lost_and_found",
  "task": "daily_life",
  "tier": "easy",
  "topic": "lost and found",
  "screen": { "type": "passage", "title": "Lost and Found", "directions": "Read in Daily Life (sign)", "text": ["…"], "questions": [ … ] }
}
```

| task | section | what it is | questions |
|---|---|---|---|
| `ctw` | reading | Complete the Words paragraph — write only `"source"`; blanks are generated | — |
| `daily_life` | reading | notice, email, sign… | easy 2 · medium 2–3 · hard 3 |
| `academic` | reading | academic passage | 5 |
| `choose_response` | listening | one spoken line + 4 replies | 1 |
| `conversation` / `announcement` | listening | title starts with `Conversation:` / `Announcement:` | 2 |
| `talk` | listening | academic talk (title `Academic Talk: …`) | 4 |
| `build_sentence` | writing | one dialogue item (see `generator/bas_build.js`) | — |
| `email` / `discussion` | writing | one writing task | — |
| `listen_repeat` / `interview` | speaking | one speaking task with a scenario | — |

`tier` is the difficulty: `easy` (lower module), `medium` (first module), `hard` (upper module). Length ranges per tier are checked automatically.

Steps:
1. Write the unit (by hand, or with the prompt in [`generator/prompts/bank-unit.md`](generator/prompts/bank-unit.md) and any chatbot).
2. Run `node tools/bank.js`. It checks every unit (structure, length for its tier, question count, unique ids, allowed HTML) and rebuilds `content/bank/bank.json`. Then run `npm run check` to run everything CI runs.
3. Open a pull request. CI runs the same checks and also builds random tests from the bank to make sure they still pass the quality gate.

## 3. Add a fixed test

Fixed tests (like `pilot-01`, `practice-02`) are **recipes**: lists of bank units in `content/tests/recipes/<id>.json`. `node tools/bank.js` renders them to `content/tests/<id>.json`. To make one:

```bash
node generator/form_assemble.js --seed 42 --id practice-03 --title "Fluova Practice Test 3" --save
node tools/bank.js && node tools/build_manifest.js
```

You can also start from whole sections drafted with the test builder (`generator/index.html`) and split them into units with `node generator/bank_from_test.js content/tests/<id>.json`.

Always: write **original** content. Never copy ETS questions, passages, audio scripts or rubric text, or content from any other publisher. Play the test once in the browser (`python3 -m http.server`, then open `/engine/`).

### Rules the linter enforces
See [docs/FIDELITY-SPEC.md](docs/FIDELITY-SPEC.md). The ones people miss most often:
- **Reading answer overlap:** on average, correct options should repeat 30–50% of their content words from the text, and 30–50% of questions should be paraphrase or inference (overlap ≤ 25%). Both too literal and too clever fail.
- **Complete the Words:** use `tools/ctw_generate.js` and do not hand-pick the blanks.
- **Build a Sentence:** use a `frame` with prefilled words and allow multi-word tiles. Only about 2 of the 10 items should have a distractor, and never more than one per item. `generator/bas_build.js` helps.
- **Listening titles:** conversations and announcements are recognised by their `title` ("Conversation: …", "Announcement: …"). Every other listening screen counts as an academic talk.
- **Speaking:** Listen and Repeat sentences must grow from about 5 to 20+ words around one scenario, and the Interview must stay on one topic, moving from factual questions to opinion.

### Explanations
Every multiple-choice question should have a `why` explaining **why the answer is right and what the trap in a wrong option is**. Letters (A–D) refer to the option order in the JSON. The engine shuffles options on screen, but the review page shows them in JSON order.

`why` can be a plain string (English) or a translation map:
```json
"why": { "en": "Inference: …", "tr": "Çıkarım: …" }
```

### Using AI to draft
AI drafts are fine, but **you are responsible for the result**. Set `"generatedBy"` to the tool or model you used, then read every item yourself. The linter catches structural drift. It cannot catch a wrong answer key.

## 4. Translate
- UI strings: `engine/js/i18n.js`. Copy the `en` block and add the language code to `LANGS`.
- Landing page: `site/i18n.js`.
- Keep "TOEFL®", task names (Complete the Words, Build a Sentence…) and all test content in English. See [docs/I18N-ARCHITECTURE.md](docs/I18N-ARCHITECTURE.md).

## 5. Code
Plain HTML/CSS/JS with no build step for the engine and no dependencies. Keep it that way unless there is a strong reason. Before you open a PR, run `npm run check`, add a test in `test/` for new logic, and try the change in Chrome at desktop width and at 375 px, in both light and dark mode.

By taking part you agree to the [code of conduct](CODE_OF_CONDUCT.md). Security issues: see [SECURITY.md](SECURITY.md).

## Trademark
Write "the TOEFL® test" or "the TOEFL iBT® test", using the mark only as an adjective. Do not put "TOEFL" in names, ids or file names. Every page carries the ETS disclaimer.
