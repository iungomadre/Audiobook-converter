import { sortNaturalBy } from '@/shared/lib/natural-sort';

const AUDIO_EXTENSIONS = /\.(mp3|m4a|m4b|aac|ogg|oga|opus|flac|wav)$/i;

export type PickedFile = { file: File; path: string };

export const isAudioFile = (file: File): boolean => AUDIO_EXTENSIONS.test(file.name) || file.type.startsWith('audio/');

/** Keeps audio files only and orders them naturally by their path ("2" before "10"). */
export const prepareFiles = (files: readonly PickedFile[]): PickedFile[] =>
  sortNaturalBy(files.filter(({ file }) => isAudioFile(file) && !file.name.startsWith('.')), ({ path }) => path);

export const fromFileList = (list: FileList): PickedFile[] =>
  Array.from(list, (file) => ({ file, path: file.webkitRelativePath || file.name }));

/** Reads dropped files and (recursively) dropped folders. */
export const fromDataTransfer = async (dataTransfer: DataTransfer): Promise<PickedFile[]> => {
  const entries = Array.from(dataTransfer.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry);
  if (entries.length === 0) return fromFileList(dataTransfer.files);

  const results: PickedFile[] = [];
  const visit = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      results.push({ file, path: entry.fullPath.replace(/^\//, '') });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns results in batches until it returns an empty array.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) break;
        for (const child of batch) await visit(child);
      }
    }
  };
  for (const entry of entries) await visit(entry);
  return results;
};
