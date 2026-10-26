/* engine.js — Fluova sınav motoru (TOEFL® iBT 2026 formatı için deneme sınavı)
   Bölüm sırası, süre, görev render, adaptif yönlendirme, otomatik puanlama. */

const State = {
  form: null,
  sectionIndex: 0,
  screens: [],            // aktif bölümün ekranları (adaptif dahil)
  screenIndex: 0,
  stage2Injected: false,
  answers: {},            // qid -> cevap
  recordings: {},         // "s_iv_1" -> url
  transcripts: {},        // "s_iv_1" -> konuşma dökümü (speech-to-text)
  speechMeta: {},         // "s_iv_1" -> {seconds, wordCount, wpm, repetitions, confidence}
  writing: {},            // taskId -> metin
  buildSentence: {},      // id -> {given, correct}
  remaining: 0,           // aktif bölüm kalan saniye
  timerHandle: null,
  results: null,
};

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = s => (s == null ? '' : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
const fmt = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), r = s % 60; return `${m}:${String(r).padStart(2, '0')}`; };
// Şık sırasını rastgele göster (konum yanlılığını önler). value=orijinal indeks kalır → puanlama bozulmaz.
function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------------- Boot ---------------- */
function startExam(form) {
  State.form = form;
  if (window.WhisperSTT && WhisperSTT.mode() === 'whisper') WhisperSTT.load().catch(() => {});
  // remember the question-bank units shown, so "New test" can prefer unseen ones
  try {
    const seen = new Set(JSON.parse(localStorage.getItem('fluova_seen_units') || '[]'));
    (form.units || []).forEach(u => seen.add(u));
    localStorage.setItem('fluova_seen_units', JSON.stringify([...seen]));
  } catch (e) {}
  State.sectionIndex = 0;
  loadSection(0);
}

function loadSection(i) {
  const sec = State.form.sections[i];
  State.sectionIndex = i;
  State.screenIndex = 0;
  State.stage2Injected = false;
  State.screens = [{ type: 'section_intro', sec }].concat(sec.screens.map(s => ({ ...s })));
  State.remaining = sec.minutes * 60;
  startTimer();
  render();
}

function startTimer() {
  clearInterval(State.timerHandle);
  State.timerHandle = setInterval(() => {
    State.remaining--;
    updateTimerUI();
    if (State.remaining <= 0) { clearInterval(State.timerHandle); nextSection(true); }
  }, 1000);
}

function updateTimerUI() {
  const t = $('#timer');
  if (!t) return;
  t.textContent = fmt(State.remaining);
  t.classList.toggle('low', State.remaining <= 60);
}

/* ---------------- Navigation ---------------- */
function currentSection() { return State.form.sections[State.sectionIndex]; }

function next() {
  TTS.stop();
  const sec = currentSection();
  // Adaptif: çekirdek ekranlar bittiğinde Stage 2 modülünü enjekte et
  const coreCount = sec.screens.length; // + 1 intro at front
  if (sec.adaptive && !State.stage2Injected && State.screenIndex === coreCount) {
    injectStage2(sec);
  }
  if (State.screenIndex < State.screens.length - 1) {
    State.screenIndex++;
    render();
  } else {
    nextSection(false);
  }
}

function back() {
  const sec = currentSection();
  if (sec.oneWay) return;
  if (State.screenIndex > 0) { State.screenIndex--; TTS.stop(); render(); }
}

function nextSection(auto) {
  clearInterval(State.timerHandle);
  TTS.stop();
  if (State.sectionIndex < State.form.sections.length - 1) {
    if (!auto) {
      const sec = currentSection();
      if (!confirm(t('ex.confirmNextSection', { name: sec.name }))) { startTimer(); return; }
    }
    loadSection(State.sectionIndex + 1);
  } else {
    finishExam();
  }
}

function injectStage2(sec) {
  const a = sec.adaptive;
  let raw = 0;
  a.routeFrom.forEach(qid => { if (isCorrect(qid)) raw++; });
  const path = raw >= a.threshold ? 'hard' : 'easy';
  State._stage2Path = path;
  State.screens = State.screens.concat(a[path].map(s => ({ ...s })));
  State.stage2Injected = true;
  // İstenirse görünmez rota bilgisi sakla (puanlamada kullanılacak)
  State['_' + sec.id + '_path'] = path;
}

/* ---------------- Render dispatch ---------------- */
function render() {
  const sec = currentSection();
  const scr = State.screens[State.screenIndex];
  renderTopbar(sec, scr);
  const stage = $('#stage');
  stage.innerHTML = '';
  const map = {
    section_intro: renderIntro, passage: renderPassage, ctw: renderCTW,
    text_chain: renderTextChain, insert_text: renderInsertText,
    choose_response: renderChooseResponse, listening: renderListening,
    build_sentence: renderBuildSentence, sentence_dialogue: renderSentenceDialogue, writing: renderWriting,
    listen_repeat: renderListenRepeat, interview: renderInterview,
  };
  // Footer'ı ekran içeriğinden ÖNCE çiz: Speaking görevleri "İleri/Bölümü Bitir"i
  // devre dışı bırakabilsin (yoksa footer sonradan çizilip butonu tekrar aktif ediyordu).
  renderFooter(sec, scr);
  (map[scr.type] || renderUnknown)(stage, scr, sec);
  window.scrollTo(0, 0);
  saveProgress();
}

