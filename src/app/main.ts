import { createBookStore } from '@/entities/book';
import { createConverterPage } from '@/pages/converter';
import './styles/index.css';

const store = createBookStore();
document.querySelector('#app')!.replaceChildren(createConverterPage(store));
