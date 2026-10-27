#!/usr/bin/env node
/* Question bank — the single source of truth for test content.

   content/bank/units/<section>/<task>/<id>.json   one unit = one screen (a passage with its questions, a talk,
                                                   one Build a Sentence item, a speaking task, …)
   content/bank/blueprint.json                     section settings + the slot recipe used by the form assembler
   content/tests/recipes/<id>.json                 fixed tests = lists of unit ids → rendered to content/tests/<id>.json

   Usage:
     node tools/bank.js            check every unit, write content/bank/bank.json and render all recipes
     node tools/bank.js --check    check only (CI)
   Exit code 1 on any unit error or if a rendered recipe fails the quality gate. */
(function () {
  const TASKS = {
    ctw:            { section: 'reading',   type: 'ctw' },
    daily_life:     { section: 'reading',   type: 'passage' },
    academic:       { section: 'reading',   type: 'passage' },
    choose_response:{ section: 'listening', type: 'choose_response' },
    conversation:   { section: 'listening', type: 'listening' },
    announcement:   { section: 'listening', type: 'listening' },
    talk:           { section: 'listening', type: 'listening' },
    build_sentence: { section: 'writing',   type: 'sentence_dialogue' },
    email:          { section: 'writing',   type: 'writing' },
    discussion:     { section: 'writing',   type: 'writing' },
    listen_repeat:  { section: 'speaking',  type: 'listen_repeat' },
    interview:      { section: 'speaking',  type: 'interview' },
  };
  const TIERS = ['easy', 'medium', 'hard'];
  // Word ranges per tier, calibrated on the pilot and docs/FIDELITY-SPEC.md. [min, max]; outside → warning.
  const WORDS = {
    ctw:          { easy: [60, 110], medium: [60, 110], hard: [60, 110] },
    daily_life:   { easy: [25, 60], medium: [50, 100], hard: [80, 120] },
    academic:     { easy: [85, 120], medium: [130, 180], hard: [140, 210] },
    choose_response: { easy: [3, 8], medium: [6, 13], hard: [6, 14] },
    conversation: { easy: [50, 75], medium: [60, 95], hard: [60, 95] },
    announcement: { easy: [35, 55], medium: [50, 75], hard: [50, 75] },
    talk:         { easy: [100, 150], medium: [190, 240], hard: [180, 250] },
  };
  const QUESTIONS = { daily_life: { easy: [2, 2], medium: [2, 3], hard: [3, 3] }, academic: [5, 5], conversation: [2, 2], announcement: [2, 2], talk: [4, 4] };
  const TITLE = { conversation: /^Conversation: /, announcement: /^Announcement: /, talk: /^Academic Talk: / };

  const words = s => String(s || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const plain = sc => {
    if (sc.type === 'ctw') return [].concat(sc.text || []).join(' ').replace(/\{\{(\w+)\}\}/g, (m, id) => { const it = (sc.items || []).find(i => i.id === id); return it ? it.stub + it.answer : ''; });
    if (sc.text) return [].concat(sc.text).join(' ').replace(/<[^>]+>/g, ' ');
    if (sc.audio) return sc.audio.map(a => a.text).join(' ');
    return '';
  };
  const mcqIds = sc => sc.type === 'choose_response' ? [sc.id] : (sc.questions || []).filter(q => q.options).map(q => q.id);

  /* Expand a Complete the Words "source" paragraph into blanks (ids derived from the unit id, so they are stable). */
  function expand(unit, deps) {
    const sc = unit.screen;
    if (sc && sc.type === 'ctw' && sc.source && !(sc.items && sc.items.length)) {
      const r = deps.ctw.generate(sc.source, unit.id + '_', 10);
      const { source, ...rest } = sc;
      unit = { ...unit, screen: { ...rest, text: r.screen.text, items: r.screen.items }, _ctwWarning: r.warning };
    }
    return unit;
  }

  /* Check one unit. Returns {errors, warnings, meta}. */
  function checkUnit(unit, deps) {
    const errors = [], warnings = [], E = m => errors.push(m), W = m => warnings.push(m);
    const T = TASKS[unit.task];
    if (!unit.id || !/^[a-z0-9_]+$/.test(unit.id)) E('id must use a-z, 0-9 and _');
    if (!T) { E(`unknown task "${unit.task}"`); return { errors, warnings, meta: {} }; }
    if (!TIERS.includes(unit.tier)) E('tier must be easy | medium | hard');
    const sc = unit.screen;
    if (!sc || sc.type !== T.type) { E(`screen.type must be "${T.type}" for task ${unit.task}`); return { errors, warnings, meta: {} }; }
    if (unit._ctwWarning) E('Complete the Words: ' + unit._ctwWarning);
    // structural check through the test validator, on a one-screen test
    const probe = { id: 'probe', title: 'probe', version: '1.0.0', license: 'CC-BY-SA-4.0', sections: [{ id: T.section, name: T.section, minutes: 1, screens: [sc] }] };
    deps.validate.validateTest(probe, null).forEach(e => E(e.replace(/^section \w+ screen 1 /, '')));
    const meta = { words: words(plain(sc)), questions: mcqIds(sc).length };
    const wr = WORDS[unit.task] && WORDS[unit.task][unit.tier];
    if (wr && (meta.words < wr[0] || meta.words > wr[1])) W(`${meta.words} words; ${unit.tier} ${unit.task} is usually ${wr[0]}–${wr[1]}`);
    if (unit.task === 'talk' && unit.tier === 'hard' && meta.words < 180) E(`upper-module talk has ${meta.words} words (spec: 180–250)`);
    const qr = QUESTIONS[unit.task]; const qrange = Array.isArray(qr) ? qr : qr && qr[unit.tier];
    if (qrange && (meta.questions < qrange[0] || meta.questions > qrange[1])) E(`${meta.questions} questions; ${unit.tier} ${unit.task} needs ${qrange[0] === qrange[1] ? qrange[0] : qrange.join('–')}`);
    if (TITLE[unit.task] && !TITLE[unit.task].test(sc.title || '')) E(`title must start with "${String(TITLE[unit.task]).slice(2, -2)}"`);
    if (unit.task === 'daily_life' && !/daily life/i.test(sc.directions || '')) E('directions must start with "Read in Daily Life"');
    if (unit.task === 'academic' && !/academic/i.test(sc.directions || '')) E('directions must mention "Read an Academic Passage"');
    if (unit.task === 'email' && sc.kind !== 'email') E('kind must be "email"');
    if (unit.task === 'discussion' && sc.kind !== 'discussion') E('kind must be "discussion"');
    if (unit.task === 'build_sentence') { meta.distractor = (sc.distractors || []).length > 0; meta.tiles = (sc.answer || []).length; if (meta.tiles < 3 || meta.tiles > 7) W(`${meta.tiles} tiles (usual 3–7)`); }
    if (unit.task === 'listen_repeat') {
      const l = (sc.sentences || []).map(words);
      if (!l.every((v, i) => !i || v >= l[i - 1]) || l[0] > 7 || l[l.length - 1] < 18) E(`sentence lengths must grow from ≤7 to ≥18 words (${l.join(',')})`);
    }
    if (['ctw', 'daily_life', 'academic'].includes(unit.task)) meta.fk = deps.ctw.fkGrade(plain(sc));
    if (unit.task === 'academic' && unit.tier === 'hard' && meta.fk < 10.5) W(`Flesch-Kincaid ${meta.fk}; upper-module passages are usually ≥ 10.5`);
    // answer/text overlap for reading questions (the form-level linter checks the 30–50% band)
    if (sc.type === 'passage' && sc.questions) {
      const lint = deps.lint.lintTest({ id: 'u', sections: [{ id: 'reading', screens: [sc] }] }, 'u');
      meta.overlap = lint.m.overlapAvg; meta.paraphrase = lint.m.overlapOver;
    }
    (sc.questions || []).concat(sc.type === 'choose_response' ? [sc] : []).forEach(q => {
      if (q.options && !q.why) W(`${q.id}: no "why" explanation`);
      else if (q.why && typeof q.why === 'object') { const miss = ['tr', 'es'].filter(l => !q.why[l]); if (miss.length) W(`${q.id}: "why" has no ${miss.join('/')} translation (optional; falls back to English)`); }
    });
    return { errors, warnings, meta };
  }

  /* Render a fixed test from a recipe: {id,title,version,level,authors,notes?, sections:{reading:{screens:[ids],hard:[ids],easy:[ids],threshold?},…}} */
  function renderRecipe(recipe, units, blueprint) {
    const byId = new Map(units.map(u => [u.id, u]));
    const missing = [];
    const pick = ids => (ids || []).map(id => { const u = byId.get(id); if (!u) missing.push(id); return u && JSON.parse(JSON.stringify(u.screen)); }).filter(Boolean);
    const sections = Object.keys(blueprint.sections).filter(id => recipe.sections[id]).map(id => {
      const r = recipe.sections[id], d = blueprint.sections[id];
      const s = { id, name: d.name, minutes: d.minutes, ...(d.oneWay ? { oneWay: true } : {}), intro: d.intro, ...(r.override || {}), screens: pick(r.screens) };
      if (r.hard || r.easy) {
        const routeFrom = s.screens.flatMap(mcqIds);
        s.adaptive = { routeFrom, threshold: r.threshold || Math.ceil(0.7 * routeFrom.length), hard: pick(r.hard), easy: pick(r.easy) };
      }
      return s;
    });
    const test = { $schema: '../schema/test.schema.json', id: recipe.id, title: recipe.title, version: recipe.version, license: 'CC-BY-SA-4.0',
      authors: recipe.authors || ['Fluova contributors'], level: recipe.level || 'real', ...(recipe.notes ? { notes: recipe.notes } : {}), sections,
      // bank units used, so the engine can avoid showing them again in a generated test
      units: Object.values(recipe.sections).flatMap(r => [...(r.screens || []), ...(r.hard || []), ...(r.easy || [])]) };
    return { test, missing };
  }

  /* Near-duplicates across the bank: two units of the same task that share most of their content words.
     Assembled tests mix units from every batch, so a reworded copy of an older item would show up as a repeat. */
  const SIM_STOP = new Set('the a an and or but of to in on at for with from by is are was were be been being it its this that these those as not no they them their there he she his her we our you your i my me can could should would will may might must do does did has have had than then so such into about over more most very also only which who whom what when where why how all any each other some just like get got one two'.split(' '));
  const SIM_SKIP = new Set(['id', 'type', 'voice', 'kind', 'why', 'interviewerVoice', 'options', 'answer', 'distractors', 'accept', 'minutes', 'wordTarget', 'directions', 'title', 'items']);
  const SHORT_TASKS = new Set(['choose_response', 'build_sentence']);
  const SIM_LIMIT = { short: 0.5, long: 0.4 };
  function contentWords(screen) {
    const out = [];
    const walk = o => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') { if (typeof o.en === 'string') return out.push(o.en); for (const [k, v] of Object.entries(o)) if (!SIM_SKIP.has(k)) walk(v); } };
    if (screen.type === 'ctw') out.push(plain(screen)); else walk(screen); // CTW: whole words, not {{blank}} placeholders
    return new Set(out.join(' ').replace(/<[^>]+>/g, ' ').toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(w => w.length > 3 && !SIM_STOP.has(w)));
  }
  function similarPairs(units) {
    const W = units.map(u => ({ id: u.id, task: u.task, w: contentWords(u.screen || {}) })), pairs = [];
    for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) {
      const a = W[i], b = W[j]; if (a.task !== b.task) continue;
      const shared = [...a.w].filter(x => b.w.has(x)), sim = shared.length / ((a.w.size + b.w.size - shared.length) || 1);
      const limit = SHORT_TASKS.has(a.task) ? SIM_LIMIT.short : SIM_LIMIT.long;
      if (sim >= limit && shared.length >= 2) pairs.push({ a: a.id, b: b.id, task: a.task, sim: Math.round(sim * 100) / 100, shared });
    }
    return pairs;
  }

  const api = { TASKS, TIERS, checkUnit, expand, renderRecipe, mcqIds, words, plain, similarPairs, SIM_LIMIT };
  if (typeof window !== 'undefined') window.FluovaBank = api;
  if (typeof module === 'undefined' || require.main !== module) { if (typeof module !== 'undefined') module.exports = api; return; }

  // ---------- CLI ----------
  const fs = require('fs'), path = require('path');
  const ROOT = path.join(__dirname, '..'), BANK = path.join(ROOT, 'content', 'bank');
  const deps = { ctw: require('./ctw_generate.js'), validate: require('./validate.js'), lint: require('./lint_forms.js') };
  const checkOnly = process.argv.includes('--check');
  const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.json') ? [path.join(d, e.name)] : []) : [];
  const files = walk(path.join(BANK, 'units')).sort();
  let failed = 0, warned = 0;
  const units = [], seenIds = new Map();
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    let u; try { u = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error(`✗ ${rel}: invalid JSON — ${e.message}`); failed++; continue; }
    if (path.basename(f, '.json') !== u.id) { console.error(`✗ ${rel}: file name must equal id "${u.id}"`); failed++; }
    const T = TASKS[u.task];
    if (T && path.relative(path.join(BANK, 'units'), f).split(path.sep).slice(0, 2).join('/') !== `${T.section}/${u.task}`) { console.error(`✗ ${rel}: must live in content/bank/units/${T && T.section}/${u.task}/`); failed++; }
    u = expand(u, deps);
    const r = checkUnit(u, deps);
    // ids (unit + question ids) must be unique across the whole bank
    [u.id, ...mcqIds(u.screen || {}), ...((u.screen && u.screen.items) || []).map(i => i.id), ...(u.screen && u.screen.id && u.screen.id !== u.id ? [u.screen.id] : [])]
      .forEach(id => { if (seenIds.has(id) && seenIds.get(id) !== u.id) r.errors.push(`id "${id}" also used in unit ${seenIds.get(id)}`); seenIds.set(id, u.id); });
    if (r.errors.length) { failed++; console.error(`✗ ${rel}\n    - ${r.errors.join('\n    - ')}`); }
    if (r.warnings.length) { warned++; console.log(`⚠ ${rel}\n    - ${r.warnings.join('\n    - ')}`); }
    const { _ctwWarning, ...clean } = u;
    units.push({ ...clean, meta: r.meta });
  }
  for (const p of similarPairs(units)) {
    warned++; console.log(`⚠ ${p.a} and ${p.b} (${p.task}) are near-duplicates: ${Math.round(p.sim * 100)}% of content words shared (${p.shared.slice(0, 6).join(', ')}). Reword one so assembled tests do not repeat an item.`);
  }
  const count = {};
  units.forEach(u => { const k = `${u.task}/${u.tier}`; count[k] = (count[k] || 0) + 1; });
  console.log(`\n${units.length} units · ${failed} with errors · ${warned} with warnings`);
  console.log(Object.keys(count).sort().map(k => `  ${k.padEnd(26)} ${count[k]}`).join('\n'));

  const blueprint = JSON.parse(fs.readFileSync(path.join(BANK, 'blueprint.json'), 'utf8'));
  const recipeDir = path.join(ROOT, 'content', 'tests', 'recipes');
  const recipes = walk(recipeDir);
  for (const f of recipes) {
    const recipe = JSON.parse(fs.readFileSync(f, 'utf8'));
    const { test, missing } = renderRecipe(recipe, units, blueprint);
    if (missing.length) { console.error(`✗ recipe ${recipe.id}: unknown units ${missing.join(', ')}`); failed++; continue; }
    const errs = deps.validate.validateTest(test, recipe.id);
    const high = deps.lint.lintTest(test, recipe.id).issues.filter(i => i.sev === 'high');
    if (errs.length || high.length) { failed++; console.error(`✗ recipe ${recipe.id}:\n    - ${errs.concat(high.map(h => h.msg)).join('\n    - ')}`); }
    else console.log(`✓ recipe ${recipe.id}`);
    if (!checkOnly) fs.writeFileSync(path.join(ROOT, 'content', 'tests', recipe.id + '.json'), JSON.stringify(test, null, 1) + '\n');
  }
  if (!checkOnly) {
    fs.writeFileSync(path.join(BANK, 'bank.json'), JSON.stringify({ units }) + '\n');
    console.log(`wrote content/bank/bank.json (${units.length} units) and ${recipes.length} test(s)`);
  }
  process.exit(failed ? 1 : 0);
})();