function renderTopbar(sec, scr) {
  const bar = $('#topbar');
  const qInfo = scr.type === 'section_intro' ? '' :
    `<span class="qcount">${sec.name} · ${t('ex.section', { i: State.sectionIndex + 1, n: State.form.sections.length })}</span>`;
  bar.innerHTML = `
    <div class="sec">${esc(State.form.title)}</div>
    <div class="mid">${qInfo}<span id="timer" class="timer">${fmt(State.remaining)}</span></div>
    <div class="tools">
      <button onclick="if(confirm(t('ex.confirmFinish')))finishExam()">${t('ex.finish')}</button>
    </div>`;
  updateTimerUI();
}

function renderFooter(sec, scr) {
  const f = $('#footer');
  const isIntro = scr.type === 'section_intro';
  const atLast = State.screenIndex >= State.screens.length - 1;
  const backBtn = (!sec.oneWay && !isIntro && State.screenIndex > 0)
    ? `<button class="btn btn-ghost" onclick="back()">${t('ex.back')}</button>` : `<span></span>`;
  const nextLabel = isIntro ? t('ex.startSection') : (atLast ? t('ex.finishSection') : t('ex.next'));
  f.innerHTML = `
    <div class="left">${sec.oneWay && !isIntro ? '⚠ ' + t('ex.noReturn') : ''}</div>
    <div>${backBtn}
      <button id="nextBtn" class="btn btn-primary" onclick="next()">${nextLabel}</button></div>`;
}

/* ---------------- Screen renderers ---------------- */
function renderUnknown(stage, scr) { stage.innerHTML = `<div class="card">${t('ex.unknown', { type: esc(scr.type) })}</div>`; }

function renderIntro(stage, scr) {
  const sec = scr.sec;
  stage.innerHTML = `<div class="card">
    <h1 class="sec-title">${esc(sec.name)}</h1>
    <div class="directions">${tx(sec.intro) || ''}</div>
    <p class="small">${t('ex.time', { n: sec.minutes })} ${sec.oneWay ? t('ex.oneWay') : t('ex.twoWay')}</p>
    <p class="small" style="margin:18px 0 0;opacity:.8">${t('disclaimer')}</p>
  </div>`;
}

/* Passage + soaru seti (Daily Life kısa, Academic uzun) */
function renderPassage(stage, scr) {
  const qs = scr.questions.map((q, idx) => qBlockMCQ(q, idx + 1)).join('');
  stage.innerHTML = `<div class="card">
    ${scr.directions ? `<div class="directions">${scr.directions}</div>` : ''}
    <div class="split">
      <div class="passage">
        <h3>${esc(scr.title || 'Reading Passage')}</h3>
        ${scr.text.map(p => `<p>${p}</p>`).join('')}
      </div>
      <div class="questions">${qs}</div>
    </div>
  </div>`;
  attachMCQ(stage);
}

function qBlockMCQ(q, n) {
  if (!q._display) q._display = shuffleArr(q.options.map((_, i) => i));
  const opts = q._display.map((oi, pos) => {
    const letter = 'ABCD'[pos];
    const checked = State.answers[q.id] === oi ? 'checked' : '';
    const sel = State.answers[q.id] === oi ? 'selected' : '';
    return `<label class="opt ${sel}" data-qid="${q.id}">
      <input type="radio" name="q_${q.id}" value="${oi}" ${checked}>
      <span class="letter">${letter}</span><span class="lbl">${q.options[oi]}</span></label>`;
  }).join('');
  return `<div class="qitem" style="margin-bottom:24px">
    <p class="qstem"><span class="qnum">${n}.</span>${q.stem}</p>${opts}</div>`;
}

function attachMCQ(root) {
  root.querySelectorAll('.opt input[type=radio]').forEach(inp => {
    inp.addEventListener('change', e => {
      const lab = e.target.closest('.opt'); const qid = lab.dataset.qid;
      State.answers[qid] = parseInt(e.target.value, 10);
      root.querySelectorAll(`.opt[data-qid="${qid}"]`).forEach(l => l.classList.remove('selected'));
      lab.classList.add('selected');
      saveProgress();
    });
  });
}

/* Complete the Words */
function renderCTW(stage, scr) {
  let html = scr.text.map(p =>
    `<p>${p.replace(/\{\{(\w+)\}\}/g, (m, id) => {
      const it = scr.items.find(x => x.id === id);
      const val = State.answers[id] || '';
      // Kutu, eksik harf sayısı kadar geniş + o kadar harfe sınırlı (gerçek testteki gibi)
      return `<span class="stub">${esc(it.stub)}</span><input class="blank" data-id="${id}" value="${esc(val)}" maxlength="${it.answer.length}" placeholder="${'_'.repeat(it.answer.length)}" autocomplete="off" spellcheck="false">`;
    })}</p>`).join('');
  stage.innerHTML = `<div class="card ctw">
    <div class="directions"><strong>Complete the Words.</strong> ${tx(scr.directions) || t('ctw.dir')}</div>
    <h3>${esc(scr.title || '')}</h3>
    ${html}</div>`;
  stage.querySelectorAll('.blank').forEach(inp => {
    const n = parseInt(inp.getAttribute('maxlength'), 10) || 6;
    inp.style.width = ((n + 1) * 13) + 'px';
    inp.style.fontFamily = 'ui-monospace,Menlo,Consolas,monospace';
    inp.style.letterSpacing = '3px';
    inp.addEventListener('input', e => { State.answers[e.target.dataset.id] = e.target.value.trim(); saveProgress(); });
  });
}

