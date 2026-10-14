import { container, findChild, findPath, leaf, parseBoxes, serializeBox, type Box } from './box';
import { concat, fourCC, readFourCC, u16, u32, u64, u8, utf8, view, zeros } from './bytes';
import type { RandomAccessFile } from './random-access-file';

export type ChapterMarker = {
  title: string;
  /** Start of the chapter, in seconds from the beginning of the book. */
  startSeconds: number;
};

export type FinalizeOptions = {
  chapters: readonly ChapterMarker[];
};

type TopLevelBox = { type: string; offset: number; size: number };

const CHAPTER_TIMESCALE = 1000;
const MAX_CHPL_TITLE_BYTES = 255;

/**
 * Post-processes an MP4 file written by Mediabunny (with `fastStart: false`)
 * so that audiobook players treat it as a proper M4B:
 *
 * - QuickTime chapter track (text track referenced by the audio track's
 *   `tref/chap`), which is what Apple Books reads;
 * - Nero `chpl` chapter list, read by most other players;
 * - `stik = 2` (media kind "Audiobook");
 * - `M4A ` major brand, as written by iTunes / `ffmpeg -f ipod`.
 *
 * Audio sample data is never moved, so this costs only one rewrite of `moov`.
 */
export const finalizeAudiobook = (file: RandomAccessFile, options: FinalizeOptions): void => {
  const topLevel = scanTopLevel(file);

  const ftyp = topLevel.find((box) => box.type === 'ftyp');
  if (ftyp) file.write(ftyp.offset + 8, fourCC('M4A '));

  const moovEntry = topLevel.find((box) => box.type === 'moov');
  if (!moovEntry) throw new Error('No "moov" box found in the output file');
  const [moov] = parseBoxes(file.read(moovEntry.offset, moovEntry.size));

  const mvhd = findChild(moov, 'mvhd');
  const audioTrak = moov.children?.find((box) => box.type === 'trak' && handlerType(box) === 'soun');
  if (!mvhd?.payload || !audioTrak) throw new Error('Output file has no audio track');

  const movie = readMvhd(mvhd.payload);
  const totalSeconds = movie.duration / movie.timescale;
  const chapters = normalizeChapters(options.chapters, totalSeconds);

  // New data goes where the old `moov` was if it is the last box (Mediabunny's
  // layout without fast start); otherwise the old `moov` is turned into `free`.
  const isMoovLast = moovEntry.offset + moovEntry.size === file.getSize();
  if (!isMoovLast) file.write(moovEntry.offset + 4, fourCC('free'));
  const writeOffset = isMoovLast ? moovEntry.offset : file.getSize();

  const samples = chapters.map((chapter) => textSample(chapter.title));
  const chapterMdat = mdatBox(samples);
  const chunkOffset = writeOffset + chapterMdat.headerSize;

  const chapterTrackId = movie.nextTrackId;

  setNextTrackId(mvhd.payload, chapterTrackId + 1);
  setChapterReference(audioTrak, chapterTrackId);

  const chapterTrak = buildChapterTrak({
    trackId: chapterTrackId,
    movieDuration: movie.duration,
    chapters,
    totalSeconds,
    sampleSizes: samples.map((sample) => sample.length),
    chunkOffset,
  });
  const audioIndex = moov.children!.indexOf(audioTrak);
  moov.children!.splice(audioIndex + 1, 0, chapterTrak);

  const udta = getOrAppend(moov, 'udta', () => container('udta', []));
  udta.children = udta.children!.filter((box) => box.type !== 'chpl');
  udta.children.push(chplBox(chapters));
  setMediaKindAudiobook(udta);

  const newMoov = serializeBox(moov);
  file.write(writeOffset, chapterMdat.bytes);
  file.write(writeOffset + chapterMdat.bytes.length, newMoov);
  file.truncate(writeOffset + chapterMdat.bytes.length + newMoov.length);

};

