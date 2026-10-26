"""STT Lab değerlendirmesi: tarayıcı STT vs Whisper (faster-whisper, yerel).

Kullanım:
  python -I evaluate.py <stt_lab_recordings.json> [model ...]
Varsayılan model: small.en. Birden çok model verilebilir (ör. small.en medium.en).

Listen & Repeat: hedef cümleye göre kelime hata oranı (WER) + hangi kelimeler kaçtı.
Interview: okunacak hazır metin var → WER + uzun duraksama/tekrar (Whisper kelime zaman damgalarından).
Not: Whisper'a hedef cümle "ipucu" olarak VERİLMEZ — verilirse hatalı telaffuzu düzeltip hataları gizler.
"""
import base64, json, os, re, sys, tempfile

from faster_whisper import WhisperModel


_ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def _num(n):
    """0–99 arası sayıları kelimeye çevir (STT '15' yazar, hedef 'fifteen' der)."""
    if n < 20:
        return [_ONES[n]]
    return [_TENS[n // 10]] + ([_ONES[n % 10]] if n % 10 else [])


def norm(s):
    s = s.lower().replace("’", "'")
    s = re.sub(r"[^a-z0-9' ]+", " ", s)
    out = []
    for w in s.split():
        out += _num(int(w)) if w.isdigit() and int(w) < 100 else [w]
    return out


def align(ref, hyp):
    """Levenshtein hizalama → (wer, kaçan/yanlış hedef kelimeler)."""
    n, m = len(ref), len(hyp)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        d[i][0] = i
    for j in range(m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] != hyp[j - 1]))
    i, j, missed = n, m, []
    while i > 0 or j > 0:
        if i > 0 and j > 0 and d[i][j] == d[i - 1][j - 1] + (ref[i - 1] != hyp[j - 1]):
            if ref[i - 1] != hyp[j - 1]:
                missed.append(f"{ref[i-1]}→{hyp[j-1]}")
            i, j = i - 1, j - 1
        elif i > 0 and d[i][j] == d[i - 1][j] + 1:
            missed.append(f"{ref[i-1]}→∅")
            i -= 1
        else:
            j -= 1
    return (d[n][m] / max(n, 1)), list(reversed(missed))


def load_audio(path):
    """ffmpeg ile 16 kHz mono float32 — faster-whisper'ın PyAV çözücüsü av 19 ile uyumsuz."""
    import subprocess
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", path, "-f", "s16le",
                          "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


def whisper_run(model, path):
    segs, _ = model.transcribe(load_audio(path), language="en", beam_size=5, temperature=0.0,
                               condition_on_previous_text=False, word_timestamps=True, vad_filter=False)
    words = [w for s in segs for w in (s.words or [])]
    text = " ".join(w.word.strip() for w in words)
    low = [w.word.strip() for w in words if w.probability < 0.5]
    gaps = [round(b.start - a.end, 1) for a, b in zip(words, words[1:]) if b.start - a.end >= 1.0]
    toks = norm(text)
    reps = sum(1 for a, b in zip(toks, toks[1:]) if a == b)
    return {"text": text, "low_conf_words": low, "long_pauses_s": gaps, "repetitions": reps}


def main():
    data = json.load(open(sys.argv[1]))
    models = sys.argv[2:] or ["small.en"]
    tmp = tempfile.mkdtemp(prefix="sttlab_")
    paths = {}
    for it in data["items"]:
        ext = "webm" if "webm" in (it.get("mime") or "webm") else "audio"
        p = os.path.join(tmp, f"{it['id']}.{ext}")
        open(p, "wb").write(base64.b64decode(it["audio_b64"]))
        paths[it["id"]] = p

    report = {"models": models, "items": []}
    loaded = {m: WhisperModel(m, device="cpu", compute_type="int8") for m in models}
    for it in data["items"]:
        row = {"id": it["id"], "type": it["type"], "target": it["target"], "seconds": it.get("seconds"),
               "browser": it["browser"].get("transcript", ""), "browser_conf": it["browser"].get("confidence"),
               "browser_ended_early_at_s": it["browser"].get("ended_early_at_s")}
        for m, model in loaded.items():
            row[m] = whisper_run(model, paths[it["id"]])
        if it.get("target"):   # artık Interview'da da okunacak metin var → her maddede WER
            ref = norm(it["target"])
            row["browser_wer"], row["browser_errors"] = align(ref, norm(row["browser"]))
            for m in models:
                row[m]["wer"], row[m]["errors"] = align(ref, norm(row[m]["text"]))
        report["items"].append(row)

    out = os.path.splitext(sys.argv[1])[0] + "_report.json"
    json.dump(report, open(out, "w"), ensure_ascii=False, indent=1)

    lr = [r for r in report["items"] if "browser_wer" in r]
    print(f"\n=== TÜM MADDELER — kelime hata oranı (düşük = iyi) ===")
    print("id    hedef_kelime  tarayıcı  " + "  ".join(f"{m:>10}" for m in models))
    for r in lr:
        print(f"{r['id']:5} {len(norm(r['target'])):>12}  {r['browser_wer']*100:7.0f}%  " +
              "  ".join(f"{r[m]['wer']*100:9.0f}%" for m in models))
    avg = lambda xs: sum(xs) / max(len(xs), 1) * 100
    print(f"ORT.  {'':>12}  {avg([r['browser_wer'] for r in lr]):7.0f}%  " +
          "  ".join(f"{avg([r[m]['wer'] for r in lr]):9.0f}%" for m in models))
    for r in lr:
        print(f"\n[{r['id']}] {r['target']}\n  tarayıcı: {r['browser']}  {r['browser_errors']}" +
              (f"  ⚠ tanıma {r['browser_ended_early_at_s']} sn'de durdu" if r['browser_ended_early_at_s'] else ""))
        for m in models:
            print(f"  {m}: {r[m]['text']}  {r[m]['errors']}  düşük-güven: {r[m]['low_conf_words']}")
    for r in [x for x in report["items"] if x["type"] == "iv"]:
        print(f"\n=== {r['id']} ({r['seconds']} sn) — akıcılık ölçüleri ===\n  tarayıcı ({len(norm(r['browser']))} kelime): {r['browser']}")
        for m in models:
            w = r[m]
            print(f"  {m} ({len(norm(w['text']))} kelime): {w['text']}\n    uzun duraksama: {w['long_pauses_s']}  tekrar: {w['repetitions']}  düşük-güven: {w['low_conf_words']}")
    print(f"\nRapor: {out}")


if __name__ == "__main__":
    main()
