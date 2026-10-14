import { h } from '@/shared/ui';

export const createAppHeader = (): HTMLElement =>
  h('header', { class: 'app-header' },
    h('h1', {}, 'Audiobook Converter'),
    h('p', { class: 'muted' }, 'Turn a folder of MP3 files into a single M4B audiobook with chapters and a cover — privately, in your browser.'),
  );
