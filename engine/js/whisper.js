/* whisper.js — optional on-device speech recognition for Speaking (Whisper small.en via transformers.js).
   The test taker chooses it on the start page. The model (~250 MB) downloads once from Hugging Face and stays in the
   browser cache; after that, recordings are transcribed on the device and never leave it.
   Why small.en: on our test recordings (one non-native speaker, 9 items) tiny/base were no better than the browser's
   own recognition (6–7% word errors); small was clearly better (see docs/STT-RESULTS.md). */
(function () {
  const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';
  const MODEL = 'onnx-community/whisper-small.en';
  const DTYPE = { encoder_model: 'q8', decoder_model_merged: 'q8' };
  let pipe = null, loading = null;

  const mode = () => { try { return localStorage.getItem('fluova_stt') || 'browser'; } catch (e) { return 'browser'; } };
  const setMode = m => { try { localStorage.setItem('fluova_stt', m); } catch (e) {} };
  const markCached = () => { try { localStorage.setItem('fluova_whisper_cached', '1'); } catch (e) {} };
  const isCached = () => { try { return localStorage.getItem('fluova_whisper_cached') === '1'; } catch (e) { return false; } };

  /* Load (and on first use download) the model. onProgress(fraction 0–1, loadedMB, totalMB). */
  function load(onProgress) {
    if (pipe) return Promise.resolve(pipe);
    if (loading) return loading;
    const files = {};
    loading = import(LIB).then(({ pipeline, env }) => {
      env.allowLocalModels = false;
      return pipeline('automatic-speech-recognition', MODEL, {
        dtype: DTYPE, device: 'wasm',
        progress_callback: p => {
          if (p.status === 'progress' && p.total) {
            files[p.file] = [p.loaded, p.total];
            const v = Object.values(files), l = v.reduce((a, x) => a + x[0], 0), t = v.reduce((a, x) => a + x[1], 0);
            onProgress && onProgress(l / t, l / 1e6, t / 1e6);
          }
        },
      });
    }).then(p => { pipe = p; markCached(); return p; })
      .catch(e => { loading = null; throw e; });
    return loading;
  }

  /* Decode a recorded Blob (webm/opus) to 16 kHz mono Float32Array. */
  async function decode(blob) {
    const buf = await blob.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    try { const audio = await ctx.decodeAudioData(buf); return audio.getChannelData(0); }
    finally { ctx.close && ctx.close(); }
  }

  async function transcribe(blob) {
    const p = await load();
    const audio = await decode(blob);
    const out = await p(audio, { chunk_length_s: 30, stride_length_s: 5 });
    return String((out && out.text) || '').trim();
  }

  window.WhisperSTT = { MODEL, mode, setMode, load, transcribe, isCached, isReady: () => !!pipe, approxMB: 250 };
})();
