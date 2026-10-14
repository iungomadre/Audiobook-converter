import type { BookStore } from '@/entities/book';
import { t, tr, trAttr } from '@/shared/i18n';
import { h } from '@/shared/ui';

const imageSearchUrl = (query: string): string =>
  `https://www.google.com/search?${new URLSearchParams({ tbm: 'isch', q: query })}`;

/** Opens a Google Images search for the book in a new tab. The app itself sends nothing. */
export const createFindCoverOnline = (store: BookStore): HTMLButtonElement => {
  const trigger = trAttr(h('button', { type: 'button', class: 'btn small' }, tr('cover.searchGoogle')), 'title', 'cover.searchGoogleHint');
  trigger.addEventListener('click', () => {
    const { title, author } = store.get().metadata;
    const query = [title, author, t('cover.searchQuerySuffix')].filter(Boolean).join(' ');
    window.open(imageSearchUrl(query), '_blank', 'noopener');
  });
  return trigger;
};
