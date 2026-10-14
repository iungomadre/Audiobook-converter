import type { BookStore } from '@/entities/book';
import { createMetadataForm } from '@/features/edit-book-metadata';
import { createFindCoverOnline } from '@/features/find-cover-online';
import { h } from '@/shared/ui';

/** Step 2: book metadata and cover (chosen from the device or found on Google Images). */
export const createBookDetails = (store: BookStore): HTMLElement =>
  h('div', { class: 'book-details' },
    createMetadataForm(store, { coverActions: [createFindCoverOnline(store)] }),
  );
