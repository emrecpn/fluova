/* Page script, kept in a file (not inline) so the page can use a strict Content-Security-Policy. */
(function () {
  const SECS = ['reading', 'listening', 'writing', 'speaking'];
  const NAME = { reading: 'Reading', listening: 'Listening', writing: 'Writing', speaking: 'Speaking' };
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const drafts = JSON.parse(store.get('fluova_builder') || '{}');
  let cur = 'reading', last = null, status = {};
  const box = document.getElementById('box'), tabs = document.getElementById('tabs');

  function drawTabs() {
    tabs.innerHTML = SECS.map(s => `<button role="tab" data-s="${s}" aria-selected="${s === cur}">${NAME[s]}<span class="dot ${status[s] || ''}"></span></button>`).join('');
  }
  function show(s) { cur = s; box.value = drafts[s] || ''; box.placeholder = `Paste the ${NAME[s]} JSON here (from prompts/${s}.md)`; drawTabs(); document.getElementById('promptMsg').textContent = ''; }
  tabs.addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (b) show(b.dataset.s); });
  box.addEventListener('input', () => { drafts[cur] = box.value; store.set('fluova_builder', JSON.stringify(drafts)); });
  show(cur);

  document.getElementById('copyPrompt').onclick = async () => {
    const msg = document.getElementById('promptMsg');
    try {
      const md = await (await fetch(`prompts/${cur}.md`)).text();
      const prompt = md.split(/\n---\n/).slice(1).join('\n---\n').trim();
      await navigator.clipboard.writeText(prompt);
      msg.textContent = `✓ ${NAME[cur]} prompt copied`;
    } catch (e) { msg.innerHTML = `Could not copy. Open <a href="prompts/${cur}.md">prompts/${cur}.md</a> instead.`; }
  };

  // Chatbots often wrap JSON in ``` fences or add a sentence before it: keep the outermost {...}
  function parseLoose(txt) {
    const t = txt.replace(/```(?:json)?/gi, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('no JSON object found');
    return JSON.parse(t.slice(a, b + 1));
  }

  document.getElementById('check').onclick = () => {
    const parts = [], findings = [];
    status = {};
    SECS.forEach(s => {
      const txt = (drafts[s] || '').trim();
      if (!txt) return;
      try {
        const obj = parseLoose(txt);
        if (!obj.sections && !obj.id) obj.id = s;
        parts.push(obj);
      } catch (e) { findings.push({ sev: 'error', sec: s, msg: `JSON could not be read: ${e.message}` }); status[s] = 'bad'; }
    });
    const meta = { id: document.getElementById('mId').value.trim(), title: document.getElementById('mTitle').value.trim(),
      level: document.getElementById('mLevel').value, generatedBy: document.getElementById('mBy').value.trim() || undefined };
    if (!/^[a-z0-9-]+$/.test(meta.id)) findings.push({ sev: 'error', sec: 'test', msg: 'test id may only contain a-z, 0-9 and -' });
    const r = FluovaAssemble.assemble(meta, parts, { ctw: FluovaCTW, validate: FluovaValidate, lint: FluovaLint });
    last = r.test;
    r.notes.forEach(n => findings.push({ sev: 'note', sec: 'test', msg: n }));
    r.errors.forEach(e => { const s = SECS.find(x => e.startsWith('section ' + x)); findings.push({ sev: 'error', sec: s || 'test', msg: e }); if (s) status[s] = 'bad'; });
    r.findings.forEach(f => { findings.push(f); if (f.sev === 'high') status[f.sec] = 'bad'; });
    SECS.forEach(s => { if (!status[s] && r.test.sections.some(x => x.id === s)) status[s] = 'ok'; });
    drawTabs();

    const blocking = findings.filter(f => f.sev === 'error' || f.sev === 'high').length;
    const missing = SECS.filter(s => !r.test.sections.some(x => x.id === s));
    document.getElementById('verdict').textContent = blocking
      ? `✗ ${blocking} problem(s) block publishing`
      : missing.length ? `Sections pass so far · still missing: ${missing.map(s => NAME[s]).join(', ')}` : '✓ Passes the quality gate';
    const order = { error: 0, high: 1, med: 2, low: 3, note: 4 };
    document.getElementById('findings').innerHTML = findings.sort((a, b) => order[a.sev] - order[b.sev])
      .map(f => `<div class="find ${f.sev}"><span class="sev">${f.sev}</span><span><strong>${esc(NAME[f.sec] || f.sec)}</strong> · ${esc(f.msg)}</span></div>`).join('')
      || '<p class="small">No findings.</p>';
    const m = r.metrics, keys = Object.keys(m).filter(k => k !== 'form');
    document.getElementById('metrics').innerHTML = `<table><tr>${keys.map(k => `<th>${esc(k)}</th>`).join('')}</tr><tr>${keys.map(k => `<td>${esc(m[k])}</td>`).join('')}</tr></table>`;
    const out = document.getElementById('out'); out.hidden = false; out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  document.getElementById('preview').onclick = () => {
    if (!last) return;
    store.set('fluova_draft', JSON.stringify(last));
    window.open('../engine/exam.html?test=draft', '_blank');
  };
  document.getElementById('download').onclick = () => {
    if (!last) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(last, null, 1) + '\n'], { type: 'application/json' }));
    a.download = last.id + '.json'; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
})();
