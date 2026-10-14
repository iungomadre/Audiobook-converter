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
- Covers: tap the cover box to pick an image (or drop one on it), or use
  "Search Google Images", which opens a prefilled search in a new tab. Every
  cover is made square for audiobook players (non-square images are centered
  on a blurred fill, never cropped).
- 15 languages with a flag picker: English, Polish, Spanish, French, German,
  Italian, Portuguese (Brazil), Ukrainian, Dutch, Turkish, Indonesian, Hindi,
  Chinese (Simplified), Japanese and Korean. The browser language is used by
  default; the choice is remembered and can change at any time.
- Output plays in Apple Books: AAC audio, QuickTime chapter track, Nero `chpl`
  chapters (other players), iTunes metadata and `stik = Audiobook`.
- Long books (40 h+) are fine: audio is streamed through a Web Worker and the
  output is written to disk (Origin Private File System), not kept in memory.

## How it works

1. Chapters are encoded **in parallel**: up to 4 at once on computers (one
   fewer than the CPU cores), 2 on phones and tablets. Each chapter gets a
   **fresh Web Worker** that is terminated when the chapter is done, so any
   memory the browser's decoder or encoder holds on to is released after every
   chapter instead of piling up over a long book (iOS kills tabs that use too
   much memory).
2. In each worker, [Mediabunny](https://mediabunny.dev) decodes the file with
   WebCodecs; the audio is mixed to the chosen channel count and resampled to
   44.1 kHz (`src/shared/lib/audio`), then encoded to AAC by the browser's
   native encoder or by `@mediabunny/aac-encoder` (FFmpeg's encoder as
   WebAssembly, ~1 MB, only downloaded where needed, e.g. Firefox).
3. Each worker writes its chapter's AAC packets into a part file in the Origin
   Private File System, keeping just a 4-byte size per packet in memory.
4. A final worker copies the parts in order into the M4B (deleting each part
   once copied) and appends the QuickTime chapter track, the Nero `chpl` list,
   iTunes tags, cover and the audiobook flag (`src/shared/lib/mp4`).
5. The file is saved via the File System Access save dialog, or a download.

On phones the screen is kept awake during conversion (Screen Wake Lock).

**Resuming.** Safari on iOS keeps memory from reading large files and kills
the tab after a few gigabytes, silently reloading the page. Finished chapter
parts therefore stay on the device together with their packet sizes, and a
small checkpoint in `localStorage` records which chapters are done. After a
reload a banner at the top says how far it got; choosing the same files again
(same content and audio quality) continues automatically with the remaining
chapters. Files are recognized by a cheap content fingerprint — size plus a
SHA-256 of the first and last 64 KB — so renamed or re-copied files still
match, while different recordings don't. Picking other files shows a warning:
choose the right ones, or start a new conversion with the picked files. The result is identical to an uninterrupted run.
Browsers forget picked files on reload, so that one step can't be automated.

**Remembered between sessions** (IndexedDB): book details, cover, audio
quality, and the chapter order and titles, which are reapplied when the same
files are picked again. Picking a different book clears them; "Start over"
removes everything, including unfinished conversions.

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
    edit-book-metadata/   metadata form, cover (pick/drop), audio quality
    find-cover-online/    opens Google Images for the book in a new tab
    select-language/      language picker with flags
    convert-book/         worker, conversion pipeline, progress, saving
  entities/
    book/                 book model, store, audio presets
  shared/
    lib/mp4/              packet/part writers and M4B assembly (chapters, tags, cover)
    lib/audio/            channel remixing and streaming resampler
    lib/storage/          OPFS and file saving
    i18n/                 translations, plural rules, live language switching
    lib/…                 natural sort, formatting, media probing, images
    ui/                   tiny DOM helper
```

Layers only import from layers below them; slices expose a public API via
their `index.ts`.

## Translations

Strings live in `src/shared/i18n/locales/<code>.ts`. English (`en.ts`) is the
source: TypeScript rejects a locale that misses a key, and a test checks that
every translation keeps the same `{placeholders}`. Plural forms (e.g. Polish
`1 rozdział / 2 rozdziały / 5 rozdziałów`) use `Intl.PluralRules`. Translations
other than English and Polish have not yet been reviewed by native speakers.

## Third-party licences

Mediabunny and `@mediabunny/aac-encoder`: MPL-2.0; the latter contains
FFmpeg's AAC encoder (LGPL-2.1+).
