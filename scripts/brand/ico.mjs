// ADR 0053: favicon.ico is written by this owned encoder, not by a dependency.
// An ICO whose images are PNGs is a container: a 6-byte directory, one 16-byte
// entry per image, then the PNG files byte for byte. No pixels are processed.
//
// Format references (Microsoft):
//   - John Hornick, "Icons", Microsoft Learn (MSDN, 1995-09-29),
//     https://learn.microsoft.com/en-us/previous-versions/ms997538(v=msdn.10)
//     defines ICONDIR and ICONDIRENTRY, all fields little-endian:
//       ICONDIR      WORD idReserved (must be 0), WORD idType (1 for icons),
//                    WORD idCount, then idCount ICONDIRENTRYs
//       ICONDIRENTRY BYTE bWidth, BYTE bHeight, BYTE bColorCount (0 if >= 8bpp),
//                    BYTE bReserved (must be 0), WORD wPlanes, WORD wBitCount,
//                    DWORD dwBytesInRes, DWORD dwImageOffset (from file start)
//   - "ICONRESDIR structure", Win32 docs, Microsoft Learn,
//     https://learn.microsoft.com/en-us/windows/win32/menurc/iconresdir
//     "The value 0 is accepted as representing a width of 256" (and height).
//   - Raymond Chen, "The evolution of the ICO file format, part 4: PNG images",
//     The Old New Thing, Microsoft (2010-10-22),
//     https://devblogs.microsoft.com/oldnewthing/20101022-00/?p=12473
//     an image may be "a PNG image, starting with the PNG file signature", and
//     "The image must be in 32bpp ARGB format": 8-bit RGBA, PNG colour type 6.

import { readPngInfo, PngInfoError } from './png-info.mjs';

/** Size of ICONDIR without its entries (Hornick, "The ICO File"). */
export const ICONDIR_SIZE = 6;
/** Size of one ICONDIRENTRY (Hornick, "The ICO File"). */
export const ICONDIRENTRY_SIZE = 16;

const TYPE_ICON = 1; // ICONDIR.idType, 1 for icons (2 is a cursor)
const MAX_SIZE = 256; // a byte holds 1..255; 0 stands for 256 (ICONRESDIR)
const BIT_COUNT = 32; // Chen part 4: PNG images must be 32bpp ARGB
const PNG_RGBA = 6; // PNG colour type "truecolour with alpha"

/** Thrown for an invalid frame list or a malformed ICO directory. */
export class IcoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IcoError';
  }
}

/**
 * Builds an ICO file from square 8-bit RGBA PNG frames.
 *
 * Entries and image data keep the order given. The output depends only on the
 * input bytes, so the same frames always give the same file.
 *
 * @param {{ size: number, png: Buffer | Uint8Array }[]} frames
 * @returns {Buffer}
 */
export function encodeIco(frames) {
  if (!Array.isArray(frames)) throw new IcoError('frames must be an array');
  if (frames.length === 0) throw new IcoError('an ICO needs at least one frame');
  if (frames.length > 0xffff) throw new IcoError('too many frames for idCount (a WORD)');

  const seen = new Set();
  const images = frames.map(({ size, png }, i) => {
    if (!Number.isInteger(size) || size < 1 || size > MAX_SIZE) {
      throw new IcoError(`frame ${i}: size ${String(size)} is not an integer from 1 to ${MAX_SIZE}`);
    }
    if (seen.has(size)) throw new IcoError(`frame ${i}: duplicate size ${size}`);
    seen.add(size);
    let info;
    try {
      info = readPngInfo(png);
    } catch (err) {
      if (err instanceof PngInfoError) throw new IcoError(`frame ${i}: not a PNG (${err.message})`);
      throw err;
    }
    if (info.width !== info.height) {
      throw new IcoError(`frame ${i}: the PNG is ${info.width}x${info.height}, not square`);
    }
    if (info.width !== size) {
      throw new IcoError(`frame ${i}: the PNG is ${info.width}x${info.height}, but the frame size is ${size}`);
    }
    if (info.bitDepth !== 8 || info.colorType !== PNG_RGBA) {
      throw new IcoError(
        `frame ${i}: the PNG must be 8-bit RGBA (32bpp ARGB), got bit depth ${info.bitDepth}, colour type ${info.colorType}`,
      );
    }
    return { size, data: Buffer.from(png.buffer, png.byteOffset, png.byteLength) };
  });

  const headerSize = ICONDIR_SIZE + ICONDIRENTRY_SIZE * images.length;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // idReserved
  header.writeUInt16LE(TYPE_ICON, 2); // idType
  header.writeUInt16LE(images.length, 4); // idCount

  let offset = headerSize;
  images.forEach(({ size, data }, i) => {
    const at = ICONDIR_SIZE + ICONDIRENTRY_SIZE * i;
    const dim = size === MAX_SIZE ? 0 : size;
    header[at] = dim; // bWidth
    header[at + 1] = dim; // bHeight
    header[at + 2] = 0; // bColorCount: 0 for >= 8bpp
    header[at + 3] = 0; // bReserved
    header.writeUInt16LE(1, at + 4); // wPlanes
    header.writeUInt16LE(BIT_COUNT, at + 6); // wBitCount
    header.writeUInt32LE(data.length, at + 8); // dwBytesInRes
    header.writeUInt32LE(offset, at + 12); // dwImageOffset
    offset += data.length;
  });
  if (offset > 0xffffffff) throw new IcoError('the ICO is too large for a DWORD offset');

  return Buffer.concat([header, ...images.map((img) => img.data)]);
}

/**
 * Parses an ICO directory and returns every entry with its image bytes.
 * Width and height 0 are reported as 256 (ICONRESDIR).
 *
 * @param {Buffer | Uint8Array} bytes
 * @returns {{ type: number, count: number, entries: { width: number, height: number,
 *   colorCount: number, reserved: number, planes: number, bitCount: number,
 *   bytes: number, offset: number, data: Buffer }[] }}
 */
export function readIcoDirectory(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new IcoError('expected a Buffer or Uint8Array');
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < ICONDIR_SIZE) throw new IcoError(`too short for an ICONDIR (${buf.length} bytes)`);
  const reserved = buf.readUInt16LE(0);
  if (reserved !== 0) throw new IcoError(`idReserved is ${reserved}, must be 0`);
  const type = buf.readUInt16LE(2);
  if (type !== TYPE_ICON) throw new IcoError(`idType is ${type}, not 1 (icon)`);
  const count = buf.readUInt16LE(4);
  if (count === 0) throw new IcoError('idCount is 0: no images');
  const end = ICONDIR_SIZE + ICONDIRENTRY_SIZE * count;
  if (buf.length < end) {
    throw new IcoError(`the directory needs ${end} bytes for ${count} entries, the file has ${buf.length}`);
  }
  const entries = [];
  for (let i = 0; i < count; i++) {
    const at = ICONDIR_SIZE + ICONDIRENTRY_SIZE * i;
    const size = buf.readUInt32LE(at + 8);
    const offset = buf.readUInt32LE(at + 12);
    if (offset < end || offset + size > buf.length) {
      throw new IcoError(`entry ${i}: image at ${offset} with ${size} bytes runs past the end or into the directory`);
    }
    entries.push({
      width: buf[at] || MAX_SIZE,
      height: buf[at + 1] || MAX_SIZE,
      colorCount: buf[at + 2],
      reserved: buf[at + 3],
      planes: buf.readUInt16LE(at + 4),
      bitCount: buf.readUInt16LE(at + 6),
      bytes: size,
      offset,
      data: buf.subarray(offset, offset + size),
    });
  }
  return { type, count, entries };
}
