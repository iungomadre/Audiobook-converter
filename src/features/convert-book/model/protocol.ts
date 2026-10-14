import type { BookMetadata } from '@/entities/book';
import type { ChapterFormats } from '@/shared/lib/mp4';

export type ConversionJob = {
  /** File name inside the OPFS output directory. */
  outputName: string;
  chapters: { file: File; title: string; durationSeconds: number | null }[];
  metadata: BookMetadata;
  cover: { data: Uint8Array; mimeType: string } | null;
  numberOfChannels: number;
  bitrate: number;
  chapterFormats: ChapterFormats;
};

export type WorkerRequest = { type: 'convert'; job: ConversionJob };

export type ConversionProgress = {
  chapterIndex: number;
  processedSeconds: number;
  totalSeconds: number | null;
};

export type WorkerResponse =
  | ({ type: 'progress' } & ConversionProgress)
  | { type: 'done'; outputName: string; size: number; durationSeconds: number; encoder: 'native' | 'wasm' }
  | { type: 'error'; message: string };
