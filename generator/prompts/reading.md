# Prompt: Reading section

Copy everything below the line into any capable chatbot. Then paste its answer into the test builder (`generator/index.html`) or save it as `reading.json` and run `generator/assemble.js`.

---

You are writing ORIGINAL practice material in the format of the Reading section of the TOEFL iBT® test (January 2026 format). The goal is to match the real test's structure and difficulty: not harder and not easier.

## Hard rules
- Everything must be original. Never copy or closely paraphrase ETS questions or passages, or material from any other publisher.
- Output **one JSON object only**: no prose and no Markdown fences.
- Use American English. Topics must suit a general international audience, with no politics, religion, medical advice or brand names.
- Every multiple-choice question has exactly 4 options and `"answer"` is the 0-based index of the correct one. Options must be similar in length; the longest option must not be more than 1.8× the shortest.
- Every question has a `"why"`: one or two sentences giving the question type, why the answer is right, and the trap in at least one wrong option, referred to by letter (A–D in the order you wrote them).
- ids must be unique and use only `a-z0-9_`. Use the prefix `r_`.

## How close answers may be to the text (this is checked automatically)
For each question, take the correct option's content words (ignore *the, of, to, is, …*) and count how many appear **verbatim** in the passage. This is its overlap.
- Across all questions, mean overlap must be **30–50%**.
- **30–50%** of questions must have overlap ≤ 25%. These are paraphrase or inference questions whose answer says the idea in new words.
- Detail questions may stay close to the text. Main-idea, inference, purpose and vocabulary questions must paraphrase.
- Wrong options should be tempting: reuse words from the text with the wrong meaning, give a true detail that does not answer the question, or overstate the claim.

## Structure (follow exactly)
```
{
  "id": "reading",
  "screens": [ ROUTER MODULE ],
  "adaptive": { "routeFrom": [ids of ALL multiple-choice questions in the router], "threshold": T, "hard": [ UPPER ], "easy": [ LOWER ] }
}
```
`T` = about 70% of the number of routeFrom questions (e.g. 7 of 10).

**Router module**, in this order:
1. Complete the Words × 2: `{"type":"ctw","title":"<topic>","source":"<paragraph>"}`. Each paragraph should be 70–100 words in 4–6 sentences, academic but general (e.g. a biology or history fact), Flesch-Kincaid grade 8–11. **Do not make blanks.** Software makes them.
2. Read in Daily Life × 2: `{"type":"passage","title":"…","directions":"Read in Daily Life (notice|email|sign|schedule|policy notice)","text":["<strong>heading</strong>","paragraph", …],"questions":[…]}`. One text of 50–70 words with 2 questions and one of 80–100 words with 3 questions. Use everyday campus or community texts.
3. Read an Academic Passage × 1: `{"type":"passage","title":"…","directions":"Read an Academic Passage — module 1","text":["paragraph 1","paragraph 2", …],"questions":[5 questions]}`. 140–170 words, Flesch-Kincaid 9–12. Questions: main idea, vocabulary in context ("The word X in the passage is closest in meaning to"), author's purpose, inference, detail.

**Upper module (`hard`)**: Complete the Words × 1 (harder topic, FK 11–14) + Read in Daily Life × 1 (90–110 words, 3 questions) + Read an Academic Passage × 1 (directions "Read an Academic Passage — upper module", 140–200 words, **Flesch-Kincaid ≥ 10.5**, 5 questions, mostly inference).

**Lower module (`easy`)**: Complete the Words × 1 (easy topic, FK 6–8) + Read in Daily Life × 1 (30–50 words, 2 questions) + Read an Academic Passage × 1 (directions "Read an Academic Passage — lower module", 90–110 words, FK 7–9, 5 more direct questions).

Question object:
```
{"id":"r_ac1_q1","stem":"…","options":["…","…","…","…"],"answer":2,"why":"Inference: … B uses the word '…' from the passage but …"}
```

Before you answer, check every rule above. Then output the JSON object.
