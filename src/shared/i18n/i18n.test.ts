import { describe, expect, it } from 'vitest';
import { setLanguage, t } from './i18n';
import { LANGUAGES, matchLanguage } from './languages';
import { DICTIONARIES } from './locales';
import { en, type MessageKey } from './locales/en';
import type { Message } from './types';

const placeholders = (message: Message): string[] =>
  [...new Set(Object.values(typeof message === 'string' ? { other: message } : message)
    .flatMap((text) => text.match(/\{\w+\}/g) ?? []))].sort();

describe('translations', () => {
  it('cover every language in the picker', () => {
    expect(Object.keys(DICTIONARIES).sort()).toEqual(LANGUAGES.map((language) => language.code).sort());
  });

  it.each(Object.entries(DICTIONARIES))('%s keeps the placeholders of every English message', (_, messages) => {
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(placeholders(messages[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('uses the right Polish plural forms', () => {
    setLanguage('pl');
    expect([1, 2, 4, 5, 12, 22, 25].map((count) => t('chapters.count', { count }))).toEqual([
      '1 rozdział', '2 rozdziały', '4 rozdziały', '5 rozdziałów', '12 rozdziałów', '22 rozdziały', '25 rozdziałów',
    ]);
    expect(t('convert.progressChapter', { n: 3, total: 22 })).toBe('Rozdział 3 z 22');
    setLanguage('en');
    expect(t('chapters.count', { count: 1 })).toBe('1 chapter');
  });
});

describe('matchLanguage', () => {
  it('matches exact tags, base languages and falls back to English', () => {
    expect(matchLanguage(['pl-PL', 'en'])).toBe('pl');
    expect(matchLanguage(['pt-PT'])).toBe('pt-BR');
    expect(matchLanguage(['zh-TW'])).toBe('zh-CN');
    expect(matchLanguage(['ru-RU', 'de'])).toBe('de');
    expect(matchLanguage(['ru'])).toBe('en');
  });
});
