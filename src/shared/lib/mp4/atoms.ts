import { container, leaf, type Box } from './box';
import { concat, fourCC, u16, u32, u64, u8, utf8, zeros } from './bytes';

export type ChapterMarker = {
  title: string;
  /** Start of the chapter, in seconds from the beginning of the book. */
  startSeconds: number;
};

export type M4bMetadata = {
  title?: string;
  album?: string;
  artist?: string;
  albumArtist?: string;
  narrator?: string;
  year?: string;
  genre?: string;
  description?: string;
  cover?: { data: Uint8Array; mimeType: string } | null;
};

export const MOVIE_TIMESCALE = 1000;
const CHAPTER_TIMESCALE = 1000;
const LANGUAGE_UND = 0x55c4;
const IDENTITY_MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32);

export const ftyp = (): Box => leaf('ftyp', [fourCC('M4A '), u32(0x200), fourCC('M4A '), fourCC('mp42'), fourCC('isom')]);

export const mvhd = (durationMs: number, nextTrackId: number): Box =>
  leaf('mvhd', [
    u32(0), u32(0), u32(0), u32(MOVIE_TIMESCALE), u32(durationMs),
    u32(0x10000), u16(0x100), zeros(10), ...IDENTITY_MATRIX, zeros(24), u32(nextTrackId),
  ]);

/** Track flags: 1 = enabled, 2 = in movie. */
const tkhd = (trackId: number, durationMs: number, flags: number, volume: number): Box =>
  leaf('tkhd', [
    u8(0), u8(0), u16(flags), u32(0), u32(0), u32(trackId), u32(0), u32(durationMs),
    zeros(8), u16(0), u16(0), u16(volume), u16(0), ...IDENTITY_MATRIX, u32(0), u32(0),
  ]);

/** Version 1 `mdhd`: 64-bit duration, since 40 h at 44.1 kHz overflows 32 bits. */
const mdhd = (timescale: number, duration: number): Box =>
  leaf('mdhd', [u8(1), zeros(3), u64(0), u64(0), u32(timescale), u64(duration), u16(LANGUAGE_UND), u16(0)]);

const hdlr = (handler: string, name: string): Box =>
  leaf('hdlr', [u32(0), u32(0), fourCC(handler), zeros(12), utf8(name), u8(0)]);

const dinf = (): Box => container('dinf', [leaf('dref', [u32(0), u32(1), u32(12), fourCC('url '), u32(1)])]);

/** MPEG-4 descriptor with a 4-byte length field, as written by FFmpeg and iTunes. */
const descriptor = (tag: number, body: Uint8Array): Uint8Array =>
  concat([u8(tag), u8(0x80 | ((body.length >> 21) & 0x7f)), u8(0x80 | ((body.length >> 14) & 0x7f)),
    u8(0x80 | ((body.length >> 7) & 0x7f)), u8(body.length & 0x7f), body]);

const esds = (audioSpecificConfig: Uint8Array, bitrate: number): Box =>
  leaf('esds', [u32(0), descriptor(0x03, concat([
    u16(0), u8(0), // ES_ID, flags
    descriptor(0x04, concat([
      u8(0x40), // Object type: MPEG-4 Audio
      u8(0x15), // Stream type: audio
      zeros(3), // Buffer size
      u32(bitrate), u32(bitrate),
      descriptor(0x05, audioSpecificConfig),
    ])),
    descriptor(0x06, u8(0x02)), // SL config: predefined MP4
  ]))]);

export type AudioTrackInput = {
  trackId: number;
  /** Track holding QuickTime chapters, or null when they are not written. */
  chapterTrackId: number | null;
  sampleRate: number;
  numberOfChannels: number;
  bitrate: number;
  audioSpecificConfig: Uint8Array;
  durationMs: number;
  totalFrames: number;
  /** Run-length encoded frames per packet, as [count, frames] pairs. */
  timeToSample: readonly (readonly [number, number])[];
  sampleSizes: Uint32Array;
  /** Absolute file offsets of chunks, each holding `samplesPerChunk` packets (the last one may hold fewer). */
  chunkOffsets: readonly number[];
  samplesPerChunk: number;
};

