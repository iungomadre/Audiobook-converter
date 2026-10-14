import type { AudioPreset } from './types';

export const AUDIO_PRESETS: readonly AudioPreset[] = [
  { id: 'mono-64', labelKey: 'preset.mono-64', numberOfChannels: 1, bitrate: 64_000 },
  { id: 'stereo-96', labelKey: 'preset.stereo-96', numberOfChannels: 2, bitrate: 96_000 },
  { id: 'stereo-128', labelKey: 'preset.stereo-128', numberOfChannels: 2, bitrate: 128_000 },
];

export const getPreset = (id: string): AudioPreset => AUDIO_PRESETS.find((preset) => preset.id === id) ?? AUDIO_PRESETS[0];
