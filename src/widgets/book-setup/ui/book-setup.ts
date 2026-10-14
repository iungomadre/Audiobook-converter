import type { BookStore } from '@/entities/book';
import { createChapterList } from '@/features/edit-chapters';
import { createFilePicker } from '@/features/select-audio-files';
import { h } from '@/shared/ui';

/** `pick-only`: files can be chosen, but chapters are only shown (e.g. while waiting for files to resume). */
export type BookSetupMode = 'edit' | 'locked' | 'pick-only';

/** Step 1: pick the audio files and review the resulting chapters. */
export const createBookSetup = (store: BookStore) => {
  // Fieldsets disable every control inside while keeping the content visible and scrollable.
  const picker = h('fieldset', { class: 'lock-scope' }, createFilePicker(store));
  const chapters = h('fieldset', { class: 'lock-scope' }, createChapterList(store));

  return {
    element: h('div', { class: 'book-setup' }, picker, chapters),
    setMode: (mode: BookSetupMode) => {
      picker.disabled = mode === 'locked';
      chapters.disabled = mode !== 'edit';
    },
  };
};
