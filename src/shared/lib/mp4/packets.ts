import type { RandomAccessFile } from './random-access-file';

/** AAC-LC always codes 1024 audio frames per packet. */
export const AAC_FRAMES_PER_PACKET = 1024;

const WRITE_BUFFER_SIZE = 1 << 20; // Packets are tiny; batch them into 1 MB disk writes

/**
 * Appends raw AAC packets to a file starting at `start`, remembering only a
 * 32-bit size per packet (~25 MB for a 40-hour book).
 */
export class PacketWriter {
  private sizes = new Uint32Array(1 << 14);
  private count = 0;
  private config: Uint8Array | null = null;
  private readonly buffer = new Uint8Array(WRITE_BUFFER_SIZE);
  private buffered = 0;

  constructor(private readonly file: RandomAccessFile, private position: number) {}

  /**
   * Adds one encoded AAC packet. `description` is the AudioSpecificConfig from
   * the encoder (WebCodecs `decoderConfig.description`); packets without one
   * are expected to be ADTS frames, whose header is stripped.
   */
  addPacket(data: Uint8Array, description?: Uint8Array): void {
    this.config ??= description ?? audioSpecificConfigFromAdts(data);
    const payload = !description && isAdts(data) ? data.subarray(adtsHeaderLength(data)) : data;
    this.write(payload);
    this.pushSizes(Uint32Array.of(payload.length));
  }

  /** Copies packets already stored in another file (as written by a PacketWriter). */
  appendFrom(source: RandomAccessFile, sizes: Uint32Array, audioSpecificConfig: Uint8Array, chunkSize = 8 << 20): void {
    this.config ??= audioSpecificConfig;
    const total = sizes.reduce((sum, size) => sum + size, 0);
    for (let offset = 0; offset < total; offset += chunkSize) {
      this.write(source.read(offset, Math.min(chunkSize, total - offset)));
    }
    this.pushSizes(sizes);
  }

  /** Writes out buffered bytes; returns the end position. */
  flush(): number {
    if (this.buffered > 0) {
      this.file.write(this.position, this.buffer.subarray(0, this.buffered));
      this.position += this.buffered;
      this.buffered = 0;
    }
    return this.position;
  }

  get packetSizes(): Uint32Array {
    return this.sizes.subarray(0, this.count);
  }

  get audioSpecificConfig(): Uint8Array | null {
    return this.config;
  }

  private write(data: Uint8Array): void {
    if (this.buffered + data.length > this.buffer.length) this.flush();
    if (data.length > this.buffer.length) {
      this.file.write(this.position, data);
      this.position += data.length;
      return;
    }
    this.buffer.set(data, this.buffered);
    this.buffered += data.length;
  }

  private pushSizes(sizes: Uint32Array): void {
    if (this.count + sizes.length > this.sizes.length) {
      let capacity = this.sizes.length;
      while (capacity < this.count + sizes.length) capacity *= 2;
      const grown = new Uint32Array(capacity);
      grown.set(this.packetSizes);
      this.sizes = grown;
    }
    this.sizes.set(sizes, this.count);
    this.count += sizes.length;
  }
}

const isAdts = (data: Uint8Array): boolean => data.length > 7 && data[0] === 0xff && (data[1] & 0xf6) === 0xf0;

const adtsHeaderLength = (data: Uint8Array): number => ((data[1] & 0x01) === 1 ? 7 : 9);

/** Builds the 2-byte AudioSpecificConfig from an ADTS header. */
const audioSpecificConfigFromAdts = (data: Uint8Array): Uint8Array => {
  if (!isAdts(data)) throw new Error('Encoder produced AAC without a decoder configuration');
  const objectType = ((data[2] >> 6) & 0x03) + 1;
  const frequencyIndex = (data[2] >> 2) & 0x0f;
  const channels = ((data[2] & 0x01) << 2) | ((data[3] >> 6) & 0x03);
  const config = (objectType << 11) | (frequencyIndex << 7) | (channels << 3);
  return Uint8Array.of(config >> 8, config & 0xff);
};
