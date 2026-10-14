import { tr } from '@/shared/i18n';
import { h } from '@/shared/ui';

/** Page header; `actions` go in the top-right corner (e.g. the language picker). */
export const createAppHeader = (actions: HTMLElement[] = []): HTMLElement =>
  h('header', { class: 'app-header' },
    h('div', { class: 'app-header-top' }, h('h1', {}, tr('app.title')), ...actions),
    h('p', { class: 'muted' }, tr('app.tagline')),
  );
