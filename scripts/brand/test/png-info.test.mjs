import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readPngInfo, PNG_SIGNATURE, PngInfoError } from '../png-info.mjs';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'png');
const fixture = (name) => readFileSync(join(FIXTURES, name));

const rejects = (buf, pattern) =>
  assert.throws(
    () => readPngInfo(buf),
    (err) => {
      assert.ok(err instanceof PngInfoError, `expected PngInfoError, got ${err}`);
      assert.match(err.message, pattern);
      return true;
    },
  );

test('reads width, height, bit depth and colour type from each fixture', () => {
  const cases = [
    ['rgba-1x1.png', { width: 1, height: 1, bitDepth: 8, colorType: 6 }],
    ['rgb-3x2.png', { width: 3, height: 2, bitDepth: 8, colorType: 2 }],
    ['gray16-2x5.png', { width: 2, height: 5, bitDepth: 16, colorType: 0 }],
    ['palette-4x4.png', { width: 4, height: 4, bitDepth: 2, colorType: 3 }],
    ['rgba-16x16.png', { width: 16, height: 16, bitDepth: 8, colorType: 6 }],
    ['rgba-256x256.png', { width: 256, height: 256, bitDepth: 8, colorType: 6 }],
  ];
  for (const [name, expected] of cases) {
    assert.deepEqual(readPngInfo(fixture(name)), expected, name);
  }
});

test('accepts a Uint8Array as well as a Buffer', () => {
  const buf = fixture('rgb-3x2.png');
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  assert.equal(readPngInfo(bytes).width, 3);
});

test('the signature constant is the PNG file signature', () => {
  assert.deepEqual([...PNG_SIGNATURE], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test('rejects a wrong signature', () => {
  const buf = Buffer.from(fixture('rgba-1x1.png'));
  buf[1] = 0x51; // 'Q'
  rejects(buf, /signature/);
  rejects(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), /signature/);
});

test('rejects input too short to hold the IHDR chunk', () => {
  rejects(Buffer.alloc(0), /too short/);
  rejects(fixture('rgba-1x1.png').subarray(0, 8), /too short/);
  rejects(fixture('rgba-1x1.png').subarray(0, 32), /too short/);
});

test('rejects a first chunk that is not IHDR', () => {
  const buf = Buffer.from(fixture('rgba-1x1.png'));
  buf.write('IDAT', 12, 'latin1');
  rejects(buf, /IHDR/);
});

test('rejects an IHDR whose length is not 13', () => {
  const buf = Buffer.from(fixture('rgba-1x1.png'));
  buf.writeUInt32BE(12, 8);
  rejects(buf, /IHDR length/);
});

test('rejects zero width or height', () => {
  const zeroW = Buffer.from(fixture('rgba-1x1.png'));
  zeroW.writeUInt32BE(0, 16);
  rejects(zeroW, /width/);
  const zeroH = Buffer.from(fixture('rgba-1x1.png'));
  zeroH.writeUInt32BE(0, 20);
  rejects(zeroH, /height/);
});

test('rejects a width or height above 2^31 - 1', () => {
  const buf = Buffer.from(fixture('rgba-1x1.png'));
  buf.writeUInt32BE(0x80000000, 16);
  rejects(buf, /width/);
});

test('rejects a non-binary argument', () => {
  rejects('not a buffer', /Buffer or Uint8Array/);
});
