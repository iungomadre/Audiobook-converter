import { createBookStore, restoreDraft } from '@/entities/book';
import { createConverterPage } from '@/pages/converter';
import './styles/index.css';

// A file dropped outside a drop area would make the browser open it and leave the page.
for (const type of ['dragover', 'drop'] as const) window.addEventListener(type, (event) => event.preventDefault());

// Keeps a copy of the app on the device so it also works offline (only in the built app).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

const store = createBookStore();
// The page is built after the last session's details are restored, so nothing flickers.
await restoreDraft(store);
document.querySelector('#app')!.replaceChildren(createConverterPage(store));
