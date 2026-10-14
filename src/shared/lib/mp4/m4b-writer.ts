import {
  audioTrak, chapterTextSample, chapterTrak, ftyp, MOVIE_TIMESCALE, mvhd, udta, type ChapterMarker, type M4bMetadata,
} from './atoms';
import { container, writeBox } from './box';
import { concat, fourCC, u32, u64 } from './bytes';
import { AAC_FRAMES_PER_PACKET, PacketWriter } from './packets';
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
const MDAT_HEADER_SIZE = 16; // 64-bit "largesize" header, so books over 4 GB still work
const AUDIO_TRACK_ID = 1;
const CHAPTER_TRACK_ID = 2;

/**
 * Writes an M4B: AAC packets go straight to disk (added one by one, or copied
 * from per-chapter part files encoded in parallel), then `finish` appends the
 * chapter samples and the `moov` box with tags and cover.
 */
export class M4bWriter {
  private readonly mdatStart: number;
  private readonly packets: PacketWriter;

  constructor(private readonly file: RandomAccessFile, private readonly format: AudioFormat) {
    file.truncate(0);
    this.mdatStart = writeBox(file, 0, ftyp());
    file.write(this.mdatStart, concat([u32(1), fourCC('mdat'), u64(0)]));
    this.packets = new PacketWriter(file, this.mdatStart + MDAT_HEADER_SIZE);
  }

  addPacket(data: Uint8Array, description?: Uint8Array): void {
    this.packets.addPacket(data, description);
  }

  /** Appends a chapter encoded separately into `part` by a PacketWriter. */
  appendPart(part: RandomAccessFile, sizes: Uint32Array, audioSpecificConfig: Uint8Array): void {
    this.packets.appendFrom(part, sizes, audioSpecificConfig);
  }

  get durationSeconds(): number {
    return (this.packets.packetSizes.length * AAC_FRAMES_PER_PACKET) / this.format.sampleRate;
  }

  /** Writes chapters, tags and cover; returns the final file size. */
  finish({ chapters, metadata }: FinishOptions): number {
    const sampleSizes = this.packets.packetSizes;
    const audioSpecificConfig = this.packets.audioSpecificConfig;
    if (!audioSpecificConfig || sampleSizes.length === 0) throw new Error('No audio was encoded');
    let position = this.packets.flush();

    // Close the audio mdat.
    this.file.write(this.mdatStart + 8, u64(position - this.mdatStart));

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
    this.file.write(position, concat([u32(textData.length + 8), fourCC('mdat'), textData]));
    const textChunkOffset = position + 8;
    position += textData.length + 8;

    const durationMs = Math.round(totalSeconds * MOVIE_TIMESCALE);
    const moov = container('moov', [
      mvhd(durationMs, CHAPTER_TRACK_ID + 1),
      audioTrak({
        trackId: AUDIO_TRACK_ID,
        chapterTrackId: CHAPTER_TRACK_ID,
        ...this.format,
        audioSpecificConfig,
        durationMs,
        totalFrames: sampleSizes.length * AAC_FRAMES_PER_PACKET,
        timeToSample: [[sampleSizes.length, AAC_FRAMES_PER_PACKET]],
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

    position = writeBox(this.file, position, moov);
    this.file.truncate(position);
    return position;
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
