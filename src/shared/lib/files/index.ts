const SAMPLE_BYTES = 64 * 1024;

/**
 * Identifies a file by its content, cheaply: size plus a SHA-256 of its first
 * and last 64 KB. Hashing whole audiobooks would mean reading gigabytes (which
 * Safari handles badly); this tells different recordings apart while still
 * recognizing the same files after renaming or copying.
 */
export const contentKey = async (file: Blob): Promise<string> => {
  const head = file.slice(0, SAMPLE_BYTES);
  const tail = file.size > SAMPLE_BYTES ? file.slice(Math.max(SAMPLE_BYTES, file.size - SAMPLE_BYTES)) : new Blob();
  const bytes = await new Blob([head, tail]).arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `${file.size}:${Array.from(digest.subarray(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};
