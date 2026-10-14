import type { BookStore } from '@/entities/book';
import { createConvertPanel } from '@/features/convert-book';
import { createLanguagePicker } from '@/features/select-language';
import { tr, type MessageKey } from '@/shared/i18n';
import { h } from '@/shared/ui';
import { createAppHeader } from '@/widgets/app-header';
import { createBookDetails } from '@/widgets/book-details';
import { createBookSetup } from '@/widgets/book-setup';

const section = (step: number, title: MessageKey, content: HTMLElement) =>
  h('section', { class: 'card' },
    h('h2', {}, h('span', { class: 'step' }, step), tr(title), h('span', { class: 'locked-label' }, tr('section.locked'))),
    content);

export const createConverterPage = (store: BookStore): HTMLElement => {
  const editableSections = [
    section(1, 'section.files', createBookSetup(store)),
    section(2, 'section.details', createBookDetails(store)),
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
    // The language can change at any time, even mid-conversion: only the page text changes.
    createAppHeader([createLanguagePicker()]),
    ...editableSections,
    section(3, 'section.convert', createConvertPanel(store, { onBusyChange: setLocked })),
  );
};
