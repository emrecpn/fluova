#!/usr/bin/env node
/* Structural validator for content/tests/*.json (no dependencies).
   Checks what the engine needs to run a test correctly; tools/lint_forms.js then checks fidelity to the ETS spec.
   Usage: node tools/validate.js [file-or-dir ...]   → exit code 1 on any error.
   Yapısal doğrulayıcı: motorun testi doğru çalıştırması için gerekenleri kontrol eder. */
(function () {

const SCREEN_TYPES = ['ctw', 'passage', 'text_chain', 'insert_text', 'choose_response', 'listening', 'sentence_dialogue', 'writing', 'listen_repeat', 'interview'];
const VOICE = /^(neutral|female|male)(:(us|gb|au))?$/;
const isLocalized = v => typeof v === 'string' || (v && typeof v === 'object' && Object.values(v).every(x => typeof x === 'string'));

/* Core check: takes a parsed test object (and optionally the file name it must match), returns a list of error strings. */
function validateTest(t, base) {
  const errors = [], err = (where, msg) => errors.push(`${where}: ${msg}`);
  if (!t || typeof t !== 'object') return ['not a JSON object'];
  for (const k of ['id', 'title', 'version', 'license', 'sections']) if (t[k] == null) err('test', `missing "${k}"`);
  if (base && t.id && t.id !== base) err('test', `id "${t.id}" must match file name "${base}"`);
  if (t.id && !/^[a-z0-9-]+$/.test(t.id)) err('test', 'id may only contain a-z, 0-9 and -');
  if (t.version && !/^\d+\.\d+\.\d+$/.test(t.version)) err('test', 'version must look like 1.0.0');
  if (t.license && t.license !== 'CC-BY-SA-4.0') err('test', 'license must be CC-BY-SA-4.0');
  if (/toefl/i.test(t.title || '') && !/TOEFL®/.test(t.title)) err('test', 'title: write "the TOEFL® test" with ®, or avoid the mark');

  // Content is rendered as HTML: allow only a few formatting tags, never attributes, scripts or URLs
  const ALLOWED = /^(strong|em|b|i|u|br|sub|sup)$/i;
  (function scan(v, where) {
    if (typeof v === 'string') {
      const tags = v.match(/<\/?\s*([a-z0-9-]+)([^>]*)>/gi) || [];
      tags.forEach(tag => {
        const m = /<\/?\s*([a-z0-9-]+)([^>]*)>/i.exec(tag);
        if (!ALLOWED.test(m[1])) err(where, `HTML tag <${m[1]}> is not allowed (only strong, em, b, i, u, br, sub, sup)`);
        else if (m[2].replace('/', '').trim()) err(where, `HTML attributes are not allowed: ${tag}`);
      });
      if (/javascript:|data:text\/html/i.test(v)) err(where, 'script-like content is not allowed');
    } else if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => scan(x, where === 'test' ? k : `${where}.${k}`));
  })(t, 'test');

  const ids = new Map();
  const seeId = (id, where) => { if (!id) return err(where, 'missing id'); if (ids.has(id)) err(where, `duplicate id "${id}" (also in ${ids.get(id)})`); else ids.set(id, where); };
  const mcq = (q, where) => {
    seeId(q.id, where);
    if (!q.stem) err(where, 'missing stem');
    if (!Array.isArray(q.options) || q.options.length !== 4) err(where, 'options must have exactly 4 entries');
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) err(where, 'answer must be an integer 0–3');
    if (q.why != null && !isLocalized(q.why)) err(where, 'why must be a string or {lang: string}');
  };
  const audio = (a, where) => {
    if (!Array.isArray(a) || !a.length) return err(where, 'audio must be a non-empty array');
    a.forEach((l, i) => { if (!l.text) err(`${where} audio[${i}]`, 'missing text'); if (l.voice && !VOICE.test(l.voice)) err(`${where} audio[${i}]`, `voice "${l.voice}" must be neutral|female|male with optional :us|:gb|:au`); });
  };

  function screen(s, where) {
    if (!SCREEN_TYPES.includes(s.type)) return err(where, `unknown type "${s.type}"`);
    where = `${where} (${s.type}${s.id ? ' ' + s.id : s.title ? ' "' + s.title + '"' : ''})`;
    switch (s.type) {
      case 'ctw': {
        const text = [].concat(s.text || []).join(' ');
        const ph = [...text.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
        (s.items || []).forEach(it => {
          seeId(it.id, where);
          if (!ph.includes(it.id)) err(where, `item ${it.id} has no {{${it.id}}} placeholder in text`);
          if (!it.stub || !it.answer) err(where, `item ${it.id} needs stub and answer`);
        });
        ph.forEach(p => { if (!(s.items || []).some(it => it.id === p)) err(where, `placeholder {{${p}}} has no item`); });
        break;
      }
      case 'passage': if (!s.text) err(where, 'missing text'); (s.questions || []).forEach((q, i) => mcq(q, `${where} q${i + 1}`)); if (!(s.questions || []).length) err(where, 'needs questions'); break;
      case 'text_chain': if (!(s.messages || []).length) err(where, 'needs messages'); (s.questions || []).forEach((q, i) => mcq(q, `${where} q${i + 1}`)); break;
      case 'insert_text': seeId(s.id, where); if (!/\[\[\d\]\]/.test(s.paragraph || '')) err(where, 'paragraph needs [[1]]…[[4]] markers'); break;
      case 'choose_response': mcq({ ...s, stem: s.stem || '(audio)' }, where); audio(s.audio, where); break;
      case 'listening': audio(s.audio, where); (s.questions || []).forEach((q, i) => mcq(q, `${where} q${i + 1}`)); if (!(s.questions || []).length) err(where, 'needs questions'); break;
      case 'sentence_dialogue': {
        seeId(s.id, where);
        if (!s.personA) err(where, 'missing personA');
        if (!Array.isArray(s.answer) || !s.answer.length) err(where, 'answer must be a non-empty array of tiles');
        if (s.frame) { const blanks = s.frame.filter(x => x === null).length; if (blanks !== (s.answer || []).length) err(where, `frame has ${blanks} blanks but answer has ${(s.answer || []).length} tiles`); }
        if ((s.distractors || []).length > 1) err(where, 'ETS format uses at most 1 distractor tile');
        break;
      }
      case 'writing': seeId(s.id, where); if (!['email', 'discussion'].includes(s.kind)) err(where, 'kind must be email or discussion'); if (!s.prompt) err(where, 'missing prompt'); if (s.kind === 'discussion' && (!s.professor || (s.students || []).length < 2)) err(where, 'discussion needs professor + 2 students'); break;
      case 'listen_repeat': seeId(s.id, where); if (!s.scenario || !s.scenario.intro) err(where, 'needs scenario {title, intro}'); if ((s.sentences || []).length !== 7) err(where, 'needs exactly 7 sentences'); break;
      case 'interview': seeId(s.id, where); if (!s.scenario || !s.scenario.intro) err(where, 'needs scenario {title, intro}'); if ((s.questions || []).length !== 4) err(where, 'needs exactly 4 questions'); break;
    }
  }

  (t.sections || []).forEach((sec, si) => {
    const where = `section ${sec.id || si}`;
    if (!['reading', 'listening', 'writing', 'speaking'].includes(sec.id)) err(where, 'id must be reading|listening|writing|speaking');
    if (!(sec.minutes > 0)) err(where, 'minutes must be > 0');
    if (sec.intro != null && !isLocalized(sec.intro)) err(where, 'intro must be a string or {lang: string}');
    (sec.screens || []).forEach((s, i) => screen(s, `${where} screen ${i + 1}`));
    if (sec.adaptive) {
      const a = sec.adaptive;
      ['hard', 'easy'].forEach(m => (a[m] || []).forEach((s, i) => screen(s, `${where} ${m} ${i + 1}`)));
      (a.routeFrom || []).forEach(id => { if (!ids.has(id)) err(`${where} adaptive`, `routeFrom id "${id}" not found`); });
      if (!(a.threshold > 0 && a.threshold <= (a.routeFrom || []).length)) err(`${where} adaptive`, 'threshold must be between 1 and routeFrom length');
    }
  });
  return errors;
}

const api = { validateTest, SCREEN_TYPES };
if (typeof window !== 'undefined') window.FluovaValidate = api;
if (typeof module === 'undefined' || require.main !== module) { if (typeof module !== 'undefined') module.exports = api; return; }

// ---------- CLI ----------
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const inputs = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(ROOT, 'content', 'tests')];
const files = inputs.flatMap(p => fs.statSync(p).isDirectory()
  ? fs.readdirSync(p).filter(f => f.endsWith('.json') && f !== 'index.json').sort().map(f => path.join(p, f)) : [p]);
function validate(file) {
  let t;
  try { t = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return [`invalid JSON — ${e.message}`]; }
  return validateTest(t, path.basename(file, '.json'));
}
let failed = 0;
for (const f of files) {
  const errs = validate(f);
  if (errs.length) { failed++; console.error(`✗ ${path.basename(f)}\n  - ${errs.join('\n  - ')}`); }
  else console.log(`✓ ${path.basename(f)}`);
}
process.exit(failed ? 1 : 0);
})();
