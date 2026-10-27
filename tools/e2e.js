#!/usr/bin/env node
/* End-to-end smoke test in a real headless Chrome, with no dependencies: a small Node static server plus the
   Chrome DevTools Protocol over Node's built-in WebSocket (Node 22+).
   The repo is served in the same layout as the GitHub Pages build, and the checks cover what unit tests cannot see:
   - pages load without script errors, failed requests or Content-Security-Policy violations
   - the landing page passes tools/layout_audit.js in every language, at phone and desktop width
   - Complete the Words boxes fit their letters (landing demo and the test itself)
   - an attempt resumes on the same screen after a reload, with the paused-clock notice
   - adaptive routing sends a strong first module to the upper module
   - a new test can be built from the question bank in the browser
   - results and review pages work, and Spanish answer explanations reach the review page
   Usage: node tools/e2e.js        (CHROME_PATH=/path/to/chrome to pick the browser) */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'site', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml' };
const PHONE = { width: 375, height: 812, deviceScaleFactor: 2, mobile: true };
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };

// ---------- static server in the Pages layout ----------
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const top = p.split('/')[1];
    const base = ['engine', 'fonts', 'content', 'generator', 'tools'].includes(top) ? ROOT : DIST;
    let file = path.join(base, p);
    if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

// ---------- Chrome + DevTools Protocol ----------
function findChrome() {
  const list = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean);
  for (const c of list) {
    if (path.isAbsolute(c)) { if (fs.existsSync(c)) return c; continue; }
    const r = spawnSync('which', [c], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

function launch(bin) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fluova-e2e-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--mute-audio', 'about:blank'];
  if (process.env.CI) args.unshift('--no-sandbox'); // GitHub's Ubuntu runners do not allow Chrome's user-namespace sandbox
  const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise((ok, fail) => {
    let buf = '';
    const timer = setTimeout(() => fail(new Error('Chrome did not start:\n' + buf)), 20000);
    proc.stderr.on('data', d => {
      buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); ok({ proc, ws: m[1], profile }); }
    });
    proc.on('error', fail);
  });
}

function connect(url) {
  const ws = new WebSocket(url), pending = new Map(), listeners = new Set();
  let id = 0;
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result); }
    else listeners.forEach(f => f(m));
  };
  const api = {
    send: (method, params = {}, sessionId) => new Promise((ok, fail) => { const i = ++id; pending.set(i, { ok, fail }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); }),
    on: f => { listeners.add(f); return () => listeners.delete(f); },
    close: () => ws.close(),
  };
  return new Promise((ok, fail) => { ws.onopen = () => ok(api); ws.onerror = () => fail(new Error('cannot connect to ' + url)); });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newPage(cdp, origin) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  const problems = [];
  cdp.on(m => {
    if (m.sessionId !== sessionId) return;
    const p = m.params || {};
    if (m.method === 'Runtime.exceptionThrown') problems.push('script error: ' + ((p.exceptionDetails.exception || {}).description || p.exceptionDetails.text));
    if (m.method === 'Log.entryAdded' && p.entry.level === 'error') problems.push(`${p.entry.source}: ${p.entry.text} ${p.entry.url || ''}`.trim());
    if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') problems.push('console.error: ' + p.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Page.javascriptDialogOpening') s('Page.handleJavaScriptDialog', { accept: true });
  });
  await Promise.all([s('Page.enable'), s('Runtime.enable'), s('Log.enable')]);
  // CSP violations are reported to the page as events; collect them (injected scripts are not subject to the page CSP)
  await s('Page.addScriptToEvaluateOnNewDocument', { source:
    "window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' blocked '+e.blockedURI));" });
  const evaluate = async expr => {
    const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text);
    return r.result.value;
  };
  const page = {
    problems, evaluate,
    size: v => s('Emulation.setDeviceMetricsOverride', v),
    async goto(url) {
      const loaded = new Promise(ok => { const off = cdp.on(m => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { off(); ok(); } }); });
      await s('Page.navigate', { url: origin + url }); await loaded; await evaluate('document.fonts.ready.then(()=>1)');
    },
    async reload() {
      const loaded = new Promise(ok => { const off = cdp.on(m => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { off(); ok(); } }); });
      await s('Page.reload', {}); await loaded;
    },
    async waitFor(expr, what, ms = 10000) {
      const end = Date.now() + ms;
      for (;;) { let v; try { v = await evaluate(expr); } catch (e) { v = null; } if (v) return v; if (Date.now() > end) throw new Error('timed out waiting for ' + what); await sleep(100); }
    },
    async csp() { return evaluate('window.__csp||[]'); },
  };
  return page;
}

