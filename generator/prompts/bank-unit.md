# Prompt: question-bank units

Use this to add questions to the bank without writing a whole test. Replace the three values in **CAPITALS** in the prompt, paste the prompt into any chatbot, save each object it returns as `content/bank/units/<section>/<task>/<id>.json`, and run `node tools/bank.js`.

Tasks and sections: `ctw`, `daily_life` and `academic` go in `reading/`. `choose_response`, `conversation`, `announcement` and `talk` go in `listening/`. `build_sentence`, `email` and `discussion` go in `writing/`. `listen_repeat` and `interview` go in `speaking/`. Tiers are `easy`, `medium` and `hard`.

---

You are writing ORIGINAL practice material in the format of the TOEFL iBT® test (January 2026 format) for an open-source question bank. Match the real test's difficulty for the given tier: not harder and not easier.

Write **NUMBER** units of task **TASK** at tier **TIER**. Output a JSON array only, with no prose and no Markdown fences. Each element looks like this:

```
{"id":"<task prefix>_<short_topic>","task":"TASK","tier":"TIER","topic":"<2–3 word topic>","screen":{ … engine screen … }}
```

## Rules
- Everything must be original. Never copy ETS questions or passages, or material from any other publisher. Use general international topics with no politics, religion, medical advice or brand names.
- ids use `a-z0-9_` only. Question ids are `<unit id>_q1`, `<unit id>_q2`, and so on.
- Multiple-choice questions have exactly 4 options of similar length, `"answer"` is the 0-based index, and the correct option is not always in the same position. Each has `"why": {"en": "…", "tr": "…", "es": "…"}` (English is required; Turkish and Spanish can be left for a maintainer): the question type, why the answer is right, and the trap in a wrong option (by letter A–D).
- In Reading, about half the correct options should paraphrase the text (few words copied) and the rest may stay close to it.

## Screen formats and lengths
- `ctw`: `{"type":"ctw","title":"Complete the Words: <topic>","source":"<one paragraph, 60–110 words, 4–6 sentences>"}`. Do NOT make blanks; software makes them. Easy uses simple vocabulary; hard is dense and academic.
- `daily_life`: `{"type":"passage","title":"…","directions":"Read in Daily Life (notice|email|sign|schedule|policy notice)","text":["<strong>heading</strong>","…"],"questions":[…]}`. Easy is 25–60 words with 2 questions, medium is 50–100 words with 2–3 questions, and hard is 80–120 words with 3 questions.
- `academic`: same shape, with directions `"Read an Academic Passage — module 1"` (medium), `"— upper module"` (hard) or `"— lower module"` (easy). Easy is 85–120 words, medium 130–180 and hard 140–210 (dense, Flesch-Kincaid ≥ 10.5). Always 5 questions: main idea, vocabulary in context, author's purpose, inference and detail.
- `choose_response`: `{"type":"choose_response","id":"<unit id>","audio":[{"text":"<one line>","voice":"female:us"}],"options":[…],"answer":0,"why":{…}}`. The line is 3–8 words for easy, 6–13 for medium and 6–14 for hard, where hard uses indirect replies and idioms. Traps: a repeated word with a different meaning, a reply to a different question type, or a yes/no reply to a *wh-* question.
- `conversation` / `announcement` / `talk`: `{"type":"listening","title":"Conversation: …" | "Announcement: …" | "Academic Talk: …","prompt":"Listen to …","audio":[{"text":"…","voice":"male:gb"}, …],"questions":[…]}`. A conversation is 50–95 words with 2 questions. An announcement is 35–75 words with 2 questions. A talk has 4 questions and is 100–150 words (easy), 190–240 (medium) or 180–250 (hard). Voices can be `female|male` with `:us|:gb|:au`.
- `build_sentence`: `{"type":"sentence_dialogue","id":"<unit id>","personA":"…","frame":["prefilled words",null,null,null,"more words?"],"answer":["tile","tile","tile"],"distractors":[]}`. The number of `null`s equals the number of answer tiles (3–6), and only one order may be correct. At most 1 in 5 items should get a single distractor tile.
- `email` / `discussion` / `listen_repeat` / `interview`: see `generator/prompts/writing.md` and `speaking.md` for the exact format.

Before answering, count the words in every passage or script and check the question counts for the tier. Then output the JSON array.
