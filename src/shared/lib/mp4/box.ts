import { concat, fourCC, readFourCC, u32, view } from './bytes';

/**
 * A parsed ISO-BMFF box. Container boxes keep their children; leaf boxes keep
 * their raw payload. `header` holds bytes between the box header and the
 * children of a container (the version/flags of a full-box container such as
 * `meta`).
 */
export type Box = {
  type: string;
  header?: Uint8Array;
  children?: Box[];
  payload?: Uint8Array;
};

/** Boxes that only contain other boxes (and that this module needs to walk). */
const CONTAINERS = new Set([
  'moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'edts', 'dinf', 'tref', 'gmhd', 'ilst',
]);

/** Full-box containers: 4 bytes of version/flags precede the children. */
const FULL_BOX_CONTAINERS = new Set(['meta']);

export const parseBoxes = (bytes: Uint8Array): Box[] => {
  const boxes: Box[] = [];
  const data = view(bytes);
  let offset = 0;

  while (offset + 8 <= bytes.length) {
    let size = data.getUint32(offset);
    const type = readFourCC(bytes, offset + 4);
    let headerSize = 8;

    if (size === 1) {
      size = Number(data.getBigUint64(offset + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = bytes.length - offset;
    }
    if (size < headerSize || offset + size > bytes.length) {
      throw new Error(`Malformed "${type}" box at offset ${offset}`);
    }

    const body = bytes.subarray(offset + headerSize, offset + size);
    if (FULL_BOX_CONTAINERS.has(type)) {
      // QuickTime-style `meta` boxes omit version/flags and start straight with a child box.
      const hasVersion = body.length >= 8 && readFourCC(body, 4) !== 'hdlr';
      boxes.push(hasVersion
        ? { type, header: body.slice(0, 4), children: parseBoxes(body.subarray(4)) }
        : { type, children: parseBoxes(body) });
    } else if (CONTAINERS.has(type)) {
      boxes.push({ type, children: parseBoxes(body) });
    } else {
      boxes.push({ type, payload: body.slice() });
    }

    offset += size;
  }

  return boxes;
};

export const serializeBox = (box: Box): Uint8Array => {
  const body = box.children
    ? concat([box.header ?? new Uint8Array(0), ...box.children.map(serializeBox)])
    : (box.payload ?? new Uint8Array(0));
  return concat([u32(body.length + 8), fourCC(box.type), body]);
};

export const leaf = (type: string, parts: readonly Uint8Array[]): Box => ({ type, payload: concat(parts) });

export const container = (type: string, children: Box[], header?: Uint8Array): Box => ({ type, children, header });

export const findChild = (parent: Box, type: string): Box | undefined =>
  parent.children?.find((child) => child.type === type);

export const findPath = (parent: Box, path: readonly string[]): Box | undefined => {
  let current: Box | undefined = parent;
  for (const type of path) {
    current = current && findChild(current, type);
  }
  return current;
};
