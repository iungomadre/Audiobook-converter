# Research: in-browser MP3 → M4B converter

Status: research / pre-MVP. Date: 2026-10-14.

## MVP requirements (recap)

- Input: a folder of MP3 files whose names are chapter numbers.
- Output: one `.m4b` file playable in dedicated audiobook players.
- Attach a cover image and metadata (title, author, narrator, year, …).
- Static web app: runs fully in the browser, no conversion server, works on any device.

## What an M4B actually is

An M4B is an MP4 (ISO-BMFF) file with a different extension. To be accepted
by audiobook players it needs:

| Part | Detail |
|---|---|
| Audio codec | **AAC** (AAC-LC, mono 64 kbps is plenty for speech). MP3-in-MP4 is legal but Apple Books / iPods and several players reject it. |
| Container | MP4, `moov` atom at the start ("fast start") is nice to have. |
| Metadata | iTunes-style `ilst` atoms: `©nam` title, `©ART` author, `©alb` album, `©day` year, `©wrt`/`©nrt` narrator, `desc`, `covr` cover (JPEG/PNG), `stik = 2` (audiobook). |
| Chapters | Two formats exist: **Nero `chpl`** atom (simple, read by most Android players, VLC) and **QuickTime chapter text track** (needed by Apple Books/iOS). Writing both is safest. Chapter start times come from the cumulative durations of the input MP3s. |

So the pipeline is: **decode MP3 → PCM → encode AAC → mux MP4 + metadata + chapters**.
Re-encoding is the expensive step; everything else is cheap byte work.

## Options

### A. ffmpeg.wasm (FFmpeg compiled to WebAssembly)

- `@ffmpeg/ffmpeg` 0.12.x, MIT wrapper around an LGPL/GPL core.
- One tool does everything: concat demuxer for the MP3 list, native `aac`
  encoder, `-f ipod`/mp4 muxer, cover via `-disposition:v attached_pic`,
  chapters + global tags via an `ffmetadata` file (writes both `chpl` and a
  QuickTime chapter track).
- **Pros:** proven pipeline, identical to the CLI recipes everyone uses for
  M4B; least code on our side; works in every browser with WebAssembly.
- **Cons:**
  - ~30 MB core download (cached after first load).
  - Single-threaded build is slow-ish; the multithreaded build needs
    `SharedArrayBuffer`, i.e. COOP/COEP headers on the host (Netlify /
    Cloudflare Pages can set them; GitHub Pages needs a service-worker hack).
  - Files live in an in-memory FS inside a 32-bit wasm heap (≤2–4 GB). Input
    MP3s + output M4B must fit; a 20–30 h book is at risk, and **iOS Safari
    tab memory limits are much lower** — the "any device" requirement is the
    weak spot. (WORKERFS mounting can avoid copying inputs, but output still
    lives in memory.)
  - No progress/streaming output, coarse error handling.

### B. Mediabunny (+ WebCodecs)

- Pure TypeScript media toolkit (MPL-2.0), successor to `mp4-muxer`.
  Reads MP3, writes MP4 with metadata tags (incl. cover), streams output.
- Decoding/encoding uses the browser's built-in **WebCodecs**
  (`AudioDecoder` / `AudioEncoder`) — native speed, often hardware/OS codecs.
- AAC encoding: Chromium yes; Safari exposes it (a 2025 WebKit bug about
  bad decoder-config bytes was reported — must test); **Firefox has no AAC
  encoder** → Mediabunny ships `@mediabunny/aac-encoder`, a WASM AAC-LC
  fallback registered only when `canEncodeAudio('aac')` is false.
- **Pros:** small bundle, fast, chunked/streaming processing so memory stays
  flat regardless of book length (can write to OPFS or the File System
  Access API), fine-grained progress, no special hosting headers.
- **Cons:** newer library; **chapter writing not confirmed** in its API —
  we would likely need to inject the `chpl` atom (and possibly a QuickTime
  chapter track) ourselves or contribute it upstream. Browser-compat matrix
  needs real-device testing.

### C. Assemble our own from smaller libraries

- Decode: WebCodecs, or `mpg123-decoder` (wasm).
- Encode: `fdk-aac` compiled to wasm (best quality, but licence is not
  OSI-free) or FFmpeg's `aac` encoder alone.
- Mux: `mp4box.js` (BSD), or hand-written audio-only MP4 writer.
- **Verdict:** writing an MP4 *muxer* for a single AAC track + `ilst` +
  `chpl` is very feasible (a few hundred lines). Writing an **AAC encoder**
  is not worth it. So "our own" only makes sense for the muxing/metadata
  layer, which is what option B already gives us.

### D. No re-encoding (MP3 stream inside MP4)