const scanTopLevel = (file: RandomAccessFile): TopLevelBox[] => {
  const boxes: TopLevelBox[] = [];
  const fileSize = file.getSize();
  let offset = 0;

  while (offset + 8 <= fileSize) {
    const header = file.read(offset, Math.min(16, fileSize - offset));
    const data = view(header);
    let size = data.getUint32(0);
    const type = readFourCC(header, 4);
    if (size === 1) size = Number(data.getBigUint64(8));
    else if (size === 0) size = fileSize - offset;
    if (size < 8) throw new Error(`Malformed top-level "${type}" box at offset ${offset}`);

    boxes.push({ type, offset, size });
    offset += size;
  }

  return boxes;
};

const handlerType = (trak: Box): string | undefined => {
  const hdlr = findPath(trak, ['mdia', 'hdlr']);
  return hdlr?.payload ? readFourCC(hdlr.payload, 8) : undefined;
};

const readMvhd = (payload: Uint8Array) => {
  const data = view(payload);
  const isV1 = payload[0] === 1;
  return {
    timescale: data.getUint32(isV1 ? 20 : 12),
    duration: isV1 ? Number(data.getBigUint64(24)) : data.getUint32(16),
    nextTrackId: data.getUint32(payload.length - 4),
  };
};

const setNextTrackId = (mvhdPayload: Uint8Array, id: number): void => {
  view(mvhdPayload).setUint32(mvhdPayload.length - 4, id);
};

const setChapterReference = (audioTrak: Box, chapterTrackId: number): void => {
  const chap = leaf('chap', [u32(chapterTrackId)]);
  let tref = findChild(audioTrak, 'tref');
  if (!tref) {
    tref = container('tref', []);
    const mdiaIndex = audioTrak.children!.findIndex((box) => box.type === 'mdia');
    audioTrak.children!.splice(mdiaIndex, 0, tref);
  }
  tref.children = [...tref.children!.filter((box) => box.type !== 'chap'), chap];
};

const normalizeChapters = (chapters: readonly ChapterMarker[], totalSeconds: number): ChapterMarker[] => {
  const sorted = chapters
    .filter((chapter) => chapter.startSeconds < totalSeconds)
    .toSorted((a, b) => a.startSeconds - b.startSeconds);
  if (sorted.length === 0) return [{ title: 'Chapter 1', startSeconds: 0 }];
  sorted[0] = { ...sorted[0], startSeconds: 0 };
  return sorted;
};

/** QuickTime text sample: 16-bit length, UTF-8 text, then an `encd` box declaring UTF-8. */
const textSample = (title: string): Uint8Array => {
  const text = utf8(title).subarray(0, 0xffff);
  return concat([u16(text.length), text, u32(12), fourCC('encd'), u32(0x0100)]);
};

const mdatBox = (samples: readonly Uint8Array[]) => {
  const body = concat(samples);
  return { bytes: concat([u32(body.length + 8), fourCC('mdat'), body]), headerSize: 8 };
};

type ChapterTrakInput = {
  trackId: number;
  movieDuration: number;
  chapters: readonly ChapterMarker[];
  totalSeconds: number;
  sampleSizes: readonly number[];
  chunkOffset: number;
};

