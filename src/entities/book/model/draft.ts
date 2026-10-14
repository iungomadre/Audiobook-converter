import { fileKey } from '@/shared/lib/files';
import { keyValue } from '@/shared/lib/storage';
import type { BookStore } from './store';
import type { BookMetadata } from './types';

const KEY = 'draft';
const SAVE_DELAY_MS = 400;

type StoredDraft = {
  metadata: BookMetadata;
  presetId: string;
  cover: { data: Uint8Array; mimeType: 'image/jpeg' | 'image/png' } | null;
  /** Chapters in the user's order, identified by file name, size and date. */
  chapters: { key: string; title: string }[];
};

/** Chapters of the last session; kept until files are picked again, since File objects don't survive a reload. */
let remembered: StoredDraft['chapters'] = [];
let saveTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Restores the book details, cover and audio quality from the last session and
 * keeps saving changes, so nothing is lost when iOS reloads the page.
 */
export const restoreDraft = async (store: BookStore): Promise<void> => {
  const draft = await keyValue.get<StoredDraft>(KEY);
  if (draft) {
    remembered = draft.chapters;
    store.updateMetadata(draft.metadata);
    store.setPreset(draft.presetId);
    if (draft.cover) {
      const previewUrl = URL.createObjectURL(new Blob([draft.cover.data as BlobPart], { type: draft.cover.mimeType }));
      store.setCover({ ...draft.cover, previewUrl });
    }
  }

  store.subscribe((book) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const chapters = book.chapters.length > 0
        ? book.chapters.map((chapter) => ({ key: fileKey(chapter.file), title: chapter.title }))
        : remembered;
      void keyValue.set(KEY, {
        metadata: book.metadata,
        presetId: book.presetId,
        cover: book.cover && { data: book.cover.data, mimeType: book.cover.mimeType },
        chapters,
      } satisfies StoredDraft);
    }, SAVE_DELAY_MS);
  });
};

/**
 * If `files` are exactly the files of the remembered book, returns them in the
 * remembered order with their titles. Returns null for any other selection.
 */
export const arrangeLikeDraft = <T extends { file: File }>(files: readonly T[]): { item: T; title: string }[] | null => {
  if (remembered.length === 0 || remembered.length !== files.length) return null;
  const byKey = new Map(files.map((item) => [fileKey(item.file), item]));
  const arranged = remembered.map(({ key, title }) => {
    const item = byKey.get(key);
    return item ? { item, title } : null;
  });
  return arranged.every(Boolean) ? (arranged as { item: T; title: string }[]) : null;
};

/** True if a previous session's book is remembered. */
export const hasRememberedChapters = (): boolean => remembered.length > 0;

/** Forgets the remembered chapters (a different book was picked). */
export const forgetRememberedChapters = (): void => {
  remembered = [];
};

export const clearDraft = async (): Promise<void> => {
  clearTimeout(saveTimer);
  remembered = [];
  await keyValue.delete(KEY);
};