/* Listen & Choose a Response */
function renderChooseResponse(stage, scr) {
  if (!scr._display) scr._display = shuffleArr(scr.options.map((_, i) => i));
  const opts = scr._display.map((oi, pos) => {
    const sel = State.answers[scr.id] === oi ? 'selected' : '';
    const checked = State.answers[scr.id] === oi ? 'checked' : '';
    return `<label class="opt ${sel}" data-qid="${scr.id}">
      <input type="radio" name="q_${scr.id}" value="${oi}" ${checked}>
      <span class="letter">${'ABCD'[pos]}</span><span class="lbl">${scr.options[oi]}</span></label>`;
  }).join('');
  stage.innerHTML = `<div class="card">
    <div class="directions"><strong lang="en">Listen and Choose a Response.</strong> ${t('cr.dir')}</div>
    ${audioBoxHTML(t('cr.play'))}
    <div id="crQuestions" class="hidden"><p class="qstem">Choose the best response:</p>${opts}</div>
  </div>`;
  wireAudio(stage, scr.audio, () => { stage.querySelector('#crQuestions').classList.remove('hidden'); });
  attachMCQ(stage);
}

/* Conversation / Announcement / Academic Talk */
function renderListening(stage, scr) {
  stage.innerHTML = `<div class="card">
    <div class="directions"><strong>${esc(scr.title || 'Listening')}</strong> — ${t('li.dir')}</div>
    ${audioBoxHTML(scr.prompt || t('li.play'))}
    <div style="margin:14px 0"><textarea class="essay notes" placeholder="${t('li.notes')}"></textarea></div>
    <div id="lsQuestions" class="hidden">${scr.questions.map((q, i) => qBlockMCQ(q, i + 1)).join('')}</div>
  </div>`;
  wireAudio(stage, scr.audio, () => { stage.querySelector('#lsQuestions').classList.remove('hidden'); });
  attachMCQ(stage);
}

function audioBoxHTML(label) {
  return `<div class="audio-box">
    <button class="play-btn" id="playBtn">▶ ${esc(label)}</button>
    <div class="equalizer" id="eq"><span></span><span></span><span></span><span></span><span></span></div>
    <div class="audio-status" id="audioStatus"></div>
  </div>`;
}

function wireAudio(root, lines, onDone) {
  const btn = root.querySelector('#playBtn');
  const eq = root.querySelector('#eq');
  const status = root.querySelector('#audioStatus');
  let played = false;
  btn.addEventListener('click', () => {
    if (played) return;
    played = true; btn.disabled = true; btn.textContent = t('au.playing');
    eq.classList.add('on'); status.textContent = '';
    TTS.speakScript(lines, {
      onDone: () => { eq.classList.remove('on'); btn.textContent = t('au.done'); status.textContent = t('au.answerNow'); onDone && onDone(); }
    });
  });
}

/* Build a Sentence */
function renderBuildSentence(stage, scr) {
  const saved = State.buildSentence[scr.id];
  stage.innerHTML = `<div class="card">
    <div class="directions"><strong lang="en">Build a Sentence.</strong> ${t('bs.dir')}</div>
    <p class="qstem">${scr.prompt}</p>
    <div class="bas-target" id="basTarget"></div>
    <div class="bas-bank" id="basBank"></div>
    <p class="small mt">${t('bs.hintAll')}</p>
  </div>`;
  const bank = stage.querySelector('#basBank');
  const target = stage.querySelector('#basTarget');
  const order = saved ? saved.order.slice() : [];
  // Kelimeleri bir kez karıştır (yeniden çizimde sabit kalsın)
  if (!scr._shuffle) {
    scr._shuffle = scr.words.map((_, i) => i);
    for (let i = scr._shuffle.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[scr._shuffle[i], scr._shuffle[j]] = [scr._shuffle[j], scr._shuffle[i]]; }
  }
  function redraw() {
    target.innerHTML = ''; bank.innerHTML = '';
    order.forEach((wi) => {
      const c = el('span', 'chip', esc(scr.words[wi]));
      c.onclick = () => { order.splice(order.indexOf(wi), 1); commit(); };
      target.appendChild(c);
    });
    scr._shuffle.forEach((i) => {
      const c = el('span', 'chip' + (order.includes(i) ? ' used' : ''), esc(scr.words[i]));
      if (!order.includes(i)) c.onclick = () => { order.push(i); commit(); };
      bank.appendChild(c);
    });
  }
  function commit() {
    State.buildSentence[scr.id] = { order: order.slice(), given: order.map(i => scr.words[i]).join(' '), correct: scr.answer };
    saveProgress(); redraw();
  }
  redraw();
}

/* Build a Sentence — GERÇEK 2026 FORMATI: A konuşur/sorar, B'nin yanıtını
   kelime bankasından (fazladan çeldirici kelimelerle) sırayla kur.
   scr.frame (ETS Practice Test 1 formatı): cümle iskeleti; null = boşluk, diğerleri önceden yerleşik
   kelimeler. Kutucuklar kelime grubu olabilir ("showed us around"); çeldirici genelde 0–1. */
