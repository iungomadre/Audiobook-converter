import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ADTS, BufferSource, EncodedAudioPacketSource, EncodedPacketSink, Input, Mp4OutputFormat, Output, StreamTarget,
} from 'mediabunny';
import { describe, expect, it } from 'vitest';
import { findPath, parseBoxes, type Box } from './box';
import { readFourCC } from './bytes';
import { createFileWritable, finalizeAudiobook, MemoryFile } from './index';

const FIXTURE = new URL('./__fixtures__/tone-6s.aac', import.meta.url);

/** Remuxes the ADTS fixture into an MP4 the same way the converter writes its output. */
const writeMp4 = async (): Promise<MemoryFile> => {
  const input = new Input({ formats: [ADTS], source: new BufferSource(readFileSync(FIXTURE)) });
  const track = (await input.getPrimaryAudioTrack())!;
  const decoderConfig = (await track.getDecoderConfig())!;

  const file = new MemoryFile();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target: new StreamTarget(createFileWritable(file)),
  });
  const source = new EncodedAudioPacketSource('aac');
  output.addAudioTrack(source);
  output.setMetadataTags({ title: 'Test Book', artist: 'Author', raw: { '©nrt': 'Narrator' } });
  await output.start();

  let first = true;
  for await (const packet of new EncodedPacketSink(track).packets()) {
    await source.add(packet, first ? { decoderConfig } : undefined);
    first = false;
  }
  source.close();
  await output.finalize();
  return file;
};

const CHAPTERS = [
  { title: 'Chapter 1', startSeconds: 0 },
  { title: 'Rozdział 2 – zażółć', startSeconds: 2.5 },
  { title: 'Chapter 3', startSeconds: 4 },
];

const topLevelTypes = (bytes: Uint8Array) => parseBoxes(bytes).map((box) => box.type);
const moovOf = (bytes: Uint8Array): Box => parseBoxes(bytes).find((box) => box.type === 'moov')!;

describe('finalizeAudiobook', () => {
  it('adds a QuickTime chapter track, chpl and stik, keeping existing metadata', async () => {
    const file = await writeMp4();
    finalizeAudiobook(file, { chapters: CHAPTERS });

    expect(readFourCC(file.bytes, 8)).toBe('M4A ');
    expect(topLevelTypes(file.bytes)).toEqual(['ftyp', 'mdat', 'mdat', 'moov']);

    const moov = moovOf(file.bytes);
    const traks = moov.children!.filter((box) => box.type === 'trak');
    expect(traks).toHaveLength(2);
    expect(findPath(traks[0], ['tref', 'chap'])).toBeDefined();
    expect(readFourCC(findPath(traks[1], ['mdia', 'hdlr'])!.payload!, 8)).toBe('text');

    const ilst = findPath(moov, ['udta', 'meta', 'ilst'])!;
    expect(ilst.children!.map((box) => box.type)).toEqual(expect.arrayContaining(['©nam', '©ART', '©nrt', 'stik']));
    expect(findPath(moov, ['udta', 'chpl'])).toBeDefined();
  });

  it.skipIf(!hasFfprobe())('produces chapters that ffprobe reads', async () => {
    const file = await writeMp4();
    finalizeAudiobook(file, { chapters: CHAPTERS });

    const path = join(mkdtempSync(join(tmpdir(), 'm4b-')), 'book.m4b');
    writeFileSync(path, file.bytes);
    const probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error', '-print_format', 'json', '-show_chapters', '-show_format', '-show_streams', path,
    ]).toString());

    expect(probe.chapters.map((c: { tags: { title: string } }) => c.tags.title)).toEqual(CHAPTERS.map((c) => c.title));
    expect(probe.chapters.map((c: { start_time: string }) => Number(c.start_time))).toEqual([0, 2.5, 4]);
    expect(probe.format.tags).toMatchObject({ title: 'Test Book', artist: 'Author', media_type: '2' });
    expect(probe.streams.filter((s: { codec_type: string }) => s.codec_type === 'audio')).toHaveLength(1);
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
