#!/usr/bin/env node
/* Form assembler — builds a brand-new test from the question bank, no AI involved.
   Fills every slot of content/bank/blueprint.json (task + difficulty tier + question count) with a random unit,
   preferring units the test taker has not seen and topics not already used in the form, keeps the Build a Sentence
   distractor share at the 2026 level, then runs the validator and the fidelity linter. If the form fails the gate
   (e.g. the answer/text overlap band), it tries again with the next seed.

   Browser: FluovaForm.assemble(bank, blueprint, {seed, exclude, id, title}, deps)   (engine "New test" button)
   CLI:     node generator/form_assemble.js --seed 7 [--exclude-origin pilot-01] [--id practice-02 --title "…" --save]
            node generator/form_assemble.js --check 20     (CI: 20 random forms must pass)
            --save writes content/tests/recipes/<id>.json; run `node tools/bank.js` afterwards to render it. */
(function () {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function pickOnce(units, blueprint, seed, exclude) {
    const rand = rng(seed), used = new Set(), topics = new Set(), notes = [];
    let repeats = 0;
    const choose = (slot, extra) => {
      let c = units.filter(u => u.task === slot.task && (slot.tier === 'any' || u.tier === slot.tier) &&
        (!slot.questions || u.meta.questions === slot.questions) && !used.has(u.id) && (!extra || extra(u)));
      if (!c.length) throw new Error(`the bank has no ${slot.tier} ${slot.task} unit${slot.questions ? ` with ${slot.questions} questions` : ''} left`);
      const fresh = c.filter(u => !exclude.has(u.id)); if (fresh.length) c = fresh; else repeats++;
      const newTopic = c.filter(u => !topics.has(u.topic || u.id)); if (newTopic.length) c = newTopic;
      const u = c[Math.floor(rand() * c.length)];
      used.add(u.id); topics.add(u.topic || u.id);
      return u.id;
    };
    const recipe = { sections: {} };
    for (const [sec, mods] of Object.entries(blueprint.recipe)) {
      const r = recipe.sections[sec] = {};
      for (const [mod, slots] of Object.entries(mods)) {
        if (!Array.isArray(slots)) continue;
        if (sec === 'writing') {
          // Build a Sentence: exactly N items with one distractor tile (2026 sample: ~2 in 10)
          const bs = slots.filter(s => s.task === 'build_sentence'), k = mods.buildSentenceDistractors || 0;
          const ids = bs.map((s, i) => choose(s, u => !!u.meta.distractor === (i < k)));
          for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
          r[mod] = ids.concat(slots.filter(s => s.task !== 'build_sentence').map(s => choose(s)));
        } else r[mod] = slots.map(s => choose(s));
      }
    }
    if (repeats) notes.push(`${repeats} unit(s) repeat questions you have already seen — the bank needs more content`);
    return { recipe, notes };
  }

  function assemble(bank, blueprint, opts, deps) {
    const exclude = new Set(opts.exclude || []);
    const base = opts.seed >>> 0, tries = opts.tries || 25;
    let best = null;
    for (let i = 0; i < tries; i++) {
      const seed = (base + i) >>> 0;
      let p;
      try { p = pickOnce(bank.units, blueprint, seed, exclude); } catch (e) { return { error: e.message }; }
      const id = opts.id || 'gen-' + seed.toString(36);
      const recipe = { id, title: opts.title || `Fluova Practice Test · generated #${seed.toString(36)}`, version: '1.0.0', level: 'real',
        authors: ['Fluova contributors'], ...p.recipe };
      const { test } = deps.bank.renderRecipe(recipe, bank.units, blueprint);
      const errors = deps.validate.validateTest(test, null);
      const findings = deps.lint.lintTest(test, id).issues.filter(x => x.sev !== 'info');
      const high = errors.length + findings.filter(f => f.sev === 'high').length;
      const result = { test, recipe, seed, notes: p.notes, errors, findings, high, tries: i + 1 };
      if (!best || high < best.high) best = result;
      if (!high) break;
    }
    return best;
  }

  /* Single-task practice set ("drill"): N units of one task type, preferring unseen ones. Not a full test, so it
     skips the full-test gate (each unit already passed the bank checks) and results show % correct, not a band. */
  const DRILL = {
    ctw: { n: 3, minutes: 7 }, daily_life: { n: 3, minutes: 6 }, academic: { n: 2, minutes: 12 },
    choose_response: { n: 10, minutes: 5 }, conversation: { n: 3, minutes: 6 }, announcement: { n: 3, minutes: 5 }, talk: { n: 2, minutes: 10 },
    build_sentence: { n: 10, minutes: 6 }, email: { n: 1, minutes: 7 }, discussion: { n: 1, minutes: 10 },
    listen_repeat: { n: 1, minutes: 3 }, interview: { n: 1, minutes: 5 },
  };
  const SECTION_OF = { ctw: 'reading', daily_life: 'reading', academic: 'reading', choose_response: 'listening', conversation: 'listening',
    announcement: 'listening', talk: 'listening', build_sentence: 'writing', email: 'writing', discussion: 'writing', listen_repeat: 'speaking', interview: 'speaking' };
  function assembleDrill(bank, blueprint, opts) {
    const task = opts.task, cfg = DRILL[task]; if (!cfg) return { error: 'unknown task ' + task };
    const rand = rng(opts.seed >>> 0), exclude = new Set(opts.exclude || []);
    let pool = bank.units.filter(u => u.task === task && (!opts.tier || opts.tier === 'any' || u.tier === opts.tier));
    if (!pool.length) return { error: `no ${opts.tier || ''} ${task} units in the bank` };
    const fresh = pool.filter(u => !exclude.has(u.id)), picked = [];
    const take = list => { const l = list.slice(); while (l.length && picked.length < cfg.n) picked.push(l.splice(Math.floor(rand() * l.length), 1)[0]); };
    take(fresh); if (picked.length < cfg.n) take(pool.filter(u => !picked.includes(u)));
    const sec = SECTION_OF[task], d = blueprint.sections[sec];
    const id = 'gen-' + task.replace(/_/g, '-') + '-' + (opts.seed >>> 0).toString(36);
    return { test: { id, title: opts.title || `Practice set · ${opts.label || task}`, version: '1.0.0', license: 'CC-BY-SA-4.0', authors: ['Fluova contributors'], level: 'practice',
      sections: [{ id: sec, name: d.name, minutes: cfg.minutes, ...(d.oneWay ? { oneWay: true } : {}), screens: picked.map(u => JSON.parse(JSON.stringify(u.screen))) }],
      units: picked.map(u => u.id) }, repeats: picked.filter(u => exclude.has(u.id)).length, available: pool.length };
  }

  const api = { assemble, assembleDrill, DRILL };
  if (typeof window !== 'undefined') window.FluovaForm = api;
  if (typeof module === 'undefined' || require.main !== module) { if (typeof module !== 'undefined') module.exports = api; return; }

  // ---------- CLI ----------
  const fs = require('fs'), path = require('path');
  const ROOT = path.join(__dirname, '..');
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const deps = { bank: require('../tools/bank.js'), validate: require('../tools/validate.js'), lint: require('../tools/lint_forms.js') };
  const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'bank', 'bank.json'), 'utf8'));
  const blueprint = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'bank', 'blueprint.json'), 'utf8'));
  if (args.includes('--check')) {
    // CI: random forms built from the bank must all pass the gate
    const n = +(opt('--check') || 20); let bad = 0;
    for (let i = 0; i < n; i++) { const r = assemble(bank, blueprint, { seed: 1000 + i * 7919 }, deps); if (r.error || r.high) { bad++; console.error(`✗ seed ${1000 + i * 7919}: ${r.error || r.findings.filter(f => f.sev === 'high').map(f => f.msg).join('; ') || r.errors.join('; ')}`); } }
    console.log(`${n - bad}/${n} random forms pass the quality gate`); process.exit(bad ? 1 : 0);
  }
  const exO = opt('--exclude-origin');
  const exclude = exO ? bank.units.filter(u => u.origin === exO).map(u => u.id) : [];
  const r = assemble(bank, blueprint, { seed: +(opt('--seed') || Date.now() % 1e9), exclude, id: opt('--id'), title: opt('--title') }, deps);
  if (r.error) { console.error('✗ ' + r.error); process.exit(1); }
  r.notes.forEach(n => console.log('• ' + n));
  r.errors.forEach(e => console.log('✗ ' + e));
  r.findings.forEach(f => console.log(`${f.sev === 'high' ? '✗' : '⚠'} [${f.sev}] ${f.sec}: ${f.msg}`));
  const fromExcluded = r.test.units.filter(u => exclude.includes(u)).length;
  console.log(`${r.high ? '✗' : '✓'} ${r.test.id} · seed ${r.seed} · ${r.tries} attempt(s) · ${r.test.units.length} units${exO ? ` · ${fromExcluded} from ${exO}` : ''}`);
  if (args.includes('--save')) {
    if (r.high) { console.error('not saved: the form does not pass the gate'); process.exit(1); }
    const { units, ...rec } = r.recipe;
    fs.writeFileSync(path.join(ROOT, 'content', 'tests', 'recipes', r.test.id + '.json'), JSON.stringify(rec, null, 1) + '\n');
    console.log(`saved content/tests/recipes/${r.test.id}.json — now run: node tools/bank.js && node tools/build_manifest.js`);
  }
  process.exit(r.high ? 1 : 0);
})();
