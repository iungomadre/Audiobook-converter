import type { BookStore } from '@/entities/book';
import { createMetadataForm } from '@/features/edit-book-metadata';
import { createFindCoverOnline } from '@/features/find-cover-online';
import { h } from '@/shared/ui';

/** Step 2: book metadata and cover (upload, paste, drop, or find online and paste). */
export const createBookDetails = (store: BookStore): HTMLElement => {
  const findCover = createFindCoverOnline(store);
  return h('div', { class: 'book-details' },
    createMetadataForm(store, { coverActions: [findCover.trigger], coverHint: findCover.hint }),
  );
};
