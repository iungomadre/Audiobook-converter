import { getPreset, numberedTitle, totalDuration, type Book } from '@/entities/book';
import { AAC_FRAMES_PER_PACKET, type ChapterMarker } from '@/shared/lib/mp4';
import { clearOutputs, createScreenWakeLock, interruptedFlag } from '@/shared/lib/storage';
import { SAMPLE_RATE } from '../lib/convert-to-m4b';
import { LocalizedError, toErrorInfo, type ErrorInfo } from './errors';
import type { ConversionJob, ConversionProgress, WorkerRequest, WorkerResponse } from './protocol';

export type ConversionState =
  | { status: 'idle' }
  | { status: 'running'; progress: ConversionProgress | null; startedAt: number }
  | { status: 'done'; outputName: string; size: number; durationSeconds: number; elapsedMs: number; encoder: 'native' | 'wasm' }
  | { status: 'error'; error: ErrorInfo };

type Listener = (state: ConversionState) => void;

class Cancelled extends Error {}

/**
 * How many chapters to encode at once. Phones and tablets get 2, because iOS
 * kills tabs that use too much memory; computers use their cores, up to 4.
 */
const parallelWorkers = (): number => {
  const cores = navigator.hardwareConcurrency || 2;
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
  return Math.max(1, Math.min(isTouchDevice ? 2 : 4, cores - 1));
};

export const createConversion = () => {
  let state: ConversionState = { status: 'idle' };
  const workers = new Set<Worker>();
  let runId = 0;
  const listeners = new Set<Listener>();
  const wakeLock = createScreenWakeLock();

  const set = (next: ConversionState) => {
    state = next;
    if (state.status === 'running') {
      wakeLock.enable();
      interruptedFlag.set();
    } else {
      wakeLock.disable();
      interruptedFlag.clear();
    }
    for (const listener of listeners) listener(state);
  };

  const stopWorkers = () => {
    for (const worker of workers) worker.terminate();
    workers.clear();
  };

  /** Runs one request in a brand-new worker and terminates it afterwards. */
  const runInFreshWorker = (
    request: WorkerRequest,
    onProgress: (processedSeconds: number) => void,
    transfer: Transferable[] = [],
  ): Promise<Exclude<WorkerResponse, { type: 'progress' } | { type: 'error' }>> =>
    new Promise((resolve, reject) => {
      const current = new Worker(new URL('../worker/convert-book.worker.ts', import.meta.url), { type: 'module' });
      workers.add(current);
      const finish = () => {
        current.terminate();
        workers.delete(current);
      };
      current.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.type === 'progress') return onProgress(data.processedSeconds);
        finish();
        if (data.type === 'error') reject(new LocalizedError(data.error.key ?? 'error.workerCrashed', data.error.params, data.error.message));
        else resolve(data);
      };
      current.onerror = (event) => {
        finish();
        reject(new LocalizedError('error.workerCrashed', {}, event.message || 'Worker crashed'));
      };
      current.postMessage(request, transfer);
    });

  const start = async (book: Book) => {
    stopWorkers();
    const id = ++runId;
    const ensureCurrent = () => {
      if (id !== runId) throw new Cancelled();
    };
    await clearOutputs();

    const preset = getPreset(book.presetId);
    const job: ConversionJob = {
      outputName: `book-${Date.now()}.m4b`,
      chapters: book.chapters.map(({ file, title, durationSeconds }, index) => ({
        file,
        title: title.trim() || numberedTitle(index),
        durationSeconds,
      })),
      metadata: book.metadata,
      cover: book.cover && { data: book.cover.data, mimeType: book.cover.mimeType },
      numberOfChannels: preset.numberOfChannels,
      bitrate: preset.bitrate,
    };
    const settings = { outputName: job.outputName, numberOfChannels: job.numberOfChannels, bitrate: job.bitrate };
    const totalSeconds = totalDuration(book.chapters);
    const startedAt = Date.now();
    const chapterSeconds = job.chapters.map(() => 0);
    let chaptersDone = 0;
    const report = () => {
      if (id !== runId) return;
      set({
        status: 'running',
        progress: {
          chapterIndex: Math.min(chaptersDone, job.chapters.length - 1),
          processedSeconds: chapterSeconds.reduce((sum, seconds) => sum + seconds, 0),
          totalSeconds,
        },
        startedAt,
      });
    };
    report();

    try {
      type Encoded = { sizes: Uint32Array; audioSpecificConfig: Uint8Array; encoder: 'native' | 'wasm' };
      const encoded: Encoded[] = new Array(job.chapters.length);
      const partName = (index: number) => `${job.outputName}.part${index}`;

      // A small pool of workers, each encoding one chapter at a time into its own part file.
      let next = 0;
      const runNext = async (): Promise<void> => {
        while (next < job.chapters.length) {
          const index = next++;
          const result = await runInFreshWorker(
            { type: 'encode-chapter', settings, file: job.chapters[index].file, partName: partName(index) },
            (processedSeconds) => {
              chapterSeconds[index] = processedSeconds;
              report();
            },
          );
          ensureCurrent();
          if (result.type !== 'chapter-done') throw new Error(`Unexpected worker reply: ${result.type}`);
          encoded[index] = result;
          chapterSeconds[index] = (result.sizes.length * AAC_FRAMES_PER_PACKET) / SAMPLE_RATE;
          chaptersDone++;
          report();
        }
      };
      await Promise.all(Array.from({ length: Math.min(parallelWorkers(), job.chapters.length) }, runNext));

      // Chapters start where the audio of the previous ones ends.
      const markers: ChapterMarker[] = [];
      let startSeconds = 0;
      for (const [index, chapter] of job.chapters.entries()) {
        markers.push({ title: chapter.title, startSeconds });
        startSeconds += (encoded[index].sizes.length * AAC_FRAMES_PER_PACKET) / SAMPLE_RATE;
      }

      const parts = encoded.map((result, index) => ({ name: partName(index), sizes: result.sizes }));
      const finished = await runInFreshWorker(
        {
          type: 'assemble',
          settings,
          parts,
          audioSpecificConfig: encoded[0].audioSpecificConfig,
          chapters: markers,
          metadata: job.metadata,
          cover: job.cover,
        },
        () => {},
        parts.map((part) => part.sizes.buffer),
      );
      ensureCurrent();
      if (finished.type !== 'finished') throw new Error(`Unexpected worker reply: ${finished.type}`);
      set({
        status: 'done',
        outputName: job.outputName,
        size: finished.size,
        durationSeconds: finished.durationSeconds,
        elapsedMs: Date.now() - startedAt,
        encoder: encoded[0].encoder,
      });
    } catch (error) {
      if (error instanceof Cancelled || id !== runId) return;
      runId++; // Stop the other chapters still being encoded.
      stopWorkers();
      set({ status: 'error', error: toErrorInfo(error) });
    }
  };

  const cancel = () => {
    runId++;
    stopWorkers();
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
