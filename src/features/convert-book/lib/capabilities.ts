import { isOpfsSupported } from '@/shared/lib/storage';

/** Returns a reason the browser cannot convert, or null when it can. */
export const getUnsupportedReason = (): string | null => {
  if (!isOpfsSupported()) return 'This browser cannot store large files locally (no Origin Private File System).';
  if (typeof AudioDecoder === 'undefined') {
    return 'This browser cannot decode audio in the background (WebCodecs is missing). Please use a recent Chrome, Edge, Firefox or Safari.';
  }
  return null;
};

/** Warns if the estimated output does not fit into the browser's storage quota. */
export const checkStorage = async (estimatedBytes: number): Promise<string | null> => {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (quota !== undefined && usage !== undefined && quota - usage < estimatedBytes * 1.1) {
      return 'Your device may not have enough free browser storage for this book. Free up some space and try again.';
    }
  } catch {
    // Estimation is best-effort.
  }
  return null;
};
