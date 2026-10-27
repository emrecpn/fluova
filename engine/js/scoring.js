/* Scoring, answer checking and adaptive routing for the test engine.
   Pure functions with no page state, so the exam, the review page and the unit tests (test/scoring.test.js)
   all use exactly the same rules. */
(function () {

// percent correct → band on the 1–6 scale. Our own approximation, not an ETS conversion table;
// it is checked against real scores as they come in (docs/FIDELITY-SPEC.md, "Calibration").
const BAND_TABLE = [[.92, 6], [.85, 5.5], [.78, 5], [.70, 4.5], [.62, 4], [.52, 3.5], [.42, 3], [.32, 2.5], [.22, 2], [.12, 1.5]];
const LOWER_ROUTE_CAP = 4; // a candidate routed to the easier second module cannot reach the top bands
const SCALED_30 = { 6: 30, 5.5: 28, 5: 26, 4.5: 24, 4: 22, 3.5: 19, 3: 16, 2.5: 13, 2: 10, 1.5: 7, 1: 4 };

function pctToBand(pct, capEasy) {
  let band = 1;
  for (const [p, b] of BAND_TABLE) { if (pct >= p) { band = b; break; } }
  if (capEasy && band > LOWER_ROUTE_CAP) band = LOWER_ROUTE_CAP;
  return band;
}
const bandTo30 = b => SCALED_30[b] || 4;

// Complete the Words: case, spaces and punctuation typed by the candidate do not matter
const letters = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const ctwCorrect = (given, answer) => letters(given) !== '' && letters(given) === letters(answer);

/* Every scored item of a module, in order: CTW blanks, single-item screens, and screen questions. */
function itemIds(pool) {
  const ids = [];
  (pool || []).forEach(scr => {
    if (scr.type === 'ctw') (scr.items || []).forEach(it => ids.push(it.id));
    else if (scr.type === 'choose_response' || scr.type === 'insert_text') ids.push(scr.id);
    else if (scr.questions) scr.questions.forEach(q => ids.push(q.id));
  });
  return ids;
}

/* Finds an item anywhere in the test (adaptive modules included) → { type: 'ctw' | 'mcq', answer } or null. */
function findQuestion(form, qid) {
  for (const sec of form.sections) {
    const pools = [sec.screens];
    if (sec.adaptive) pools.push(sec.adaptive.hard, sec.adaptive.easy);
    for (const pool of pools) for (const scr of pool || []) {
      if (scr.type === 'ctw') { const it = (scr.items || []).find(x => x.id === qid); if (it) return { type: 'ctw', answer: it.answer }; }
      if ((scr.type === 'choose_response' || scr.type === 'insert_text') && scr.id === qid) return { type: 'mcq', answer: scr.answer };
      if (scr.questions) { const q = scr.questions.find(x => x.id === qid); if (q) return { type: 'mcq', answer: q.answer }; }
    }
  }
  return null;
}

function isCorrect(form, answers, qid) {
  const q = findQuestion(form, qid);
  if (!q) return false;
  return q.type === 'ctw' ? ctwCorrect(answers[qid], q.answer) : answers[qid] === q.answer;
}

/* Multistage routing: enough correct answers on the router items → upper ('hard') module, otherwise lower ('easy'). */
function route(form, sec, answers) {
  const a = sec.adaptive;
  const raw = a.routeFrom.filter(qid => isCorrect(form, answers, qid)).length;
  return raw >= a.threshold ? 'hard' : 'easy';
}

/* Reading or Listening score: router module + the module the candidate was routed to. */
function scoreSection(form, secId, answers, path) {
  const sec = form.sections.find(s => s.id === secId);
  if (!sec) return { correct: 0, total: 0, pct: 0, band: null, scaled30: null, path: null, missing: true }; // a test may leave out a section (e.g. a practice set)
  path = path || null;
  const ids = itemIds(sec.screens).concat(sec.adaptive && path ? itemIds(sec.adaptive[path]) : []);
  const correct = ids.filter(id => isCorrect(form, answers, id)).length;
  const total = ids.length || 1;
  const pct = correct / total;
  const band = pctToBand(pct, path === 'easy');
  return { correct, total, pct, band, scaled30: bandTo30(band), path };
}

/* Build a Sentence: put the chosen tiles into the frame's gaps (frame entries that are null). */
function fillFrame(scr, chunks) {
  if (!scr.frame) return chunks.join(' ');
  let k = 0;
  return scr.frame.map(t => (t === null ? (chunks[k++] || '____') : t)).join(' ').replace(/\s+([?.!,])/g, '$1');
}
const normSentence = s => String(s || '').trim().toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ');
/* The model sentence, or any listed alternative ("accept"), ignoring case, punctuation and extra spaces. */
function sentenceCorrect(scr, given) {
  const model = scr.type === 'sentence_dialogue' ? fillFrame(scr, scr.answer) : scr.answer;
  return [model].concat(scr.accept || []).map(normSentence).includes(normSentence(given));
}

// Listen and Repeat: share of the target's words that were said (0..1), counting repeated words once each
function similarity(said, target) {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const a = norm(said), b = norm(target);
  if (!b.length) return 0;
  const left = {}; b.forEach(w => left[w] = (left[w] || 0) + 1);
  let match = 0;
  a.forEach(w => { if (left[w] > 0) { match++; left[w]--; } });
  return Math.min(1, match / b.length);
}

const api = { pctToBand, bandTo30, ctwCorrect, itemIds, findQuestion, isCorrect, route, scoreSection, fillFrame, sentenceCorrect, similarity, BAND_TABLE, LOWER_ROUTE_CAP };
if (typeof window !== 'undefined') window.FluovaScore = api;
if (typeof module !== 'undefined') module.exports = api;
})();
