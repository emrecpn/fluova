// Core tests for the content pipeline. Run with: npm test  (or: node --test)
// No dependencies: node:test + node:assert only.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const ctw = require('../tools/ctw_generate.js');
const validate = require('../tools/validate.js');
const lint = require('../tools/lint_forms.js');
const bankLib = require('../tools/bank.js');
const form = require('../generator/form_assemble.js');
const bas = require('../generator/bas_build.js');
const load = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));
const bank = load('content/bank/bank.json');
const blueprint = load('content/bank/blueprint.json');
const deps = { bank: bankLib, validate, lint };

test('Complete the Words follows the C-test rule', () => {
  const r = ctw.generate('Bees share news about food in a surprising way. When a forager finds a rich patch of flowers, it returns to the hive and performs a short dance on the wall of the comb. The angle of the dance shows the direction of the food.', 'x', 10);
  assert.equal(r.screen.items.length, 10);
  assert.ok(r.screen.text[0].startsWith('Bees share news about food in a surprising way.'), 'first sentence stays intact');
  for (const it of r.screen.items) {
    const word = it.stub + it.answer, shown = Math.floor(word.length / 2);
    assert.equal(it.stub.length, shown, `${word}: shows floor(n/2) letters`);
  }
  assert.throws(() => ctw.generate('One sentence only'), /two sentences/);
});

test('validator accepts the published tests and rejects broken ones', () => {
  for (const id of ['pilot-01', 'practice-02']) assert.deepEqual(validate.validateTest(load(`content/tests/${id}.json`), id), []);
  const t = clone(load('content/tests/pilot-01.json'));
  t.sections[0].screens[2].questions[0].answer = 7;
  t.sections[0].screens[2].questions[1].id = t.sections[0].screens[2].questions[0].id;
  const errs = validate.validateTest(t, 'pilot-01').join('\n');
  assert.match(errs, /answer must be an integer 0–3/);
  assert.match(errs, /duplicate id/);
});

test('validator blocks unsafe HTML in content', () => {
  const t = clone(load('content/tests/pilot-01.json'));
  t.sections[0].screens[2].text[1] += ' <img src=x onerror=alert(1)>';
  t.sections[0].screens[2].questions[0].stem = '<strong onclick="x()">Hi</strong>';
  const errs = validate.validateTest(t, 'pilot-01').join('\n');
  assert.match(errs, /<img> is not allowed/);
  assert.match(errs, /attributes are not allowed/);
});

test('linter: published tests pass, a too-literal Reading set fails', () => {
  for (const id of ['pilot-01', 'practice-02']) {
    const high = lint.lintTest(load(`content/tests/${id}.json`), id).issues.filter(i => i.sev === 'high');
    assert.deepEqual(high, [], `${id} has critical findings`);
  }
  const t = clone(load('content/tests/pilot-01.json'));
  // make every correct Reading option a verbatim copy of its passage → overlap far above the 50% band
  const r = t.sections.find(s => s.id === 'reading');
  for (const sc of [...r.screens, ...r.adaptive.hard, ...r.adaptive.easy]) if (sc.type === 'passage')
    sc.questions.forEach(q => { q.options[q.answer] = sc.text.join(' ').replace(/<[^>]+>/g, '').split(' ').slice(0, 8).join(' '); });
  const high = lint.lintTest(t, 'x').issues.filter(i => i.sev === 'high').map(i => i.msg).join('\n');
  assert.match(high, /copy the passage too closely|Paraphrase\/inference share/);
});

