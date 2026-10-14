import { getPreset, numberedTitle, totalDuration, type Book } from '@/entities/book';
import { AAC_FRAMES_PER_PACKET, type ChapterMarker } from '@/shared/lib/mp4';
import { clearOutputs, createScreenWakeLock, interruptedFlag } from '@/shared/lib/storage';
import { SAMPLE_RATE } from '../lib/convert-to-m4b';
import { createEtaEstimator } from '../lib/eta';
import { checkpoint, loadChapterSizes, partName, sizesName, type Checkpoint } from './checkpoint';
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
    const preset = getPreset(book.presetId);
    const files = book.chapters.map((chapter) => chapter.key);

    // Continue an interrupted conversion of the same files, or start from scratch.
    let saved: Checkpoint | null = checkpoint.load();
    if (!saved || !checkpoint.matches(saved, files, preset.numberOfChannels, preset.bitrate)) {
      await clearOutputs();
      saved = checkpoint.create(`book-${Date.now()}.m4b`, files, preset.numberOfChannels, preset.bitrate);
      checkpoint.save(saved);
    }
    const progressState: Checkpoint = saved;
    type Encoded = { sizes: Uint32Array; audioSpecificConfig: Uint8Array; encoder: 'native' | 'wasm' };
    const encoded: Encoded[] = new Array(files.length);
    if (progressState.audioSpecificConfig) {
      const audioSpecificConfig = Uint8Array.from(progressState.audioSpecificConfig);
      for (const index of progressState.done) {
        const sizes = await loadChapterSizes(progressState.outputName, index);
        if (sizes) encoded[index] = { sizes, audioSpecificConfig, encoder: 'native' };
      }
    }
    progressState.done = progressState.done.filter((index) => encoded[index]);
    ensureCurrent();

    const job: ConversionJob = {
      outputName: progressState.outputName,
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
    const encodedSeconds = (sizes: Uint32Array) => (sizes.length * AAC_FRAMES_PER_PACKET) / SAMPLE_RATE;
    const chapterSeconds = job.chapters.map((_, index) => (encoded[index] ? encodedSeconds(encoded[index].sizes) : 0));
    let chaptersDone = progressState.done.length;
    // Estimate only from work done in this session; reused chapters took no time.
    const reusedSeconds = chapterSeconds.reduce((sum, seconds) => sum + seconds, 0);
    const eta = totalSeconds === null ? null : createEtaEstimator(Math.max(0, totalSeconds - reusedSeconds), startedAt);
    const report = () => {
      if (id !== runId) return;
      const processedSeconds = chapterSeconds.reduce((sum, seconds) => sum + seconds, 0);
      set({
        status: 'running',
        progress: {
          chapterIndex: Math.min(chaptersDone, job.chapters.length - 1),
          processedSeconds,
          totalSeconds,
          remainingSeconds: eta?.update(processedSeconds - reusedSeconds, Date.now()) ?? null,
        },
        startedAt,
      });
    };
    report();

    try {
      // A small pool of workers, each encoding one chapter at a time into its own part file.
      const pending = job.chapters.map((_, index) => index).filter((index) => !encoded[index]);
      let next = 0;
      const runNext = async (): Promise<void> => {
        while (next < pending.length) {
          const index = pending[next++];
          const result = await runInFreshWorker(
            {
              type: 'encode-chapter',
              settings,
              file: job.chapters[index].file,
              partName: partName(job.outputName, index),
              sizesName: sizesName(job.outputName, index),
            },
            (processedSeconds) => {
              chapterSeconds[index] = processedSeconds;
              report();
            },
          );
          ensureCurrent();
          if (result.type !== 'chapter-done') throw new Error(`Unexpected worker reply: ${result.type}`);
          encoded[index] = result;
          chapterSeconds[index] = encodedSeconds(result.sizes);
          chaptersDone++;
          progressState.done.push(index);
          progressState.audioSpecificConfig ??= Array.from(result.audioSpecificConfig);
          checkpoint.save(progressState);
          report();
        }
      };
      await Promise.all(Array.from({ length: Math.min(parallelWorkers(), pending.length) }, runNext));

      // Chapters start where the audio of the previous ones ends.
      const markers: ChapterMarker[] = [];
      let startSeconds = 0;
      for (const [index, chapter] of job.chapters.entries()) {
        markers.push({ title: chapter.title, startSeconds });
        startSeconds += encodedSeconds(encoded[index].sizes);
      }

      const parts = encoded.map((result, index) => ({ name: partName(job.outputName, index), sizes: result.sizes }));
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
      checkpoint.clear();
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
    checkpoint.clear();
    set({ status: 'idle' });
    // The terminated worker may still hold the file lock for a moment.
    setTimeout(() => void clearOutputs(), 1000);
  };

  /** Chapters finished in an earlier session, if any. */
  const savedProgress = (): { done: number; total: number } | null => {
    const saved = checkpoint.load();
    return saved && saved.done.length > 0 ? { done: saved.done.length, total: saved.files.length } : null;
  };

  /** Like `savedProgress`, but only if `book` has the same files and audio settings, so it would be continued. */
  const resumableFor = (book: Book): { done: number; total: number } | null => {
    const saved = checkpoint.load();
    const preset = getPreset(book.presetId);
    const files = book.chapters.map((chapter) => chapter.key);
    return saved && saved.done.length > 0 && checkpoint.matches(saved, files, preset.numberOfChannels, preset.bitrate)
      ? { done: saved.done.length, total: saved.files.length }
      : null;
  };

  /** True if `book` has files but they are not the files of the saved, unfinished conversion. */
  const isDifferentBook = (book: Book): boolean => {
    const saved = checkpoint.load();
    if (!saved || saved.done.length === 0 || book.chapters.length === 0) return false;
    const keys = book.chapters.map((chapter) => chapter.key);
    return keys.length !== saved.files.length || keys.some((key, index) => key !== saved.files[index]);
  };

  return {
    get: () => state,
    savedProgress,
    resumableFor,
    isDifferentBook,
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
