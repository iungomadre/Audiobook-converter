import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, sanitizeFileName, stripExtension } from './index';

describe('format', () => {
  it('formats durations', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(144000)).toBe('40:00:00');
  });

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GB');
  });

  it('cleans file names', () => {
    expect(stripExtension('01 - Intro.mp3')).toBe('01 - Intro');
    expect(sanitizeFileName('Author: Title?')).toBe('Author Title');
    expect(sanitizeFileName('  ')).toBe('audiobook');
  });
});
