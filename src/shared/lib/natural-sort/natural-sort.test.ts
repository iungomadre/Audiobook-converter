import { describe, expect, it } from 'vitest';
import { sortNaturalBy } from './index';

describe('sortNaturalBy', () => {
  it('orders numbered file names numerically', () => {
    const names = ['10.mp3', '2.mp3', '1.mp3', 'Chapter 11.mp3', 'Chapter 9.mp3', '01 - Intro.mp3'];
    expect(sortNaturalBy(names, (name) => name)).toEqual([
      '01 - Intro.mp3', '1.mp3', '2.mp3', '10.mp3', 'Chapter 9.mp3', 'Chapter 11.mp3',
    ]);
  });

  it('sorts by folder path first', () => {
    const paths = ['Book/CD2/01.mp3', 'Book/CD1/02.mp3', 'Book/CD1/01.mp3'];
    expect(sortNaturalBy(paths, (path) => path)).toEqual(['Book/CD1/01.mp3', 'Book/CD1/02.mp3', 'Book/CD2/01.mp3']);
  });
});