export const audioTrak = (input: AudioTrackInput): Box => {
  const sampleCount = input.sampleSizes.length;
  const chunkCount = input.chunkOffsets.length;
  const lastChunkSamples = sampleCount - (chunkCount - 1) * input.samplesPerChunk;
  const useCo64 = input.chunkOffsets.some((offset) => offset > 0xffffffff);

  const mp4a = leaf('mp4a', [
    zeros(6), u16(1), zeros(8),
    u16(input.numberOfChannels), u16(16), u16(0), u16(0), u32(input.sampleRate * 0x10000),
    serializeLeaf(esds(input.audioSpecificConfig, input.bitrate)),
  ]);

  const stsc = lastChunkSamples === input.samplesPerChunk || chunkCount === 1
    ? [[1, chunkCount === 1 ? sampleCount : input.samplesPerChunk]]
    : [[1, input.samplesPerChunk], [chunkCount, lastChunkSamples]];

  const stsz = new Uint8Array(12 + sampleCount * 4);
  const stszView = new DataView(stsz.buffer);
  stszView.setUint32(8, sampleCount);
  input.sampleSizes.forEach((size, i) => stszView.setUint32(12 + i * 4, size));

  const offsets = new Uint8Array(8 + chunkCount * (useCo64 ? 8 : 4));
  const offsetsView = new DataView(offsets.buffer);
  offsetsView.setUint32(4, chunkCount);
  input.chunkOffsets.forEach((offset, i) => {
    if (useCo64) offsetsView.setBigUint64(8 + i * 8, BigInt(offset));
    else offsetsView.setUint32(8 + i * 4, offset);
  });

  return container('trak', [
    tkhd(input.trackId, input.durationMs, 3, 0x100),
    ...(input.chapterTrackId === null ? [] : [container('tref', [leaf('chap', [u32(input.chapterTrackId)])])]),
    container('mdia', [
      mdhd(input.sampleRate, input.totalFrames),
      hdlr('soun', 'SoundHandler'),
      container('minf', [
        leaf('smhd', [u32(0), u16(0), u16(0)]),
        dinf(),
        container('stbl', [
          leaf('stsd', [u32(0), u32(1), serializeLeaf(mp4a)]),
          leaf('stts', [u32(0), u32(input.timeToSample.length), ...input.timeToSample.flatMap(([count, frames]) => [u32(count), u32(frames)])]),
          leaf('stsc', [u32(0), u32(stsc.length), ...stsc.flatMap(([first, count]) => [u32(first), u32(count), u32(1)])]),
          { type: 'stsz', payload: stsz },
          { type: useCo64 ? 'co64' : 'stco', payload: offsets },
        ]),
      ]),
    ]),
  ]);
};

const serializeLeaf = (box: Box): Uint8Array => concat([u32(8 + box.payload!.length), fourCC(box.type), box.payload!]);

/** QuickTime text sample: 16-bit length, UTF-8 text, then an `encd` box declaring UTF-8. */
export const chapterTextSample = (title: string): Uint8Array => {
  const text = utf8(title).subarray(0, 0xffff);
  return concat([u16(text.length), text, u32(12), fourCC('encd'), u32(0x0100)]);
};