test('linter flags answer cues: key is usually the longest option, or one letter dominates', () => {
  const t = clone(load('content/tests/pilot-01.json'));
  const all = t.sections.filter(s => s.id === 'reading' || s.id === 'listening')
    .flatMap(s => [...s.screens, ...s.adaptive.hard, ...s.adaptive.easy])
    .flatMap(sc => sc.type === 'choose_response' ? [sc] : (sc.questions || []).filter(q => q.options));
  for (const q of all) { q.options[q.answer] += ' — this one is clearly the longest of all the options here'; }
  assert.match(lint.lintTest(t, 'x').issues.filter(i => i.sev === 'high').map(i => i.msg).join('\n'), /single longest option/);
  for (const q of all) { const k = q.options.splice(q.answer, 1)[0]; q.options.unshift(k); q.answer = 0; }
  assert.match(lint.lintTest(t, 'x').issues.map(i => i.msg).join('\n'), /Option A is correct in 100%/);
});

test('bank: every unit passes its checks and ids are unique', () => {
  const ids = new Set();
  for (const u of bank.units) {
    const r = bankLib.checkUnit(u, { ctw, validate, lint });
    assert.deepEqual(r.errors, [], `${u.id}: ${r.errors.join('; ')}`);
    assert.ok(!ids.has(u.id), `duplicate unit ${u.id}`); ids.add(u.id);
  }
});

test('every answer explanation in the bank has English, Turkish and Spanish', () => {
  const missing = [];
  const walk = (o, where) => {
    if (Array.isArray(o)) return o.forEach((x, i) => walk(x, where));
    if (!o || typeof o !== 'object') return;
    if (o.why && typeof o.why === 'object') ['en', 'tr', 'es'].forEach(l => { if (!String(o.why[l] || '').trim()) missing.push(`${o.id || where}: ${l}`); });
    Object.values(o).forEach(v => walk(v, where));
  };
  bank.units.forEach(u => walk(u.screen, u.id));
  assert.deepEqual(missing, []);
});

test('recipes render exactly the committed tests', () => {
  for (const id of ['pilot-01', 'practice-02']) {
    const { test: rendered, missing } = bankLib.renderRecipe(load(`content/tests/recipes/${id}.json`), bank.units, blueprint);
    assert.deepEqual(missing, []);
    assert.deepEqual(rendered, load(`content/tests/${id}.json`));
  }
});

test('form assembler: deterministic, prefers unseen units, keeps 2/10 distractors, passes the gate', () => {
  const a = form.assemble(bank, blueprint, { seed: 42 }, deps), b = form.assemble(bank, blueprint, { seed: 42 }, deps);
  assert.deepEqual(a.test.units, b.test.units, 'same seed → same form');
  assert.equal(a.high, 0);
  const bs = a.test.sections.find(s => s.id === 'writing').screens.filter(s => s.type === 'sentence_dialogue');
  assert.equal(bs.length, 10);
  assert.equal(bs.filter(s => (s.distractors || []).length).length, 2);
  const pilotUnits = bank.units.filter(u => u.origin === 'pilot-01').map(u => u.id);
  const fresh = form.assemble(bank, blueprint, { seed: 7, exclude: pilotUnits }, deps);
  assert.equal(fresh.test.units.filter(u => pilotUnits.includes(u)).length, 0, 'unseen units are preferred');
});

test('practice sets contain only the requested task', () => {
  const r = form.assembleDrill(bank, blueprint, { task: 'talk', seed: 3 });
  assert.equal(r.test.level, 'practice');
  assert.equal(r.test.sections.length, 1);
  assert.ok(r.test.units.every(id => bank.units.find(u => u.id === id).task === 'talk'));
  assert.deepEqual(validate.validateTest(r.test, null), []);
});

test('Build a Sentence builder parses frames and suggests grammar distractors', () => {
  const { items, problems } = bas.build('A: Is the lab open?\nB: Do you know [when] [it] [will] [open] today?\nX: auto', 't');
  assert.deepEqual(problems.filter(p => p.sev === 'error'), []);
  assert.deepEqual(items[0].answer, ['when', 'it', 'will', 'open']);
  assert.equal(items[0].frame.filter(x => x === null).length, 4);
  assert.deepEqual(items[0].distractors, ['does']);
  assert.ok(bas.build('A: Hi\nB: [a] [a] [b] c.', 't').problems.some(p => /identical/.test(p.msg)), 'identical tiles are rejected');
});
