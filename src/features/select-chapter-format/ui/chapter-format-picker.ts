import { CHAPTER_FORMATS, type BookStore, type ChapterFormatOption } from '@/entities/book';
import { NERO_MAX_CHAPTERS } from '@/shared/lib/mp4';
import { h } from '@/shared/ui';

/** Pick list of chapter formats, each with example apps so users know which to choose. */
export const createChapterFormatPicker = (store: BookStore): HTMLElement => {
  const radios = new Map<string, HTMLInputElement>();

  const option = (format: ChapterFormatOption) => {
    const radio = h('input', {
      type: 'radio',
      name: 'chapter-format',
      value: format.id,
      onchange: () => store.setChapterFormat(format.id),
    });
    radios.set(format.id, radio);

    return h('label', { class: 'choice' },
      radio,
      h('span', { class: 'choice-body' },
        h('span', { class: 'choice-title' }, format.label, format.badge && h('span', { class: 'badge' }, format.badge)),
        h('span', { class: 'choice-description muted' }, format.description),
        h('span', { class: 'chips', attrs: { 'aria-label': 'For example' } },
          ...format.examples.map((example) => h('span', { class: 'chip' }, example))),
      ),
    );
  };

  const warning = h('p', { class: 'notice', attrs: { role: 'alert' } });

  store.subscribe(({ chapterFormat, chapters }) => {
    for (const [id, radio] of radios) radio.checked = id === chapterFormat;
    const tooMany = chapterFormat === 'nero' && chapters.length > NERO_MAX_CHAPTERS;
    warning.hidden = !tooMany;
    warning.textContent = tooMany
      ? `Nero chapters support at most ${NERO_MAX_CHAPTERS} chapters; this book has ${chapters.length}, so the rest ` +
        'would be missing. Choose "Both formats" or "Apple chapters" instead.'
      : '';
  });

  return h('div', { class: 'chapter-format' },
    h('fieldset', { class: 'choices' },
      h('legend', { class: 'muted' }, 'Which app will you listen in? Chapters come in two formats, and players differ in which one they read.'),
      ...CHAPTER_FORMATS.map(option),
    ),
    warning,
    h('p', { class: 'muted small' },
      'Apps change over time — if chapters don\'t show up in your player, convert again with "Both formats".'),
  );
};
