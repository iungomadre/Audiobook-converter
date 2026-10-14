import { clearDraft, hasRememberedChapters, type Book, type BookStore } from '@/entities/book';
import { createConvertPanel } from '@/features/convert-book';
import { refillDetailsFromFiles } from '@/features/select-audio-files';
import { createLanguagePicker } from '@/features/select-language';
import { t, tr, type MessageKey } from '@/shared/i18n';
import { h } from '@/shared/ui';
import { createAppHeader } from '@/widgets/app-header';
import { createBookDetails } from '@/widgets/book-details';
import { createBookSetup } from '@/widgets/book-setup';

/** True if the user entered or picked anything (the genre has a default and doesn't count). */
const hasContent = (book: Book): boolean => {
  const { title, author, narrator, year, description } = book.metadata;
  return book.chapters.length > 0 || book.cover !== null || [title, author, narrator, year, description].some(Boolean);
};

const section = (step: number, title: MessageKey, content: HTMLElement) =>
  h('section', { class: 'card' },
    h('h2', {}, h('span', { class: 'step' }, step), tr(title), h('span', { class: 'locked-label' }, tr('section.locked'))),
    content);

/** Wraps content in a fieldset so it can be locked: controls disabled, but still readable and scrollable. */
const lockScope = (content: HTMLElement) => h('fieldset', { class: 'lock-scope' }, content);

export const createConverterPage = (store: BookStore): HTMLElement => {
  const scopes = [lockScope(createBookSetup(store)), lockScope(createBookDetails(store))];
  const editableSections = [section(1, 'section.files', scopes[0]), section(2, 'section.details', scopes[1])];

  const { panel, statusBar, banner, discard, hasSavedProgress } = createConvertPanel(store, {
    onBusyChange: (busy) => {
      // While converting, the book can be reviewed but not changed.
      scopes.forEach((scope) => (scope.disabled = busy));
      editableSections.forEach((element) => element.classList.toggle('is-locked', busy));
      if (busy) convertSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      updateStartOver();
    },
    onStartFresh: () => void refillDetailsFromFiles(store),
  });
  const convertSection = section(3, 'section.convert', panel);

  // Start over: forget the files, details, cover and any unfinished conversion.
  const startOver = h('button', { type: 'button', class: 'btn small start-over' }, tr('app.startOver'));
  startOver.addEventListener('click', () => {
    if (!confirm(t('app.startOverConfirm'))) return;
    discard();
    void clearDraft();
    store.reset();
    updateStartOver();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Offer "Start over" only when there is something to clear.
  const updateStartOver = () => {
    startOver.hidden = !(hasContent(store.get()) || hasRememberedChapters() || hasSavedProgress());
  };
  store.subscribe(updateStartOver);

  // The status bar sits outside the centered column so it spans the full width while sticking to the top.
  return h('div', {},
    statusBar,
    h('main', { class: 'page' },
      // The language can change at any time, even mid-conversion: only the page text changes.
      createAppHeader([h('div', { class: 'header-actions' }, startOver, createLanguagePicker())]),
      banner,
      ...editableSections,
      convertSection,
    ),
  );
};
