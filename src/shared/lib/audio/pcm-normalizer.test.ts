import { describe, expect, it } from 'vitest';
import { remixChannels, StreamingResampler } from './pcm-normalizer';

const sine = (frequency: number, rate: number, frames: number, offset = 0) =>
  Float32Array.from({ length: frames }, (_, i) => Math.sin((2 * Math.PI * frequency * (i + offset)) / rate));

describe('remixChannels', () => {
  it('averages to mono and duplicates to stereo', () => {
    const [mono] = remixChannels([Float32Array.of(1, 0), Float32Array.of(0, 1)], 1);
    expect(Array.from(mono)).toEqual([0.5, 0.5]);
    const stereo = remixChannels([Float32Array.of(0.25)], 2);
    expect(stereo.map((plane) => plane[0])).toEqual([0.25, 0.25]);
  });
});

describe('StreamingResampler', () => {
  it.each([[22_050, 44_100], [48_000, 44_100], [44_100, 44_100]])('converts %i Hz to %i Hz in chunks', (inRate, outRate) => {
    const resampler = new StreamingResampler(inRate, outRate, 1);
    const seconds = 2;
    const chunk = 1152;
    let out: number[] = [];
    for (let start = 0; start < inRate * seconds; start += chunk) {
      out = out.concat(Array.from(resampler.process([sine(440, inRate, chunk, start)])[0]));
    }

    const inputFrames = Math.ceil((inRate * seconds) / chunk) * chunk;
    expect(Math.abs(out.length - (inputFrames * outRate) / inRate)).toBeLessThanOrEqual(2);

    // The output is the same tone at the new rate (delayed by at most one input frame).
    const delay = inRate === outRate ? 0 : outRate / inRate; // Resampling lags by one input frame.
    const maxError = Math.max(...out.slice(10).map((value, i) => Math.abs(value - Math.sin((2 * Math.PI * 440 * (i + 10 - delay)) / outRate))));
    expect(maxError).toBeLessThan(0.02);
  });
});
