import type { BookMetadata } from '@/entities/book';
import type { ChapterMarker } from '@/shared/lib/mp4';
import type { ErrorInfo } from './errors';

/** Settings shared by every step of one conversion. */
export type ConversionSettings = {
  /** File name inside the OPFS output directory. */
  outputName: string;
  numberOfChannels: number;
  bitrate: number;
};

export type ConversionJob = ConversionSettings & {
  chapters: { file: File; title: string; durationSeconds: number | null }[];
  metadata: BookMetadata;
  cover: { data: Uint8Array; mimeType: string } | null;
};

/**
 * Chapters are encoded in parallel, each by a fresh worker into its own part
 * file; the worker is terminated afterwards, so whatever memory a browser's
 * decoder or encoder holds on to is released after every chapter. A final
 * worker assembles the parts into the M4B.
 */
export type WorkerRequest =
  | { type: 'encode-chapter'; settings: ConversionSettings; file: File; partName: string; sizesName: string }
  | {
    type: 'assemble';
    settings: ConversionSettings;
    parts: { name: string; sizes: Uint32Array }[];
    audioSpecificConfig: Uint8Array;
    chapters: ChapterMarker[];
    metadata: BookMetadata;
    cover: ConversionJob['cover'];
  };

export type ConversionProgress = {
  chapterIndex: number;
  processedSeconds: number;
  totalSeconds: number | null;
  /** Smoothed estimate of the time left, or null while still estimating. */
  remainingSeconds: number | null;
};

export type WorkerResponse =
  | { type: 'progress'; processedSeconds: number }
  | { type: 'chapter-done'; sizes: Uint32Array; audioSpecificConfig: Uint8Array; encoder: 'native' | 'wasm' }
  | { type: 'finished'; size: number; durationSeconds: number }
  | { type: 'error'; error: ErrorInfo };
