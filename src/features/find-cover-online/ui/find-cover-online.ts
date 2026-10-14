import type { BookStore } from '@/entities/book';
import { h } from '@/shared/ui';

const imageSearchUrl = (query: string): string =>
  `https://www.google.com/search?${new URLSearchParams({ tbm: 'isch', q: query })}`;

/**
 * Opens an image search for the book in a new tab. Search engines can't be
 * embedded or read by another page, so the user copies the image there and
 * pastes it here; the app itself sends nothing anywhere.
 */
export const createFindCoverOnline = (store: BookStore): { trigger: HTMLButtonElement; hint: HTMLElement } => {
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const hint = h('p', { class: 'notice small', hidden: true },
    'Google Images opened in a new tab. ',
    isTouch
      ? 'Tap the cover you want, long-press the large image and choose “Copy”. Then come back here and tap “Paste”.'
      : 'Click the cover you want, right-click the large image and choose “Copy image”. Then come back here and press “Paste” (or Ctrl/⌘+V).',
    ' Only your browser talks to Google, in that tab; this app sends nothing.',
  );

  const trigger = h('button', { type: 'button', class: 'btn small', title: 'Search Google Images in a new tab' }, 'Search Google Images');
  trigger.addEventListener('click', () => {
    const { title, author } = store.get().metadata;
    const query = [title, author, 'audiobook'].filter(Boolean).join(' ');
    window.open(imageSearchUrl(query), '_blank', 'noopener');
    hint.hidden = false;
  });

  return { trigger, hint };
};
