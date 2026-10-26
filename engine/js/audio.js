/* audio.js — Listening için TTS, Speaking için mikrofon kaydı.
   Web Speech API (speechSynthesis) + MediaRecorder. Chrome/Edge önerilir. */

const TTS = (function () {
  let voices = [];
  function load() { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; }
  if (window.speechSynthesis) {
    load();
    speechSynthesis.onvoiceschanged = load;
  }
  /* Ses seçimi: "female", "male:gb", "female:au", "neutral" gibi. ETS 2026: ABD/Kanada, İngiliz ve
     Avustralya aksanları dengeli kullanılır. macOS'taki eğlence sesleri (Bubbles, Zarvox…) asla seçilmez. */
  const NOVELTY_RE = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|junior|kathy|organ|ralph|superstar|trinoids|whisper|wobble|zarvox|fred|grandma|grandpa|hysterical|deranged|pipe organ/i;
  const MALE_RE = /daniel|reed|rocko|eddy|alex|aaron|arthur|oliver|rishi|tom|david|guy|ryan|thomas|male/i;
  const FEMALE_RE = /samantha|shelley|sandy|flo\b|karen|moira|tessa|ava|allison|susan|zoe|kate|serena|fiona|libby|sonia|natasha|jenny|aria|female/i;
  const ACCENT_LANG = { us: /^en[-_]US/i, gb: /^en[-_]GB/i, au: /^en[-_]AU/i };
  const isFemale = v => FEMALE_RE.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, ''));
  const isMale = v => MALE_RE.test(v.name) && !isFemale(v);
  function pickVoice(pref) {
    if (!voices.length) load();
    const [gender = 'neutral', accent = 'us'] = String(pref || 'neutral').split(':');
    const en = voices.filter(v => (/^en(-|_)/i.test(v.lang) || /english/i.test(v.name)) && !NOVELTY_RE.test(v.name));
    if (!en.length) return voices[0] || null;
    const byAccent = en.filter(v => (ACCENT_LANG[accent] || ACCENT_LANG.us).test(v.lang));
    const want = gender === 'male' ? isMale : isFemale;   // "neutral" → anlatıcı olarak kadın ABD sesi
    return byAccent.find(want) || en.find(want) || byAccent[0] || en[0];
  }
  // Seçilen ses istenen cinsiyetteyse perdeyi bozma (doğal kalsın); değilse ayrışma için hafif oynat.
  function pitchFor(pref, v) {
    const g = String(pref || 'neutral').split(':')[0];
    if (!v || g === 'neutral') return 1.0;
    if (g === 'male') return isMale(v) ? 1.0 : 0.8;
    return isFemale(v) ? 1.0 : 1.2;
  }

  /* Bir dizi {text, voice, rate} satırını sırayla seslendirir.
     onProgress(index) her satır başlarken, done() bitince çağrılır. */
  function speakScript(lines, { onStart, onLine, onDone } = {}) {
    if (!window.speechSynthesis) { alert(window.t ? t('au.noTts') : 'Your browser cannot read text aloud. Use Chrome or Edge.'); onDone && onDone(); return; }
    speechSynthesis.cancel();
    let i = 0;
    onStart && onStart();
    function next() {
      if (i >= lines.length) { onDone && onDone(); return; }
      const ln = lines[i];
      const u = new SpeechSynthesisUtterance(ln.text);
      u.voice = pickVoice(ln.voice || 'neutral');
      u.pitch = pitchFor(ln.voice, u.voice);
      u.rate = ln.rate || 1.0;   // ETS: doğal konuşma hızı
      u.lang = (u.voice && u.voice.lang) || 'en-US';
      onLine && onLine(i);
      u.onend = () => { i++; setTimeout(next, ln.gap != null ? ln.gap : 350); };
      u.onerror = () => { i++; setTimeout(next, 200); };
      speechSynthesis.speak(u);
    }
    next();
  }

  function speakOne(text, voice, cb) {
    speakScript([{ text, voice }], { onDone: cb });
  }

  function stop() { if (window.speechSynthesis) speechSynthesis.cancel(); }
  function available() { return !!window.speechSynthesis; }

  return { speakScript, speakOne, stop, available, pickVoice };
})();


/* Speech-to-Text — Speaking yanıtlarını canlı olarak metne döker (Chrome/Edge).
   İnternet bağlantısı gerektirir. Kayıt (MediaRecorder) ile paralel çalışır. */
const STT = (function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function supported() { return !!SR; }
  function createSession() {
    if (!SR) return null;
    const r = new SR();
    r.lang = 'en-US'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    // committed: önceki (kendiliğinden kapanmış) oturumlardan kalan metin. Chrome tanımayı
    // duraksamada kendi kapatabiliyor; yeniden başlatmazsak cümlenin sonu kayboluyordu.
    let finalText = '', committed = '', confSum = 0, confN = 0, finalCounted = 0, stopping = false;
    r.onresult = e => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) {
        t += e.results[i][0].transcript + ' ';
        // her kesinleşen sonucu bir kez say (eskiden her olayda yeniden sayılıyordu)
        if (e.results[i].isFinal && i >= finalCounted) { const c = e.results[i][0].confidence; if (c) { confSum += c; confN++; } finalCounted = i + 1; }
      }
      finalText = (committed + ' ' + t).replace(/\s+/g, ' ').trim();
    };
    r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') stopping = true; };
    r.onend = () => {
      if (stopping) return;
      committed = finalText; finalCounted = 0;
      try { r.start(); } catch (e) {}
    };
    let started = false;
    const result = () => ({ transcript: finalText.trim(), confidence: confN ? +(confSum / confN).toFixed(2) : null });
    return {
      start() { try { r.start(); started = true; } catch (e) {} },
      stop() {
        return new Promise(res => {
          stopping = true;
          if (!started) return res(result());
          r.onend = () => res(result());
          try { r.stop(); } catch (e) { res(result()); }
          setTimeout(() => res(result()), 1500); // güvenlik
        });
      }
    };
  }
  return { supported, createSession };
})();

const Recorder = (function () {
  let mediaRecorder = null, chunks = [], stream = null;

  async function ensureStream() {
    if (stream) return stream;
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return stream;
  }

  async function test() {
    try { await ensureStream(); return true; }
    catch (e) { return false; }
  }

  async function start() {
    await ensureStream();
    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mediaRecorder.start();
  }

  function stop() {
    return new Promise(resolve => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') { resolve(null); return; }
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        resolve({ blob, url: URL.createObjectURL(blob) });
      };
      mediaRecorder.stop();
    });
  }

  function supported() { return !!(navigator.mediaDevices && window.MediaRecorder); }

  return { test, start, stop, supported };
})();
