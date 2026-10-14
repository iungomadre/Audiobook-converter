import type { BookStore } from '@/entities/book';
import { createConvertPanel } from '@/features/convert-book';
import { createMetadataForm } from '@/features/edit-book-metadata';
import { h } from '@/shared/ui';
import { createAppHeader } from '@/widgets/app-header';
import { createBookSetup } from '@/widgets/book-setup';

const section = (step: number, title: string, content: HTMLElement) =>
  h('section', { class: 'card' }, h('h2', {}, h('span', { class: 'step' }, step), title), content);

export const createConverterPage = (store: BookStore): HTMLElement =>
  h('main', { class: 'page' },
    createAppHeader(),
    section(1, 'Audio files', createBookSetup(store)),
    section(2, 'Book details', createMetadataForm(store)),
    section(3, 'Convert', createConvertPanel(store)),
  );
