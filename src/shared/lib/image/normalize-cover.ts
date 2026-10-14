const MAX_SIDE = 1400;
const KEEP_AS_IS_BYTES = 3 * 1024 * 1024;

export type NormalizedImage = { data: Uint8Array; mimeType: 'image/jpeg' | 'image/png' };

/**
 * Returns an image suitable for an M4B cover: JPEG or PNG, at most ~1400 px.
 * Small JPEG/PNG files are kept untouched; anything else is re-encoded as JPEG.
 */
export const normalizeCover = async (blob: Blob): Promise<NormalizedImage> => {
  const isSupported = blob.type === 'image/jpeg' || blob.type === 'image/png';
  if (isSupported && blob.size <= KEEP_AS_IS_BYTES) {
    return { data: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type as NormalizedImage['mimeType'] };
  }

  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return { data: new Uint8Array(await jpeg.arrayBuffer()), mimeType: 'image/jpeg' };
};
