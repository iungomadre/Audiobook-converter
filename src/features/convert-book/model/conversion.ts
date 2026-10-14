import { getPreset, totalDuration, type Book } from '@/entities/book';
import { clearOutputs } from '@/shared/lib/storage';
import type { ConversionJob, ConversionProgress, WorkerRequest, WorkerResponse } from './protocol';

export type ConversionState =
  | { status: 'idle' }
  | { status: 'running'; progress: ConversionProgress | null; startedAt: number }
  | { status: 'done'; outputName: string; size: number; durationSeconds: number; elapsedMs: number; encoder: 'native' | 'wasm' }
  | { status: 'error'; message: string };

type Listener = (state: ConversionState) => void;

export const createConversion = () => {
  let state: ConversionState = { status: 'idle' };
  let worker: Worker | null = null;
  const listeners = new Set<Listener>();

  const set = (next: ConversionState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  const stopWorker = () => {
    worker?.terminate();
    worker = null;
  };

  const start = async (book: Book) => {
    stopWorker();
    const outputName = `book-${Date.now()}.m4b`;
    await clearOutputs();

    const preset = getPreset(book.presetId);
    const job: ConversionJob = {
      outputName,
      chapters: book.chapters.map(({ file, title, durationSeconds }, index) => ({
        file,
        title: title.trim() || `Chapter ${index + 1}`,
        durationSeconds,
      })),
      metadata: book.metadata,
      cover: book.cover && { data: book.cover.data, mimeType: book.cover.mimeType },
      numberOfChannels: preset.numberOfChannels,
      bitrate: preset.bitrate,
    };

    const startedAt = Date.now();
    set({ status: 'running', progress: { chapterIndex: 0, processedSeconds: 0, totalSeconds: totalDuration(book.chapters) }, startedAt });

    worker = new Worker(new URL('../worker/convert-book.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === 'progress') {
        set({ status: 'running', progress: data, startedAt });
      } else if (data.type === 'done') {
        stopWorker();
        set({ ...data, status: 'done', elapsedMs: Date.now() - startedAt });
      } else {
        stopWorker();
        set({ status: 'error', message: data.message });
      }
    };
    worker.onerror = (event) => {
      stopWorker();
      set({ status: 'error', message: event.message || 'The converter stopped unexpectedly.' });
    };
    worker.postMessage({ type: 'convert', job } satisfies WorkerRequest);
  };

  const cancel = () => {
    stopWorker();
    set({ status: 'idle' });
    // The terminated worker may still hold the file lock for a moment.
    setTimeout(() => void clearOutputs(), 1000);
  };

  return {
    get: () => state,
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    start,
    cancel,
    reset: () => set({ status: 'idle' }),
  };
};

export type Conversion = ReturnType<typeof createConversion>;
