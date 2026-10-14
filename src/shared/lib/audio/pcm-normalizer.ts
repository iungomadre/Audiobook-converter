/** Planar 32-bit float PCM: one array per channel, all the same length. */
export type PlanarPcm = Float32Array[];

/** Up/down-mixes planar PCM to the requested channel count. */
export const remixChannels = (input: PlanarPcm, channels: number): PlanarPcm => {
  if (input.length === channels) return input;
  if (channels === 1) {
    const mono = new Float32Array(input[0].length);
    for (const plane of input) {
      for (let i = 0; i < mono.length; i++) mono[i] += plane[i];
    }
    for (let i = 0; i < mono.length; i++) mono[i] /= input.length;
    return [mono];
  }
  // Mono → stereo duplicates; more channels → keep the first ones.
  return Array.from({ length: channels }, (_, channel) => input[Math.min(channel, input.length - 1)]);
};

/**
 * Streaming linear-interpolation resampler. Feed consecutive chunks of one
 * continuous stream; state carries over between chunks so there are no clicks.
 * Linear interpolation is plenty for spoken word.
 */
export class StreamingResampler {
  private readonly step: number;
  private position = 0;
  private previous: Float32Array | null = null;

  constructor(inputRate: number, private readonly outputRate: number, private readonly channels: number) {
    this.step = inputRate / outputRate;
  }

  process(input: PlanarPcm): PlanarPcm {
    const frames = input[0]?.length ?? 0;
    if (this.step === 1 || frames === 0) return input;

    // Virtual stream: [previous last frame, ...input]. Index 0 is the carried-over frame.
    const previous = this.previous ?? Float32Array.from(input, (plane) => plane[0]);
    const count = Math.max(0, Math.floor((frames - this.position) / this.step) + 1);
    const output = Array.from({ length: this.channels }, () => new Float32Array(count));

    let t = this.position;
    let written = 0;
    for (; written < count; written++, t += this.step) {
      const index = Math.floor(t);
      if (index + 1 > frames) break;
      const fraction = t - index;
      for (let channel = 0; channel < this.channels; channel++) {
        const plane = input[channel];
        const a = index === 0 ? previous[channel] : plane[index - 1];
        const b = plane[index];
        output[channel][written] = a + (b - a) * fraction;
      }
    }

    this.position = t - frames;
    this.previous = Float32Array.from(input, (plane) => plane[frames - 1]);
    return written === count ? output : output.map((plane) => plane.subarray(0, written));
  }

  get rate(): number {
    return this.outputRate;
  }
}
