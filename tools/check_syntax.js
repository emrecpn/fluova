#!/usr/bin/env node
/* Parses every JavaScript file (and every inline <script> in the HTML pages) without running it, so a typo in a
   browser-only file is caught in CI instead of on the live site. No dependencies.
   Usage: node tools/check_syntax.js   → exit code 1 on any syntax error. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', '.claude', 'dist']);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => SKIP.has(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
let bad = 0, n = 0;
function check(code, where) {
  n++;
  try { new vm.Script(code.replace(/^#!.*\n/, ''), { filename: where }); }
  catch (e) { bad++; console.error(`✗ ${where}: ${e.message}`); }
}
for (const f of walk(ROOT)) {
  const rel = path.relative(ROOT, f);
  if (f.endsWith('.js')) check(fs.readFileSync(f, 'utf8'), rel);
  else if (f.endsWith('.html')) {
    const html = fs.readFileSync(f, 'utf8');
    for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
      const attrs = m[1] || '', code = m[2];
      if (/\ssrc=/.test(attrs) || !code.trim()) continue;
      if (/type=["']module["']/.test(attrs)) continue; // ES modules with top-level await are checked in the browser
      check(code, `${rel} <script>`);
    }
  }
}
console.log(bad ? `${bad} of ${n} scripts have syntax errors` : `✓ ${n} scripts parse cleanly`);
process.exit(bad ? 1 : 0);
