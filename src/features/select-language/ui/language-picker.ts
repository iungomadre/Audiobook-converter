import { getLanguage, LANGUAGES, onLanguageChange, setLanguage, trAttr, type LanguageCode } from '@/shared/i18n';
import { h } from '@/shared/ui';

/** Language pick list with flags; switching keeps everything the user entered. */
export const createLanguagePicker = (): HTMLSelectElement => {
  const select = h('select', { class: 'language-picker', onchange: () => setLanguage(select.value as LanguageCode) },
    ...LANGUAGES.map(({ code, name, flag }) => h('option', { value: code, lang: code }, `${flag} ${name}`)));
  trAttr(select, 'aria-label', 'app.language');
  select.value = getLanguage();
  onLanguageChange(() => {
    select.value = getLanguage();
  });
  return select;
};
