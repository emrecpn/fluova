#!/usr/bin/env node
/* Build a Sentence builder — turns a plain-text list of dialogues into engine-ready `sentence_dialogue` screens
   in the ETS 2026 format: partly prefilled frame, word-group tiles, 0–1 distractor (about 2 in 10 items).

   Input (blocks separated by a blank line):
     A: How was the workshop you went to on Saturday?
     B: The [tips] [that] [the speaker] [shared] [were] really useful.
     X: was            ← optional distractor tile; "X: auto" picks one from the rules below; omit for none

   Words in [brackets] become tiles (in the correct order); everything else is prefilled in the frame.

   Usage:
     node generator/bas_build.js items.txt --prefix w12_bs            → prints a JSON array
     node generator/bas_build.js items.txt --prefix w12_bs --units     → saves each item as a question-bank unit
                                                                      (content/bank/units/writing/build_sentence/)
   Exit code 1 if any item has an error. */
(function () {
  const WH = /^(what|when|where|why|how|who|which|whether|if)\b/i;
  const ASKERS = /\b(know|tell me|wonder|sure|ask(ed)?|wanted to know|idea|explain)\b/i;
  const EN_ING = { written: 'writing', taken: 'taking', given: 'giving', broken: 'breaking', chosen: 'choosing', eaten: 'eating',
    spoken: 'speaking', driven: 'driving', shown: 'showing', seen: 'seeing', done: 'doing', known: 'knowing', forgotten: 'forgetting' };
  /* past participle → -ing form (repaired → repairing, studied → studying, written → writing); null if unknown */
  function ing(p) {
    p = p.toLowerCase();
    if (EN_ING[p]) return EN_ING[p];
    if (/ied$/.test(p)) return p.slice(0, -3) + 'ying';
    if (/ed$/.test(p)) return p.slice(0, -2) + 'ing';
    return null;
  }

  /* Rule-based distractors: each returns a tile that is a classic grammatical trap for this sentence, or null.
     Order matters: the first rule that fires is used for "X: auto". */
  const RULES = [
    { name: 'embedded question → added auxiliary', test: (tiles, full) => {
      const i = tiles.findIndex(t => WH.test(t));
      if (i < 0 || !ASKERS.test(full)) return null;
      return /\b(was|were|did|had|went|said|\w+ed)\b/.test(tiles.slice(i + 1).join(' ')) ? 'did' : 'does';
    } },
    { name: 'passive → active -ing form', test: tiles => {
      const i = tiles.findIndex(t => /^(being|been|is|are|was|were)$/i.test(t));
      const p = i >= 0 && tiles.slice(i + 1).find(t => /^\w+(ed|en)$/i.test(t));
      return p ? ing(p) : null;
    } },
    { name: 'reported speech → backshift missing', test: tiles => {
      const w = tiles.find(t => /^would \w+/i.test(t));
      return w ? w.replace(/^would/i, 'will') : null;
    } },
    { name: 'superlative → double comparison', test: tiles => {
      const s = tiles.find(t => /^the \w+est$/i.test(t));
      return s ? 'the most ' + s.split(' ')[1].replace(/est$/, '') : null;
    } },
    { name: 'subject–verb agreement', test: tiles => {
      const map = { were: 'was', was: 'were', are: 'is', is: 'are', has: 'have', have: 'has' };
      const v = tiles.find(t => map[t.toLowerCase()]);
      return v ? map[v.toLowerCase()] : null;
    } },
  ];

  function suggest(tiles, full) {
    return RULES.map(r => ({ rule: r.name, tile: r.test(tiles, full) })).filter(x => x.tile && !tiles.includes(x.tile));
  }

  /* Parse one "B:" line into frame + answer tiles. */
  function parseB(line) {
    const frame = [], answer = [];
    const re = /\[([^\]]+)\]/g; let m, last = 0;
    while ((m = re.exec(line))) {
      const before = line.slice(last, m.index).trim();
      if (before) frame.push(before);
      frame.push(null); answer.push(m[1].trim());
      last = re.lastIndex;
    }
    const after = line.slice(last).trim();
    if (after) frame.push(after);
    return { frame, answer, full: line.replace(/[\[\]]/g, '').replace(/\s+([?.!,])/g, '$1') };
  }

  function build(text, prefix) {
    const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    const items = [], problems = [];
    blocks.forEach((blk, n) => {
      const get = k => (blk.match(new RegExp('^' + k + ':\\s*(.*)$', 'mi')) || [])[1];
      const id = `${prefix}${n + 1}`, A = get('A'), B = get('B'), X = get('X');
      const err = msg => problems.push({ id, sev: 'error', msg }), warn = msg => problems.push({ id, sev: 'warn', msg });
      if (!A || !B) return err('needs an "A:" line and a "B:" line');
      const { frame, answer, full } = parseB(B);
      if (answer.length < 3) err(`only ${answer.length} tiles — use at least 3`);
      if (answer.length > 7) warn(`${answer.length} tiles — the 2026 sample uses 3–7`);
      if (new Set(answer.map(a => a.toLowerCase())).size !== answer.length) err('two tiles are identical, so the order is ambiguous');
      if (!/[?.!]$/.test(full)) warn('sentence has no final punctuation');
      let distractors = [];
      if (X && /^auto$/i.test(X.trim())) {
        const s = suggest(answer, full);
        if (s.length) distractors = [s[0].tile]; else warn('X: auto — no rule matched; item has no distractor');
      } else if (X) distractors = [X.trim()];
      if (distractors.some(d => answer.map(a => a.toLowerCase()).includes(d.toLowerCase()))) err('distractor is identical to a correct tile');
      items.push({ type: 'sentence_dialogue', id, personA: A.trim(), frame, answer, distractors,
        _suggestions: suggest(answer, full).map(x => `${x.tile} (${x.rule})`) });
    });
    const withD = items.filter(i => i.distractors.length).length;
    if (items.length && withD / items.length > 0.4)
      problems.push({ id: '(set)', sev: 'warn', msg: `${withD}/${items.length} items have a distractor; the 2026 sample has about 2 in 10` });
    if (items.length && items.length !== 10) problems.push({ id: '(set)', sev: 'warn', msg: `${items.length} items; a test needs 10` });
    return { items, problems };
  }

  const api = { build, suggest, parseB, RULES };
  if (typeof window !== 'undefined') window.FluovaBaS = api;
  if (typeof module === 'undefined' || require.main !== module) { if (typeof module !== 'undefined') module.exports = api; return; }

  // ---------- CLI ----------
  const fs = require('fs');
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const prefix = opt('--prefix') || 'bs', into = opt('--into');
  if (!args[0]) { console.error('usage: node generator/bas_build.js items.txt [--prefix w12_bs] [--into test.json]'); process.exit(2); }
  const { items, problems } = build(fs.readFileSync(args[0], 'utf8'), prefix);
  problems.forEach(p => console.error(`${p.sev === 'error' ? '✗' : '⚠'} ${p.id}: ${p.msg}`));
  items.forEach(i => { if (i._suggestions.length) console.error(`  ${i.id} distractor ideas: ${i._suggestions.join(' · ')}`); });
  const clean = items.map(({ _suggestions, ...i }) => i);
  if (problems.some(p => p.sev === 'error')) process.exit(1);
  if (args.includes('--units')) {
    const dir = require('path').join(__dirname, '..', 'content', 'bank', 'units', 'writing', 'build_sentence');
    fs.mkdirSync(dir, { recursive: true });
    clean.forEach(i => fs.writeFileSync(require('path').join(dir, i.id + '.json'),
      JSON.stringify({ id: i.id, task: 'build_sentence', tier: 'medium', topic: 'build a sentence', screen: i }, null, 1) + '\n'));
    console.error(`✓ ${clean.length} units written to content/bank/units/writing/build_sentence/ — now run: node tools/bank.js`);
  } else if (into) {
    const t = JSON.parse(fs.readFileSync(into, 'utf8'));
    const w = t.sections.find(s => s.id === 'writing');
    if (!w) { console.error('✗ test has no writing section'); process.exit(1); }
    const first = w.screens.findIndex(s => s.type === 'sentence_dialogue');
    const others = w.screens.filter(s => s.type !== 'sentence_dialogue');
    w.screens = [...others.slice(0, Math.max(first, 0)), ...clean, ...others.slice(Math.max(first, 0))];
    fs.writeFileSync(into, JSON.stringify(t, null, 1) + '\n');
    console.error(`✓ ${clean.length} Build a Sentence items written to ${into}`);
  } else console.log(JSON.stringify(clean, null, 1));
})();
