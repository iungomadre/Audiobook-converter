import { onLanguageChange, t, tr, trAttr } from '@/shared/i18n';
import { numberedTitle, totalDuration, type BookStore, type Chapter } from '@/entities/book';
import { formatDuration, stripExtension } from '@/shared/lib/format';
import { h } from '@/shared/ui';

/** Editable, reorderable list of chapters (one per input file). */
export const createChapterList = (store: BookStore): HTMLElement => {
  const summary = h('p', { class: 'muted' });
  const list = h('ol', { class: 'chapter-list' });
  const titleInputs = new Map<string, HTMLInputElement>();
  const durationLabels = new Map<string, HTMLElement>();
  let renderedKey = '';

  const move = (index: number, delta: number) => {
    const chapters = [...store.get().chapters];
    const target = index + delta;
    if (target < 0 || target >= chapters.length) return;
    [chapters[index], chapters[target]] = [chapters[target], chapters[index]];
    store.setChapters(chapters);
  };

  const remove = (id: string) => store.setChapters(store.get().chapters.filter((chapter) => chapter.id !== id));

  const renameAll = (rename: (chapter: Chapter, index: number) => string) =>
    store.setChapters(store.get().chapters.map((chapter, index) => ({ ...chapter, title: rename(chapter, index) })));

  const row = (chapter: Chapter, index: number, count: number) => {
    const input = h('input', {
      type: 'text',
      class: 'chapter-title',
      value: chapter.title,
      oninput: () => store.updateChapter(chapter.id, { title: input.value }),
    });
    const duration = h('span', { class: 'chapter-duration muted' });
    trAttr(input, 'aria-label', 'chapters.titleLabel', { n: index + 1 });
    titleInputs.set(chapter.id, input);
    durationLabels.set(chapter.id, duration);

    return h('li', { class: 'chapter' },
      h('span', { class: 'chapter-index' }, index + 1),
      h('div', { class: 'chapter-main' },
        input,
        h('span', { class: 'chapter-file muted', title: chapter.path }, chapter.path),
      ),
      duration,
      h('div', { class: 'chapter-actions' },
        trAttr(h('button', { type: 'button', class: 'icon-btn', disabled: index === 0, onclick: () => move(index, -1) }, '↑'), 'title', 'chapters.moveUp'),
        trAttr(h('button', { type: 'button', class: 'icon-btn', disabled: index === count - 1, onclick: () => move(index, 1) }, '↓'), 'title', 'chapters.moveDown'),
        trAttr(h('button', { type: 'button', class: 'icon-btn', onclick: () => remove(chapter.id) }, '✕'), 'title', 'chapters.remove'),
      ),
    );
  };

  const toolbar = h('div', { class: 'row' },
    h('button', { type: 'button', class: 'btn small', onclick: () => renameAll((_, index) => numberedTitle(index)) }, tr('chapters.numberAll')),
    h('button', { type: 'button', class: 'btn small', onclick: () => renameAll((chapter) => stripExtension(chapter.file.name)) }, tr('chapters.useFileNames')),
  );

  const element = h('div', { class: 'chapters' }, h('div', { class: 'row spread' }, summary, toolbar), list);

  const renderSummary = () => {
    const { chapters } = store.get();
    const total = totalDuration(chapters);
    summary.textContent = `${t('chapters.count', { count: chapters.length })} · ` +
      (total === null ? t('chapters.measuring') : formatDuration(total));
  };
  onLanguageChange(renderSummary);

  store.subscribe(({ chapters }) => {
    element.hidden = chapters.length === 0;
    renderSummary();

    // Rebuild rows only when the order changes, so typing keeps focus.
    const key = chapters.map((chapter) => chapter.id).join('|');
    if (key !== renderedKey) {
      renderedKey = key;
      titleInputs.clear();
      durationLabels.clear();
      list.replaceChildren(...chapters.map((chapter, index) => row(chapter, index, chapters.length)));
    }
    for (const chapter of chapters) {
      const input = titleInputs.get(chapter.id)!;
      if (input.value !== chapter.title) input.value = chapter.title;
      durationLabels.get(chapter.id)!.textContent =
        chapter.durationSeconds === null ? '…' : formatDuration(chapter.durationSeconds);
    }
  });

  return element;
};
