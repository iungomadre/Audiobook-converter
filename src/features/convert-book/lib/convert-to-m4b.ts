import {
  AdtsOutputFormat, ALL_FORMATS, AudioSample, AudioSampleSink, AudioSampleSource, BlobSource, canEncodeAudio, Input,
  NullTarget, Output,
} from 'mediabunny';
import { remixChannels, StreamingResampler, type PlanarPcm } from '@/shared/lib/audio';
import { M4bWriter, type ChapterMarker, type M4bMetadata, type RandomAccessFile } from '@/shared/lib/mp4';
import type { ConversionJob, ConversionProgress } from '../model/protocol';

const SAMPLE_RATE = 44_100;
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

export const buildMetadata = (job: ConversionJob): M4bMetadata => {
  const { title, author, narrator, year, genre, description } = job.metadata;
  return {
    title,
    album: title,
    artist: author,
    albumArtist: author,
    narrator,
    year,
    genre,
    description,
    cover: job.cover,
  };
};

/**
 * Decodes every input file in order, re-encodes the audio to AAC as one continuous track,
 * writes it as MP4 into `file` and finally adds chapters and audiobook metadata.
 */
export const convertToM4b = async (
  job: ConversionJob,
  file: RandomAccessFile,
  onProgress: (progress: ConversionProgress) => void,
): Promise<{ durationSeconds: number; encoder: 'native' | 'wasm' }> => {
  const encoder = await ensureAacEncoder(job.numberOfChannels, job.bitrate);
  const writer = new M4bWriter(file, { sampleRate: SAMPLE_RATE, numberOfChannels: job.numberOfChannels, bitrate: job.bitrate });

  // Mediabunny only encodes here. Its MP4 muxer keeps an object per packet in
  // memory until the end, which on a 40-hour book is enough for iOS to kill
  // the tab, so packets go to our own writer and Mediabunny's (lightweight,
  // non-retaining) ADTS muxer writes into a NullTarget.
  const output = new Output({ format: new AdtsOutputFormat(), target: new NullTarget() });
  // Mediabunny needs constant input parameters per track, so every file is
  // normalized to the same channel count and sample rate before encoding.
  const source = new AudioSampleSource({
    codec: 'aac',
    bitrate: job.bitrate,
    onEncodedPacket: (packet, meta) => {
      const description = meta?.decoderConfig?.description;
      writer.addPacket(
        packet.data,
        Math.round(packet.duration * SAMPLE_RATE),
        description ? toBytes(description) : undefined,
      );
    },
  });
  output.addAudioTrack(source);
  await output.start();

  const knownTotal = job.chapters.every((chapter) => chapter.durationSeconds !== null)
    ? job.chapters.reduce((sum, chapter) => sum + chapter.durationSeconds!, 0)
    : null;
  const markers: ChapterMarker[] = [];
  let framesWritten = 0;
  const position = () => framesWritten / SAMPLE_RATE;
  let lastReport = 0;

  try {
    for (const [chapterIndex, chapter] of job.chapters.entries()) {
      markers.push({ title: chapter.title, startSeconds: position() });

      const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(chapter.file) });
      try {
        const track = await input.getPrimaryAudioTrack();
        if (!track) throw new Error(`"${chapter.file.name}" contains no audio.`);
        if (!(await track.canDecode())) {
          throw new Error(`This browser cannot decode "${chapter.file.name}" (${track.codec ?? 'unknown codec'}).`);
        }

        const resampler = new StreamingResampler(track.sampleRate, SAMPLE_RATE, job.numberOfChannels);
        for await (const decoded of new AudioSampleSink(track).samples()) {
          const pcm = resampler.process(remixChannels(toPlanar(decoded), job.numberOfChannels));
          decoded.close();
          if (pcm[0].length === 0) continue;

          // Files are laid end to end, ignoring each file's own start offset.
          const sample = fromPlanar(pcm, position());
          framesWritten += pcm[0].length;
          await source.add(sample);
          sample.close();

          const now = Date.now();
          if (now - lastReport >= PROGRESS_INTERVAL_MS) {
            lastReport = now;
            onProgress({ chapterIndex, processedSeconds: position(), totalSeconds: knownTotal });
          }
        }
      } finally {
        input.dispose();
      }
    }

    source.close();
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }

  onProgress({ chapterIndex: job.chapters.length - 1, processedSeconds: position(), totalSeconds: knownTotal });
  writer.finish({ chapters: markers, metadata: buildMetadata(job), chapterFormats: job.chapterFormats });
  return { durationSeconds: writer.durationSeconds, encoder };
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
