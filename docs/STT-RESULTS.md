# Speaking transcription: how we tested

Fluova lets the test taker choose how spoken answers become text:

- **Browser speech recognition**: the default. Instant, no download. Chrome and Edge send the audio to Google or Microsoft.
- **Whisper on your device**: optional. The model, Whisper `small.en` (8-bit, about 250 MB, from Hugging Face), downloads once and runs in the browser through transformers.js. The audio never leaves the device.

## Test set
- **Speaker:** one non-native speaker of English (the project founder, a Turkish speaker; real test Speaking score 4.5).
- **Recordings:** 9, about 2.5 minutes in total, made in Chrome on a laptop microphone.
  - 7 *Listen and Repeat* sentences of 5–22 words.
  - 2 interview answers of about 70 words each. The speaker read a prepared answer, so a reference text exists for every recording.
- **Measure:** word error rate (WER) against the reference text after normalisation (lower case, punctuation removed, numbers written as words). Lower is better.

## Results (26 Oct 2026)

| System | Where it runs | Mean WER |
|---|---|---|
| Browser speech recognition (Chrome) | Google's servers | **6.4%** |
| Whisper tiny.en | local (faster-whisper, int8) | 6% |
| Whisper base.en | local (faster-whisper, int8) | 7% |
| Whisper small.en | local (faster-whisper, int8) | 3% |
| **Whisper small.en, in the browser** (transformers.js 4.3.1, q8, WASM) | test taker's device | **3.7%** |
| Whisper medium.en | local (faster-whisper, int8) | 2% |

Where they differ: browser recognition misheard accent-sensitive words, for example "quiet study rooms" → "quotes to the rooms", "many" → "main" and "university" → "universal". Whisper small got these right. All systems agreed on two places where the speaker's own pronunciation or self-correction shows up ("interlibrary" → "the entire library"; "two or three weeks, three times a week"). That is useful feedback rather than an error.

This is why the in-browser option uses **small.en**: tiny and base were no better than browser recognition.

## Speed and size (same laptop, Chrome)
- **First download:** about 252 MB (encoder 92 MB + decoder 157 MB). It loaded in about 30 seconds on a home connection and later loaded from the browser cache in about 4 seconds.
- **Transcription on the CPU (WASM):** about 16–20 seconds per answer, whatever its length, because Whisper processes 30-second windows. Fluova transcribes in the background while the test continues and waits for any unfinished transcripts before showing results.
- **WebGPU with the same 8-bit model was slower** (about 27 seconds per answer), so the CPU path is used.

## Limits
One speaker and 9 recordings is a small sample. The direction is clear, but the exact numbers will move. Reading a prepared text is also easier to transcribe than free speech. If you want to help, record yourself with `tools/stt-lab/` and share the results file in an issue (it contains your audio, so only share it if you are comfortable with that).
