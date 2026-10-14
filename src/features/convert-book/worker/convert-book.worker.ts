import { toErrorInfo } from '../model/errors';
/// <reference lib="webworker" />
import { fromSyncAccessHandle, type SyncAccessHandle } from '@/shared/lib/mp4';
import { getOutputDirectory } from '@/shared/lib/storage';
import { convertToM4b } from '../lib/convert-to-m4b';
import type { WorkerRequest, WorkerResponse } from '../model/protocol';

const post = (message: WorkerResponse) => self.postMessage(message);

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type !== 'convert') return;
  const { job } = data;
  let handle: (SyncAccessHandle & { flush(): void; close(): void }) | undefined;

  try {
    const directory = await getOutputDirectory();
    const fileHandle = await directory.getFileHandle(job.outputName, { create: true });
    handle = await (fileHandle as unknown as { createSyncAccessHandle(): Promise<NonNullable<typeof handle>> })
      .createSyncAccessHandle();

    const result = await convertToM4b(job, fromSyncAccessHandle(handle), (progress) => post({ type: 'progress', ...progress }));
    handle.flush();
    const size = handle.getSize();
    handle.close();
    handle = undefined;
    post({ type: 'done', outputName: job.outputName, size, ...result });
  } catch (error) {
    handle?.close();
    post({ type: 'error', error: toErrorInfo(error) });
  }
};
