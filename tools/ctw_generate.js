#!/usr/bin/env node
/* Complete the Words generator — the 2026 C-test rule (docs/FIDELITY-SPEC.md §3):
   - The first sentence stays intact.
   - After it, words are counted in order (across sentence boundaries); every SECOND word loses its second half:
     shown = floor(n/2) letters, hidden = ceil(n/2). (because → bec + "ause", of → o + "f")
   - One-letter, hyphenated (long-term) and apostrophe (don't) words are never blanked; the next word takes the turn.
   - 10 blanks per paragraph; the rest of the text stays as it is.
   Output: the engine's `ctw` screen ({{id}} placeholders + items[{id, stub, answer}]).

   Usage: node tools/ctw_generate.js "<paragraph>" [prefix] [blanks]
      or: echo "<paragraph>" | node tools/ctw_generate.js - [prefix] [blanks] */
(function () {

function syllables(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, ''); if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g); return m ? m.length : 1;
}
function fkGrade(text) {
  const sents = Math.max(1, (text.match(/[.!?]+(\s|$)/g) || []).length);
  const ws = text.toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
  const syl = ws.reduce((a, w) => a + syllables(w), 0);
  return +(0.39 * ws.length / sents + 11.8 * syl / ws.length - 15.59).toFixed(1);
}

function generate(paragraph, prefix = 'c', blanks = 10) {
  const text = paragraph.replace(/\s+/g, ' ').trim();
  const firstEnd = text.search(/[.!?](\s|$)/);
  if (firstEnd < 0) throw new Error('The paragraph needs at least two sentences.');
  const head = text.slice(0, firstEnd + 1);
  const rest = text.slice(firstEnd + 1);
  // split into words and everything between them (spaces, punctuation)
  const tokens = rest.split(/([A-Za-z]+(?:[-'][A-Za-z]+)*)/);   // hyphenated / apostrophe words stay one token
  const items = [];
  let wordIdx = 0, wantDamage = false, out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const isWord = i % 2 === 1;
    if (!isWord) { out += t; continue; }
    // every second word: word 0 intact, word 1 blanked, word 2 intact ...
    wantDamage = wordIdx % 2 === 1;
    wordIdx++;
    const letters = t.replace(/'/g, '');
    if (wantDamage && items.length < blanks && letters.length >= 2 && !/['-]/.test(t)) {
      const shown = Math.floor(t.length / 2);
      const id = prefix + (items.length + 1);
      items.push({ id, stub: t.slice(0, shown), answer: t.slice(shown).toLowerCase(), word: t });
      out += `{{${id}}}`;
    } else {
      if (wantDamage && items.length < blanks) wordIdx--; // a word that cannot be blanked passes the turn on
      out += t;
    }
  }
  const warning = items.length < blanks ? `only ${items.length}/${blanks} blanks — the paragraph is too short` : null;
  const display = (head + out).replace(/\{\{(\w+)\}\}/g, (_, id) => {
    const it = items.find(x => x.id === id); return it.stub + '_'.repeat(it.answer.length);
  });
  return {
    screen: { type: 'ctw', title: 'Complete the Words',
      text: [head + out], items: items.map(({ id, stub, answer }) => ({ id, stub, answer })) },
    display, fk: fkGrade(text), words: items.map(x => x.word), warning,
  };
}

const api = { generate, fkGrade };
if (typeof window !== 'undefined') window.FluovaCTW = api;
if (typeof module === 'undefined') return;
module.exports = api;
if (require.main === module) {
  const fs = require('fs');
  let para = process.argv[2];
  if (!para || para === '-') para = fs.readFileSync(0, 'utf8');
  const res = generate(para, process.argv[3] || 'c', +(process.argv[4] || 10));
  if (res.warning) console.error('Warning: ' + res.warning);
  console.log('Preview:\n  ' + res.display);
  console.log(`\nBlanked words (${res.words.length}): ${res.words.join(', ')}`);
  console.log(`Flesch-Kincaid: ${res.fk}  (spec medium 7.4–10.5, high 10.5+)`);
  console.log('\nEngine screen (JSON):\n' + JSON.stringify(res.screen, null, 2));
}
})();
