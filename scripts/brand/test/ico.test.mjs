import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { encodeIco, readIcoDirectory, IcoError, ICONDIR_SIZE, ICONDIRENTRY_SIZE } from '../ico.mjs';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'png');
const png = (name) => readFileSync(join(FIXTURES, name));

const RGBA_1 = png('rgba-1x1.png');
const RGBA_16 = png('rgba-16x16.png');
const RGBA_256 = png('rgba-256x256.png');

const throwsIco = (fn, pattern) =>
  assert.throws(fn, (err) => {
    assert.ok(err instanceof IcoError, `expected IcoError, got ${err}`);
    assert.match(err.message, pattern);
    return true;
  });

test('the directory and entry sizes are 6 and 16 bytes', () => {
  assert.equal(ICONDIR_SIZE, 6);
  assert.equal(ICONDIRENTRY_SIZE, 16);
});

test('one frame: exact header and entry bytes, then the PNG', () => {
  const ico = encodeIco([{ size: 16, png: RGBA_16 }]);
  const n = RGBA_16.length;
  const expected = Buffer.alloc(6 + 16);
  // ICONDIR
  expected.writeUInt16LE(0, 0); // idReserved
  expected.writeUInt16LE(1, 2); // idType: icon
  expected.writeUInt16LE(1, 4); // idCount
  // ICONDIRENTRY
  expected[6] = 16; // bWidth
  expected[7] = 16; // bHeight
  expected[8] = 0; // bColorCount
  expected[9] = 0; // bReserved
  expected.writeUInt16LE(1, 10); // wPlanes
  expected.writeUInt16LE(32, 12); // wBitCount
  expected.writeUInt32LE(n, 14); // dwBytesInRes
  expected.writeUInt32LE(22, 18); // dwImageOffset
  assert.deepEqual(ico.subarray(0, 22), expected);
  assert.deepEqual(ico.subarray(22), RGBA_16);
  assert.equal(ico.length, 22 + n);
});

test('header bytes literally: 00 00 01 00 then the count', () => {
  const ico = encodeIco([
    { size: 1, png: RGBA_1 },
    { size: 16, png: RGBA_16 },
  ]);
  assert.deepEqual([...ico.subarray(0, 6)], [0x00, 0x00, 0x01, 0x00, 0x02, 0x00]);
});

test('three frames: offsets follow the directory and each other', () => {
  const frames = [
    { size: 1, png: RGBA_1 },
    { size: 16, png: RGBA_16 },
    { size: 256, png: RGBA_256 },
  ];
  const ico = encodeIco(frames);
  const dir = readIcoDirectory(ico);
  assert.equal(dir.count, 3);
  const first = 6 + 3 * 16;
  assert.deepEqual(
    dir.entries.map((e) => [e.offset, e.bytes]),
    [
      [first, RGBA_1.length],
      [first + RGBA_1.length, RGBA_16.length],
      [first + RGBA_1.length + RGBA_16.length, RGBA_256.length],
    ],
  );
  assert.equal(ico.length, first + RGBA_1.length + RGBA_16.length + RGBA_256.length);
});

test('round trip: the directory reads back sizes, fields and the exact PNG bytes', () => {
  const frames = [
    { size: 16, png: RGBA_16 },
    { size: 1, png: RGBA_1 },
    { size: 256, png: RGBA_256 },
  ];
  const dir = readIcoDirectory(encodeIco(frames));
  assert.equal(dir.type, 1);
  assert.equal(dir.entries.length, 3);
  dir.entries.forEach((e, i) => {
    assert.equal(e.width, frames[i].size);
    assert.equal(e.height, frames[i].size);
    assert.equal(e.colorCount, 0);
    assert.equal(e.planes, 1);
    assert.equal(e.bitCount, 32);
    assert.deepEqual(e.data, frames[i].png);
  });
});

test('256 px is stored as 0 in bWidth and bHeight and read back as 256', () => {
  const ico = encodeIco([{ size: 256, png: RGBA_256 }]);
  assert.equal(ico[6], 0);
  assert.equal(ico[7], 0);
  const [entry] = readIcoDirectory(ico).entries;
  assert.equal(entry.width, 256);
  assert.equal(entry.height, 256);
});

test('the output is deterministic', () => {
  const frames = [
    { size: 1, png: RGBA_1 },
    { size: 16, png: RGBA_16 },
  ];
  assert.deepEqual(encodeIco(frames), encodeIco(frames));
});

test('accepts a Uint8Array frame', () => {
  const bytes = new Uint8Array(RGBA_16);
  const ico = encodeIco([{ size: 16, png: bytes }]);
  assert.deepEqual(readIcoDirectory(ico).entries[0].data, RGBA_16);
});

test('rejects an empty or non-array frame list', () => {
  throwsIco(() => encodeIco([]), /at least one frame/);
  throwsIco(() => encodeIco(undefined), /array/);
});

test('rejects sizes outside 1..256 or not integers', () => {
  for (const size of [0, 257, -16, 16.5, '16', NaN]) {
    throwsIco(() => encodeIco([{ size, png: RGBA_16 }]), /size/);
  }
});

test('rejects a frame whose PNG dimensions do not match its size', () => {
  throwsIco(() => encodeIco([{ size: 32, png: RGBA_16 }]), /16x16.*32/);
});

test('rejects a frame that is not a PNG', () => {
  throwsIco(() => encodeIco([{ size: 16, png: Buffer.from('not a png at all, no signature') }]), /PNG/);
  throwsIco(() => encodeIco([{ size: 16, png: 'string' }]), /PNG/);
});

test('rejects a PNG that is not 8-bit RGBA (32bpp ARGB)', () => {
  throwsIco(() => encodeIco([{ size: 3, png: png('rgb-3x2.png') }]), /RGBA|square/);
  // A square non-RGBA PNG: the palette fixture is 4x4, 2-bit indexed.
  throwsIco(() => encodeIco([{ size: 4, png: png('palette-4x4.png') }]), /RGBA/);
});

test('rejects duplicate frame sizes', () => {
  throwsIco(
    () =>
      encodeIco([
        { size: 16, png: RGBA_16 },
        { size: 16, png: RGBA_16 },
      ]),
    /duplicate/,
  );
});

test('readIcoDirectory rejects malformed input', () => {
  const good = encodeIco([{ size: 16, png: RGBA_16 }]);
  throwsIco(() => readIcoDirectory(good.subarray(0, 5)), /too short/);
  const reserved = Buffer.from(good);
  reserved.writeUInt16LE(1, 0);
  throwsIco(() => readIcoDirectory(reserved), /idReserved/);
  const cursor = Buffer.from(good);
  cursor.writeUInt16LE(2, 2);
  throwsIco(() => readIcoDirectory(cursor), /idType/);
  const zero = Buffer.from(good);
  zero.writeUInt16LE(0, 4);
  throwsIco(() => readIcoDirectory(zero), /no images/);
  throwsIco(() => readIcoDirectory(good.subarray(0, 21)), /directory/);
  throwsIco(() => readIcoDirectory(good.subarray(0, good.length - 1)), /past the end/);
  throwsIco(() => readIcoDirectory('ico'), /Buffer or Uint8Array/);
});
