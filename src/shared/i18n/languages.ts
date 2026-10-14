export type Language = {
  code: string;
  /** Name in the language itself. */
  name: string;
  /** Emoji flag. Shown as letters on Windows, which has no flag emoji. */
  flag: string;
};

export const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt-BR', name: 'Português (Brasil)', flag: '🇧🇷' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
  { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
] as const satisfies readonly Language[];

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

/** Picks the best supported language for a list of BCP 47 tags (e.g. navigator.languages). */
export const matchLanguage = (preferred: readonly string[]): LanguageCode => {
  const codes = LANGUAGES.map((language) => language.code as string);
  for (const tag of preferred) {
    const exact = codes.find((code) => code.toLowerCase() === tag.toLowerCase());
    if (exact) return exact as LanguageCode;
    const base = tag.split('-')[0].toLowerCase();
    const byBase = codes.find((code) => code.split('-')[0].toLowerCase() === base);
    if (byBase) return byBase as LanguageCode;
  }
  return 'en';
};
