import { clearDraft, hasRememberedChapters, type Book, type BookStore } from '@/entities/book';
import { createConvertPanel, type Phase } from '@/features/convert-book';
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
  const setup = createBookSetup(store);
  const details = lockScope(createBookDetails(store));
  const filesSection = section(1, 'section.files', setup.element);
  const detailsSection = section(2, 'section.details', details);

  // Start over: forget the files, details, cover and any unfinished conversion. Destructive, so confirmed.
  const startOver = () => {
    if (!confirm(t('app.startOverConfirm'))) return;
    discard();
    void clearDraft();
    store.reset();
    updateStartOver();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  let phase: Phase = 'setup';
  let built = false; // The panel reports its first phase while it is being created.
  const applyPhase = () => {
    // Setup: everything editable. Converting: the book is visible but locked. Awaiting files after a
    // reload: only choosing the files again is possible. Done: only the result is shown.
    setup.setMode(phase === 'setup' ? 'edit' : phase === 'awaiting-files' ? 'pick-only' : 'locked');
    details.disabled = phase !== 'setup';
    filesSection.classList.toggle('is-locked', phase === 'converting');
    detailsSection.classList.toggle('is-locked', phase === 'converting');
    filesSection.hidden = detailsSection.hidden = phase === 'done';
    updateStartOver();
    if (phase === 'converting') convertSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (phase === 'done') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const { panel, statusBar, banner, discard, hasSavedProgress } = createConvertPanel(store, {
    onPhaseChange: (next) => {
      phase = next;
      if (built) applyPhase();
    },
    onStartFresh: () => void refillDetailsFromFiles(store),
    onStartOver: startOver,
  });
  const convertSection = section(3, 'section.convert', panel);

  const startOverButton = h('button', { type: 'button', class: 'btn small start-over', onclick: startOver }, tr('app.startOver'));
  // Offer "Start over" only when there is something to clear (the result view has its own button).
  const updateStartOver = () => {
    startOverButton.hidden = phase === 'done' || !(hasContent(store.get()) || hasRememberedChapters() || hasSavedProgress());
  };
  store.subscribe(updateStartOver);

  // The status bar sits outside the centered column so it spans the full width while sticking to the top.
  const page = h('div', {},
    statusBar,
    h('main', { class: 'page' },
      // The language can change at any time, even mid-conversion: only the page text changes.
      createAppHeader([startOverButton, createLanguagePicker()]),
      banner,
      filesSection,
      detailsSection,
      convertSection,
    ),
  );
  built = true;
  applyPhase();
  return page;
};
