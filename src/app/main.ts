import { createBookStore, restoreDraft } from '@/entities/book';
import { createConverterPage } from '@/pages/converter';
import './styles/index.css';

// A file dropped outside a drop area would make the browser open it and leave the page.
for (const type of ['dragover', 'drop'] as const) window.addEventListener(type, (event) => event.preventDefault());

const store = createBookStore();
// The page is built after the last session's details are restored, so nothing flickers.
await restoreDraft(store);
document.querySelector('#app')!.replaceChildren(createConverterPage(store));
