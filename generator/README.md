# Test generator

## 0. The question bank and the form assembler (automatic, no AI, no cost)
`content/bank/units/` holds every passage, talk and task as a separate unit with a task type and a difficulty tier. `generator/form_assemble.js` fills the 2026 blueprint (`content/bank/blueprint.json`) with units, preferring questions the test taker has not seen, keeps the Build a Sentence distractor share at about 2 in 10, and runs the quality gate, retrying with another seed if needed. The engine's **New test** button runs it in the browser. Each new unit multiplies the number of distinct tests.

```bash
node tools/bank.js                         # check all units, rebuild bank.json, render fixed-test recipes
node generator/form_assemble.js --check 20 # 20 random forms must pass the gate (CI does this)
node generator/form_assemble.js --seed 9 --id practice-03 --title "Fluova Practice Test 3" --save
```

New content reaches the bank in three ways (below). Every way ends at the same quality gate (`tools/bank.js`, `tools/validate.js`, `tools/lint_forms.js`), which also runs in CI on every pull request.

## 1. Algorithmic (no AI)
| Tool | What it does |
|---|---|
| `tools/ctw_generate.js` | **Complete the Words.** Applies the 2026 C-test rule to any paragraph: the first sentence stays intact, every second word loses its second half, 10 blanks. |
| `generator/bas_build.js` | **Build a Sentence.** Turns plain-text dialogues into engine screens: a partly prefilled frame, word-group tiles, and an optional distractor chosen by grammar rules (extra auxiliary in an embedded question, wrong passive form, missing backshift, double comparative, agreement). It warns when more than ~2 in 10 items have a distractor. |

```
A: How was the workshop you went to on Saturday?
B: The [tips] [that] [the speaker] [shared] [were] really useful.
X: auto
```
```bash
node generator/bas_build.js items.txt --prefix w12_bs                          # print JSON
node generator/bas_build.js items.txt --prefix w12_bs --units                   # save each item as a bank unit
```

## 2. AI-assisted (bring your own chatbot)
`generator/prompts/bank-unit.md` writes individual bank units (the easiest way to contribute). `generator/prompts/` also holds one prompt per section: `reading.md`, `listening.md`, `writing.md` and `speaking.md`. Each prompt encodes the section blueprint and the fidelity rules, such as answer/text overlap bands, talk lengths and the distractor share.

**In the browser:** open `generator/index.html` (the test builder).
1. Copy a prompt and paste the chatbot's answer.
2. Press **Check test**.
3. Fix any findings, preview the test in the engine, and download the JSON.

**On the command line:**
```bash
node generator/assemble.js --id my-test-02 --title "Fluova Practice Test 2" --by "model name" \
     reading.json listening.json writing.json speaking.json
```
The assembler orders the sections, fills in default timings, and makes Complete the Words blanks from each `"source"` paragraph. It then runs both checks and writes `content/tests/<id>.json` only if nothing critical is found.

> The gate checks structure and fidelity. It **cannot** tell whether an answer key is right or whether a passage contains a factual error. Read and play every AI-drafted test yourself before opening a pull request, and set `"generatedBy"`.

## 3. Community
Open a pull request with the new test. CI runs the gate; a maintainer reviews the content; merging to `main` publishes it.
