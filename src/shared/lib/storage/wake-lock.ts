type WakeLockSentinelLike = { release(): Promise<void> };
type WakeLockLike = { request(type: 'screen'): Promise<WakeLockSentinelLike> };

/**
 * Keeps the screen on while active. Mobile browsers pause or discard pages
 * once the screen locks, which would stop a long conversion.
 */
export const createScreenWakeLock = () => {
  let sentinel: WakeLockSentinelLike | null = null;
  let active = false;

  const acquire = async () => {
    const wakeLock = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock;
    if (!active || !wakeLock || document.visibilityState !== 'visible') return;
    try {
      sentinel = await wakeLock.request('screen');
    } catch {
      // Not allowed (e.g. low battery mode); conversion continues regardless.
    }
  };

  // The lock is released automatically whenever the page is hidden.
  document.addEventListener('visibilitychange', () => void acquire());

  return {
    enable: () => {
      active = true;
      void acquire();
    },
    disable: () => {
      active = false;
      void sentinel?.release().catch(() => {});
      sentinel = null;
    },
  };
};
