const WINDOW_MS = 20_000; // Measure speed over the last 20 s, not from one message to the next
const MIN_ELAPSED_MS = 5_000; // Too early to say anything sensible
const DISPLAY_INTERVAL_MS = 1_000;
const SMOOTHING = 0.25; // Weight of a new estimate in the shown value

/**
 * Remaining-time estimate that stays calm while several workers report
 * progress at slightly different moments: speed is measured over a sliding
 * window, the result is smoothed, rounded, and refreshed at most once a second.
 */
export const createEtaEstimator = (totalSeconds: number, startedAt: number) => {
  const samples: { at: number; processed: number }[] = [];
  let smoothed: number | null = null;
  let shown: number | null = null;
  let shownAt = 0;

  return {
    /** Records progress (seconds of audio processed so far) and returns the remaining time to show, or null. */
    update(processedSeconds: number, now: number): number | null {
      samples.push({ at: now, processed: processedSeconds });
      while (samples.length > 2 && now - samples[1].at >= WINDOW_MS) samples.shift();
      if (now - startedAt < MIN_ELAPSED_MS) return null;

      const oldest = samples[0];
      const windowRate = now > oldest.at ? (processedSeconds - oldest.processed) / ((now - oldest.at) / 1000) : 0;
      const overallRate = processedSeconds / ((now - startedAt) / 1000);
      const rate = now - oldest.at >= WINDOW_MS / 2 && windowRate > 0 ? windowRate : overallRate;
      if (!(rate > 0)) return shown;

      const remaining = Math.max(0, totalSeconds - processedSeconds) / rate;
      smoothed = smoothed === null ? remaining : smoothed + SMOOTHING * (remaining - smoothed);

      if (shown === null || now - shownAt >= DISPLAY_INTERVAL_MS) {
        shown = roundRemaining(smoothed);
        shownAt = now;
      }
      return shown;
    },
  };
};

/** Rounds to steps that don't flicker: 5 s under a minute, 10 s under 10 minutes, then whole minutes. */
export const roundRemaining = (seconds: number): number => {
  const step = seconds < 60 ? 5 : seconds < 600 ? 10 : 60;
  return Math.max(step, Math.round(seconds / step) * step);
};
