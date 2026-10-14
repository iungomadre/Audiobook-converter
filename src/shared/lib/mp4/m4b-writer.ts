import {
  audioTrak, chapterTextSample, chapterTrak, ftyp, MOVIE_TIMESCALE, mvhd, udta, type ChapterMarker, type M4bMetadata,
} from './atoms';
import { container, writeBox } from './box';
import { concat, fourCC, u32, u64 } from './bytes';
import type { RandomAccessFile } from './random-access-file';

export type AudioFormat = {
  sampleRate: number;
  numberOfChannels: number;
  bitrate: number;
};

export type FinishOptions = {
  chapters: readonly ChapterMarker[];
  metadata: M4bMetadata;
};

const SAMPLES_PER_CHUNK = 64; // ~1.5 s of AAC per chunk
const WRITE_BUFFER_SIZE = 1 << 20; // Packets are tiny; batch them into 1 MB disk writes
const MDAT_HEADER_SIZE = 16; // 64-bit "largesize" header, so books over 4 GB still work
const AUDIO_TRACK_ID = 1;
const CHAPTER_TRACK_ID = 2;

/**
 * Streams AAC packets straight into an M4B file. Only one 32-bit size per
 * packet is kept in memory (~25 MB for a 40-hour book); everything else lives
 * on disk. `finish` appends the chapter samples and the `moov` box.
 */
export class M4bWriter {
  private position: number;
  private readonly mdatStart: number;
  private sizes = new Uint32Array(1 << 16);
  private sampleCount = 0;
  private totalFrames = 0;
  private timeToSample: [number, number][] = [];
  private audioSpecificConfig: Uint8Array | null = null;
  private readonly buffer = new Uint8Array(WRITE_BUFFER_SIZE);
  private buffered = 0;

  constructor(private readonly file: RandomAccessFile, private readonly format: AudioFormat) {
    file.truncate(0);
    this.position = writeBox(file, 0, ftyp());
    this.mdatStart = this.position;
    file.write(this.position, concat([u32(1), fourCC('mdat'), u64(0)]));
    this.position += MDAT_HEADER_SIZE;
  }

  /**
   * Adds one encoded AAC packet. `description` is the AudioSpecificConfig from
   * the encoder (WebCodecs `decoderConfig.description`); packets without one
   * are expected to be ADTS frames, whose header is stripped.
   */
  addPacket(data: Uint8Array, frames: number, description?: Uint8Array): void {
    let payload = data;
    if (!this.audioSpecificConfig) {
      this.audioSpecificConfig = description ?? audioSpecificConfigFromAdts(data);
    }
    if (!description && isAdts(data)) payload = data.subarray(adtsHeaderLength(data));

    this.writeBuffered(payload);

    if (this.sampleCount === this.sizes.length) {
      const grown = new Uint32Array(this.sizes.length * 2);
      grown.set(this.sizes);
      this.sizes = grown;
    }
    this.sizes[this.sampleCount++] = payload.length;
    this.totalFrames += frames;

    const last = this.timeToSample.at(-1);
    if (last && last[1] === frames) last[0]++;
    else this.timeToSample.push([1, frames]);
  }

  private writeBuffered(data: Uint8Array): void {
    if (this.buffered + data.length > this.buffer.length) this.flush();
    if (data.length > this.buffer.length) {
      this.file.write(this.position, data);
      this.position += data.length;
      return;
    }
    this.buffer.set(data, this.buffered);
    this.buffered += data.length;
  }

  private flush(): void {
    if (this.buffered === 0) return;
    this.file.write(this.position, this.buffer.subarray(0, this.buffered));
    this.position += this.buffered;
    this.buffered = 0;
  }

  get durationSeconds(): number {
    return this.totalFrames / this.format.sampleRate;
  }

  finish({ chapters, metadata }: FinishOptions): number {
    if (!this.audioSpecificConfig || this.sampleCount === 0) throw new Error('No audio was encoded');
    this.flush();

    // Close the audio mdat.
    this.file.write(this.mdatStart + 8, u64(this.position - this.mdatStart));

    const sampleSizes = this.sizes.subarray(0, this.sampleCount);
    const chunkOffsets: number[] = [];
    let offset = this.mdatStart + MDAT_HEADER_SIZE;
    for (let i = 0; i < sampleSizes.length; i++) {
      if (i % SAMPLES_PER_CHUNK === 0) chunkOffsets.push(offset);
      offset += sampleSizes[i];
    }

    const totalSeconds = this.durationSeconds;
    const markers = normalizeChapters(chapters, totalSeconds);
    const textSamples = markers.map((chapter) => chapterTextSample(chapter.title));
    const textData = concat(textSamples);
    this.file.write(this.position, concat([u32(textData.length + 8), fourCC('mdat'), textData]));
    const textChunkOffset = this.position + 8;
    this.position += textData.length + 8;

    const durationMs = Math.round(totalSeconds * MOVIE_TIMESCALE);
    const moov = container('moov', [
      mvhd(durationMs, CHAPTER_TRACK_ID + 1),
      audioTrak({
        trackId: AUDIO_TRACK_ID,
        chapterTrackId: CHAPTER_TRACK_ID,
        ...this.format,
        audioSpecificConfig: this.audioSpecificConfig,
        durationMs,
        totalFrames: this.totalFrames,
        timeToSample: this.timeToSample,
        sampleSizes,
        chunkOffsets,
        samplesPerChunk: SAMPLES_PER_CHUNK,
      }),
      chapterTrak({
        trackId: CHAPTER_TRACK_ID,
        durationMs,
        chapters: markers,
        totalSeconds,
        sampleSizes: textSamples.map((sample) => sample.length),
        chunkOffset: textChunkOffset,
      }),
      udta(metadata, markers),
    ]);

    this.position = writeBox(this.file, this.position, moov);
    this.file.truncate(this.position);
    return this.position;
  }
}

const normalizeChapters = (chapters: readonly ChapterMarker[], totalSeconds: number): ChapterMarker[] => {
  const sorted = chapters
    .filter((chapter) => chapter.startSeconds < totalSeconds)
    .toSorted((a, b) => a.startSeconds - b.startSeconds);
  if (sorted.length === 0) return [{ title: 'Chapter 1', startSeconds: 0 }];
  sorted[0] = { ...sorted[0], startSeconds: 0 };
  return sorted;
};

const isAdts = (data: Uint8Array): boolean => data.length > 7 && data[0] === 0xff && (data[1] & 0xf6) === 0xf0;

const adtsHeaderLength = (data: Uint8Array): number => ((data[1] & 0x01) === 1 ? 7 : 9);

/** Builds the 2-byte AudioSpecificConfig from an ADTS header. */
const audioSpecificConfigFromAdts = (data: Uint8Array): Uint8Array => {
  if (!isAdts(data)) throw new Error('Encoder produced AAC without a decoder configuration');
  const objectType = ((data[2] >> 6) & 0x03) + 1;
  const frequencyIndex = (data[2] >> 2) & 0x0f;
  const channels = ((data[2] & 0x01) << 2) | ((data[3] >> 6) & 0x03);
  const config = (objectType << 11) | (frequencyIndex << 7) | (channels << 3);
  return Uint8Array.of(config >> 8, config & 0xff);
};