function basFill(scr, chunks) {
  if (!scr.frame) return chunks.join(' ');
  let k = 0;
  return scr.frame.map(t => (t === null ? (chunks[k++] || '____') : t)).join(' ').replace(/\s+([?.!,])/g, '$1');
}
function renderSentenceDialogue(stage, scr) {
  const saved = State.buildSentence[scr.id];
  stage.innerHTML = `<div class="card">
    <div class="directions"><strong lang="en">Build a Sentence.</strong> ${scr.frame ? t('sd.dirFrame') : t('sd.dirBank')}</div>
    <div class="chat">
      <div class="bubble left"><span class="who">A</span>${scr.personA}</div>
      <div class="bubble right"><span class="who">B</span><span id="bResp" class="bresp"><em>${t('sd.build')}</em></span></div>
    </div>
    <div class="bas-bank" id="basBank" style="margin-top:16px"></div>
    ${scr.frame ? '' : `<p class="small mt">${t('sd.hintBank')}</p>`}
  </div>`;
  const bank = stage.querySelector('#basBank');
  const bResp = stage.querySelector('#bResp');
  // banka = doğru cevap + çeldiriciler (bir kez karıştır)
  const pool = scr.answer.concat(scr.distractors || []);
  if (!scr._shuffle) {
    scr._shuffle = pool.map((_, i) => i);
    for (let i = scr._shuffle.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[scr._shuffle[i], scr._shuffle[j]] = [scr._shuffle[j], scr._shuffle[i]]; }
  }
  const order = saved ? saved.order.slice() : []; // seçilen banka indeksleri, sırayla
  const slots = scr.frame ? scr.frame.filter(t => t === null).length : Infinity;
  function commit() {
    const given = basFill(scr, order.map(i => pool[i]));
    State.buildSentence[scr.id] = { order: order.slice(), given, correct: basFill(scr, scr.answer), accept: scr.accept, dialogue: true };
    saveProgress(); redraw();
  }
  function chipFor(pi) {
    const c = el('span', 'chip', esc(pool[pi]));
    c.onclick = () => { order.splice(order.indexOf(pi), 1); commit(); };
    return c;
  }
  function redraw() {
    // B yanıtı — iskeletli formatta sabit kelimeler + boşluklar
    if (scr.frame) {
      bResp.innerHTML = ''; let k = 0;
      scr.frame.forEach(t => {
        if (t !== null) { bResp.appendChild(el('span', 'fixed', esc(t))); return; }
        const pi = order[k++];
        bResp.appendChild(pi != null ? chipFor(pi) : el('span', 'slot', '_____'));
      });
    } else if (order.length) {
      bResp.innerHTML = '';
      order.forEach(pi => {
        const c = el('span', 'chip', esc(pool[pi]));
        c.onclick = () => { order.splice(order.indexOf(pi), 1); commit(); };
        bResp.appendChild(c);
      });
    } else { bResp.innerHTML = `<em>${t('sd.build')}</em>`; }
    // banka
    bank.innerHTML = '';
    scr._shuffle.forEach(pi => {
      const used = order.includes(pi);
      const c = el('span', 'chip' + (used ? ' used' : ''), esc(pool[pi]));
      if (!used) c.onclick = () => { if (order.length < slots) { order.push(pi); commit(); } };
      bank.appendChild(c);
    });
  }
  redraw();
}

/* Read in Daily Life — Text Chain (sohbet/mesajlaşma) formatı */
function renderTextChain(stage, scr) {
  const bubbles = scr.messages.map((m, i) => {
    const side = i % 2 === 0 ? 'left' : 'right';
    return `<div class="bubble ${side}"><span class="who">${esc(m.from)}</span>${m.text}</div>`;
  }).join('');
  const qs = scr.questions.map((q, i) => qBlockMCQ(q, i + 1)).join('');
  stage.innerHTML = `<div class="card">
    <div class="directions"><strong lang="en">Read in Daily Life — Text Chain.</strong> ${tx(scr.directions) || t('tc.dir')}</div>
    <div class="split">
      <div class="passage"><div class="chat">${bubbles}</div></div>
      <div class="questions">${qs}</div>
    </div>
  </div>`;
  attachMCQ(stage);
}

/* Reading: Insert Text — verilen cümlenin pasajda en iyi oturduğu yeri seç */
function renderInsertText(stage, scr) {
  const sel = State.answers[scr.id];
  const body = scr.paragraph.replace(/\[\[(\d+)\]\]/g, (m, num) => {
    const n = parseInt(num, 10);
    return sel === n
      ? `<span class="insslot chosen" data-n="${n}">▣ <em>${esc(scr.sentence)}</em> </span>`
      : `<span class="insslot" data-n="${n}" title="+">▢</span>`;
  });
  stage.innerHTML = `<div class="card">
    <div class="directions"><strong lang="en">Insert Text.</strong> ${tx(scr.directions) || t('it.dir')}</div>
    <div class="ins-sentence">➤ <strong>${t('it.add')}</strong> ${esc(scr.sentence)}</div>
    <div class="passage" style="max-height:none;border:none;padding-right:0">${scr.title ? `<h3 style="margin-top:0">${esc(scr.title)}</h3>` : ''}${body}</div>
  </div>`;
  stage.querySelectorAll('.insslot').forEach(s => {
    s.onclick = () => { State.answers[scr.id] = parseInt(s.dataset.n, 10); saveProgress(); renderInsertText(stage, scr); };
  });
}

