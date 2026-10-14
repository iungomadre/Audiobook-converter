import {
  arrangeLikeDraft, forgetRememberedChapters, hasRememberedChapters, isConversionPending, numberedTitle, type BookStore,
  type Chapter,
} from '@/entities/book';
import { contentKey } from '@/shared/lib/files';
import { normalizeCover } from '@/shared/lib/image';
import { probeAudioFile } from '@/shared/lib/media';
import { prepareFiles, type PickedFile } from '../lib/collect-files';

let generation = 0;

/**
 * Replaces the chapter list with the picked files, then probes durations in the background
 * and pre-fills empty metadata (title, author, year, cover) from the first file's tags.
 * Picking the same files as in the last session restores their order and titles.
 */
export const loadFiles = async (store: BookStore, picked: readonly PickedFile[]): Promise<number> => {
  const current = ++generation;
  const files = await Promise.all(prepareFiles(picked).map(async (item) => ({ ...item, key: await contentKey(item.file) })));
  if (current !== generation) return files.length;

  const remembered = arrangeLikeDraft(files);
  if (!remembered && hasRememberedChapters() && !isConversionPending()) {
    // A different book than last time: its details and cover don't apply. (While a conversion
    // of the old book is unfinished they are kept; the convert step asks what to do.)
    store.resetDetails();
    forgetRememberedChapters();
  }

  const ordered = remembered ?? files.map((item, index) => ({ item, title: numberedTitle(index) }));
  const chapters: Chapter[] = ordered.map(({ item: { file, path, key }, title }) => ({
    id: crypto.randomUUID(),
    file,
    key,
    path,
    title,
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

/** Replaces the book details and cover with those found in the first file's tags. */
export const refillDetailsFromFiles = async (store: BookStore): Promise<void> => {
  store.resetDetails();
  const first = store.get().chapters[0];
  if (first) await prefillFromTags(store, (await probeAudioFile(first.file)).tags);
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
