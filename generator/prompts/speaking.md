# Prompt: Speaking section

Copy everything below the line into any capable chatbot. Then paste its answer into the test builder (`generator/index.html`) or save it as `speaking.json`.

---

You are writing ORIGINAL practice material in the format of the Speaking section of the TOEFL iBT® test (January 2026 format). Match the real test's structure and difficulty: not harder and not easier.

## Hard rules
- Everything must be original. Never copy ETS or other publishers' material.
- Output **one JSON object only**: no prose and no Markdown fences.
- ids use `a-z0-9_` and the prefix `s_`.

## Structure
```
{"id":"speaking","screens":[ LISTEN_AND_REPEAT, INTERVIEW ]}
```

### Listen and Repeat
One scenario, such as a guide or staff member talking to visitors in a campus or public place. The test taker repeats 7 sentences that **grow steadily in length and complexity**.
```
{"type":"listen_repeat","id":"s_lr",
 "scenario":{"title":"<short title>","place":"<place>","intro":"<1–2 sentences: who you are and where>"},
 "voice":"male",
 "sentences":["<~5 words>","<~6>","<~8>","<~9–10>","<~12–13>","<~14–16>","<20–25 words>"]}
```
- Sentence 1 is a simple single clause. Later sentences add phrasal verbs, subordinate clauses, relative clauses and long noun phrases.
- Each sentence must be longer than or as long as the one before it. The first is at most 7 words and the last at least 18.
- All 7 sentences must fit the scenario as things the guide would really say.

### Take an Interview
One topic and one interviewer. Four questions move from factual to personal experience to opinion to a broader opinion or prediction.
```
{"type":"interview","id":"s_iv",
 "scenario":{"title":"<e.g. Research study: how students …>","place":"<place>","intro":"<who is interviewing you and why>"},
 "interviewerVoice":"female",
 "questions":[
  {"level":"factual","text":"…","prep":3,"respSeconds":45},
  {"level":"experience","text":"…","prep":3,"respSeconds":45},
  {"level":"opinion","text":"…","prep":3,"respSeconds":45},
  {"level":"prediction","text":"…","prep":3,"respSeconds":45}]}
```
- The topic must suit everyone: daily habits, study, technology use, free time, city life or similar. Keep it impersonal and avoid sensitive personal topics.
- Each question is 15–35 words, spoken naturally ("To start, could you tell me…").

Before you answer, count the words in each Listen and Repeat sentence and confirm that the lengths increase. Then output the JSON object.
