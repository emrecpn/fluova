// Scoring, answer checking and adaptive routing (engine/js/scoring.js). Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const S = require('../engine/js/scoring.js');
const form = require('../generator/form_assemble.js');
const ROOT = path.join(__dirname, '..');
const load = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const FIXED = load('content/tests/index.json').tests.map(t => load(`content/tests/${t.id}.json`));
const bank = load('content/bank/bank.json'), blueprint = load('content/bank/blueprint.json');
const deps = { bank: require('../tools/bank.js'), validate: require('../tools/validate.js'), lint: require('../tools/lint_forms.js') };

// answer sheet with the key for every item in the given modules (CTW answers typed as the candidate would)
function keySheet(pools) {
  const sheet = {};
  for (const pool of pools) for (const scr of pool || []) {
    if (scr.type === 'ctw') scr.items.forEach(it => { sheet[it.id] = it.answer; });
    else if (scr.type === 'choose_response' || scr.type === 'insert_text') sheet[scr.id] = scr.answer;
    else (scr.questions || []).forEach(q => { if ('answer' in q) sheet[q.id] = q.answer; });
  }
  return sheet;
}
const adaptiveSections = t => t.sections.filter(s => s.adaptive);

test('bands: table boundaries, the lower-route cap and the /30 scale', () => {
  assert.equal(S.pctToBand(1), 6);
  assert.equal(S.pctToBand(0.92), 6);
  assert.equal(S.pctToBand(0.919), 5.5);
  assert.equal(S.pctToBand(0.5), 3);
  assert.equal(S.pctToBand(0), 1);
  assert.equal(S.pctToBand(1, true), S.LOWER_ROUTE_CAP, 'the lower module cannot reach the top bands');
  assert.equal(S.pctToBand(0.5, true), 3, 'the cap only lowers, never raises');
  const bands = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].map(S.bandTo30);
  assert.ok(bands.every((v, i) => i === 0 || v > bands[i - 1]), 'scaled score rises with the band');
  assert.equal(S.bandTo30(6), 30);
});

test('Complete the Words: case, spaces and punctuation do not matter; wrong or blank is wrong', () => {
  assert.ok(S.ctwCorrect('ese', 'ese'));
  assert.ok(S.ctwCorrect(' E s e. ', 'ese'));
  assert.ok(!S.ctwCorrect('eze', 'ese'));
  assert.ok(!S.ctwCorrect('es', 'ese'));
  assert.ok(!S.ctwCorrect('', 'ese'));
  assert.ok(!S.ctwCorrect(undefined, 'ese'));
});

test('routing: the threshold sends a candidate to the upper module, one answer fewer to the lower', () => {
  for (const t of FIXED) for (const sec of adaptiveSections(t)) {
    const a = sec.adaptive, sheet = keySheet([sec.screens]);
    const only = n => { const s = {}; a.routeFrom.slice(0, n).forEach(id => { s[id] = sheet[id]; }); return s; };
    assert.equal(S.route(t, sec, sheet), 'hard', `${t.id} ${sec.id}: all correct`);
    assert.equal(S.route(t, sec, {}), 'easy', `${t.id} ${sec.id}: nothing answered`);
    assert.equal(S.route(t, sec, only(a.threshold)), 'hard', `${t.id} ${sec.id}: exactly the threshold`);
    assert.equal(S.route(t, sec, only(a.threshold - 1)), 'easy', `${t.id} ${sec.id}: one below the threshold`);
  }
});

test('section scores on the fixed tests: perfect, empty and perfect-on-the-lower-route', () => {
  for (const t of FIXED) for (const sec of adaptiveSections(t)) {
    const upper = S.scoreSection(t, sec.id, keySheet([sec.screens, sec.adaptive.hard]), 'hard');
    assert.equal(upper.band, 6, `${t.id} ${sec.id}`);
    assert.equal(upper.correct, upper.total);
    assert.equal(upper.total, S.itemIds(sec.screens).length + S.itemIds(sec.adaptive.hard).length, 'router + routed module only');
    const lower = S.scoreSection(t, sec.id, keySheet([sec.screens, sec.adaptive.easy]), 'easy');
    assert.equal(lower.band, S.LOWER_ROUTE_CAP, `${t.id} ${sec.id}: capped on the lower route`);
    const empty = S.scoreSection(t, sec.id, {}, 'easy');
    assert.equal(empty.correct, 0);
    assert.equal(empty.band, 1);
  }
  assert.equal(S.scoreSection(FIXED[0], 'nope', {}, null).missing, true);
});

test('every assembled form can be scored: a perfect candidate is routed up and gets band 6', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const t = form.assemble(bank, blueprint, { seed }, deps).test;
    for (const sec of adaptiveSections(t)) {
      const sheet = keySheet([sec.screens, sec.adaptive.hard]);
      assert.equal(S.route(t, sec, sheet), 'hard', `seed ${seed} ${sec.id}`);
      assert.equal(S.scoreSection(t, sec.id, sheet, 'hard').band, 6, `seed ${seed} ${sec.id}`);
    }
  }
});

test('Build a Sentence: the model sentence or a listed alternative, ignoring case and punctuation', () => {
  const scr = { type: 'sentence_dialogue', frame: ['Not', 'yet,', null, null, 'by', 'Wednesday.'], answer: ['but I will', 'have it finished'],
    accept: ['Not yet, but I will finish it by Wednesday.'] };
  assert.equal(S.fillFrame(scr, scr.answer), 'Not yet, but I will have it finished by Wednesday.');
  assert.ok(S.sentenceCorrect(scr, 'not yet but i will have it finished by wednesday'));
  assert.ok(S.sentenceCorrect(scr, 'Not  yet, but I will finish it by Wednesday!'));
  assert.ok(!S.sentenceCorrect(scr, 'Not yet, but I have it finished will by Wednesday.'));
  assert.ok(S.sentenceCorrect({ type: 'build_sentence', answer: 'Where is the lab?' }, 'where is the lab'));
});

test('Listen and Repeat similarity counts each target word once', () => {
  assert.equal(S.similarity('the museum opens at ten', 'The museum opens at ten.'), 1);
  assert.equal(S.similarity('the the the', 'the museum'), 0.5);
  assert.equal(S.similarity('', 'the museum'), 0);
  assert.equal(S.similarity('anything', ''), 0);
});
