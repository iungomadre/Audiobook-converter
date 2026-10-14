import { describe, expect, it } from 'vitest';
import { contentKey } from './index';

const file = (bytes: Uint8Array, name = 'a.mp3', lastModified = 1) => new File([bytes as BlobPart], name, { lastModified });
const filled = (size: number, at: number, value: number) => {
  const bytes = new Uint8Array(size);
  bytes[at] = value;
  return bytes;
};

describe('contentKey', () => {
  it('ignores name and date but not content', async () => {
    const size = 300_000;
    const original = await contentKey(file(filled(size, 10, 1)));
    expect(await contentKey(file(filled(size, 10, 1), 'renamed.mp3', 999))).toBe(original);
    expect(await contentKey(file(filled(size, 10, 2)))).not.toBe(original); // start differs
    expect(await contentKey(file(filled(size, size - 10, 2)))).not.toBe(original); // end differs
    expect(await contentKey(file(filled(size + 1, 10, 1)))).not.toBe(original); // size differs
  });

  it('handles small files', async () => {
    expect(await contentKey(file(Uint8Array.of(1, 2, 3)))).toMatch(/^3:[0-9a-f]{32}$/);
  });
});
