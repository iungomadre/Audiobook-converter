const KEY = 'audiobook-converter:conversion-running';

/**
 * Remembers that a conversion is running, so that after iOS silently kills and
 * reloads the tab we can tell the user what happened instead of showing an
 * empty form. Storage may be unavailable (private mode); that is fine.
 */
export const interruptedFlag = {
  set: () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Best effort.
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Best effort.
    }
  },
  /** Returns true (once) if the previous page load ended during a conversion. */
  consume: (): boolean => {
    try {
      const wasRunning = localStorage.getItem(KEY) !== null;
      localStorage.removeItem(KEY);
      return wasRunning;
    } catch {
      return false;
    }
  },
};