// ---------- checks ----------
// Fill every Complete the Words box with its widest possible answer and measure it: letters must not scroll inside the box.
const CTW_FIT = `(() => [...document.querySelectorAll(SEL)].map(i => { const n = +i.getAttribute('maxlength') || 2; const v = i.value;
  i.value = 'w'.repeat(n); const over = i.scrollWidth - i.clientWidth; i.value = v; return over > 1 ? (i.getAttribute('aria-label') || i.dataset.id) + ' +' + over + 'px' : null; }).filter(Boolean))()`;

async function main() {
  const bin = findChrome();
  if (!bin) { console.error('✗ Chrome not found. Set CHROME_PATH.'); process.exit(1); }
  for (const f of ['site/dist/index.html', 'content/bank/bank.json']) if (!fs.existsSync(path.join(ROOT, f))) { console.error(`✗ ${f} missing. Run: npm run build`); process.exit(1); }
  const server = await serve(), origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = await launch(bin), cdp = await connect(chrome.ws);
  const results = [];
  const check = async (name, fn) => {
    try { const extra = await fn(); results.push({ name, ok: true }); console.log(`✓ ${name}${extra ? ' — ' + extra : ''}`); }
    catch (e) { results.push({ name, ok: false }); console.log(`✗ ${name}\n    ${String(e.message || e).split('\n').join('\n    ')}`); }
  };
  const clean = async (page, label) => {
    const csp = await page.csp(); const all = [...page.problems.splice(0), ...csp.map(c => 'CSP: ' + c)];
    if (all.length) throw new Error(`${label}:\n` + [...new Set(all)].join('\n'));
  };
  const audit = fs.readFileSync(path.join(ROOT, 'tools', 'layout_audit.js'), 'utf8');

  try {
    const page = await newPage(cdp, origin);

    for (const [label, vp] of [['phone', PHONE], ['desktop', DESKTOP]]) {
      await check(`landing page, ${label} width: layout audit in EN/TR/ES, no errors`, async () => {
        await page.size(vp);
        const found = [];
        for (const lang of ['en', 'tr', 'es']) {
          await page.goto(`/${lang}/`);
          await page.evaluate(audit);
          const r = await page.evaluate(`__audit('${lang}')`);
          if (r.pageOverflow) found.push(`${lang}: page scrolls sideways`);
          r.issues.forEach(i => found.push(`${lang}: ${i}`));
          await clean(page, `/${lang}/`);
        }
        if (found.length) throw new Error(found.join('\n'));
      });
      await check(`landing demo, ${label} width: Complete the Words boxes fit their letters`, async () => {
        await page.goto('/');
        const over = await page.evaluate(CTW_FIT.replace('SEL', "'.ctw input'"));
        if (over.length) throw new Error('letters overflow: ' + over.join(', '));
      });
    }

    await page.size(PHONE);
    let firstBlank;
    await check('test, phone width: Complete the Words boxes fit their letters', async () => {
      await page.goto('/engine/exam.html?test=pilot-01');
      await page.waitFor("document.querySelector('[data-action=next]')", 'the first screen');
      for (let i = 0; i < 4 && !(await page.evaluate("!!document.querySelector('.ctw .blank')")); i++) {
        await page.evaluate("document.querySelector('[data-action=next]').click()"); await sleep(150);
      }
      await page.waitFor("document.querySelector('.ctw .blank')", 'the Complete the Words screen');
      const over = await page.evaluate(CTW_FIT.replace('SEL', "'.ctw .blank'"));
      if (over.length) throw new Error('letters overflow: ' + over.join(', '));
      await clean(page, 'exam');
      return (await page.evaluate("document.querySelectorAll('.ctw .blank').length")) + ' boxes';
    });

    await check('resume after reload: same screen, saved answer, paused-clock notice', async () => {
      firstBlank = await page.evaluate(`(() => { const i = document.querySelector('.ctw .blank'); i.value = 'ab'.slice(0, +i.maxLength);
        i.dispatchEvent(new Event('input', { bubbles: true })); return { id: i.dataset.id, screen: State.screenIndex, section: State.sectionIndex }; })()`);
      await page.reload();
      await page.waitFor("document.querySelector('.resume-note')", 'the resume notice');
      const now = await page.evaluate(`({ screen: State.screenIndex, section: State.sectionIndex, value: (document.querySelector('.blank[data-id="${firstBlank.id}"]') || {}).value })`);
      if (now.screen !== firstBlank.screen || now.section !== firstBlank.section) throw new Error(`resumed at section ${now.section} screen ${now.screen}, expected ${firstBlank.section}/${firstBlank.screen}`);
      if (!now.value) throw new Error('the saved answer was not restored');
      await clean(page, 'exam after reload');
    });

    await check('adaptive routing in the browser: a strong first module leads to the upper module', async () => {
      const r = await page.evaluate(`(() => { const sec = State.form.sections[State.sectionIndex], before = State.screens.length;
        sec.adaptive.routeFrom.forEach(id => { State.answers[id] = FluovaScore.findQuestion(State.form, id).answer; });
        injectStage2(sec); return { path: State._stage2Path, added: State.screens.length - before, expected: sec.adaptive.hard.length }; })()`);
      if (r.path !== 'hard' || r.added !== r.expected) throw new Error('routing went wrong: ' + JSON.stringify(r));
      await clean(page, 'routing');
    });

    await check('finish → results → review in Spanish shows Spanish explanations', async () => {
      await page.evaluate('finishExam()');
      await page.waitFor("location.pathname.endsWith('results.html') && document.readyState === 'complete' && document.body.innerText.length > 200", 'the results page');
      await clean(page, 'results');
      await page.evaluate("localStorage.setItem('fluova_lang', 'es')");
      await page.goto('/engine/review.html?test=pilot-01');
      await page.waitFor("document.querySelectorAll('.why').length > 20", 'the review list');
      // every multiple-choice explanation on the page must be the Spanish text from the bank
      const r = await page.evaluate(`fetch('../content/bank/bank.json').then(r => r.json()).then(bank => {
        const es = new Set(JSON.stringify(bank).match(/"es":"(?:[^"\\\\]|\\\\.)*"/g).map(s => JSON.parse('{' + s + '}').es));
        const whys = [...document.querySelectorAll('.why')].map(w => w.textContent.replace(/^Por qué:\\s*/, ''));
        return { n: whys.length, missing: whys.filter(w => !es.has(w)) };
      })`);
      if (r.missing.length) throw new Error(`${r.missing.length}/${r.n} explanations are not the Spanish text, e.g. ${r.missing[0]}`);
      await clean(page, 'review');
      await page.evaluate("localStorage.removeItem('fluova_lang')");
      return `${r.n} explanations`;
    });

    await check('new test from the question bank builds in the browser and opens', async () => {
      await page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('fluova_seen')).forEach(k => localStorage.removeItem(k))");
      await page.goto('/engine/');
      await page.waitFor("!document.getElementById('newTest').hidden", 'the question bank');
      await page.evaluate("document.getElementById('newBtn').click()");
      await page.waitFor("location.pathname.endsWith('exam.html') && /test=gen-/.test(location.search) && document.querySelector('[data-action=next]')", 'the new test', 20000);
      await clean(page, 'new test');
      return await page.evaluate("new URLSearchParams(location.search).get('test')");
    });

    await check('question builder page loads', async () => {
      await page.goto('/generator/');
      await sleep(300);
      await clean(page, 'generator');
    });
  } finally {
    cdp.close(); chrome.proc.kill(); server.close();
    try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch (e) {}
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(failed ? `\n✗ ${failed} of ${results.length} end-to-end checks failed` : `\n✓ ${results.length} end-to-end checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
