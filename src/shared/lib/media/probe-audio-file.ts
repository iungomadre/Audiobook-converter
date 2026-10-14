import { ALL_FORMATS, BlobSource, Input, type MetadataTags } from 'mediabunny';

export type AudioFileProbe = {
  durationSeconds: number | null;
  tags: MetadataTags;
};

/** Reads duration and tags without decoding the audio. */
export const probeAudioFile = async (file: File): Promise<AudioFileProbe> => {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const [durationSeconds, tags] = await Promise.all([
      input.getDurationFromMetadata().then((duration) => duration ?? input.computeDuration()),
      input.getMetadataTags(),
    ]);
    return { durationSeconds, tags };
  } catch {
    return { durationSeconds: null, tags: {} };
  } finally {
    input.dispose();
  }
};
