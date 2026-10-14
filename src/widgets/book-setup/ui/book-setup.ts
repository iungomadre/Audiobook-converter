import type { BookStore } from '@/entities/book';
import { createChapterList } from '@/features/edit-chapters';
import { createFilePicker } from '@/features/select-audio-files';
import { h } from '@/shared/ui';

/** Step 1: pick the audio files and review the resulting chapters. */
export const createBookSetup = (store: BookStore): HTMLElement =>
  h('div', { class: 'book-setup' }, createFilePicker(store), createChapterList(store));
