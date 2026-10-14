import { describe, expect, it } from 'vitest';
import { createEtaEstimator, roundRemaining } from './eta';

describe('createEtaEstimator', () => {
  it('stays steady when two workers report alternately with stale values', () => {
    // 1 h of audio processed at 30x real time by two workers, each reporting every 250 ms
    // but half a second out of date.
    const total = 3600;
    const estimator = createEtaEstimator(total, 0);
    const shown: number[] = [];
    for (let now = 250; now <= 60_000; now += 125) {
      const workerLag = (now / 125) % 2 === 0 ? 0 : 500;
      const processed = ((now - workerLag) / 1000) * 30;
      const remaining = estimator.update(processed, now);
      if (now >= 30_000 && remaining !== null) shown.push(remaining);
    }
    // True remaining time at 30-60 s is 90-60 s; the shown value only ever moves down, in small steps.
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i]).toBeLessThanOrEqual(shown[i - 1]);
      expect(shown[i - 1] - shown[i]).toBeLessThanOrEqual(10);
    }
    expect(shown.at(-1)).toBeGreaterThanOrEqual(55);
    expect(shown.at(-1)).toBeLessThanOrEqual(70);
  });

  it('says nothing in the first seconds', () => {
    const estimator = createEtaEstimator(100, 0);
    expect(estimator.update(10, 1000)).toBeNull();
  });
});

describe('roundRemaining', () => {
  it('uses coarser steps for longer times', () => {
    expect(roundRemaining(42)).toBe(40);
    expect(roundRemaining(123)).toBe(120);
    expect(roundRemaining(3725)).toBe(3720);
    expect(roundRemaining(1)).toBe(5);
  });
});
