import { getOutputDirectory } from '@/shared/lib/storage';

const KEY = 'audiobook-converter:checkpoint-v2';

/**
 * What survives a reload of the page: which chapters of which conversion are
 * already encoded (their part files stay in the Origin Private File System).
 * iOS silently kills and reloads tabs that use too much memory, so long books
 * may need several sessions; finished chapters are never encoded twice.
 */
export type Checkpoint = {
  outputName: string;
  numberOfChannels: number;
  bitrate: number;
  /** Content fingerprints of the input files, in chapter order. */
  files: string[];
  /** Indices of finished chapters. */
  done: number[];
  audioSpecificConfig: number[] | null;
};

export const partName = (outputName: string, index: number) => `${outputName}.part${index}`;
export const sizesName = (outputName: string, index: number) => `${partName(outputName, index)}.sizes`;

export const checkpoint = {
  load(): Checkpoint | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Checkpoint) : null;
    } catch {
      return null;
    }
  },

  save(value: Checkpoint): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      // Without storage, resuming is simply not available.
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Best effort.
    }
  },

  create(outputName: string, fileKeys: string[], numberOfChannels: number, bitrate: number): Checkpoint {
    return { outputName, numberOfChannels, bitrate, files: fileKeys, done: [], audioSpecificConfig: null };
  },

  /** True if `value` belongs to the same files (by content, in the same order) and audio settings. */
  matches(value: Checkpoint, fileKeys: string[], numberOfChannels: number, bitrate: number): boolean {
    return value.numberOfChannels === numberOfChannels
      && value.bitrate === bitrate
      && value.files.length === fileKeys.length
      && fileKeys.every((key, index) => value.files[index] === key);
  },
};

/** Reads the packet sizes saved next to a finished chapter's part; null if the part is gone. */
export const loadChapterSizes = async (outputName: string, index: number): Promise<Uint32Array | null> => {
  try {
    const directory = await getOutputDirectory();
    await directory.getFileHandle(partName(outputName, index));
    const file = await (await directory.getFileHandle(sizesName(outputName, index))).getFile();
    const sizes = new Uint32Array(await file.arrayBuffer());
    return sizes.length > 0 ? sizes : null;
  } catch {
    return null;
  }
};
