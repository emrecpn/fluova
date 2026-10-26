#!/usr/bin/env node
/* Test assembler — puts section drafts (e.g. from the prompt pack) together into one test file and checks it.
   - Accepts section objects ({"id": "reading", ...}) in any order, or a whole test ({"sections": [...]}).
   - Complete the Words screens may carry a plain paragraph in "source"; blanks are made by the C-test
     algorithm (tools/ctw_generate.js), never by hand or by AI.
   - Runs the structural validator and the fidelity linter on the result.

   Usage:
     node generator/assemble.js --id my-test-02 --title "Fluova Practice Test 2" [--level real] [--by "model name"] \
          reading.json listening.json writing.json speaking.json
   Writes content/tests/<id>.json only when there are no errors or critical findings (use --force to write anyway). */
(function () {
  const ORDER = ['reading', 'listening', 'writing', 'speaking'];
  const DEFAULTS = {
    reading: { name: 'Reading', minutes: 29 }, listening: { name: 'Listening', minutes: 29, oneWay: true },
    writing: { name: 'Writing', minutes: 23 }, speaking: { name: 'Speaking', minutes: 8 },
  };

  function assemble(meta, parts, deps) {
    const { generate } = deps.ctw;
    const notes = [];
    let sections = [];
    parts.forEach(p => { if (p && Array.isArray(p.sections)) sections.push(...p.sections); else if (p) sections.push(p); });
    const seen = new Set();
    sections = sections.filter(s => {
      if (!ORDER.includes(s.id)) { notes.push(`skipped an object without a valid section id (${JSON.stringify(s.id)})`); return false; }
      if (seen.has(s.id)) { notes.push(`section "${s.id}" appeared twice; kept the first`); return false; }
      seen.add(s.id); return true;
    }).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
      .map(s => ({ ...DEFAULTS[s.id], ...s }));

    let n = 0;
    const expand = scr => {
      if (scr.type !== 'ctw' || !scr.source || (scr.items && scr.items.length)) return scr;
      n++;
      try {
        const res = generate(scr.source, `ctw${n}_`, 10);
        if (res.warning) notes.push(`Complete the Words "${scr.title || n}": ${res.warning}`);
        const { source, ...rest } = scr;
        return { ...res.screen, ...rest, text: res.screen.text, items: res.screen.items,
          title: scr.title ? (/^complete the words/i.test(scr.title) ? scr.title : 'Complete the Words: ' + scr.title) : res.screen.title };
      } catch (e) { notes.push(`Complete the Words "${scr.title || n}": ${e.message}`); return scr; }
    };
    sections.forEach(s => {
      s.screens = (s.screens || []).map(expand);
      if (s.adaptive) ['hard', 'easy'].forEach(m => { s.adaptive[m] = (s.adaptive[m] || []).map(expand); });
    });
    if (n) notes.push(`generated blanks for ${n} Complete the Words paragraph(s)`);
    ORDER.filter(id => !seen.has(id)).forEach(id => notes.push(`section "${id}" is missing`));

    const test = {
      $schema: '../schema/test.schema.json', id: meta.id, title: meta.title, version: meta.version || '1.0.0',
      license: 'CC-BY-SA-4.0', authors: meta.authors || ['Fluova contributors'], level: meta.level || 'real',
      ...(meta.generatedBy ? { generatedBy: meta.generatedBy } : {}), sections,
    };
    const errors = deps.validate.validateTest(test, null);
    const lint = deps.lint.lintTest(test, meta.id);
    return { test, notes, errors, findings: lint.issues.filter(i => i.sev !== 'info'), metrics: lint.m };
  }

  const api = { assemble, ORDER };
  if (typeof window !== 'undefined') window.FluovaAssemble = api;
  if (typeof module === 'undefined' || require.main !== module) { if (typeof module !== 'undefined') module.exports = api; return; }

  // ---------- CLI ----------
  const fs = require('fs'), path = require('path');
  const deps = { ctw: require('../tools/ctw_generate.js'), validate: require('../tools/validate.js'), lint: require('../tools/lint_forms.js') };
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const force = args.includes('--force'); if (force) args.splice(args.indexOf('--force'), 1);
  const meta = { id: opt('--id'), title: opt('--title'), level: opt('--level'), generatedBy: opt('--by') };
  if (!meta.id || !meta.title || !args.length) {
    console.error('usage: node generator/assemble.js --id my-test-02 --title "…" [--level real] [--by "model"] section.json …'); process.exit(2);
  }
  const parts = args.map(f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error(`✗ ${f}: ${e.message}`); process.exit(1); } });
  const r = assemble(meta, parts, deps);
  r.notes.forEach(x => console.log('• ' + x));
  r.errors.forEach(x => console.log('✗ ' + x));
  r.findings.forEach(x => console.log(`${x.sev === 'high' ? '✗' : '⚠'} [${x.sev}] ${x.sec}: ${x.msg}`));
  const blocked = r.errors.length || r.findings.some(f => f.sev === 'high');
  if (blocked && !force) { console.log('\nNot written: fix the errors above (or pass --force to save a draft).'); process.exit(1); }
  const out = path.join(__dirname, '..', 'content', 'tests', meta.id + '.json');
  fs.writeFileSync(out, JSON.stringify(r.test, null, 1) + '\n');
  console.log(`\n✓ wrote ${path.relative(process.cwd(), out)}${blocked ? ' (draft — does not pass the gate yet)' : ''}. Next: node tools/build_manifest.js`);
})();
