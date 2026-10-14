import type { StreamTargetChunk } from 'mediabunny';
import type { RandomAccessFile } from './random-access-file';

/** Writable stream for Mediabunny's `StreamTarget` that writes chunks at their positions. */
export const createFileWritable = (file: RandomAccessFile): WritableStream<StreamTargetChunk> =>
  new WritableStream<StreamTargetChunk>({
    write: (chunk) => file.write(chunk.position, chunk.data),
  });
