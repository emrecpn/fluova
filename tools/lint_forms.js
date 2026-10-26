#!/usr/bin/env node
/* Quality gate: measures tests against the ETS 2026 test specification (docs/FIDELITY-SPEC.md).
   Usage:  node tools/lint_forms.js [file-or-dir ...] [--report out.md]
   Default: content/tests/*.json (index.json skipped). Exit code 1 if any test has a critical (high) finding,
   so CI rejects it. Kalite kapısı: testleri ETS 2026 şartnamesine karşı ölçer; kritik bulguda çıkış kodu 1. */
(function () {

// --- ETS 2026 test specification (see docs/FIDELITY-SPEC.md) ---
const SPEC = {
  ctw: [30, 30], dailyLife: [5, 15], academic: [5, 15], readingTotal: 50,
  chooseResp: [15, 19], conversation: [10, 10], announcement: [6, 10], talk: [8, 16], listeningTotal: 47,
  talkWordsLower: [100, 180], talkWordsUpper: [180, 250], passageMaxWords: 200,
  bas: 10, lr: 7, interview: 4,
  basDistractorShareMax: 0.4,   // ETS Practice Test 1: ~2 of 10 Build a Sentence items have one extra tile
  // Calibration: ETS Practice Test 1 (2026 format, 20 Reading MCQs) → mean overlap 46%, 7/20 questions ≤ 25%
  overlapMax: 0.50, overlapMin: 0.30,   // mean share of the correct option's content words found verbatim in the passage (ETS 46%)
  lowOverlap: 0.25, lowShareMin: 0.30, lowShareMax: 0.50,  // paraphrase/inference share (ETS 35%) — equal to the real test, not harder
  optionLenRatioMax: 1.8,    // longest / shortest option (characters)
  fkMedium: [7.4, 10.5], fkHigh: 10.5,
};

const STOP = new Set('the a an and or but of to in on at for with from by is are was were be been being it its this that these those as not no they them their there he she his her we our you your i my me can could should would will may might must do does did has have had than then so such into about over more most very also only which who whom what when where why how all any each other some'.split(' '));
const words = s => String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
const content = s => words(s).filter(w => w.length > 2 && !STOP.has(w));
const text = t => Array.isArray(t) ? t.join(' ') : String(t || '');
const wc = t => words(text(t)).length;

function syllables(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, ''); if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g); return m ? m.length : 1;
}
function fkGrade(t) {
  const s = text(t).replace(/<[^>]+>/g, ' ');
  const sents = Math.max(1, (s.match(/[.!?]+(\s|$)/g) || []).length);
  const ws = words(s); if (!ws.length) return null;
  const syl = ws.reduce((a, w) => a + syllables(w), 0);
  return +(0.39 * ws.length / sents + 11.8 * syl / ws.length - 15.59).toFixed(1);
}

