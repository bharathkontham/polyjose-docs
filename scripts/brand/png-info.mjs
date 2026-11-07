// Reads the image header of a PNG file without decoding any pixels.
//
// Part of the brand export pipeline (ADR 0053): the exporter checks every
// screenshot it writes, the ICO writer checks every frame, and the browser-free
// tests check the committed exports, all through this one reader.
//
// Format reference: W3C, Portable Network Graphics (PNG) Specification (Third
// Edition), https://www.w3.org/TR/png-3/
//   - §5.2 PNG signature: the first 8 bytes are 89 50 4E 47 0D 0A 1A 0A.
//   - §5.3 Chunk layout: a 4-byte big-endian length, a 4-byte type, the data,
//     then a 4-byte CRC.
//   - §5.6 Chunk ordering: IHDR is the first chunk.
//   - §11.2.1 IHDR: 13 bytes of data, namely width (4), height (4), bit depth
//     (1), colour type (1), compression (1), filter (1), interlace (1). Width
//     and height are non-zero "PNG four-byte unsigned integers", which §3
//     limits to 0 to 2^31 - 1.
//   - §6.1 table 9: the colour types.

/** The PNG file signature (PNG spec §5.2). */
export const PNG_SIGNATURE = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Thrown when the bytes are not a PNG with a well-formed IHDR. */
export class PngInfoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PngInfoError';
  }
}

// signature (8) + IHDR length (4) + type (4) + data (13) + CRC (4)
const MIN_LENGTH = 8 + 4 + 4 + 13 + 4;
const MAX_DIMENSION = 0x7fffffff; // PNG spec §3, "PNG four-byte unsigned integer"

/**
 * Returns `{ width, height, bitDepth, colorType }` from the IHDR chunk.
 * Colour types (PNG spec §6.1 table 9): 0 greyscale, 2 truecolour,
 * 3 indexed, 4 greyscale with alpha, 6 truecolour with alpha.
 *
 * @param {Buffer | Uint8Array} bytes the whole file, or at least its first 33 bytes
 */
export function readPngInfo(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new PngInfoError('expected a Buffer or Uint8Array');
  }
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((b, i) => buf[i] !== b)) {
    if (buf.length === 0) throw new PngInfoError('too short to be a PNG (0 bytes)');
    throw new PngInfoError('not a PNG: the file signature does not match (PNG spec §5.2)');
  }
  if (buf.length < MIN_LENGTH) {
    throw new PngInfoError(`too short to hold the IHDR chunk (${buf.length} bytes, need ${MIN_LENGTH})`);
  }
  const type = buf.toString('latin1', 12, 16);
  if (type !== 'IHDR') {
    throw new PngInfoError(`the first chunk is ${JSON.stringify(type)}, not IHDR (PNG spec §5.6)`);
  }
  const length = buf.readUInt32BE(8);
  if (length !== 13) {
    throw new PngInfoError(`IHDR length is ${length}, not 13 (PNG spec §11.2.1)`);
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width === 0 || width > MAX_DIMENSION) {
    throw new PngInfoError(`invalid width ${width} (PNG spec §11.2.1 and §3: 1 to 2^31 - 1)`);
  }
  if (height === 0 || height > MAX_DIMENSION) {
    throw new PngInfoError(`invalid height ${height} (PNG spec §11.2.1 and §3: 1 to 2^31 - 1)`);
  }
  return { width, height, bitDepth: buf[24], colorType: buf[25] };
}
