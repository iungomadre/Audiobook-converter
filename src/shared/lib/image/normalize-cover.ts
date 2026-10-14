const MAX_SIDE = 1400;
const KEEP_AS_IS_BYTES = 3 * 1024 * 1024;
const SQUARE_TOLERANCE = 0.02;

export type NormalizedImage = { data: Uint8Array; mimeType: 'image/jpeg' | 'image/png' };

/**
 * Returns a square JPEG/PNG of at most 1400 px, as audiobook players expect.
 * Small square JPEG/PNG files are kept untouched. Other images are centered on a
 * blurred, darkened copy of themselves, so nothing (like the title) is cropped.
 */
export const normalizeCover = async (blob: Blob): Promise<NormalizedImage> => {
  const bitmap = await createImageBitmap(blob);
  try {
    const isSquare = Math.abs(bitmap.width / bitmap.height - 1) <= SQUARE_TOLERANCE;
    const isSupported = blob.type === 'image/jpeg' || blob.type === 'image/png';
    if (isSquare && isSupported && blob.size <= KEEP_AS_IS_BYTES && bitmap.width <= MAX_SIDE) {
      return { data: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type as NormalizedImage['mimeType'] };
    }

    const side = Math.min(MAX_SIDE, Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(side, side);
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';

    if (!isSquare) {
      // Cheap, universally supported blur: shrink to a few pixels, then stretch back up.
      const tiny = new OffscreenCanvas(12, 12);
      tiny.getContext('2d')!.drawImage(bitmap, 0, 0, 12, 12);
      context.drawImage(tiny, 0, 0, side, side);
      context.fillStyle = 'rgba(0, 0, 0, 0.35)';
      context.fillRect(0, 0, side, side);
    }

    const scale = side / Math.max(bitmap.width, bitmap.height);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    context.drawImage(bitmap, Math.round((side - width) / 2), Math.round((side - height) / 2), width, height);

    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    return { data: new Uint8Array(await jpeg.arrayBuffer()), mimeType: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
};
