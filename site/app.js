/* Fluova landing — ortak davranış: dil, tema, XP, iki mini oyun, sayaçlar.
   İki tasarım yönü (blueprint / pastel) aynı id ve data-* kancalarını kullanır.
   Sayfa JS olmadan da tam okunur: sayılar ve metinler HTML'de son halleriyle durur. */
(function () {
  var I18N = window.FLUOVA_I18N;
  var root = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  // ---------- dil ----------
  function setLang(lang) {
    var d = I18N[lang] || I18N.en;
    root.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (d[k] != null) el.innerHTML = d[k];
    });
    document.querySelectorAll('[data-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.lang === lang ? 'true' : 'false');
    });
    store.set('fluova_lang', lang);
    renderBadge();
  }
  // Statik mod (build.js çıktısı, /en/ /tr/): içerik HTML'de hazır; dil seçici gerçek bağlantıdır.
  var STATIC = root.dataset.static === '1';
  document.querySelectorAll('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () {
      store.set('fluova_lang', b.dataset.lang);
      if (!STATIC) setLang(b.dataset.lang);
    });
  });

  // ---------- tema (sistem → açık → koyu) ----------
  var themeBtn = document.getElementById('themeBtn');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var cur = root.getAttribute('data-theme');
    var dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', dark ? 'light' : 'dark');
  });

  // ---------- XP ----------
  var state = { g1: false, g2: false };
  try { Object.assign(state, JSON.parse(store.get('fluova_xp') || '{}')); } catch (e) {}
  var XP_MAX = 50;
  function xp() { return (state.g1 ? 20 : 0) + (state.g2 ? 30 : 0); }
  function renderXP() {
    var v = xp();
    var fill = document.getElementById('xpFill'), num = document.getElementById('xpNum');
    if (fill) fill.style.width = (v / XP_MAX * 100) + '%';
    if (num) num.textContent = v + '/' + XP_MAX;
    var bar = document.getElementById('xpBar');
    if (bar) bar.setAttribute('aria-valuenow', v);
    renderBadge();
  }
  function renderBadge() {
    var b = document.getElementById('badge');
    if (!b) return;
    var open = state.g1 && state.g2;
    var d = I18N[root.lang] || I18N.en;
    b.classList.toggle('is-open', open);
    var t = b.querySelector('[data-badge-text]');
    if (t) t.textContent = open ? d.badge_open : d.badge_locked;
  }
  function award(key, el) {
    if (state[key]) return;
    state[key] = true;
    store.set('fluova_xp', JSON.stringify(state));
    renderXP();
    celebrate(el, key === 'g1' ? 20 : 30);
  }

  // ---------- kutlama: yöne göre (pastel = renkli parçacık, blueprint = onay damgası) ----------
  function celebrate(el, pts) {
    if (!el) return;
    var host = el.closest('[data-game]') || el;
    var tag = document.createElement('span');
    tag.className = 'xp-pop';
    tag.textContent = '+' + pts + ' XP';
    host.appendChild(tag);
    setTimeout(function () { tag.remove(); }, 1600);
    if (reduce) return;
    if (document.body.dataset.direction === 'pastel') {
      var r = host.getBoundingClientRect();
      for (var i = 0; i < 18; i++) {
        var p = document.createElement('i');
        p.className = 'confetti';
        var a = (Math.PI * 2 * i) / 18, dist = 60 + Math.random() * 70;
        p.style.setProperty('--dx', Math.cos(a) * dist + 'px');
        p.style.setProperty('--dy', Math.sin(a) * dist + 'px');
        p.style.left = (r.width / 2) + 'px';
        p.style.top = (r.height / 2) + 'px';
        p.style.background = 'var(--c' + (i % 4 + 1) + ')';
        host.appendChild(p);
        setTimeout(function (n) { return function () { n.remove(); }; }(p), 900);
      }
    } else {
      var st = document.createElement('span');
      st.className = 'stamp';
      st.textContent = 'CHECKED';
      host.appendChild(st);
      setTimeout(function () { st.remove(); }, 2200);
    }
  }

  // ---------- Oyun 1: parafraz sorusu ----------
  var g1 = document.querySelector('[data-game="g1"]');
  if (g1) {
    var fb = g1.querySelector('[data-feedback]');
    g1.querySelectorAll('[data-opt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var d = I18N[root.lang] || I18N.en;
        var right = btn.dataset.opt === g1.dataset.answer;
        g1.querySelectorAll('[data-opt]').forEach(function (b) { b.classList.remove('is-wrong'); });
        btn.classList.add(right ? 'is-right' : 'is-wrong');
        btn.setAttribute('aria-pressed', 'true');
        fb.textContent = right ? d.g1_ok : d.g1_bad;
        fb.className = 'feedback ' + (right ? 'ok' : 'bad');
        if (right) {
          g1.classList.add('is-solved');
          g1.querySelectorAll('[data-opt]').forEach(function (b) { b.disabled = true; });
          award('g1', btn);
        }
      });
    });
  }

  // ---------- Oyun 2: Complete the Words (C-test kuralı) ----------
  var g2 = document.querySelector('[data-game="g2"]');
  if (g2) {
    var inputs = g2.querySelectorAll('input[data-ans]');
    inputs.forEach(function (inp, i) {
      inp.addEventListener('input', function () {
        inp.value = inp.value.replace(/[^a-zA-Z]/g, '').toLowerCase();
        inp.classList.remove('is-wrong', 'is-right');
        if (inp.value.length >= +inp.maxLength && inputs[i + 1]) inputs[i + 1].focus();
      });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
    });
    var fb2 = g2.querySelector('[data-feedback]');
    function check() {
      var d = I18N[root.lang] || I18N.en, all = true;
      inputs.forEach(function (inp) {
        var ok = inp.value.toLowerCase() === inp.dataset.ans;
        inp.classList.toggle('is-right', ok);
        inp.classList.toggle('is-wrong', !ok);
        if (!ok) all = false;
      });
      fb2.textContent = all ? d.g2_ok : d.g2_bad;
      fb2.className = 'feedback ' + (all ? 'ok' : 'bad');
      if (all) { g2.classList.add('is-solved'); award('g2', g2.querySelector('[data-check]')); }
    }
    g2.querySelector('[data-check]').addEventListener('click', check);
  }

  // ---------- sayaçlar: HTML son değeri taşır, hareket izinliyse 0'dan sayar ----------
  if (!reduce) {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      var end = parseFloat(el.dataset.count), dec = (el.dataset.count.split('.')[1] || '').length;
      var t0 = null, dur = 1100;
      function step(t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = (end * e).toFixed(dec) + (el.dataset.suffix || '');
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  // ---------- bağış adresi kopyalama ----------
  var cw = document.getElementById('copyWallet');
  if (cw) cw.addEventListener('click', function () {
    var w = document.getElementById('wallet').textContent.trim(), d = I18N[root.lang] || I18N.en;
    var done = function () { cw.textContent = '✓ ' + d.open_copied; };
    if (navigator.clipboard) navigator.clipboard.writeText(w).then(done, function () { selectWallet(); });
    else selectWallet();
    function selectWallet() { var r = document.createRange(); r.selectNodeContents(document.getElementById('wallet')); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  });

  var saved = store.get('fluova_lang');
  if (STATIC) {
    renderBadge();
    // Öneri bandı: tercih kaydı yoksa ve tarayıcı dili bu sayfadan farklı bir desteklenen dilse
    var nav = (navigator.language || 'en').slice(0, 2), bar = document.getElementById('langSuggest');
    if (bar && !saved && nav !== root.lang && I18N[nav]) {
      var a = bar.querySelector('a');
      bar.querySelector('[data-suggest-text]').textContent = I18N[nav].suggest;
      a.textContent = I18N[nav].suggest_go;
      a.href = (root.dataset.base || '../') + nav + '/';
      a.addEventListener('click', function () { store.set('fluova_lang', nav); });
      bar.querySelector('button').addEventListener('click', function () { store.set('fluova_lang', root.lang); bar.hidden = true; });
      bar.hidden = false;
    }
  } else {
    setLang(saved || ((navigator.language || 'en').slice(0, 2) === 'tr' ? 'tr' : 'en'));
  }
  renderXP();
  // Daha önce çözülen oyunları çözülmüş göster (XP korunuyor; kart da tutarlı olsun)
  (function restoreSolved() {
    var d = I18N[root.lang] || I18N.en;
    if (state.g1 && g1) {
      g1.classList.add('is-solved');
      g1.querySelectorAll('[data-opt]').forEach(function (b) { b.disabled = true; if (b.dataset.opt === g1.dataset.answer) b.classList.add('is-right'); });
      var f1 = g1.querySelector('[data-feedback]'); f1.textContent = d.g1_ok; f1.className = 'feedback ok';
    }
    if (state.g2 && g2) {
      g2.classList.add('is-solved');
      g2.querySelectorAll('input[data-ans]').forEach(function (inp) { inp.value = inp.dataset.ans; inp.classList.add('is-right'); });
      var f2 = g2.querySelector('[data-feedback]'); f2.textContent = d.g2_ok; f2.className = 'feedback ok';
    }
  })();
  var y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
})();
