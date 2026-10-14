import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findPath, parseBoxes } from './box';
import { readFourCC } from './bytes';
import { M4bWriter, MemoryFile } from './index';

const FIXTURE = readFileSync(new URL('./__fixtures__/tone-6s.aac', import.meta.url));
const FORMAT = { sampleRate: 44_100, numberOfChannels: 1, bitrate: 32_000 };

const CHAPTERS = [
  { title: 'Chapter 1', startSeconds: 0 },
  { title: 'Rozdział 2 – zażółć', startSeconds: 2.5 },
  { title: 'Chapter 3', startSeconds: 4 },
];

const METADATA = {
  title: 'Test Book', album: 'Test Book', artist: 'Author', narrator: 'Narrator', year: '2021',
  description: 'Opis', cover: { data: Uint8Array.of(0xff, 0xd8, 0xff, 0xd9), mimeType: 'image/jpeg' },
};

/** Splits the ADTS fixture into frames (header included). */
const adtsFrames = (): Uint8Array[] => {
  const frames: Uint8Array[] = [];
  for (let offset = 0; offset < FIXTURE.length;) {
    const length = ((FIXTURE[offset + 3] & 0x03) << 11) | (FIXTURE[offset + 4] << 3) | (FIXTURE[offset + 5] >> 5);
    frames.push(FIXTURE.subarray(offset, offset + length));
    offset += length;
  }
  return frames;
};

// AAC-LC, 44.1 kHz, mono.
const AUDIO_SPECIFIC_CONFIG = Uint8Array.of(0x12, 0x08);

/** Raw AAC packets + AudioSpecificConfig, as WebCodecs' AudioEncoder delivers them. */
const writeFromRawPackets = (): MemoryFile => {
  const file = new MemoryFile();
  const writer = new M4bWriter(file, FORMAT);
  for (const frame of adtsFrames()) writer.addPacket(frame.subarray(7), 1024, AUDIO_SPECIFIC_CONFIG);
  writer.finish({ chapters: CHAPTERS, metadata: METADATA });
  return file;
};

/** ADTS frames without a description, as some encoders deliver them. */
const writeFromAdtsFrames = (): MemoryFile => {
  const file = new MemoryFile();
  const writer = new M4bWriter(file, FORMAT);
  for (const frame of adtsFrames()) writer.addPacket(frame, 1024);
  writer.finish({ chapters: CHAPTERS, metadata: METADATA });
  return file;
};

const probe = (bytes: Uint8Array) => {
  const path = join(mkdtempSync(join(tmpdir(), 'm4b-')), 'book.m4b');
  writeFileSync(path, bytes);
  execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-map', '0:a', '-f', 'null', '-']); // Throws if the audio does not decode
  return JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-print_format', 'json', '-show_chapters', '-show_format', '-show_streams', path,
  ]).toString());
};

describe('M4bWriter', () => {
  it('writes an Apple-style audiobook layout', () => {
    const { bytes } = writeFromRawPackets();
    expect(readFourCC(bytes, 8)).toBe('M4A ');

    const boxes = parseBoxes(bytes);
    expect(boxes.map((box) => box.type)).toEqual(['ftyp', 'mdat', 'mdat', 'moov']);
    const moov = boxes.at(-1)!;
    const traks = moov.children!.filter((box) => box.type === 'trak');
    expect(findPath(traks[0], ['tref', 'chap'])).toBeDefined();
    expect(readFourCC(findPath(traks[1], ['mdia', 'hdlr'])!.payload!, 8)).toBe('text');
    expect(findPath(moov, ['udta', 'chpl'])).toBeDefined();
    const ilst = findPath(moov, ['udta', 'meta', 'ilst'])!;
    expect(ilst.children!.map((box) => box.type)).toEqual(expect.arrayContaining(['©nam', '©ART', '©nrt', 'stik', 'covr']));
  });

  it.skipIf(!hasFfprobe()).each([
    ['raw packets with a description', writeFromRawPackets],
    ['ADTS frames', writeFromAdtsFrames],
  ])('produces a file ffmpeg plays and reads chapters from (%s)', (_, write) => {
    const result = probe(write().bytes);

    expect(result.chapters.map((c: { tags: { title: string } }) => c.tags.title)).toEqual(CHAPTERS.map((c) => c.title));
    expect(result.chapters.map((c: { start_time: string }) => Number(c.start_time))).toEqual([0, 2.5, 4]);
    expect(result.format.tags).toMatchObject({ title: 'Test Book', artist: 'Author', date: '2021', media_type: '2' });
    const audio = result.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
    expect(audio).toMatchObject({ codec_name: 'aac', sample_rate: '44100', channels: 1 });
    expect(Number(audio.duration)).toBeCloseTo(6, 0);
  });
});

function hasFfprobe(): boolean {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
