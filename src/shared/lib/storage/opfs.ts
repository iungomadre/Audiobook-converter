const OUTPUT_DIRECTORY = 'conversions';

/** Directory in the Origin Private File System that holds converted books. */
export const getOutputDirectory = async (): Promise<FileSystemDirectoryHandle> => {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OUTPUT_DIRECTORY, { create: true });
};

export const getOutputFile = async (name: string): Promise<File> =>
  (await (await getOutputDirectory()).getFileHandle(name)).getFile();

/** Deletes earlier outputs (best effort: a file still locked by a worker is skipped). */
export const clearOutputs = async (keep?: string): Promise<void> => {
  const directory = await getOutputDirectory();
  const names: string[] = [];
  for await (const name of (directory as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
  await Promise.all(names.filter((name) => name !== keep).map((name) => directory.removeEntry(name).catch(() => {})));
};

export const isOpfsSupported = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
