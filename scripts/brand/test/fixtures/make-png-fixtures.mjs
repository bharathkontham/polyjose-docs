#!/usr/bin/env node
// Writes the tiny PNG fixtures in ./png/ that the png-info tests read.
//
// The fixtures are committed; this script records how they were made so they
// can be regenerated: `node scripts/brand/test/fixtures/make-png-fixtures.mjs`.
// Each is a valid PNG (W3C PNG Specification, Third Edition, §5 datastream
// structure, §11.2.1 IHDR): the 8-byte signature, IHDR, one zlib IDAT, IEND.
// It is not run by any npm script.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

/** Channels per pixel for each colour type (PNG spec §6.1 table 11). */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function png({ width, height, bitDepth, colorType, palette }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  // compression 0, filter 0, interlace 0
  const rowBytes = Math.ceil((width * CHANNELS[colorType] * bitDepth) / 8);
  // Each scanline: filter type 0 then a mid-grey-ish byte pattern.
  const raw = Buffer.alloc((rowBytes + 1) * height, 0x80);
  for (let y = 0; y < height; y++) raw[y * (rowBytes + 1)] = 0;
  if (colorType === 3) raw.fill(0, 0); // palette index 0 everywhere
  const parts = [SIGNATURE, chunk('IHDR', ihdr)];
  if (palette) parts.push(chunk('PLTE', Buffer.from(palette)));
  parts.push(chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

const FIXTURES = {
  'rgba-1x1.png': { width: 1, height: 1, bitDepth: 8, colorType: 6 },
  'rgb-3x2.png': { width: 3, height: 2, bitDepth: 8, colorType: 2 },
  'gray16-2x5.png': { width: 2, height: 5, bitDepth: 16, colorType: 0 },
  'palette-4x4.png': { width: 4, height: 4, bitDepth: 2, colorType: 3, palette: [0x16, 0x25, 0x5a, 0xff, 0xff, 0xff] },
  'rgba-16x16.png': { width: 16, height: 16, bitDepth: 8, colorType: 6 },
  'rgba-256x256.png': { width: 256, height: 256, bitDepth: 8, colorType: 6 },
};

const dir = join(import.meta.dirname, 'png');
mkdirSync(dir, { recursive: true });
for (const [name, spec] of Object.entries(FIXTURES)) {
  writeFileSync(join(dir, name), png(spec));
  console.log(name);
}
