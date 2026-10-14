import type { ChapterFormatId } from './chapter-formats';

export type Chapter = {
  id: string;
  file: File;
  /** Path inside the picked folder, or the file name. */
  path: string;
  title: string;
  /** Null while unknown (still probing, or the file has no readable duration). */
  durationSeconds: number | null;
};

export type BookMetadata = {
  title: string;
  author: string;
  narrator: string;
  year: string;
  genre: string;
  description: string;
};

export type Cover = {
  data: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png';
  /** Object URL for previews. */
  previewUrl: string;
};

export type AudioPreset = {
  id: string;
  label: string;
  numberOfChannels: 1 | 2;
  bitrate: number;
};

export type Book = {
  chapters: Chapter[];
  metadata: BookMetadata;
  cover: Cover | null;
  presetId: string;
  chapterFormat: ChapterFormatId;
};
