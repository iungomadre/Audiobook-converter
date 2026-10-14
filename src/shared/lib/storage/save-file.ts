type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle & { createWritable(): Promise<WritableStream<Uint8Array>> }>;

/**
 * Saves a (possibly multi-gigabyte, disk-backed) file to the user's device.
 * Uses the File System Access save dialog where available, otherwise a regular download.
 * Returns false if the user cancelled the dialog.
 */
export const saveFile = async (file: File, suggestedName: string): Promise<boolean> => {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName,
        types: [{ description: 'Audiobook', accept: { 'audio/mp4': ['.m4b'] } }],
      });
      await file.stream().pipeTo(await handle.createWritable());
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      // Fall through to a plain download if the picker is unavailable in this context.
    }
  }

  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: suggestedName });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
};