/* Writing: email (7dk) / academic discussion (10dk) */
function renderWriting(stage, scr) {
  const val = State.writing[scr.id] || '';
  let context = '';
  if (scr.kind === 'discussion') {
    context = `<div class="context">
      <p><strong>Professor ${esc(scr.professor.name)}:</strong> ${scr.professor.post}</p>
      ${scr.students.map(s => `<p><strong>${esc(s.name)}:</strong> ${s.post}</p>`).join('')}</div>`;
  } else {
    context = `<div class="context">
      <p>${scr.scenario}</p></div>`;
  }
  stage.innerHTML = `<div class="card">
    <div class="directions"><strong lang="en">${scr.kind === 'email' ? 'Write an Email' : 'Writing for an Academic Discussion'}</strong> — ${t('wr.time', { n: scr.minutes })} ${tx(scr.wordTarget) || ''}</div>
    <p class="qstem">${scr.prompt}</p>
    ${context}
    <textarea class="essay" id="essay" placeholder="${t('wr.placeholder')}">${esc(val)}</textarea>
    <div class="wordcount" id="wc">${t('wr.words', { n: 0 })}</div>
  </div>`;
  const ta = stage.querySelector('#essay'); const wc = stage.querySelector('#wc');
  const upd = () => { const n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0; wc.textContent = t('wr.words', { n }); State.writing[scr.id] = ta.value; saveProgress(); };
  ta.addEventListener('input', upd); upd();
}

/* ETS 2026 şartnamesi: her Speaking görevi bir senaryo tanıtımıyla (sesli + yazılı) başlar.
   scr.scenario = { title, intro, place? } — yoksa eski davranış (senaryosuz) korunur. */
function scenarioCardHTML(sc) {
  if (!sc) return '';
  // lang="en": sayfa lang="tr" olduğundan büyük harf dönüşümü "i"yi "İ" yapıyordu (SCENARİO)
  return `<div class="directions scenario" lang="en">
    <div class="small eyebrow">Scenario${sc.place ? ' · ' + esc(sc.place) : ''}</div>
    <div><strong>${esc(sc.title)}</strong></div><div>${esc(sc.intro)}</div></div>`;
}
const withIntro = (sc, i, audio) => (sc && i === 0 ? [{ text: sc.intro, voice: 'neutral' }, ...audio] : audio);

/* Speaking: Listen & Repeat */
function renderListenRepeat(stage, scr) {
  stage.innerHTML = `<div class="card center">
    <div class="directions" style="text-align:left"><strong lang="en">Listen and Repeat.</strong> ${t('lr.dir')}</div>
    ${scenarioCardHTML(scr.scenario)}
    <p class="qstem" id="lrCount"></p>
    ${audioBoxHTML(t('lr.play'))}
    <div id="recArea" class="mt"></div>
  </div>`;
  runSpeakingItems(stage, scr.sentences.map((s, i) => ({
    label: `Sentence ${i + 1} of ${scr.sentences.length}`, audio: withIntro(scr.scenario, i, [{ text: s, voice: scr.voice || 'neutral' }]),
    // Gerçek sınav: 8–12 sn yanıt penceresi, cümle uzunluğuyla artar
    respSeconds: Math.min(12, Math.max(8, Math.round(s.split(/\s+/).length * 0.8))),
    prep: 0, key: `${scr.id}_${i}`, target: s, kind: 'repeat'
  })), '#lrCount', '#recArea', stage.querySelector('#playBtn'));
}

/* Speaking: Interview — tek konu, olgusal → görüş/tahmin ilerlemesi (ETS şartnamesi) */
function renderInterview(stage, scr) {
  const intro = scr.scenario ? '' : esc(scr.topicIntro || '');
  stage.innerHTML = `<div class="card center">
    <div class="directions" style="text-align:left"><strong lang="en">Take an Interview.</strong> ${intro} ${t('iv.dir')}</div>
    ${scenarioCardHTML(scr.scenario)}
    <p class="qstem" id="ivCount"></p>
    ${audioBoxHTML(t('iv.listen'))}
    <div id="recArea" class="mt"></div>
  </div>`;
  runSpeakingItems(stage, scr.questions.map((q, i) => ({
    label: `Question ${i + 1} of ${scr.questions.length}`, text: q.text, audio: withIntro(scr.scenario, i, [{ text: q.text, voice: scr.interviewerVoice || 'female' }]),
    respSeconds: q.respSeconds || 45, prep: q.prep || 3, key: `${scr.id}_${i}`, question: q.text, kind: 'interview'
  })), '#ivCount', '#recArea', stage.querySelector('#playBtn'));
}