const buildChapterTrak = (input: ChapterTrakInput): Box => {
  const { chapters, totalSeconds } = input;
  const toTicks = (seconds: number) => Math.round(seconds * CHAPTER_TIMESCALE);
  const durations = chapters.map((chapter, i) =>
    Math.max(1, toTicks(chapters[i + 1]?.startSeconds ?? totalSeconds) - toTicks(chapter.startSeconds)));
  const mediaDuration = durations.reduce((sum, value) => sum + value, 0);
  const identityMatrix = [u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)];

  // Track flags 0x2 = "in movie" but not enabled, so players don't render it as subtitles.
  const tkhd = leaf('tkhd', [
    u8(0), u8(0), u16(2),
    u32(0), u32(0), u32(input.trackId), u32(0), u32(input.movieDuration),
    zeros(8), u16(0), u16(0), u16(0), u16(0),
    ...identityMatrix,
    u32(0), u32(0),
  ]);

  const mdhd = leaf('mdhd', [u32(0), u32(0), u32(0), u32(CHAPTER_TIMESCALE), u32(mediaDuration), u16(0x55c4), u16(0)]);
  const hdlr = leaf('hdlr', [u32(0), u32(0), fourCC('text'), zeros(12), utf8('SubtitleHandler'), u8(0)]);

  const gmhd = container('gmhd', [
    leaf('gmin', [u32(0), u16(0x40), u16(0x8000), u16(0x8000), u16(0x8000), u16(0), u16(0)]),
    leaf('text', [u32(0x10000), zeros(12), u32(0x10000), zeros(12), u32(0x40000000)]),
  ]);
  const dinf = container('dinf', [leaf('dref', [u32(0), u32(1), u32(12), fourCC('url '), u32(1)])]);

  const textSampleEntry = concat([
    u32(59), fourCC('text'), zeros(6), u16(1),
    u32(1), // display flags
    u8(0), u8(0), // horizontal + vertical justification
    zeros(4), // background RGBA
    zeros(8), // default text box
    u16(0), u16(0), u16(1), u8(0), u8(0), zeros(4), // style record: chars, font id, flags, size, RGBA
    u32(13), fourCC('ftab'), u16(1), u16(1), u8(0), // font table with one unnamed font
  ]);

  const stbl = container('stbl', [
    leaf('stsd', [u32(0), u32(1), textSampleEntry]),
    leaf('stts', [u32(0), u32(durations.length), ...durations.flatMap((duration) => [u32(1), u32(duration)])]),
    leaf('stsc', [u32(0), u32(1), u32(1), u32(input.sampleSizes.length), u32(1)]),
    leaf('stsz', [u32(0), u32(0), u32(input.sampleSizes.length), ...input.sampleSizes.map(u32)]),
    input.chunkOffset > 0xffffffff
      ? leaf('co64', [u32(0), u32(1), u64(input.chunkOffset)])
      : leaf('stco', [u32(0), u32(1), u32(input.chunkOffset)]),
  ]);

  return container('trak', [
    tkhd,
    container('mdia', [mdhd, hdlr, container('minf', [gmhd, dinf, stbl])]),
  ]);
};

/** Nero chapter list. Times are in units of 100 ns. */
const chplBox = (chapters: readonly ChapterMarker[]): Box =>
  leaf('chpl', [
    u8(1), zeros(3), u32(0), u8(Math.min(chapters.length, 255)),
    ...chapters.slice(0, 255).flatMap((chapter) => {
      const title = truncateUtf8(chapter.title, MAX_CHPL_TITLE_BYTES);
      return [u64(BigInt(Math.round(chapter.startSeconds * 1e7))), u8(title.length), title];
    }),
  ]);

const truncateUtf8 = (text: string, maxBytes: number): Uint8Array => {
  let bytes = utf8(text);
  let chars = [...text];
  while (bytes.length > maxBytes) {
    chars = chars.slice(0, -1);
    bytes = utf8(chars.join(''));
  }
  return bytes;
};

const setMediaKindAudiobook = (udta: Box): void => {
  const meta = getOrAppend(udta, 'meta', () =>
    container('meta', [leaf('hdlr', [u32(0), u32(0), fourCC('mdir'), fourCC('appl'), zeros(9)])], u32(0)));
  const ilst = getOrAppend(meta, 'ilst', () => container('ilst', []));
  // Data type 21 = signed big-endian integer; value 2 = Audiobook.
  const stik = leaf('stik', [u32(17), fourCC('data'), u32(21), u32(0), u8(2)]);
  ilst.children = [...ilst.children!.filter((box) => box.type !== 'stik'), stik];
};

const getOrAppend = (parent: Box, type: string, create: () => Box): Box => {
  let child = findChild(parent, type);
  if (!child) {
    child = create();
    parent.children!.push(child);
  }
  return child;
};
