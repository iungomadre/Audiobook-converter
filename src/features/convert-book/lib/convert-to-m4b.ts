import {
  ALL_FORMATS, AudioSample, AudioSampleSink, AudioSampleSource, BlobSource, canEncodeAudio, Input, Mp4OutputFormat,
  Output, StreamTarget, type MetadataTags,
} from 'mediabunny';
import { remixChannels, StreamingResampler, type PlanarPcm } from '@/shared/lib/audio';
import { createFileWritable, finalizeAudiobook, type ChapterMarker, type RandomAccessFile } from '@/shared/lib/mp4';
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

export const buildMetadataTags = (job: ConversionJob): MetadataTags => {
  const { title, author, narrator, year, genre, description } = job.metadata;
  const raw: NonNullable<MetadataTags['raw']> = {};
  if (year) raw['©day'] = year;
  if (narrator) {
    raw['©nrt'] = narrator;
    raw['©wrt'] = narrator; // Shown as "Composer" by iTunes-style apps; the common audiobook convention.
  }
  if (description) {
    raw.desc = description;
    raw.ldes = description;
  }

  return {
    title: title || undefined,
    album: title || undefined,
    artist: author || undefined,
    albumArtist: author || undefined,
    genre: genre || undefined,
    description: description || undefined,
    images: job.cover ? [{ data: job.cover.data, mimeType: job.cover.mimeType, kind: 'coverFront' }] : undefined,
    raw,
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
  file.truncate(0);

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target: new StreamTarget(createFileWritable(file), { chunked: true, chunkSize: 8 * 1024 * 1024 }),
  });
  // Mediabunny needs constant input parameters per track, so every file is
  // normalized to the same channel count and sample rate before encoding.
  const source = new AudioSampleSource({ codec: 'aac', bitrate: job.bitrate });
  output.addAudioTrack(source, { languageCode: 'und' });
  output.setMetadataTags(buildMetadataTags(job));
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
  finalizeAudiobook(file, { chapters: markers });
  return { durationSeconds: position(), encoder };
};

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