/* Konuşma öğelerini sırayla yürütür: dinle → (hazırlık) → kaydet → oynat → sonraki */
function runSpeakingItems(stage, items, countSel, areaSel, playBtn) {
  let idx = 0;
  const countEl = stage.querySelector(countSel);
  const area = stage.querySelector(areaSel);
  const status = stage.querySelector('#audioStatus');
  const eq = stage.querySelector('#eq');
  const nextBtnDisable = v => { const b = $('#nextBtn'); if (b) b.disabled = v; };

  function show() {
    nextBtnDisable(true);
    const it = items[idx];
    countEl.textContent = it.label;   // soru metni dinlemeden önce gösterilmez (gerçek sınavdaki gibi)
    area.innerHTML = `<p class="small">${t('iv.pressListen')}</p>`;
    playBtn.disabled = false; playBtn.textContent = '▶ ' + t('iv.listen');
    playBtn.onclick = () => {
      playBtn.disabled = true; playBtn.textContent = t('au.playing'); eq.classList.add('on'); status.textContent = '';
      TTS.speakScript(it.audio, { onDone: () => { eq.classList.remove('on'); status.textContent = ''; afterListen(it); } });
    };
  }

  function afterListen(it) {
    if (it.kind === 'interview' && it.text) countEl.textContent = it.label + ' — "' + it.text + '"';
    if (it.prep && it.prep > 0) {
      let p = it.prep;
      area.innerHTML = `<p>${t('sp.prep', { t: `<span class="prep-timer" id="pt">${p}</span>` })}</p>`;
      const h = setInterval(() => { p--; stage.querySelector('#pt').textContent = p; if (p <= 0) { clearInterval(h); record(it); } }, 1000);
    } else { record(it); }
  }

  async function record(it) {
    // Whisper mode (chosen on the start page): no browser speech service; the recording is transcribed on the device
    const useW = !!(window.WhisperSTT && WhisperSTT.mode() === 'whisper');
    const stt = !useW && STT.supported() ? STT.createSession() : null;
    let rec = null;
    if (Recorder.supported()) {
      try { await Recorder.start(); }
      catch (e) { /* kayıt olmasa da speech-to-text ile devam */ }
    }
    if (stt) stt.start();
    const t0 = Date.now();
    let left = it.respSeconds;
    const sttNote = useW ? `<span class="small">${t('sp.whisperNote')}</span>` : stt ? `<span class="small">${t('sp.stt')}</span>` : `<span class="small status-bad">${t('sp.noStt')}</span>`;
    area.innerHTML = `<p><span class="record-dot on"></span><strong>${t('sp.recording')}</strong> <span class="resp-timer" id="rt">${left}</span> s</p>
      <p>${sttNote}</p>
      <button class="btn btn-ghost" id="stopEarly">${t('sp.stopEarly')}</button>`;
    let finished = false;
    const finish = async () => {
      if (finished) return; finished = true;
      clearInterval(h);
      rec = Recorder.supported() ? await Recorder.stop() : null;
      const sttRes = stt ? await stt.stop() : { transcript: '', confidence: null, pending: useW && !!rec };
      const seconds = Math.max(1, Math.round((Date.now() - t0) / 1000));
      done(it, rec, sttRes, seconds);
      if (sttRes.pending) queueWhisper(it, rec.blob, seconds);
    };
    const h = setInterval(() => { left--; const r = stage.querySelector('#rt'); if (r) r.textContent = left; if (left <= 0) finish(); }, 1000);
    const se = stage.querySelector('#stopEarly'); if (se) se.onclick = finish;
  }

  function queueWhisper(it, blob, seconds) {
    State.sttPending = (State.sttPending || 0) + 1;
    State.sttQueue = (State.sttQueue || Promise.resolve()).then(() => WhisperSTT.transcribe(blob)).then(text => {
      State.transcripts[it.key] = text;
      State.speechMeta[it.key] = speechMetrics(text, seconds, null);
      const tx = document.getElementById('tx_' + it.key), acc = document.getElementById('acc_' + it.key);
      if (tx) tx.innerHTML = text ? esc(text) : `<em>${t('sp.nothing')}</em>`;
      if (acc && it.kind === 'repeat') acc.textContent = Math.round(similarity(text, it.target) * 100) + '%';
      const mm = document.getElementById('m_' + it.key), m = State.speechMeta[it.key];
      if (mm && m) mm.textContent = '📊 ' + t('sp.metrics', { w: m.wordCount || 0, wpm: m.wpm || 0, r: m.repetitions || 0 });
    }).catch(() => {
      const tx = document.getElementById('tx_' + it.key); if (tx) tx.innerHTML = `<em>${t('sp.whisperFailed')}</em>`;
    }).finally(() => { State.sttPending--; saveProgress(); });
  }

  function done(it, rec, sttRes, seconds) {
    const transcript = (sttRes && sttRes.transcript) || '';
    if (rec) State.recordings[it.key] = rec.url;
    State.transcripts[it.key] = transcript;
    State.speechMeta[it.key] = speechMetrics(transcript, seconds, sttRes && sttRes.confidence);
    let html = `<p class="status-ok">${t('sp.saved')}</p>`;
    if (it.kind === 'repeat') {
      const acc = similarity(transcript, it.target);
      html += `<div class="directions" style="text-align:left">
        <div><strong>${t('sp.target')}</strong> ${esc(it.target)}</div>
        <div><strong>${t('sp.heard')}</strong> <span id="tx_${it.key}">${sttRes.pending ? `<em>${t('sp.whisperWorking')}</em>` : transcript ? esc(transcript) : `<em>${t('sp.nothing')}</em>`}</span></div>
        <div><strong>${t('sp.accuracy')}</strong> <span id="acc_${it.key}">${sttRes.pending ? '…' : Math.round(acc * 100) + '%'}</span></div></div>`;
    } else if (it.kind === 'interview') {
      const m = State.speechMeta[it.key] || {};
      html += `<div class="directions" style="text-align:left">
        <div><strong>${t('sp.heardAnswer')}</strong> <span id="tx_${it.key}">${sttRes.pending ? `<em>${t('sp.whisperWorking')}</em>` : transcript ? esc(transcript) : `<em>${t('sp.nothing')}</em>`}</span></div>
        <div class="small mt" id="m_${it.key}">📊 ${t('sp.metrics', { w: m.wordCount || 0, wpm: m.wpm || 0, r: m.repetitions || 0 })}${m.confidence != null ? ' · ' + t('sp.clarity', { n: Math.round(m.confidence * 100) }) : ''}</div></div>`;
    }
    if (rec) html += `<div style="margin:8px 0"><audio controls src="${rec.url}"></audio></div>`;
    if (idx < items.length - 1) {
      html += `<button class="btn btn-primary" id="nextItem">${t('ex.next')}</button>`;
    } else if (it.kind === 'interview') {
      // Speaking'in SON ekranı → tüm kayıtların indirme linklerini burada topla (sınav süresince uğraştırma)
      const keys = Object.keys(State.recordings);
      const dls = keys.map(k => `<a class="btn btn-ghost btn-sm" href="${State.recordings[k]}" download="speaking_${k}.webm">⬇ ${esc(k)}</a>`).join(' ');
      html += `<p class="small">${t('sp.allDone')}</p>`;
      if (dls) html += `<div class="directions" style="text-align:left"><strong>${t('sp.download')}</strong> (${t('sp.downloadNote')}):<div class="mt">${dls}</div></div>`;
      html += `<p class="small mt">${t('sp.finishHint')}</p>`;
      nextBtnDisable(false);
    } else {
      html += `<p class="small">${t('sp.taskDone')}</p>`;
      nextBtnDisable(false);
    }
    area.innerHTML = html;
    const ni = stage.querySelector('#nextItem');
    if (ni) ni.onclick = () => { idx++; show(); };
    saveProgress();
  }

  show();
}

