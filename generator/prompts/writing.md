# Prompt: Writing section

Copy everything below the line into any capable chatbot. Then paste its answer into the test builder (`generator/index.html`) or save it as `writing.json`.

Tip: Build a Sentence items can also be written by hand in a simple text format and converted with `generator/bas_build.js`. The format is described at the top of that file.

---

You are writing ORIGINAL practice material in the format of the Writing section of the TOEFL iBT® test (January 2026 format). Match the real test's structure and difficulty: not harder and not easier.

## Hard rules
- Everything must be original. Never copy ETS or other publishers' material.
- Output **one JSON object only**: no prose and no Markdown fences.
- ids are unique, use `a-z0-9_` and the prefix `w_`.

## Structure
```
{"id":"writing","screens":[ 10 × Build a Sentence, 1 × Write an Email, 1 × Academic Discussion ]}
```

### Build a Sentence × 10
Speaker A says something, and speaker B's reply is a sentence the test taker assembles from tiles.
```
{"type":"sentence_dialogue","id":"w_bs1","personA":"How was the workshop on Saturday?",
 "frame":["The",null,null,null,null,null,"really useful."],
 "answer":["tips","that","the speaker","shared","were"],
 "distractors":[]}
```
- `frame` is B's sentence with the prefilled words as strings and each blank as `null`. The number of `null`s equals the length of `answer`, which lists the tiles in the correct order.
- 3–6 tiles per item. A tile may be a word group ("the speaker", "is going").
- Only **one correct order** must be possible. Avoid tiles that could swap places.
- **Distractors:** exactly 2 of the 10 items get **one** distractor tile, a classic error such as an extra auxiliary in an embedded question ("does"), a wrong verb form ("repairing" for "repaired") or a missing backshift ("will" for "would"). The other 8 items have `"distractors": []`.
- Grammar mix: at least 3 embedded or indirect questions (*Do you know whether…*, *Can you tell me when…*), 2 relative clauses, 1 reported speech, 1 passive, 1 direct question, and the rest free.
- Everyday campus or social situations; sentences of 7–14 words.

### Write an Email × 1
```
{"type":"writing","id":"w_email","kind":"email","minutes":7,
 "scenario":"<2–4 sentences of situation>",
 "prompt":"Write an email to <recipient>. In your email, do the following: (1) … (2) … (3) …",
 "wordTarget":"Cover all three points in full sentences. Do not forget a closing."}
```
Give a realistic everyday problem with three bullet tasks, for example describe what happened, explain why it matters, and ask for a specific action.

### Academic Discussion × 1
```
{"type":"writing","id":"w_disc","kind":"discussion","minutes":10,
 "prompt":"Your professor is teaching a class on <subject>. Write a post responding to the professor's question. Express and support your opinion, and make a contribution to the discussion in your own words.",
 "professor":{"name":"<surname>","post":"<60–90 words ending in a clear question>"},
 "students":[{"name":"<first name>","post":"<40–60 words, one view>"},{"name":"<first name>","post":"<40–60 words, the opposing view>"}],
 "wordTarget":"At least 100 words. State your opinion, support it, and add your own contribution to the discussion."}
```

Before you answer, check the number of `null`s against `answer` in every item and confirm that exactly 2 items have a distractor. Then output the JSON object.
