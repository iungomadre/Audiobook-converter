import type { BookStore } from '@/entities/book';
import { createConvertPanel } from '@/features/convert-book';
import { createMetadataForm } from '@/features/edit-book-metadata';
import { h } from '@/shared/ui';
import { createAppHeader } from '@/widgets/app-header';
import { createBookSetup } from '@/widgets/book-setup';

const section = (step: number, title: string, content: HTMLElement) =>
  h('section', { class: 'card' },
    h('h2', {}, h('span', { class: 'step' }, step), title, h('span', { class: 'locked-label' }, 'Locked while converting')),
    content);

export const createConverterPage = (store: BookStore): HTMLElement => {
  const editableSections = [
    section(1, 'Audio files', createBookSetup(store)),
    section(2, 'Book details', createMetadataForm(store)),
  ];

  // While converting, the book can be reviewed but not changed: `inert` blocks
  // every click, tap and keyboard focus without hiding the content.
  const setLocked = (locked: boolean) => {
    for (const element of editableSections) {
      element.inert = locked;
      element.classList.toggle('is-locked', locked);
    }
  };

  return h('main', { class: 'page' },
    createAppHeader(),
    ...editableSections,
    section(3, 'Convert', createConvertPanel(store, { onBusyChange: setLocked })),
  );
};
