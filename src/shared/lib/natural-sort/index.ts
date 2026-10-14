const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Compares strings so that "2.mp3" sorts before "10.mp3". */
export const compareNatural = (a: string, b: string): number => collator.compare(a, b);

export const sortNaturalBy = <T>(items: readonly T[], key: (item: T) => string): T[] =>
  items.toSorted((a, b) => compareNatural(key(a), key(b)));