/* Core check: takes a parsed test object, returns { m: metrics, issues: [{sev, sec, msg}] }. Runs in Node and the browser. */
function lintTest(f, key) {
  const R = f.sections.find(s => s.id === 'reading'), L = f.sections.find(s => s.id === 'listening');
  const W = f.sections.find(s => s.id === 'writing'), S = f.sections.find(s => s.id === 'speaking');
  const issues = [], m = { form: f.id ?? key };
  let SEC = 'reading';
  const flag = (sev, msg) => issues.push({ sev, sec: SEC, msg });
  const inRange = (v, [a, b]) => v >= a && v <= b;

  // ---------- READING ----------
  let ctw = 0, dl = 0, ac = 0, overlaps = [], fks = [], optRatios = [], passWords = [];
  const rScreens = R ? [...(R.screens || [])] : [];
  const rHard = R && R.adaptive ? R.adaptive.hard : [];
  const rEasy = R && R.adaptive ? R.adaptive.easy : [];
  const checkMcq = (q, passageText) => {
    const opts = q.options || []; const ans = opts[q.answer];
    if (passageText && ans != null) {
      const P = new Set(content(passageText)); const c = content(ans);
      if (c.length) overlaps.push({ id: q.id, v: c.filter(w => P.has(w)).length / c.length });
    }
    const lens = opts.map(o => String(o).length).filter(Boolean);
    if (lens.length > 1) optRatios.push({ id: q.id, v: Math.max(...lens) / Math.min(...lens) });
    if (!q.why) flag('info', `${q.id}: no "why" explanation`);
  };
  // Modules mix task types (CTW + Daily Life + Academic), so every screen type is handled here.
  // mod: 'router' | 'hard' | 'easy' — totals count the router + upper (hard) module.
  let hardQ = 0;
  const handle = (sc, mod) => {
    const count = mod !== 'easy';
    const tag = mod === 'router' ? '' : ` (${mod})`;
    if (sc.type === 'ctw') { if (count) ctw += (sc.items || []).length; return; }
    if (sc.type === 'text_chain') { if (count) dl += sc.questions.length; sc.questions.forEach(q => checkMcq(q, (sc.messages || []).map(x => x.text).join(' '))); return; }
    if (sc.type === 'insert_text') { if (count) ac += 1; return; }
    if (sc.type !== 'passage') return;
    const isAc = /academic|passage \(stage|advanced|standard/i.test((sc.directions || '') + ' ' + (sc.title || '')) && !/daily life/i.test(sc.directions || '');
    if (isAc) {
      if (count) { if (mod === 'hard') hardQ += sc.questions.length; else ac += sc.questions.length; }
      fks.push({ t: sc.title + tag, v: fkGrade(sc.text) }); passWords.push({ t: sc.title, v: wc(sc.text) });
    } else if (count) dl += sc.questions.length;
    sc.questions.forEach(q => checkMcq(q, text(sc.text)));
  };
  rScreens.forEach(sc => handle(sc, 'router'));
  rHard.forEach(sc => handle(sc, 'hard'));
  rEasy.forEach(sc => handle(sc, 'easy'));
  Object.assign(m, { ctw, dailyLife: dl, academic: ac + hardQ, readingTotal: ctw + dl + ac + hardQ });
  if (!inRange(ctw, SPEC.ctw)) flag('high', `Complete the Words: ${ctw} items (spec: 30)`);
  if (!inRange(dl, SPEC.dailyLife)) flag('med', `Read in Daily Life: ${dl} items (spec: 5–15)`);
  if (m.readingTotal < SPEC.readingTotal - 5) flag('med', `Reading total ${m.readingTotal} (spec: 50)`);
  passWords.filter(p => p.v > SPEC.passageMaxWords + 20).forEach(p => flag('low', `Passage "${p.t}" has ${p.v} words (spec: up to ~200)`));
  const avgOv = overlaps.length ? overlaps.reduce((a, o) => a + o.v, 0) / overlaps.length : null;
  m.overlapAvg = avgOv == null ? '—' : Math.round(avgOv * 100) + '%';
  const lowShare = overlaps.length ? overlaps.filter(o => o.v <= SPEC.lowOverlap).length / overlaps.length : 0;
  m.overlapOver = Math.round(lowShare * 100) + '%';
  if (avgOv != null && avgOv > SPEC.overlapMax) flag('high', `Correct options copy the passage too closely: mean overlap ${m.overlapAvg} (ETS sample 46%, max 50%) — tests matching, not reading`);
  if (overlaps.length && lowShare < SPEC.lowShareMin) flag('high', `Paraphrase/inference share ${Math.round(lowShare*100)}% (questions with overlap ≤25%; ETS sample 35%, min 30%)`);
  if (avgOv != null && avgOv < SPEC.overlapMin) flag('med', `Mean overlap ${m.overlapAvg} is very low (ETS 46%) — real detail questions stay close to the text; this test may be harder than the real one`);
  if (overlaps.length && lowShare > SPEC.lowShareMax) flag('med', `Paraphrase share ${Math.round(lowShare*100)}% is very high (ETS 35%, band 30–50%) — may be harder than the real test`);
  const hardFk = fks.filter(x => /\(hard\)/.test(x.t)).map(x => x.v);
  m.fkHard = hardFk.length ? hardFk.join(',') : '—';
  hardFk.forEach(v => { if (v != null && v < SPEC.fkHigh) flag('med', `Upper-module passage Flesch-Kincaid ${v} (spec high band: ≥10.5)`); });
  const badRatio = optRatios.filter(o => o.v > SPEC.optionLenRatioMax);
  m.optImbalance = badRatio.length + '/' + optRatios.length;
  if (optRatios.length && badRatio.length / optRatios.length > 0.2) flag('low', `Unbalanced option lengths: ${m.optImbalance} questions have longest/shortest > ${SPEC.optionLenRatioMax}`);

  // ---------- LISTENING ----------
  SEC = 'listening';
  let cr = 0, cv = 0, an = 0, tk = 0, talkLens = [];
  const lAll = L ? [...(L.screens || [])] : [];
  const lHard = L && L.adaptive ? L.adaptive.hard : [], lEasy = L && L.adaptive ? L.adaptive.easy : [];
  const talkWords = sc => (sc.audio || []).map(a => a.text).join(' ');
  // Modules mix task types (choose-response, conversation, announcement, talk). Totals = router + upper module.
  // Conversations/announcements are recognised by their title ("Conversation", "Announcement").
  const handleL = (sc, mod) => {
    const count = mod !== 'lower', title = sc.title || '';
    if (sc.type === 'choose_response') { if (count) cr++; checkMcq(sc, null); return; }
    const n = (sc.questions || []).length;
    if (/conversation/i.test(title)) { if (count) cv += n; return; }
    if (/announcement/i.test(title)) { if (count) an += n; return; }
    if (sc.questions) { if (count) tk += n; talkLens.push({ t: title, v: wc(talkWords(sc)), mod }); }
  };
  lAll.forEach(sc => handleL(sc, 'router'));
  lHard.forEach(sc => handleL(sc, 'upper'));
  lEasy.forEach(sc => handleL(sc, 'lower'));
  Object.assign(m, { chooseResp: cr, conversation: cv, announcement: an, talk: tk, listeningTotal: cr + cv + an + tk });
  m.talkMax = talkLens.length ? Math.max(...talkLens.map(t => t.v)) : 0;
  if (!inRange(cr, SPEC.chooseResp)) flag('high', `Listen and Choose a Response: ${cr} items (spec: 15–19)`);
  if (!inRange(an, SPEC.announcement)) flag('med', `Announcement questions: ${an} (spec: 6–10)`);
  if (!inRange(tk, SPEC.talk)) flag('med', `Academic Talk questions: ${tk} (spec: 8–16)`);
  talkLens.filter(t => t.mod === 'upper' && t.v < SPEC.talkWordsUpper[0]).forEach(t => flag('high', `Upper-module talk "${t.t}" has ${t.v} words (spec long monologue: 180–250)`));

  // ---------- WRITING ----------
  SEC = 'writing';
  const ws = W ? W.screens || [] : [];
  m.bas = ws.filter(s => s.type === 'sentence_dialogue' || s.type === 'build_sentence').length;
  if (m.bas !== SPEC.bas) flag('med', `Build a Sentence: ${m.bas} items (spec: 10)`);
  const basItems = ws.filter(s => s.type === 'sentence_dialogue' || s.type === 'build_sentence');
  const withDistractor = basItems.filter(s => (s.distractors || []).length > 0).length;
  m.basDistr = basItems.length ? `${withDistractor}/${basItems.length}` : '—';
  if (basItems.length && withDistractor / basItems.length > SPEC.basDistractorShareMax)
    flag('med', `Build a Sentence: ${withDistractor}/${basItems.length} items have a distractor tile (ETS sample ~2/10) — harder than the real test`);
  if (!ws.some(s => s.kind === 'email')) flag('high', 'Write an Email task missing');
  if (!ws.some(s => s.kind === 'discussion')) flag('high', 'Academic Discussion task missing');

  // ---------- SPEAKING ----------
  SEC = 'speaking';
  const ss = S ? S.screens || [] : [];
  const lr = ss.find(s => s.type === 'listen_repeat'), iv = ss.find(s => s.type === 'interview');
  const lrLens = lr ? lr.sentences.map(x => wc(typeof x === 'string' ? x : x.text)) : [];
  m.lrLens = lrLens.join(',');
  if (lrLens.length !== SPEC.lr) flag('med', `Listen and Repeat: ${lrLens.length} sentences (spec: 7)`);
  const monotonic = lrLens.every((v, i) => i === 0 || v >= lrLens[i - 1]);
  if (lrLens.length && (!monotonic || lrLens[0] > 7 || lrLens[lrLens.length - 1] < 18))
    flag('high', `Listen and Repeat lengths do not build up (${m.lrLens} words); spec: short and simple → long and complex (≈5 → 20+)`);
  if (lr && !lr.scenario) flag('high', 'Listen and Repeat has no scenario (spec: every task opens with a scenario)');
  if (iv && !iv.scenario) flag('high', 'Interview has no scenario/topic (spec: one topic, factual → opinion)');
  if (iv && iv.questions.length !== SPEC.interview) flag('med', `Interview: ${iv.questions.length} questions (spec: 4)`);

  return { m, issues };
}

const api = { lintTest, SPEC };
if (typeof window !== 'undefined') window.FluovaLint = api;
if (typeof module === 'undefined' || require.main !== module) { if (typeof module !== 'undefined') module.exports = api; return; }

// ---------- CLI ----------
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const ri = args.indexOf('--report'); const REPORT = ri >= 0 ? args.splice(ri, 2)[1] : null;
const ROOT = path.join(__dirname, '..');
const inputs = args.length ? args : [path.join(ROOT, 'content', 'tests')];
function lintForm(file) {
  const src = fs.readFileSync(file, 'utf8');
  let f, key = path.basename(file);
  if (file.endsWith('.json')) f = JSON.parse(src);
  else { global.window = {}; new Function('window', src + '\n;')(global.window); key = Object.keys(global.window).find(k => /^FORM\d+$/.test(k)); f = global.window[key]; }
  return lintTest(f, key);
}
const files = inputs.flatMap(p => fs.statSync(p).isDirectory()
  ? fs.readdirSync(p).filter(f => /\.(json|js)$/.test(f) && f !== 'index.json').sort().map(f => path.join(p, f))
  : [p]);
const rows = files.map(f => ({ f: path.basename(f), ...lintForm(f) }));

const cols = ['form', 'ctw', 'readingTotal', 'overlapAvg', 'overlapOver', 'fkHard', 'chooseResp', 'announcement', 'talk', 'talkMax', 'listeningTotal', 'bas', 'basDistr', 'lrLens'];
const hdr = { form: 'Test', ctw: 'CTW (30)', readingTotal: 'R total (50)', overlapAvg: 'Overlap mean (30–50%; ETS 46%)', overlapOver: 'Paraphrase share (30–50%; ETS 35%)', fkHard: 'FK hard (≥10.5)', chooseResp: 'L&C (15–19)', announcement: 'Ann (6–10)', talk: 'Talk Q (8–16)', talkMax: 'Longest talk (≤250)', listeningTotal: 'L total (47)', bas: 'BaS (10)', basDistr: 'BaS w/ distractor (~2/10)', lrLens: 'L&R words' };
let md = `# Quality gate report — ${new Date().toISOString().slice(0, 10)}\n\nReference: ETS 2026 Test Blueprint & Specifications · rules: docs/FIDELITY-SPEC.md\n\n`;
md += '| ' + cols.map(c => hdr[c]).join(' | ') + ' |\n|' + cols.map(() => '---').join('|') + '|\n';
rows.forEach(r => { md += '| ' + cols.map(c => r.m[c]).join(' | ') + ' |\n'; });
const sevOrder = { high: 0, med: 1, low: 2, info: 3 };
md += '\n## Findings per test\n';
rows.forEach(r => {
  const iss = r.issues.filter(i => i.sev !== 'info').sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev]);
  const high = iss.filter(i => i.sev === 'high').length;
  md += `\n### ${r.f} — ${high ? '❌ ' + high + ' critical' : '✅ no critical'}, ${iss.length} total\n` + iss.map(i => `- [${i.sev}] ${i.msg}`).join('\n') + '\n';
});
if (REPORT) fs.writeFileSync(REPORT, md);
console.log(md);
const failed = rows.filter(r => r.issues.some(i => i.sev === 'high'));
if (failed.length) { console.error(`\n✗ ${failed.length} test(s) with critical findings: ${failed.map(r => r.f).join(', ')}`); process.exit(1); }
console.log('\n✓ All tests pass the quality gate.');

})();
