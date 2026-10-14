/** Identifies a picked file across page reloads (the File object itself can't be kept). */
export const fileKey = (file: File): string => `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