/* ---------------- Scoring ---------------- */
function isCorrect(qid) {
  const q = findQuestion(qid);
  if (!q) return false;
  if (q.type === 'ctw') {
    const val = (State.answers[qid] || '').toLowerCase().replace(/[^a-z]/g, '');
    return val === (q.answer || '').toLowerCase();
  }
  return State.answers[qid] === q.answer;
}

// İki metin arasında kelime düzeyinde basit benzerlik (0..1) — Listen & Repeat için
function similarity(said, target) {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const a = norm(said), b = norm(target);
  if (!b.length) return 0;
  const bcount = {}; b.forEach(w => bcount[w] = (bcount[w] || 0) + 1);
  let match = 0;
  a.forEach(w => { if (bcount[w] > 0) { match++; bcount[w]--; } });
  return Math.min(1, match / b.length);
}

// Konuşma akıcılığı ölçümleri (objektif Delivery göstergeleri)
function speechMetrics(transcript, seconds, confidence) {
  const words = (transcript || '').trim().split(/\s+/).filter(Boolean);
  const wc = words.length;
  const wpm = seconds > 0 ? Math.round(wc / (seconds / 60)) : 0;
  let reps = 0;
  const fillers = /^(um|uh|er|ah|like)$/i;
  for (let i = 0; i < words.length; i++) {
    if (i > 0 && words[i].toLowerCase() === words[i - 1].toLowerCase()) reps++;
    else if (fillers.test(words[i])) reps++;
  }
  return { seconds, wordCount: wc, wpm, repetitions: reps, confidence: (confidence != null ? confidence : null) };
}

function findQuestion(qid) {
  // Tüm bölümlerdeki soruları düz liste olarak arar (adaptif dahil)
  for (const sec of State.form.sections) {
    const pools = [sec.screens];
    if (sec.adaptive) pools.push(sec.adaptive.hard, sec.adaptive.easy);
    for (const pool of pools) for (const scr of pool) {
      if (scr.type === 'ctw') { const it = (scr.items || []).find(x => x.id === qid); if (it) return { type: 'ctw', answer: it.answer }; }
      if ((scr.type === 'choose_response' || scr.type === 'insert_text') && scr.id === qid) return { type: 'mcq', answer: scr.answer };
      if (scr.questions) { const q = scr.questions.find(x => x.id === qid); if (q) return { type: 'mcq', answer: q.answer }; }
    }
  }
  return null;
}

// yüzdeden band'e (yaklaşık, README'de açıklanır)
function pctToBand(pct, capEasy) {
  const table = [[.92, 6], [.85, 5.5], [.78, 5], [.70, 4.5], [.62, 4], [.52, 3.5], [.42, 3], [.32, 2.5], [.22, 2], [.12, 1.5]];
  let band = 1;
  for (const [p, b] of table) { if (pct >= p) { band = b; break; } }
  if (capEasy && band > 4) band = 4; // kolay yola yönlenenler için tavan
  return band;
}
const bandTo30 = b => ({ 6: 30, 5.5: 28, 5: 26, 4.5: 24, 4: 22, 3.5: 19, 3: 16, 2.5: 13, 2: 10, 1.5: 7, 1: 4 }[b] || 4);

function scoreSection(secId) {
  const sec = State.form.sections.find(s => s.id === secId);
  if (!sec) return { correct: 0, total: 0, pct: 0, band: null, scaled30: null, path: null, missing: true }; // yapım aşamasındaki (pilot) formlarda bölüm eksik olabilir
  const ids = [];
  const collect = pool => pool.forEach(scr => {
    if (scr.type === 'ctw') (scr.items || []).forEach(it => ids.push(it.id));
    else if (scr.type === 'choose_response' || scr.type === 'insert_text') ids.push(scr.id);
    else if (scr.questions) scr.questions.forEach(q => ids.push(q.id));
  });
  collect(sec.screens);
  const path = State['_' + sec.id + '_path'] || null;
  if (sec.adaptive && path) collect(sec.adaptive[path]);
  let correct = 0; ids.forEach(id => { if (isCorrect(id)) correct++; });
  const total = ids.length || 1;
  const pct = correct / total;
  const band = pctToBand(pct, path === 'easy');
  return { correct, total, pct, band, scaled30: bandTo30(band), path };
}

