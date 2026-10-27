/* Page script, kept in a file (not inline) so the page can use a strict Content-Security-Policy. */
(function () {
  I18N.apply(); I18N.switcher(document.getElementById('lang'));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const read = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const PILL = { real: '', easy: 'green', medium: 'yellow', hard: 'peach' };

  function tile(x) {
    const done = read('fluova_results_' + x.id), started = !done && read('fluova_progress_' + x.id);
    const max = Math.max(...x.sections.map(s => s.items));
    const bars = x.sections.map(s => `<div class="secbar"><span style="color:var(--ink)">${t('sec.' + s.id)}</span>
      <b style="width:${Math.round(100 * s.items / max)}%"></b><span>${t('idx.items', { n: s.items })} · ${t('idx.min', { n: s.minutes })}</span></div>`).join('');
    const links = done ? `<a href="results.html?test=${x.id}">${t('idx.last')}</a> · <a href="review.html?test=${x.id}">${t('idx.review')}</a>` : '';
    return `<article class="tile">
      <span class="pill ${PILL[x.level] || ''}">${esc(t('level.' + x.level))}</span>
      <h2>${esc(x.title)}</h2>
      <p>${t('idx.minutes', { n: x.minutes })}</p>
      <div class="secbars">${bars}</div>
      <div class="tile-foot">
        <a class="btn btn-primary" href="exam.html?test=${x.id}">${started ? t('idx.resume') : t('idx.start')} →</a>
        ${started ? `<button class="btn btn-sm" data-restart="${x.id}">${t('idx.restart')}</button>` : ''}
        <span class="links small">${links}</span>
        <span class="ver">v${esc(x.version)}</span>
      </div>
    </article>`;
  }

  fetch('../content/tests/index.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(m => {
      const box = document.getElementById('tests'); box.innerHTML = m.tests.map(tile).join('');
      box.addEventListener('click', e => { const b = e.target.closest('[data-restart]'); if (!b) return;
        try { localStorage.removeItem('fluova_progress_' + b.dataset.restart); } catch (err) {} location.href = 'exam.html?test=' + b.dataset.restart; });
    })
    .catch(e => { document.getElementById('tests').innerHTML = `<p class="status-bad">${t('idx.loadFail', { msg: esc(e.message) })}</p>`; });

  // ---------- Single-task practice sets ----------
  const TASKS = [['ctw', 'Reading · Complete the Words'], ['daily_life', 'Reading · Read in Daily Life'], ['academic', 'Reading · Academic Passage'],
    ['choose_response', 'Listening · Choose a Response'], ['conversation', 'Listening · Conversations'], ['announcement', 'Listening · Announcements'], ['talk', 'Listening · Academic Talks'],
    ['build_sentence', 'Writing · Build a Sentence'], ['email', 'Writing · Email'], ['discussion', 'Writing · Academic Discussion'],
    ['listen_repeat', 'Speaking · Listen and Repeat'], ['interview', 'Speaking · Interview']];
  function initDrills(bank, blueprint) {
    const sel = document.getElementById('drillTask'), tier = document.getElementById('drillTier'), msg = document.getElementById('drillMsg');
    sel.innerHTML = TASKS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
    document.getElementById('drillTile').hidden = false;
    document.getElementById('drillBtn').onclick = () => {
      const seen = readJSON('fluova_seen_units', []), label = TASKS.find(x => x[0] === sel.value)[1].split(' · ')[1];
      const r = FluovaForm.assembleDrill(bank, blueprint, { task: sel.value, tier: tier.value, seed: Math.floor(Math.random() * 2 ** 31), exclude: seen, label });
      if (r.error) { msg.innerHTML = `<span class="status-bad">${esc(t('idx.new.fail', { msg: r.error }))}</span>`; return; }
      try { localStorage.setItem('fluova_gen_' + r.test.id, JSON.stringify(r.test)); } catch (e) { msg.textContent = e.message; return; }
      if (r.repeats) msg.innerHTML = `${esc(t('idx.new.repeat', { n: r.repeats }))} <a class="btn btn-sm" href="exam.html?test=${r.test.id}">${t('idx.new.anyway')} →</a>`;
      else location.href = 'exam.html?test=' + r.test.id;
    };
  }

  // ---------- New test from the question bank ----------
  const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const genIds = () => { try { return Object.keys(localStorage).filter(k => k.startsWith('fluova_gen_')).map(k => k.slice(11)); } catch (e) { return []; } };
  function drawGenerated() {
    const ids = genIds();
    document.getElementById('genList').innerHTML = !ids.length ? '' : `<h3 style="margin-top:22px">${t('idx.gen.h')}</h3><p class="small">${t('idx.gen.p')}</p>` +
      ids.map(id => { const done = read('fluova_results_' + id); return `<p class="small"><a href="exam.html?test=${id}">${esc(id)}</a>${done ? ` · <a href="results.html?test=${id}">${t('idx.last')}</a> · <a href="review.html?test=${id}">${t('idx.review')}</a>` : ''}</p>`; }).join('');
  }
  Promise.all(['../content/bank/bank.json', '../content/bank/blueprint.json'].map(u => fetch(u, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })))
    .then(([bank, blueprint]) => {
      document.getElementById('newTest').hidden = false;
      initDrills(bank, blueprint);
      document.getElementById('newP').textContent = t('idx.new.p', { n: bank.units.length });
      drawGenerated();
      const btn = document.getElementById('newBtn'), msg = document.getElementById('newMsg');
      btn.onclick = () => {
        btn.disabled = true; btn.textContent = t('idx.new.building');
        setTimeout(() => {
          const seen = readJSON('fluova_seen_units', []);
          const r = FluovaForm.assemble(bank, blueprint, { seed: Math.floor(Math.random() * 2 ** 31), exclude: seen },
            { bank: FluovaBank, validate: FluovaValidate, lint: FluovaLint });
          btn.disabled = false; btn.textContent = t('idx.new.btn');
          if (r.error || r.high) { msg.innerHTML = `<span class="status-bad">${esc(t('idx.new.fail', { msg: r.error || 'quality gate' }))}</span>`; return; }
          try { localStorage.setItem('fluova_gen_' + r.test.id, JSON.stringify(r.test)); } catch (e) { msg.innerHTML = `<span class="status-bad">${esc(t('idx.new.fail', { msg: e.message }))}</span>`; return; }
          const repeats = r.test.units.filter(u => seen.includes(u)).length;
          if (repeats) { msg.innerHTML = `${esc(t('idx.new.repeat', { n: repeats }))} <a class="btn btn-sm" href="exam.html?test=${r.test.id}">${t('idx.new.anyway')} →</a>`; drawGenerated(); }
          else location.href = 'exam.html?test=' + r.test.id;
        }, 30);
      };
    }).catch(() => {});

  // ---------- Speaking transcription choice ----------
  const radios = [...document.querySelectorAll('input[name="stt"]')], wRow = document.getElementById('whisperRow');
  const wBtn = document.getElementById('whisperBtn'), wMsg = document.getElementById('whisperMsg');
  function syncStt() {
    const m = WhisperSTT.mode(); radios.forEach(r => { r.checked = r.value === m; });
    wRow.hidden = m !== 'whisper';
    if (m === 'whisper' && !WhisperSTT.isReady()) wMsg.textContent = WhisperSTT.isCached() ? t('stt.cached') : '';
  }
  radios.forEach(r => r.addEventListener('change', () => { WhisperSTT.setMode(r.value); syncStt(); }));
  wBtn.onclick = () => {
    wBtn.disabled = true;
    WhisperSTT.load((f, l, tot) => { wMsg.textContent = t('stt.downloading', { p: Math.round(f * 100), l: Math.round(l), t: Math.round(tot) }); })
      .then(() => { wMsg.innerHTML = `<span class="status-ok">${t('stt.ready')}</span>`; })
      .catch(e => { wBtn.disabled = false; wMsg.innerHTML = `<span class="status-bad">${esc(t('stt.fail', { msg: e.message }))}</span>`; WhisperSTT.setMode('browser'); syncStt(); });
  };
  // phones: Whisper is a large download and runs slowly on a phone CPU, so say so up front
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) document.getElementById('sttMobile').hidden = false;
  syncStt();

  document.getElementById('testAudio').onclick = () => {
    const r = document.getElementById('audioResult');
    if (!TTS.available()) { r.innerHTML = `<span class="status-bad">${t('idx.check.noTts')}</span>`; return; }
    r.textContent = t('idx.check.playing');
    TTS.speakOne('This is a sound check for the listening section. If you can hear this clearly, your audio is working.', 'female',
      () => { r.innerHTML = `<span class="status-ok">${t('idx.check.audioOk')}</span>`; });
  };
  document.getElementById('testMic').onclick = async () => {
    const r = document.getElementById('micResult');
    if (!Recorder.supported()) { r.innerHTML = `<span class="status-bad">${t('idx.check.noRec')}</span>`; return; }
    r.textContent = t('idx.check.asking');
    const ok = await Recorder.test();
    r.innerHTML = ok ? `<span class="status-ok">${t('idx.check.micOk')}</span>` : `<span class="status-bad">${t('idx.check.micBad')}</span>`;
  };
})();
