import { numberedTitle, type BookStore, type Chapter } from '@/entities/book';
import { normalizeCover } from '@/shared/lib/image';
import { probeAudioFile } from '@/shared/lib/media';
import { prepareFiles, type PickedFile } from '../lib/collect-files';

let generation = 0;

/**
 * Replaces the chapter list with the picked files, then probes durations in the background
 * and pre-fills empty metadata (title, author, year, cover) from the first file's tags.
 */
export const loadFiles = async (store: BookStore, picked: readonly PickedFile[]): Promise<number> => {
  const files = prepareFiles(picked);
  const current = ++generation;

  const chapters: Chapter[] = files.map(({ file, path }, index) => ({
    id: crypto.randomUUID(),
    file,
    path,
    title: numberedTitle(index),
    durationSeconds: null,
  }));
  store.setChapters(chapters);

  for (const [index, chapter] of chapters.entries()) {
    const probe = await probeAudioFile(chapter.file);
    if (current !== generation) return files.length; // A newer selection replaced this one.
    store.updateChapter(chapter.id, { durationSeconds: probe.durationSeconds });
    if (index === 0) await prefillFromTags(store, probe.tags);
  }
  return files.length;
};

const prefillFromTags = async (store: BookStore, tags: Awaited<ReturnType<typeof probeAudioFile>>['tags']) => {
  const { metadata, cover } = store.get();
  store.updateMetadata({
    title: metadata.title || tags.album || '',
    author: metadata.author || tags.albumArtist || tags.artist || '',
    year: metadata.year || (tags.date ? String(tags.date.getFullYear()) : ''),
  });

  const image = tags.images?.find((candidate) => candidate.kind === 'coverFront') ?? tags.images?.[0];
  if (!cover && image) {
    try {
      const normalized = await normalizeCover(new Blob([image.data as BlobPart], { type: image.mimeType }));
      const previewUrl = URL.createObjectURL(new Blob([normalized.data as BlobPart], { type: normalized.mimeType }));
      store.setCover({ ...normalized, previewUrl });
    } catch {
      // An unreadable embedded image is not worth failing over; the user can pick a cover.
    }
  }
};
