import type { AudioPreset } from './types';

export const AUDIO_PRESETS: readonly AudioPreset[] = [
  { id: 'mono-64', label: 'Mono · 64 kbps (recommended for speech)', numberOfChannels: 1, bitrate: 64_000 },
  { id: 'stereo-96', label: 'Stereo · 96 kbps', numberOfChannels: 2, bitrate: 96_000 },
  { id: 'stereo-128', label: 'Stereo · 128 kbps', numberOfChannels: 2, bitrate: 128_000 },
];

export const getPreset = (id: string): AudioPreset => AUDIO_PRESETS.find((preset) => preset.id === id) ?? AUDIO_PRESETS[0];