/** Chapter track as Apple Books reads it (same layout as `ffmpeg -f ipod`). */
export const chapterTrak = (input: {
  trackId: number;
  durationMs: number;
  chapters: readonly ChapterMarker[];
  totalSeconds: number;
  sampleSizes: readonly number[];
  chunkOffset: number;
}): Box => {
  const { chapters, totalSeconds } = input;
  const toTicks = (seconds: number) => Math.round(seconds * CHAPTER_TIMESCALE);
  const durations = chapters.map((chapter, i) =>
    Math.max(1, toTicks(chapters[i + 1]?.startSeconds ?? totalSeconds) - toTicks(chapter.startSeconds)));

  const textSampleEntry = concat([
    u32(59), fourCC('text'), zeros(6), u16(1),
    u32(1), // display flags
    u8(0), u8(0), // horizontal + vertical justification
    zeros(4), // background RGBA
    zeros(8), // default text box
    u16(0), u16(0), u16(1), u8(0), u8(0), zeros(4), // style record: chars, font id, flags, size, RGBA
    u32(13), fourCC('ftab'), u16(1), u16(1), u8(0), // font table with one unnamed font
  ]);

  return container('trak', [
    // Flags 2 = "in movie" but not enabled, so players don't render it as subtitles.
    tkhd(input.trackId, input.durationMs, 2, 0),
    container('mdia', [
      mdhd(CHAPTER_TIMESCALE, durations.reduce((sum, value) => sum + value, 0)),
      hdlr('text', 'SubtitleHandler'),
      container('minf', [
        container('gmhd', [
          leaf('gmin', [u32(0), u16(0x40), u16(0x8000), u16(0x8000), u16(0x8000), u16(0), u16(0)]),
          leaf('text', [u32(0x10000), zeros(12), u32(0x10000), zeros(12), u32(0x40000000)]),
        ]),
        dinf(),
        container('stbl', [
          leaf('stsd', [u32(0), u32(1), textSampleEntry]),
          leaf('stts', [u32(0), u32(durations.length), ...durations.flatMap((duration) => [u32(1), u32(duration)])]),
          leaf('stsc', [u32(0), u32(1), u32(1), u32(input.sampleSizes.length), u32(1)]),
          leaf('stsz', [u32(0), u32(0), u32(input.sampleSizes.length), ...input.sampleSizes.map(u32)]),
          input.chunkOffset > 0xffffffff
            ? leaf('co64', [u32(0), u32(1), u64(input.chunkOffset)])
            : leaf('stco', [u32(0), u32(1), u32(input.chunkOffset)]),
        ]),
      ]),
    ]),
  ]);
};

/** Nero chapters can list at most 255 entries (8-bit count). */
export const NERO_MAX_CHAPTERS = 255;

/** Nero chapter list (read by most non-Apple players). Times are in units of 100 ns. */
export const chpl = (chapters: readonly ChapterMarker[]): Box =>
  leaf('chpl', [
    u8(1), zeros(3), u32(0), u8(Math.min(chapters.length, NERO_MAX_CHAPTERS)),
    ...chapters.slice(0, NERO_MAX_CHAPTERS).flatMap((chapter) => {
      const title = truncateUtf8(chapter.title, 255);
      return [u64(BigInt(Math.round(chapter.startSeconds * 1e7))), u8(title.length), title];
    }),
  ]);

const truncateUtf8 = (text: string, maxBytes: number): Uint8Array => {
  let chars = [...text];
  let bytes = utf8(text);
  while (bytes.length > maxBytes) {
    chars = chars.slice(0, -1);
    bytes = utf8(chars.join(''));
  }
  return bytes;
};

/** iTunes-style `data` box. Types: 1 = UTF-8, 13 = JPEG, 14 = PNG, 21 = signed integer. */
const item = (key: string, type: number, value: Uint8Array): Box =>
  container(key, [leaf('data', [u32(type), u32(0), value])]);

const textItem = (key: string, value: string | undefined): Box[] => (value ? [item(key, 1, utf8(value))] : []);

/** `neroChapters` null leaves out the Nero chapter list. */
export const udta = (metadata: M4bMetadata, neroChapters: readonly ChapterMarker[] | null): Box => {
  const { cover } = metadata;
  const ilst = container('ilst', [
    ...textItem('©nam', metadata.title),
    ...textItem('©alb', metadata.album),
    ...textItem('©ART', metadata.artist),
    ...textItem('aART', metadata.albumArtist),
    ...textItem('©nrt', metadata.narrator),
    // Composer is where iTunes-style apps traditionally show the narrator.
    ...textItem('©wrt', metadata.narrator),
    ...textItem('©day', metadata.year),
    ...textItem('©gen', metadata.genre),
    ...textItem('desc', metadata.description),
    ...textItem('ldes', metadata.description),
    ...textItem('©too', 'Audiobook Converter'),
    item('stik', 21, u8(2)), // Media kind: Audiobook
    ...(cover ? [item('covr', cover.mimeType === 'image/png' ? 14 : 13, cover.data)] : []),
  ]);

  return container('udta', [
    container('meta', [leaf('hdlr', [u32(0), u32(0), fourCC('mdir'), fourCC('appl'), zeros(9)]), ilst], u32(0)),
    ...(neroChapters ? [chpl(neroChapters)] : []),
  ]);
};
