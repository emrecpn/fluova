# Fidelity spec

Fluova tests aim to match the real test in structure and difficulty. They should be **equal to the real thing, not harder and not easier.** This page lists the targets. [`tools/lint_forms.js`](../tools/lint_forms.js) checks every test against them automatically.

**Primary source:** ETS, *TOEFL iBT® Test: 2026 Update — Test Blueprint and Specifications Document* (page numbers in brackets).
**Calibration source:** measurements taken from ETS's free *Practice Test 1* for the 2026 format. Only counts and statistics were recorded. No ETS questions, passages or audio are stored in this repository, and none may be added.

---

## 1. Section blueprint

| Section / task | Official spec | Linter rule |
|---|---|---|
| **Reading total** | 50 items, including unscored ones; router module + adaptive second module [p.1] | warn if < 45 |
| Complete the Words | 30 items [p.3] | **fail** if ≠ 30 |
| Read in Daily Life | 5–15 items, in sets of 2–3 [p.3, p.7] | warn outside range |
| Read an Academic Passage | 5–15 items [p.3]; passages up to ~200 words [p.8] | warn outside range |
| Passage difficulty | Flesch-Kincaid: medium 7.4–10.5, high 10.5+ [p.8] | warn if a hard-module passage is < 10.5 |
| **Listening total** | 47 items; router + lower/upper module [p.1, p.4] | — |
| Listen and Choose a Response | 15–19 [p.4] | **fail** outside range |
| Listen to a Conversation | 10 [p.4] | — |
| Listen to an Announcement | 6–10 [p.4] | warn outside range |
| Listen to an Academic Talk | 8–16 [p.4]; long monologues up to 250 words [p.11] | **fail** if an upper-module talk is < 180 words |
| Voices | Mix of US/Canadian, British and Australian accents; audio plays **once** [p.11] | — |
| **Writing** | Build a Sentence 10, Write an Email 1, Academic Discussion 1; 23 min [p.5, p.14] | **fail** if email or discussion missing; warn if > 40% of Build a Sentence items have a distractor (Practice Test 1: about 2 in 10) |
| **Speaking** | Listen and Repeat 7 + Take an Interview 4; each item scored 0–5 [p.6, p.17] | see §4 |

The paper version of Practice Test 1 has fewer items than the live test. The live test adds unscored items, which brings totals up to 50 and 47. Our tests sit between the two.

## 2. Reading: how close is the correct answer to the text?

Low-quality practice tests usually fail here. If the correct option repeats the passage word for word, the question tests matching instead of reading.

We measure the **overlap** of each correct option: the share of its content words (stop words removed) that appear verbatim in the passage.

| | Mean overlap | Paraphrase share (questions with overlap ≤ 25%) |
|---|---|---|
| ETS Practice Test 1 (20 multiple-choice questions) | 46% | 35% |
| Linter band | **30–50%** (fail > 50%, warn < 30%) | **30–50%** (fail < 30%, warn > 50%) |

The band works in **both directions**. The first draft of the pilot overshot to 19% overlap and 68% paraphrase, which made it harder than the real test, so the lower bounds exist too. Lower modules should be more direct; upper modules should rely more on inference.

The sample is 20 questions. Update the band when more official samples are published.

## 3. Task formats

### Complete the Words (a classic C-test)
- The first sentence stays intact.
- After it, every second word loses its second half: a word of *n* letters shows ⌊n/2⌋ letters and hides ⌈n/2⌉. For example, *because* shows *bec* and hides 4 letters, and *of* shows *o* and hides 1.
- Skip one-letter words, hyphenated words and words with apostrophes.
- 10 blanks per paragraph, 3 paragraphs per test (30 items).
- Most blanked words are common words. Difficulty comes from the paragraph, not from rare vocabulary.
- [`tools/ctw_generate.js`](../tools/ctw_generate.js) applies this rule to any paragraph.

### Build a Sentence
- The sentence frame is **partly filled in**. The `frame` field holds the skeleton, with `null` for each blank.
- A tile can hold a **word group**, not just a single word.
- **0–1 distractor tile** per item; most items have none.
- Grammar targets: embedded questions (*Do you know whether…*), relative clauses, reported speech, passive voice, and direct questions.
- Scoring checks the full sentence.

### Listening module shape (measured on Practice Test 1)
| | Module 1 | Module 2 |
|---|---|---|
| Listen and Choose a Response | 8 | 8 |
| Conversations (2 questions each) | 2 | 1 |
| Announcements (2 questions) | 1 | 1 |
| Academic talks (4 questions) | 1 | 1 |

Stimulus lengths: conversations 66–82 words, announcements 50–71, academic talks 177–230.
Common Listen-and-Choose distractors: one that echoes a word from the prompt with the wrong meaning, one that answers a different question type (a time given for a *where* question), and a yes/no answer to a *wh-* question.

## 4. Speaking structure [p.16]
- Every task opens with a **scenario introduction**.
- **Listen and Repeat:** the 7 sentences come from one scenario and grow in length and complexity, from about 5 words to more than 20. *Fail* if the lengths do not increase or there is no scenario.
- **Take an Interview:** 4 questions on **one topic**, moving from a factual or personal question to opinion, explanation and prediction. *Fail* if there is no scenario.

## 5. Difficulty levels
| Level | Reading (Flesch-Kincaid) | Listening |
|---|---|---|
| `easy` | < 7.4, mostly short texts | lower-module lengths |
| `medium` | 7.4–10.5 | mixed |
| `hard` | 10.5+, inference-heavy | 200–250-word talks, mixed accents |
| `real` (default) | adaptive router → lower/upper module | adaptive |

Score estimates are reported only for `real` tests.

## 6. Calibration
People who know their real scores take `real` tests. We then check whether the estimate falls within ±0.5 band. The founder's own scores (Aug 2026: Reading 4, Listening 6, Writing 5, Speaking 4.5) are the first data point.

Even ETS says its practice scores can differ slightly from real ones, so Fluova promises **measured closeness, not a guarantee**.
