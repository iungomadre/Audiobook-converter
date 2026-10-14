export type { AudioPreset, Book, BookMetadata, Chapter, Cover } from './model/types';
export { AUDIO_PRESETS, getPreset } from './model/presets';
export { createBookStore, numberedTitle, totalDuration, type BookStore } from './model/store';
export { CHAPTER_FORMATS, getChapterFormat, type ChapterFormatId, type ChapterFormatOption } from './model/chapter-formats';
