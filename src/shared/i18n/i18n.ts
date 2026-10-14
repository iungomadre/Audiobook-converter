import { LANGUAGES, matchLanguage, type LanguageCode } from './languages';
import { DICTIONARIES } from './locales';
import { en, type MessageKey } from './locales/en';
import type { Message } from './types';

type Params = Record<string, string | number>;

const STORAGE_KEY = 'audiobook-converter:language';
const listeners = new Set<() => void>();

const readStoredLanguage = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const isSupported = (code: string | null): code is LanguageCode => LANGUAGES.some((language) => language.code === code);

let current: LanguageCode = (() => {
  const stored = readStoredLanguage();
  if (isSupported(stored)) return stored;
  return typeof navigator === 'undefined' ? 'en' : matchLanguage(navigator.languages ?? [navigator.language]);
})();

export const getLanguage = (): LanguageCode => current;

export const setLanguage = (code: LanguageCode): void => {
  if (code === current) return;
  current = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Remembering the choice is best effort.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = code;
  for (const listener of listeners) listener();
};

/** Runs `listener` after every language change. Returns an unsubscribe function. */
export const onLanguageChange = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const format = (message: Message, params: Params, language: LanguageCode): string => {
  let text: string;
  if (typeof message === 'string') {
    text = message;
  } else {
    const count = Number(params.count ?? 0);
    text = message[new Intl.PluralRules(language).select(count)] ?? message.other;
  }
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
};

/** Translates a message into the current language (falling back to English). */
export const t = (key: MessageKey, params: Params = {}): string =>
  format(DICTIONARIES[current][key] ?? en[key], params, current);

// Live bindings: nodes are held weakly, so detached elements can be garbage collected.
const bindings = new Set<{ ref: WeakRef<Node>; update: (node: Node) => void }>();

const bind = <N extends Node>(node: N, update: (node: N) => void): N => {
  update(node);
  bindings.add({ ref: new WeakRef(node), update: update as (node: Node) => void });
  return node;
};

onLanguageChange(() => {
  for (const binding of bindings) {
    const node = binding.ref.deref();
    if (node) binding.update(node);
    else bindings.delete(binding);
  }
});

/** A text node that stays translated when the language changes. */
export const tr = (key: MessageKey, params?: Params): Text =>
  bind(document.createTextNode(''), (node) => {
    node.data = t(key, params);
  });

/** Keeps an attribute (title, placeholder, aria-label, alt…) translated. */
export const trAttr = <E extends Element>(element: E, attribute: string, key: MessageKey, params?: Params): E =>
  bind(element, (node) => node.setAttribute(attribute, t(key, params)));

if (typeof document !== 'undefined') document.documentElement.lang = current;
