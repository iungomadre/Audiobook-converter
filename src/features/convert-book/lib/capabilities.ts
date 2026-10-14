import type { MessageKey } from '@/shared/i18n';
import { isOpfsSupported } from '@/shared/lib/storage';

/** Returns why the browser cannot convert, or null when it can. */
export const getUnsupportedReason = (): MessageKey | null => {
  if (!isOpfsSupported()) return 'error.noOpfs';
  if (typeof AudioDecoder === 'undefined') return 'error.noWebCodecs';
  return null;
};

/** Returns true if the estimated output may not fit into the browser's storage quota. */
export const isStorageLow = async (estimatedBytes: number): Promise<boolean> => {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    return quota !== undefined && usage !== undefined && quota - usage < estimatedBytes * 1.1;
  } catch {
    return false; // Estimation is best-effort.
  }
};
