/// <reference lib="webworker" />
import { fromSyncAccessHandle, type SyncAccessHandle } from '@/shared/lib/mp4';
import { getOutputDirectory } from '@/shared/lib/storage';
import { assembleBook, buildMetadata, encodeChapter } from '../lib/convert-to-m4b';
import { toErrorInfo } from '../model/errors';
import type { WorkerRequest, WorkerResponse } from '../model/protocol';

type Handle = SyncAccessHandle & { flush(): void; close(): void };

const post = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, transfer);

/** Opens a file in the output directory for synchronous access (one worker at a time per file). */
const open = async (name: string): Promise<Handle> => {
  const fileHandle = await (await getOutputDirectory()).getFileHandle(name, { create: true });
  return (fileHandle as unknown as { createSyncAccessHandle(): Promise<Handle> }).createSyncAccessHandle();
};

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  const handles: Handle[] = [];
  const openTracked = async (name: string) => {
    const handle = await open(name);
    handles.push(handle);
    return handle;
  };
  const closeAll = () => {
    for (const handle of handles.splice(0)) {
      handle.flush();
      handle.close();
    }
  };

  try {
    if (data.type === 'encode-chapter') {
      const part = await openTracked(data.partName);
      const result = await encodeChapter(data.settings, data.file, fromSyncAccessHandle(part), (seconds) =>
        post({ type: 'progress', processedSeconds: seconds }));
      closeAll();
      post({ type: 'chapter-done', ...result }, [result.sizes.buffer]);
    } else {
      const directory = await getOutputDirectory();
      const output = fromSyncAccessHandle(await openTracked(data.settings.outputName));
      const parts = data.parts.map(({ name, sizes }) => ({
        sizes,
        open: async () => {
          const handle = await open(name);
          return {
            file: fromSyncAccessHandle(handle),
            release: async () => {
              handle.close();
              await directory.removeEntry(name);
            },
          };
        },
      }));
      const result = await assembleBook(
        data.settings, output, parts, data.audioSpecificConfig, data.chapters, buildMetadata(data.metadata, data.cover));
      closeAll();
      post({ type: 'finished', ...result });
    }
  } catch (error) {
    for (const handle of handles.splice(0)) handle.close();
    post({ type: 'error', error: toErrorInfo(error) });
  }
};
