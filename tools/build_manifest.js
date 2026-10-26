#!/usr/bin/env node
/* Builds content/tests/index.json — the list the engine's start page reads.
   Usage: node tools/build_manifest.js   (CI runs it before deploying)
   Sınav listesi (index.json) üretir; motorun ana sayfası bunu okur. */
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'content', 'tests');

// Scored items per screen (what the test taker answers), used for the summary line.
const count = s => ({
  ctw: (s.items || []).length, passage: (s.questions || []).length, text_chain: (s.questions || []).length,
  insert_text: 1, choose_response: 1, listening: (s.questions || []).length, sentence_dialogue: 1,
  writing: 1, listen_repeat: (s.sentences || []).length, interview: (s.questions || []).length,
}[s.type] || 0);
const sum = screens => (screens || []).reduce((n, s) => n + count(s), 0);

const tests = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'index.json').sort().map(f => {
  const t = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  return {
    id: t.id, title: t.title, version: t.version, level: t.level || 'real', authors: t.authors || [],
    minutes: t.sections.reduce((m, s) => m + s.minutes, 0),
    sections: t.sections.map(s => ({
      id: s.id, minutes: s.minutes,
      // adaptive sections: router + the longer of the two second-stage modules
      items: sum(s.screens) + (s.adaptive ? Math.max(sum(s.adaptive.hard), sum(s.adaptive.easy)) : 0),
    })),
  };
});

fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify({ tests }, null, 1) + '\n');
console.log(`index.json: ${tests.length} test(s) — ${tests.map(t => t.id).join(', ')}`);