function collectDetails(secId) {
  const sec = State.form.sections.find(s => s.id === secId);
  if (!sec) return [];
  const rows = [];
  const walk = pool => pool.forEach(scr => {
    const group = scr.title || scr.type;
    if (scr.type === 'ctw') scr.items.forEach(it => rows.push({ id: it.id, type: 'ctw', group, correct: isCorrect(it.id) }));
    else if (scr.type === 'choose_response') rows.push({ id: scr.id, type: 'choose_response', group: 'Listen & Choose', correct: isCorrect(scr.id) });
    else if (scr.type === 'insert_text') rows.push({ id: scr.id, type: 'insert_text', group: scr.title || 'Insert Text', correct: isCorrect(scr.id) });
    else if (scr.questions) scr.questions.forEach(q => rows.push({ id: q.id, type: scr.type, group, correct: isCorrect(q.id) }));
  });
  walk(sec.screens);
  const path = State['_' + sec.id + '_path'];
  if (sec.adaptive && path) walk(sec.adaptive[path]);
  return rows;
}

function finishExam() {
  clearInterval(State.timerHandle); TTS.stop();
  if (State.sttPending > 0) {
    $('#stage').innerHTML = `<div class="card center"><h2>${t('ex.finishingStt', { n: State.sttPending })}</h2><div class="equalizer on"><span></span><span></span><span></span><span></span><span></span></div></div>`;
    $('#footer').innerHTML = '';
    State.sttQueue.then(finishExam, finishExam);
    return;
  }
  const reading = scoreSection('reading');
  const listening = scoreSection('listening');
  State.results = {
    formId: State.form.id, formTitle: State.form.title, date: new Date().toISOString(),
    reading, listening,
    details: { reading: collectDetails('reading'), listening: collectDetails('listening') },
    writing: collectWriting(), speaking: collectSpeaking(),
    est0120_RL: reading.scaled30 + listening.scaled30, // W+S sonra eklenecek
  };
  localStorage.setItem('fluova_results_' + State.form.id, JSON.stringify(State.results));
  localStorage.setItem('fluova_results_last', JSON.stringify(State.results));
  downloadResults(State.results);
  location.href = 'results.html?test=' + encodeURIComponent(State.form.id);
}

// Tüm sonuçları (Writing metinleri + Speaking dökümleri dahil) tek dosya olarak indirir.
// Bu dosya Claude tarafından okunup değerlendirilir.
function downloadResults(results) {
  try {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fluova_${results.formId}_results.json`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } catch (e) {}
}

function collectWriting() {
  const out = { buildSentence: [], email: '', discussion: '' };
  for (const sec of State.form.sections) if (sec.id === 'writing') for (const scr of sec.screens) {
    if (scr.type === 'build_sentence') {
      const b = State.buildSentence[scr.id] || {};
      const nrm = s => (s || '').trim().toLowerCase().replace(/[.,!?;:]/g, '');
      const accepted = [scr.answer].concat(scr.accept || []).map(nrm);
      out.buildSentence.push({ prompt: scr.prompt, given: b.given || t('empty'), correct: scr.answer, ok: accepted.includes(nrm(b.given)) });
    }
    if (scr.type === 'sentence_dialogue') {
      const b = State.buildSentence[scr.id] || {};
      const nrm = s => (s || '').trim().toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ');
      const correct = basFill(scr, scr.answer);
      const accepted = [correct].concat(scr.accept || []).map(nrm);
      out.buildSentence.push({ prompt: 'A: ' + scr.personA, given: b.given || t('empty'), correct, ok: accepted.includes(nrm(b.given)) });
    }
    if (scr.type === 'writing') out[scr.kind] = State.writing[scr.id] || '';
  }
  return out;
}
function collectSpeaking() {
  const out = { listenRepeat: [], interview: [] };
  for (const sec of State.form.sections) if (sec.id === 'speaking') for (const scr of sec.screens) {
    if (scr.type === 'listen_repeat') scr.sentences.forEach((s, i) => {
      const key = `${scr.id}_${i}`; const tr = State.transcripts[key] || '';
      out.listenRepeat.push({ target: s, transcript: tr, accuracy: Math.round(similarity(tr, s) * 100), metrics: State.speechMeta[key] || null, recorded: !!State.recordings[key] });
    });
    if (scr.type === 'interview') scr.questions.forEach((q, i) => {
      const key = `${scr.id}_${i}`;
      out.interview.push({ question: q.text, transcript: State.transcripts[key] || '', metrics: State.speechMeta[key] || null, recorded: !!State.recordings[key] });
    });
  }
  return out;
}

/* ---------------- Persistence ---------------- */
function saveProgress() {
  try {
    localStorage.setItem('fluova_progress_' + State.form.id, JSON.stringify({
      answers: State.answers, writing: State.writing, buildSentence: State.buildSentence,
      sectionIndex: State.sectionIndex, screenIndex: State.screenIndex, remaining: State.remaining
    }));
  } catch (e) {}
}
