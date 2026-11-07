import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, posix } from 'node:path';

import { TARGETS, SOURCES, ICO_SIZES } from '../targets.mjs';

const FIXTURE_SRC = join(import.meta.dirname, 'fixtures', 'src');
const rasters = TARGETS.filter((t) => t.kind !== 'copy');
const byOut = (out) => {
  const t = TARGETS.find((x) => x.out === out);
  assert.ok(t, `no target writes ${out}`);
  return t;
};

test('the export table is exactly the one the brand plan lists', () => {
  const table = Object.fromEntries(TARGETS.map((t) => [t.out, t.src]));
  assert.deepEqual(table, {
    'public/favicon.svg': 'favicon.svg',
    'public/favicon.ico': 'mark-light.svg',
    'public/apple-touch-icon.png': 'app-icon.svg',
    'public/icon-192.png': 'app-icon.svg',
    'public/icon-512.png': 'app-icon.svg',
    'public/icon-mask.png': 'app-icon-maskable.svg',
    'public/og.png': 'og.svg',
    'brand/exports/social-preview-1280x640.png': 'social-preview.svg',
    'brand/exports/avatar-500.png': 'avatar.svg',
    'brand/exports/gravatar-512.png': 'avatar.svg',
    'public/brand/lockup-light.svg': 'lockup-light.svg',
    'public/brand/lockup-dark.svg': 'lockup-dark.svg',
    'public/brand/mark-light.svg': 'mark-light.svg',
    'public/brand/mark-dark.svg': 'mark-dark.svg',
    'src/assets/brand/logo-light.svg': 'lockup-light.svg',
    'src/assets/brand/logo-dark.svg': 'lockup-dark.svg',
  });
});

test('outputs are unique', () => {
  const outs = TARGETS.map((t) => t.out);
  assert.equal(new Set(outs).size, outs.length);
});

test('every kind is copy, png or ico, and the output extension matches it', () => {
  const ext = { copy: '.svg', png: '.png', ico: '.ico' };
  for (const t of TARGETS) {
    assert.ok(Object.hasOwn(ext, t.kind), `${t.out}: unknown kind ${t.kind}`);
    assert.equal(posix.extname(t.out), ext[t.kind], t.out);
  }
});

test('sources are bare .svg file names and outputs are safe relative paths', () => {
  for (const t of TARGETS) {
    assert.match(t.src, /^[a-z0-9-]+\.svg$/, t.src);
    assert.ok(!posix.isAbsolute(t.out), t.out);
    assert.equal(posix.normalize(t.out), t.out, t.out);
    assert.ok(!t.out.split('/').includes('..'), t.out);
    assert.match(t.out, /^(public\/|brand\/exports\/|src\/assets\/brand\/)/, t.out);
  }
});

test('PNG sizes are positive integers', () => {
  for (const t of TARGETS.filter((x) => x.kind === 'png')) {
    assert.ok(Number.isInteger(t.width) && t.width > 0, `${t.out} width`);
    assert.ok(Number.isInteger(t.height) && t.height > 0, `${t.out} height`);
  }
});

test('PNG sizes are the ones the brand plan lists', () => {
  const sizes = Object.fromEntries(TARGETS.filter((t) => t.kind === 'png').map((t) => [t.out, [t.width, t.height]]));
  assert.deepEqual(sizes, {
    'public/apple-touch-icon.png': [180, 180],
    'public/icon-192.png': [192, 192],
    'public/icon-512.png': [512, 512],
    'public/icon-mask.png': [512, 512],
    'public/og.png': [1200, 630],
    'brand/exports/social-preview-1280x640.png': [1280, 640],
    'brand/exports/avatar-500.png': [500, 500],
    'brand/exports/gravatar-512.png': [512, 512],
  });
});

test('the ICO has exactly the 16, 32 and 48 frames, rendered from mark-light.svg', () => {
  assert.deepEqual([...ICO_SIZES], [16, 32, 48]);
  const icos = TARGETS.filter((t) => t.kind === 'ico');
  assert.equal(icos.length, 1);
  assert.deepEqual([...icos[0].sizes], [16, 32, 48]);
  assert.equal(icos[0].src, 'mark-light.svg');
  for (const s of icos[0].sizes) assert.ok(Number.isInteger(s) && s > 0 && s <= 256);
});

test('every raster has a boolean opaque flag; copies have none', () => {
  for (const t of rasters) assert.equal(typeof t.opaque, 'boolean', t.out);
  for (const t of TARGETS.filter((x) => x.kind === 'copy')) {
    assert.equal(t.opaque, undefined, t.out);
    assert.equal(t.width, undefined, t.out);
  }
});

test('apple-touch, og, social preview and avatars are opaque', () => {
  for (const out of [
    'public/apple-touch-icon.png',
    'public/og.png',
    'brand/exports/social-preview-1280x640.png',
    'brand/exports/avatar-500.png',
    'brand/exports/gravatar-512.png',
  ]) {
    assert.equal(byOut(out).opaque, true, out);
  }
});

test('the ICO keeps the rounded tile corners transparent', () => {
  assert.equal(byOut('public/favicon.ico').opaque, false);
});

test('the target list is frozen', () => {
  assert.ok(Object.isFrozen(TARGETS));
  for (const t of TARGETS) assert.ok(Object.isFrozen(t), t.out);
});

test('SOURCES lists each source once, in first-use order', () => {
  assert.deepEqual(SOURCES, [...new Set(TARGETS.map((t) => t.src))]);
});

test('the test fixtures provide every source', () => {
  for (const src of SOURCES) assert.ok(existsSync(join(FIXTURE_SRC, src)), `fixture ${src} is missing`);
});
