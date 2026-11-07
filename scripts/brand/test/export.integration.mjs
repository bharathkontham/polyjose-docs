// npm run brand:export:test
//
// Integration test of the brand exporter (ADR 0053) with Playwright's Chromium.
// It needs the browser (`npx playwright install chromium`), so it is NOT named
// *.test.mjs and is not part of `npm run test:scripts`, which must run without
// one (the deploy job installs no browser).
//
// On the placeholder sources in fixtures/src it checks that:
//   - every target in targets.mjs is written, and nothing else;
//   - copies are byte-identical to their source;
//   - every PNG has the exact pixel size of its target;
//   - favicon.ico lists exactly the 16, 32 and 48 frames, each an 8-bit RGBA
//     PNG of that size;
//   - opaque targets have alpha 255 at the four corners and the centre, and the
//     ICO frames (opaque: false; the fixture mark has rounded corners) have
//     alpha 0 at the corners and 255 at the centre, read back through a canvas
//     getImageData in Chromium;
//   - a second export of the same sources is byte-identical to the first.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import { TARGETS, ICO_SIZES } from '../targets.mjs';
import { readIcoDirectory } from '../ico.mjs';
import { readPngInfo } from '../png-info.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = fileURLToPath(new URL('../export.mjs', import.meta.url));
const FIXTURE_SRC = join(import.meta.dirname, 'fixtures', 'src');

const temps = [];
let browser;
let page;
let first;
let second;

/** Runs the exporter on the fixtures into a fresh directory. */
function exportFixtures() {
  const out = mkdtempSync(join(tmpdir(), 'brand-export-'));
  temps.push(out);
  const r = spawnSync(process.execPath, [CLI, '--src', FIXTURE_SRC, '--out', out], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `export failed:\n${r.stdout}\n${r.stderr}`);
  return { out, stdout: r.stdout };
}

/** Every file under `dir`, as sorted POSIX paths relative to it. */
function listTree(dir) {
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return files.sort();
}

/** Alpha at each [x, y] of a PNG, read through a Chromium canvas. */
async function alphaAt(png, points) {
  return page.evaluate(
    async ({ b64, points }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return points.map(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3]);
    },
    { b64: png.toString('base64'), points },
  );
}

const corners = (w, h) => [
  [0, 0],
  [w - 1, 0],
  [0, h - 1],
  [w - 1, h - 1],
];
const centre = (w, h) => [Math.floor(w / 2), Math.floor(h / 2)];

before(async () => {
  first = exportFixtures();
  second = exportFixtures();
  browser = await chromium.launch();
  page = await browser.newPage();
});

after(async () => {
  await browser?.close();
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

test('writes every target and nothing else', () => {
  assert.deepEqual(listTree(first.out), TARGETS.map((t) => t.out).sort());
});

test('prints one line per output with its path, size and byte count', () => {
  const lines = first.stdout.trim().split('\n');
  assert.equal(lines.length, TARGETS.length + 1, first.stdout);
  TARGETS.forEach((t, i) => {
    const bytes = statSync(join(first.out, t.out)).size;
    assert.match(lines[i], new RegExp(`^${t.out.replaceAll('.', '\\.')}\\s+\\S+\\s+${bytes} bytes$`), lines[i]);
  });
});

test('copies are byte-identical to their source', () => {
  for (const t of TARGETS.filter((x) => x.kind === 'copy')) {
    assert.deepEqual(readFileSync(join(first.out, t.out)), readFileSync(join(FIXTURE_SRC, t.src)), t.out);
  }
});

test('every PNG has the exact target size', () => {
  for (const t of TARGETS.filter((x) => x.kind === 'png')) {
    const info = readPngInfo(readFileSync(join(first.out, t.out)));
    assert.deepEqual([info.width, info.height], [t.width, t.height], t.out);
    assert.equal(info.bitDepth, 8, t.out);
  }
});

test('favicon.ico has exactly the 16, 32 and 48 frames, each an RGBA PNG of that size', () => {
  const ico = readIcoDirectory(readFileSync(join(first.out, 'public/favicon.ico')));
  assert.deepEqual(
    ico.entries.map((e) => e.width),
    [...ICO_SIZES],
  );
  assert.deepEqual([...ICO_SIZES], [16, 32, 48]);
  for (const e of ico.entries) {
    assert.equal(e.height, e.width);
    assert.equal(e.planes, 1);
    assert.equal(e.bitCount, 32);
    assert.deepEqual(readPngInfo(e.data), { width: e.width, height: e.height, bitDepth: 8, colorType: 6 });
  }
});

test('opaque targets have alpha 255 at the four corners and the centre', async () => {
  for (const t of TARGETS.filter((x) => x.kind === 'png' && x.opaque)) {
    const png = readFileSync(join(first.out, t.out));
    const alphas = await alphaAt(png, [...corners(t.width, t.height), centre(t.width, t.height)]);
    assert.deepEqual(alphas, [255, 255, 255, 255, 255], t.out);
  }
});

test('the ICO frames keep transparent corners (omitBackground) and an opaque centre', async () => {
  const ico = readIcoDirectory(readFileSync(join(first.out, 'public/favicon.ico')));
  for (const e of ico.entries) {
    const alphas = await alphaAt(e.data, [...corners(e.width, e.height), centre(e.width, e.height)]);
    assert.deepEqual(alphas, [0, 0, 0, 0, 255], `${e.width}x${e.height}`);
  }
});

test('a second export of the same sources is byte-identical', () => {
  const files = listTree(first.out);
  assert.deepEqual(listTree(second.out), files);
  for (const f of files) {
    assert.ok(readFileSync(join(first.out, f)).equals(readFileSync(join(second.out, f))), `${f} differs`);
  }
});
