const textEncoder = new TextEncoder();

export const utf8 = (text: string): Uint8Array => textEncoder.encode(text);

/** Four-character code. `©` (U+00A9) maps to the single byte 0xA9, as MP4 expects. */
export const fourCC = (code: string): Uint8Array => {
  if (code.length !== 4) throw new Error(`Invalid four-character code: "${code}"`);
  return Uint8Array.from(code, (char) => char.charCodeAt(0) & 0xff);
};

export const readFourCC = (bytes: Uint8Array, offset: number): string =>
  String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);

export const u8 = (value: number): Uint8Array => Uint8Array.of(value & 0xff);

export const u16 = (value: number): Uint8Array => {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value);
  return out;
};

export const u32 = (value: number): Uint8Array => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
};

export const u64 = (value: number | bigint): Uint8Array => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value));
  return out;
};

export const zeros = (length: number): Uint8Array => new Uint8Array(length);

export const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

export const view = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
