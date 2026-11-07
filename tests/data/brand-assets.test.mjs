// Checks for the committed brand exports (ADR 0053): every output that
// `npm run brand:export` writes from brand/src/ is in the repo, with the format
// and the exact size that scripts/brand/targets.mjs gives it.
//
// No browser is needed. PNGs are checked through their IHDR
// (scripts/brand/png-info.mjs) and favicon.ico through its directory
// (scripts/brand/ico.mjs). No pixel is compared: Chromium's anti-aliasing may
// change between Playwright versions, and the exports are only re-made when a
// source changes (ADR 0053).
//
// What is checked, and why:
// - Every target exists: builds and deploys never rasterise, so a missing
//   export would be a missing icon on the site or in the owner's handoff.
// - Every PNG is 8-bit with the exact width and height of its target. Opaque
//   targets are truecolour without alpha (PNG colour type 2, PNG spec
//   §11.2.1), so no pixel can be transparent: iOS is widely reported to show a
//   transparent home-screen icon on black, and social cards and avatars sit on
//   backgrounds we don't control.
// - favicon.ico holds exactly the 16, 32 and 48 frames, in that order, each a
//   square 8-bit RGBA PNG of its size (Raymond Chen, "The evolution of the ICO
//   file format, part 4: PNG images": "32bpp ARGB").
// - og.png, the GitHub social preview and the 500 px avatar are under 1 MB
//   (GitHub's limit for the social preview, and a budget for the others).
// - The SVGs served as-is are byte-identical to their sources, so a source
//   edit without a re-export fails here.
// - The export folders hold nothing but targets, so a renamed target can't
//   leave a stale file behind.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGETS, ICO_SIZES } from '../../scripts/brand/targets.mjs';
import { readPngInfo } from '../../scripts/brand/png-info.mjs';
import { readIcoDirectory } from '../../scripts/brand/ico.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const src = join(root, 'brand', 'src');

/** PNG IHDR colour types (PNG spec §11.2.1, Table 8). */
const PNG_RGB = 2;
const PNG_RGBA = 6;

/** 1 MB, counted in decimal so the limit holds however a site rounds. */
const ONE_MB = 1_000_000;

const read = (rel) => readFileSync(join(root, rel));
const byKind = (kind) => TARGETS.filter((t) => t.kind === kind);

describe('brand exports: every target is committed', () => {
	for (const t of TARGETS) {
		test(`${t.out} exists`, () => {
			assert.ok(existsSync(join(root, t.out)), `${t.out} is missing: run npm run brand:export`);
		});
	}
});

describe('brand exports: PNG format and size', () => {
	for (const t of byKind('png')) {
		test(`${t.out} is an 8-bit PNG of ${t.width}x${t.height}`, () => {
			const info = readPngInfo(read(t.out));
			assert.equal(info.width, t.width, 'width');
			assert.equal(info.height, t.height, 'height');
			assert.equal(info.bitDepth, 8, 'bit depth');
		});
		if (t.opaque) {
			test(`${t.out} is opaque (truecolour, no alpha channel)`, () => {
				assert.equal(readPngInfo(read(t.out)).colorType, PNG_RGB);
			});
		}
	}
});

describe('brand exports: favicon.ico', () => {
	const [ico] = byKind('ico');

	test('targets.mjs has exactly one ICO, public/favicon.ico, with frames 16, 32 and 48', () => {
		assert.equal(byKind('ico').length, 1);
		assert.equal(ico.out, 'public/favicon.ico');
		assert.deepEqual([...ico.sizes], [16, 32, 48]);
		assert.deepEqual([...ico.sizes], [...ICO_SIZES]);
	});

	test('the directory lists exactly the 16, 32 and 48 frames, in that order', () => {
		const dir = readIcoDirectory(read(ico.out));
		assert.equal(dir.type, 1, 'idType 1 (icon)');
		assert.equal(dir.count, 3);
		assert.deepEqual(
			dir.entries.map((e) => [e.width, e.height]),
			[16, 32, 48].map((s) => [s, s]),
		);
	});

	test('every frame is a square 8-bit RGBA PNG of its listed size', () => {
		const dir = readIcoDirectory(read(ico.out));
		for (const e of dir.entries) {
			const info = readPngInfo(e.data); // throws without the PNG signature
			assert.equal(info.width, e.width, `frame ${e.width}: PNG width`);
			assert.equal(info.height, e.height, `frame ${e.width}: PNG height`);
			assert.equal(info.bitDepth, 8, `frame ${e.width}: bit depth`);
			assert.equal(info.colorType, PNG_RGBA, `frame ${e.width}: colour type`);
			assert.equal(e.bitCount, 32, `frame ${e.width}: wBitCount`);
			assert.equal(e.planes, 1, `frame ${e.width}: wPlanes`);
		}
	});

	test('the frames fill the file with nothing left over', () => {
		const buf = read(ico.out);
		const dir = readIcoDirectory(buf);
		const last = dir.entries.at(-1);
		assert.equal(last.offset + last.bytes, buf.length);
	});
});

describe('brand exports: file size limits', () => {
	for (const out of [
		'public/og.png',
		'brand/exports/social-preview-1280x640.png',
		'brand/exports/avatar-500.png',
	]) {
		test(`${out} is under 1 MB`, () => {
			assert.ok(
				TARGETS.some((t) => t.out === out),
				`${out} is not a target in targets.mjs`,
			);
			const bytes = statSync(join(root, out)).size;
			assert.ok(bytes < ONE_MB, `${out} is ${bytes} bytes`);
		});
	}
});

describe('brand exports: SVGs served as-is', () => {
	for (const t of byKind('copy')) {
		test(`${t.out} is byte-identical to brand/src/${t.src}`, () => {
			assert.ok(read(t.out).equals(readFileSync(join(src, t.src))));
		});
	}

	for (const [out, source] of [
		['public/favicon.svg', 'favicon.svg'],
		['src/assets/brand/logo-light.svg', 'lockup-light.svg'],
		['src/assets/brand/logo-dark.svg', 'lockup-dark.svg'],
	]) {
		test(`targets.mjs copies brand/src/${source} to ${out}`, () => {
			assert.ok(
				TARGETS.some((t) => t.kind === 'copy' && t.src === source && t.out === out),
				`no copy target ${source} -> ${out}`,
			);
		});
	}
});

describe('brand exports: no stale files', () => {
	const dirs = ['brand/exports', 'public/brand', 'src/assets/brand'];
	const outs = new Set(TARGETS.map((t) => t.out));

	for (const d of dirs) {
		test(`${d}/ holds only targets from targets.mjs`, () => {
			const abs = join(root, d);
			assert.ok(existsSync(abs), `${d}/ is missing: run npm run brand:export`);
			const extra = readdirSync(abs, { recursive: true })
				.map((f) => relative(root, join(abs, String(f))).split('\\').join('/'))
				// .DS_Store is Finder's, never committed
				.filter((f) => !f.endsWith('/.DS_Store'))
				.filter((f) => !statSync(join(root, f)).isDirectory() && !outs.has(f));
			assert.deepEqual(extra, []);
		});
	}
});
