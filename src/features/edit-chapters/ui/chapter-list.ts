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
      attrs: { 'aria-label': `Title of chapter ${index + 1}` },
      oninput: () => store.updateChapter(chapter.id, { title: input.value }),
    });
    const duration = h('span', { class: 'chapter-duration muted' });
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
        h('button', { type: 'button', class: 'icon-btn', title: 'Move up', disabled: index === 0, onclick: () => move(index, -1) }, '↑'),
        h('button', { type: 'button', class: 'icon-btn', title: 'Move down', disabled: index === count - 1, onclick: () => move(index, 1) }, '↓'),
        h('button', { type: 'button', class: 'icon-btn', title: 'Remove', onclick: () => remove(chapter.id) }, '✕'),
      ),
    );
  };

  const toolbar = h('div', { class: 'row' },
    h('button', { type: 'button', class: 'btn small', onclick: () => renameAll((_, index) => numberedTitle(index)) }, 'Number chapters'),
    h('button', { type: 'button', class: 'btn small', onclick: () => renameAll((chapter) => stripExtension(chapter.file.name)) }, 'Use file names'),
  );

  const element = h('div', { class: 'chapters' }, h('div', { class: 'row spread' }, summary, toolbar), list);

  store.subscribe(({ chapters }) => {
    element.hidden = chapters.length === 0;
    const total = totalDuration(chapters);
    summary.textContent = `${chapters.length} chapter${chapters.length === 1 ? '' : 's'}` +
      (total === null ? ' · measuring length…' : ` · ${formatDuration(total)}`);

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