- Copy MP3 frames into an MP4 container (`mp4a.6B`), add metadata/chapters.
- Near-instant, lossless, tiny memory use.
- Not reliably supported by Apple players and some others — useful later as
  an optional "fast mode", not as the default.

## Comparison

| | ffmpeg.wasm | Mediabunny + WebCodecs | Own muxer + encoder libs | MP3-in-MP4 |
|---|---|---|---|---|
| Effort for MVP | Lowest | Low–medium | High | Low |
| Speed | Slow–OK | Fast | Depends | Instant |
| Memory on long books / phones | Risky | Good (streaming) | Good | Good |
| Download size | ~30 MB | ~100s of KB (+wasm AAC fallback for Firefox) | Small–medium | Tiny |
| Chapters | Built in | Probably DIY atom | DIY | DIY |
| Player compatibility | Excellent | Excellent | Excellent | Partial |
| Hosting constraints | COOP/COEP for MT | None | None | None |

## Recommendation

1. **Don't write a codec.** Use an existing AAC encoder (browser WebCodecs
   or a wasm build).
2. **Primary path: Mediabunny + WebCodecs**, with a small module of our own
   that writes the chapter atoms (`chpl` first, QuickTime chapter track
   second). This best fits "any device, no server, no install" because it
   streams and stays light on memory and download size.
3. **Fallback / reference: ffmpeg.wasm.** Use it in a spike as the
   known-good baseline to compare output against, and keep it as an
   optional engine if a browser can't handle path 2.

### Suggested first spike (1–2 days)

- Load a real book folder (`<input webkitdirectory>` + natural sort of
  filenames, e.g. `Intl.Collator(…, {numeric: true})`).
- Path 2: MP3 → AAC via Mediabunny; measure speed and peak memory on
  Chrome desktop, Firefox, iOS Safari, Android Chrome.
- Inject `chpl` + `ilst` (cover, author, year, `stik=2`); verify in the
  target audiobook player, Apple Books and VLC; check with `ffprobe`/MP4Box.
- Same book via ffmpeg.wasm for a speed/size/compat baseline.

## Decisions (2026-10-14)

- **Engine: Mediabunny** (v1.61.4 at time of writing) + WebCodecs, with
  `@mediabunny/aac-encoder` as fallback where the browser lacks AAC encoding.
- **Target player: Apple Books** → the **QuickTime chapter track** is
  required in the MVP (Apple ignores Nero `chpl`); we write `chpl` too.
- **Book length: 40+ h is normal.** At 64 kbps mono that is ~1.1–1.2 GB of
  output, so output must be streamed to disk (OPFS / File System Access),
  never held in memory.
- **Chapters: one per input file**, enumerated in natural filename order.
- No custom codecs.

## Licensing

- `mediabunny` and `@mediabunny/aac-encoder`: **MPL-2.0**. Free for personal,
  open-source and commercial use. Copyleft is per file: only changes made to
  Mediabunny's own source files must be published under MPL-2.0; our code can
  use any licence.
- `@mediabunny/aac-encoder` bundles a WASM build of FFmpeg's libavcodec AAC
  encoder (**LGPL-2.1+**). Fine to ship as-is with an attribution / licence
  notice; it is only loaded in browsers without a native AAC encoder.

## Gaps found in Mediabunny 1.61.4

- No chapter API (the only "chapter" in the type definitions is Matroska's
  EBML schema). We must add chapters ourselves: a QuickTime text track linked
  via `tref/chap`, plus `moov/udta/chpl`. Options: post-process the MP4,
  or contribute chapter support upstream.
- `MetadataTags` covers title, artist, album, albumArtist, date, genre,
  comment, description, images (cover) and `raw`. Audiobook-specific atoms
  (`stik = 2`, narrator `©nrt`) need to go through `raw` or post-processing.

## Sources

- ffmpeg.wasm releases: https://github.com/ffmpegwasm/ffmpeg.wasm/releases
- Mediabunny – writing media files: https://mediabunny.dev/guide/writing-media-files
- Mediabunny AAC encoder extension: https://mediabunny.dev/guide/extensions/aac-encoder
- Remotion – encodable audio codecs (Firefox: no AAC): https://www.remotion.dev/docs/web-renderer/get-encodable-audio-codecs
- WebKit bug 302253 (Safari AAC AudioEncoder description bytes): https://bugs.webkit.org/show_bug.cgi?id=302253
- W3C WebCodecs AAC registration: https://www.w3.org/TR/2022/DNOTE-webcodecs-aac-codec-registration-20221020/
- MP4 chapter formats (Nero chpl vs QuickTime): https://github.com/Zeugma440/atldotnet/wiki/Focus-on-Chapter-metadata
