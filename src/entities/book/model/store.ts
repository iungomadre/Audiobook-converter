import type { Book, BookMetadata, Chapter, Cover } from './types';
import { AUDIO_PRESETS } from './presets';

type Listener = (book: Book) => void;

const EMPTY_METADATA: BookMetadata = { title: '', author: '', narrator: '', year: '', genre: 'Audiobook', description: '' };

/** Single source of truth for the book being assembled. */
export const createBookStore = () => {
  let book: Book = { chapters: [], metadata: { ...EMPTY_METADATA }, cover: null, presetId: AUDIO_PRESETS[0].id };
  const listeners = new Set<Listener>();

  const set = (next: Partial<Book>) => {
    book = { ...book, ...next };
    for (const listener of listeners) listener(book);
  };

  return {
    get: () => book,
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      listener(book);
      return () => listeners.delete(listener);
    },
    setChapters: (chapters: Chapter[]) => set({ chapters }),
    updateChapter: (id: string, patch: Partial<Chapter>) =>
      set({ chapters: book.chapters.map((chapter) => (chapter.id === id ? { ...chapter, ...patch } : chapter)) }),
    updateMetadata: (patch: Partial<BookMetadata>) => set({ metadata: { ...book.metadata, ...patch } }),
    setCover: (cover: Cover | null) => {
      if (book.cover) URL.revokeObjectURL(book.cover.previewUrl);
      set({ cover });
    },
    setPreset: (presetId: string) => set({ presetId }),
  };
};

export type BookStore = ReturnType<typeof createBookStore>;

export const totalDuration = (chapters: readonly Chapter[]): number | null =>
  chapters.every((chapter) => chapter.durationSeconds !== null)
    ? chapters.reduce((sum, chapter) => sum + chapter.durationSeconds!, 0)
    : null;

export const numberedTitle = (index: number): string => `Chapter ${index + 1}`;
