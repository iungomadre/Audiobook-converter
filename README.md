# Audiobook Converter

Turn a folder of MP3 files into a single **M4B audiobook** with chapters, cover
and metadata, entirely in your browser. Nothing is uploaded and there is no
server: decoding, AAC encoding and MP4 writing all run on your device.

## Features (MVP)

- Pick a folder (or drop it, or pick files on mobile). Files are sorted
  naturally (`2.mp3` before `10.mp3`) and each becomes one chapter.
- Chapter titles default to "Chapter N"; rename, reorder or remove them.
- Title, author, narrator, year, genre, description and cover image.
  Fields and cover are pre-filled from the first file's ID3 tags when present.
- Covers: upload, drop, paste (copy an image anywhere, then tap Paste or press
  Ctrl/⌘+V), or "Search Google Images", which opens Google in a new tab so you
  can copy a cover and paste it back. Every cover is made square for audiobook
  players (non-square images are centered on a blurred fill, never cropped).
- Output plays in Apple Books: AAC audio, QuickTime chapter track, Nero `chpl`
  chapters (other players), iTunes metadata and `stik = Audiobook`.
- Long books (40 h+) are fine: audio is streamed through a Web Worker and the
  output is written to disk (Origin Private File System), not kept in memory.

## How it works

1. [Mediabunny](https://mediabunny.dev) reads each file and decodes it with
   the browser's WebCodecs `AudioDecoder`.
2. All audio is mixed to the chosen channel count and resampled to 44.1 kHz
   (`src/shared/lib/audio`), so files with different formats can be joined.
3. Mediabunny encodes AAC with the browser's native encoder, or with
   `@mediabunny/aac-encoder` (FFmpeg's encoder compiled to WebAssembly) where
   none exists, e.g. Firefox and Chrome on Linux. That ~1 MB module is only
   downloaded when needed.
4. Our own streaming writer (`src/shared/lib/mp4`) puts every AAC packet
   straight into a file in the Origin Private File System and keeps only a
   4-byte size per packet in memory (~25 MB for 40 hours). At the end it
   appends the QuickTime chapter track, the Nero `chpl` list, the iTunes tags
   and the audiobook flag. (Mediabunny's own MP4 muxer keeps an object per
   packet until the end, which made iOS kill the tab on long books.)
5. The file is saved via the File System Access save dialog, or a download.

On phones the screen is kept awake during conversion (Screen Wake Lock), and
if the page is reloaded mid-conversion — iOS does this silently when a tab is
killed — the app says so instead of just showing an empty form.

## Browser support

Needs WebCodecs audio decoding and OPFS: current Chrome, Edge and Firefox, and
recent Safari (macOS/iOS) with WebCodecs audio support. Verified so far in
Chromium; Safari and mobile still need real-device testing.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (the MP4 test uses ffprobe when installed)
npm run build      # type-check and production build into dist/
```

Pushes to `main` (and the current development branch) deploy to GitHub Pages
via `.github/workflows/deploy.yml`.

## Project structure

The code follows [Feature-Sliced Design](https://feature-sliced.design):

```
src/
  app/        entry point and global styles
  pages/      converter page (composes widgets and features)
  widgets/    app-header, book-setup (files + chapters), book-details (metadata + cover)
  features/
    select-audio-files/   folder/file picking, drag & drop, tag pre-fill
    edit-chapters/        chapter titles, order, removal
    edit-book-metadata/   metadata form, cover (upload/paste/drop), audio quality
    find-cover-online/    opens Google Images for the book in a new tab
    convert-book/         worker, conversion pipeline, progress, saving
  entities/
    book/                 book model, store, audio presets
  shared/
    lib/mp4/              streaming M4B writer (chapters, tags, cover)
    lib/audio/            channel remixing and streaming resampler
    lib/storage/          OPFS and file saving
    lib/…                 natural sort, formatting, media probing, images
    ui/                   tiny DOM helper
```

Layers only import from layers below them; slices expose a public API via
their `index.ts`.

## Third-party licences

Mediabunny and `@mediabunny/aac-encoder`: MPL-2.0; the latter contains
FFmpeg's AAC encoder (LGPL-2.1+).
