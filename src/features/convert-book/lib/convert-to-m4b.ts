import {
  AdtsOutputFormat, ALL_FORMATS, AudioSample, AudioSampleSink, AudioSampleSource, BlobSource, canEncodeAudio, Input,
  NullTarget, Output,
} from 'mediabunny';
import type { BookMetadata } from '@/entities/book';
import { remixChannels, StreamingResampler, type PlanarPcm } from '@/shared/lib/audio';
import {
  M4bWriter, PacketWriter, type AudioFormat, type ChapterMarker, type M4bMetadata, type RandomAccessFile,
} from '@/shared/lib/mp4';
import { LocalizedError } from '../model/errors';
import type { ConversionJob, ConversionSettings } from '../model/protocol';

export const SAMPLE_RATE = 44_100;
const PROGRESS_INTERVAL_MS = 250;

let wasmEncoderRegistered = false;

/** Uses the browser's AAC encoder when it has one, otherwise registers the WASM (FFmpeg) encoder. */
const ensureAacEncoder = async (numberOfChannels: number, bitrate: number): Promise<'native' | 'wasm'> => {
  if (wasmEncoderRegistered) return 'wasm';
  if (await canEncodeAudio('aac', { numberOfChannels, sampleRate: SAMPLE_RATE, bitrate })) return 'native';
  // Loaded on demand: the WASM encoder is ~1 MB and most browsers don't need it.
  const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
  registerAacEncoder();
  wasmEncoderRegistered = true;
  return 'wasm';
};

const audioFormat = (settings: ConversionSettings): AudioFormat => ({
  sampleRate: SAMPLE_RATE,
  numberOfChannels: settings.numberOfChannels,
  bitrate: settings.bitrate,
});

/**
 * Decodes one input file and writes it as raw AAC packets into `part`.
 * Returns the packet sizes and decoder config needed to assemble the book.
 */
export const encodeChapter = async (
  settings: ConversionSettings,
  inputFile: File,
  part: RandomAccessFile,
  onProgress: (chapterSeconds: number) => void,
): Promise<{ sizes: Uint32Array; audioSpecificConfig: Uint8Array; encoder: 'native' | 'wasm' }> => {
  const encoder = await ensureAacEncoder(settings.numberOfChannels, settings.bitrate);
  part.truncate(0);
  const writer = new PacketWriter(part, 0);

  // Mediabunny only decodes and encodes here: packets go to our own writer, and
  // its lightweight ADTS muxer (which keeps nothing) writes into a NullTarget.
  const output = new Output({ format: new AdtsOutputFormat(), target: new NullTarget() });
  const source = new AudioSampleSource({
    codec: 'aac',
    bitrate: settings.bitrate,
    onEncodedPacket: (packet, meta) => {
      const description = meta?.decoderConfig?.description;
      writer.addPacket(packet.data, description ? toBytes(description) : undefined);
    },
  });
  output.addAudioTrack(source);
  await output.start();

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(inputFile) });
  let framesWritten = 0;
  let lastReport = 0;
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new LocalizedError('error.noAudio', { file: inputFile.name }, `"${inputFile.name}" contains no audio.`);
    if (!(await track.canDecode())) {
      const codec = track.codec ?? '?';
      throw new LocalizedError('error.cannotDecode', { file: inputFile.name, codec }, `Cannot decode "${inputFile.name}" (${codec}).`);
    }

    // Mediabunny needs constant input parameters per track, so every file is
    // normalized to the same channel count and sample rate before encoding.
    const resampler = new StreamingResampler(track.sampleRate, SAMPLE_RATE, settings.numberOfChannels);
    for await (const decoded of new AudioSampleSink(track).samples()) {
      const pcm = resampler.process(remixChannels(toPlanar(decoded), settings.numberOfChannels));
      decoded.close();
      if (pcm[0].length === 0) continue;

      const sample = fromPlanar(pcm, framesWritten / SAMPLE_RATE);
      framesWritten += pcm[0].length;
      await source.add(sample);
      sample.close();

      const now = Date.now();
      if (now - lastReport >= PROGRESS_INTERVAL_MS) {
        lastReport = now;
        onProgress(framesWritten / SAMPLE_RATE);
      }
    }

    source.close();
    await output.finalize(); // Flushes the encoder, so every packet of this chapter is written
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    input.dispose();
  }

  writer.flush();
  if (!writer.audioSpecificConfig) throw new LocalizedError('error.noAudio', { file: inputFile.name }, `"${inputFile.name}" contains no audio.`);
  return { sizes: writer.packetSizes.slice(), audioSpecificConfig: writer.audioSpecificConfig, encoder };
};

export const buildMetadata = (metadata: BookMetadata, cover: ConversionJob['cover']): M4bMetadata => ({
  title: metadata.title,
  album: metadata.title,
  artist: metadata.author,
  albumArtist: metadata.author,
  narrator: metadata.narrator,
  year: metadata.year,
  genre: metadata.genre,
  description: metadata.description,
  cover,
});

export type PartSource = {
  sizes: Uint32Array;
  /** Opens the part file; `release` closes and deletes it once copied. */
  open: () => Promise<{ file: RandomAccessFile; release: () => Promise<void> }>;
};

/**
 * Copies the chapter parts into the M4B in order, deleting each one once it is
 * copied (so the extra disk space stays around one part), then writes the
 * chapters, tags and cover.
 */
export const assembleBook = async (
  settings: ConversionSettings,
  file: RandomAccessFile,
  parts: PartSource[],
  audioSpecificConfig: Uint8Array,
  chapters: ChapterMarker[],
  metadata: M4bMetadata,
): Promise<{ size: number; durationSeconds: number }> => {
  const writer = new M4bWriter(file, audioFormat(settings));
  for (const part of parts) {
    const { file: partFile, release } = await part.open();
    writer.appendPart(partFile, part.sizes, audioSpecificConfig);
    await release();
  }
  const size = writer.finish({ chapters, metadata });
  return { size, durationSeconds: writer.durationSeconds };
};

const toBytes = (source: AllowSharedBufferSource): Uint8Array =>
  ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);

const toPlanar = (sample: AudioSample): PlanarPcm =>
  Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
    const plane = new Float32Array(sample.numberOfFrames);
    sample.copyTo(plane, { planeIndex, format: 'f32-planar' });
    return plane;
  });

const fromPlanar = (pcm: PlanarPcm, timestamp: number): AudioSample => {
  const frames = pcm[0].length;
  const data = new Float32Array(frames * pcm.length);
  pcm.forEach((plane, channel) => data.set(plane, channel * frames));
  return new AudioSample({ data, format: 'f32-planar', numberOfChannels: pcm.length, sampleRate: SAMPLE_RATE, timestamp });
};
