import { describe, expect, it } from 'vitest';
import { prepareFiles } from './collect-files';

const picked = (path: string, type = '') => ({ file: new File([], path.split('/').pop()!, { type }), path });

describe('prepareFiles', () => {
  it('keeps audio only, drops hidden files and sorts naturally', () => {
    const result = prepareFiles([
      picked('Book/10.mp3'), picked('Book/cover.jpg', 'image/jpeg'), picked('Book/2.mp3'),
      picked('Book/._2.mp3'), picked('Book/1.MP3'),
    ]);
    expect(result.map(({ path }) => path)).toEqual(['Book/1.MP3', 'Book/2.mp3', 'Book/10.mp3']);
  });
});
