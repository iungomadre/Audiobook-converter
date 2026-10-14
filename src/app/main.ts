import { createBookStore } from '@/entities/book';
import { createConverterPage } from '@/pages/converter';
import './styles/index.css';

// A file dropped outside a drop area would make the browser open it and leave the page.
for (const type of ['dragover', 'drop'] as const) window.addEventListener(type, (event) => event.preventDefault());

const store = createBookStore();
document.querySelector('#app')!.replaceChildren(createConverterPage(store));
