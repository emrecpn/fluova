#!/usr/bin/env node
/* Split a whole test into question-bank units + a recipe that rebuilds the same test.
   Usage: node generator/bank_from_test.js content/tests/<id>.json [--dry]
   Writes content/bank/units/<section>/<task>/<unit>.json and content/tests/recipes/<id>.json.
   Tier comes from the module: router → medium, upper → hard, lower → easy (writing/speaking → medium). */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const file = process.argv[2], dry = process.argv.includes('--dry');
if (!file) { console.error('usage: node generator/bank_from_test.js content/tests/<id>.json [--dry]'); process.exit(2); }
const t = JSON.parse(fs.readFileSync(file, 'utf8'));
const { TASKS } = require('../tools/bank.js');

const slug = s => String(s).toLowerCase().replace(/^(complete the words|conversation|announcement|academic talk):\s*/i, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
function taskOf(sc) {
  if (sc.type === 'ctw') return 'ctw';
  if (sc.type === 'passage') return /daily life/i.test(sc.directions || '') ? 'daily_life' : 'academic';
  if (sc.type === 'choose_response') return 'choose_response';
  if (sc.type === 'listening') return /^conversation/i.test(sc.title) ? 'conversation' : /^announcement/i.test(sc.title) ? 'announcement' : 'talk';
  if (sc.type === 'sentence_dialogue') return 'build_sentence';
  if (sc.type === 'writing') return sc.kind === 'email' ? 'email' : 'discussion';
  return sc.type; // listen_repeat, interview
}
const PREFIX = { ctw: 'ctw', daily_life: 'dl', academic: 'ac', conversation: 'conv', announcement: 'ann', talk: 'talk' };
const TIER = { screens: 'medium', hard: 'hard', easy: 'easy' };

const recipe = { id: t.id, title: t.title, version: t.version, level: t.level, authors: t.authors, ...(t.notes ? { notes: t.notes } : {}), sections: {} };
const out = [];
for (const s of t.sections) {
  const r = recipe.sections[s.id] = {};
  const mods = { screens: s.screens, ...(s.adaptive ? { hard: s.adaptive.hard, easy: s.adaptive.easy } : {}) };
  if (s.adaptive && s.adaptive.threshold !== Math.ceil(0.7 * s.adaptive.routeFrom.length)) r.threshold = s.adaptive.threshold;
  for (const [mod, arr] of Object.entries(mods)) {
    r[mod] = arr.map(sc => {
      const task = taskOf(sc);
      const id = PREFIX[task] ? `${PREFIX[task]}_${slug(sc.title || sc.id)}` : sc.id;
      out.push({ id, task, tier: TIER[mod], origin: t.id, screen: sc });
      return id;
    });
  }
}
for (const u of out) {
  const dir = path.join(ROOT, 'content', 'bank', 'units', TASKS[u.task].section, u.task);
  if (!dry) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, u.id + '.json'), JSON.stringify(u, null, 1) + '\n'); }
}
if (!dry) fs.writeFileSync(path.join(ROOT, 'content', 'tests', 'recipes', t.id + '.json'), JSON.stringify(recipe, null, 1) + '\n');
console.log(`${out.length} units${dry ? ' (dry run)' : ''} + recipe ${t.id}`);
const dup = out.map(u => u.id).filter((x, i, a) => a.indexOf(x) !== i);
if (dup.length) { console.error('duplicate unit ids: ' + dup.join(', ')); process.exit(1); }
