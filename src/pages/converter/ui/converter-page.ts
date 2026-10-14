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

/** Wraps content in a fieldset so it can be locked: controls disabled, but still readable and scrollable. */
const lockScope = (content: HTMLElement) => h('fieldset', { class: 'lock-scope' }, content);

export const createConverterPage = (store: BookStore): HTMLElement => {
  const scopes = [lockScope(createBookSetup(store)), lockScope(createBookDetails(store))];
  const editableSections = [section(1, 'section.files', scopes[0]), section(2, 'section.details', scopes[1])];

  const { panel, statusBar } = createConvertPanel(store, {
    onBusyChange: (busy) => {
      // While converting, the book can be reviewed but not changed.
      scopes.forEach((scope) => (scope.disabled = busy));
      editableSections.forEach((element) => element.classList.toggle('is-locked', busy));
      if (busy) convertSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  });
  const convertSection = section(3, 'section.convert', panel);

  return h('main', { class: 'page' },
    statusBar,
    // The language can change at any time, even mid-conversion: only the page text changes.
    createAppHeader([createLanguagePicker()]),
    ...editableSections,
    convertSection,
  );
};
