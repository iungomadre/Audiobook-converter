/** Minimal synchronous random-access file, e.g. an OPFS `FileSystemSyncAccessHandle`. */
export interface RandomAccessFile {
  getSize(): number;
  read(offset: number, length: number): Uint8Array;
  write(offset: number, data: Uint8Array): void;
  truncate(size: number): void;
}

/** The subset of OPFS `FileSystemSyncAccessHandle` we use (the type lives in the WebWorker lib). */
export interface SyncAccessHandle {
  getSize(): number;
  read(buffer: Uint8Array, options: { at: number }): number;
  write(buffer: Uint8Array, options: { at: number }): number;
  truncate(size: number): void;
}

/** Adapts an OPFS sync access handle (available in dedicated workers). */
export const fromSyncAccessHandle = (handle: SyncAccessHandle): RandomAccessFile => ({
  getSize: () => handle.getSize(),
  read: (offset, length) => {
    const out = new Uint8Array(length);
    const read = handle.read(out, { at: offset });
    if (read !== length) throw new Error(`Short read: expected ${length} bytes, got ${read}`);
    return out;
  },
  write: (offset, data) => {
    handle.write(data, { at: offset });
  },
  truncate: (size) => handle.truncate(size),
});

/** In-memory implementation, used by tests. */
export class MemoryFile implements RandomAccessFile {
  constructor(public bytes: Uint8Array = new Uint8Array(0)) {}

  getSize(): number {
    return this.bytes.length;
  }

  read(offset: number, length: number): Uint8Array {
    return this.bytes.slice(offset, offset + length);
  }

  write(offset: number, data: Uint8Array): void {
    if (offset + data.length > this.bytes.length) {
      const grown = new Uint8Array(offset + data.length);
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes.set(data, offset);
  }

  truncate(size: number): void {
    const resized = new Uint8Array(size);
    resized.set(this.bytes.subarray(0, size));
    this.bytes = resized;
  }
}
