/** A message, or plural variants selected with Intl.PluralRules (`other` is required). */
export type PluralMessage = { other: string } & Partial<Record<Exclude<Intl.LDMLPluralRule, 'other'>, string>>;
export type Message = string | PluralMessage;
