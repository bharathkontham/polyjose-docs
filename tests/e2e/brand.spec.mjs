// Browser check for the brand icons (feature 0014, T07).
//
//   npm run build && node --test tests/e2e/brand.spec.mjs
//
// It needs Chromium (`npx playwright install chromium`), so it is NOT named
// *.test.mjs and `npm run test:scripts` (browser-free) does not run it.
//
// Serves dist/ with Astro's programmatic preview server (the server behind
// `npm run preview`) on an OS-assigned port, then checks in Chromium that:
// - no head icon, manifest or social-image URL 404s, and each has the
//   content type its extension needs;
// - the web app manifest has its required members, the three icons (192 any,
//   512 any, 512 maskable), real PNGs of the declared sizes, nothing outside
//   the maskable safe zone (the central 80%: a circle of radius 40%), and
//   Chromium's own parser (CDP Page.getAppManifest) reports no errors;
// - favicon.svg and the favicon.ico frames render at 16 and 32 px, light and
//   dark, with the light and dark tile colours, on a light and a dark tab
//   strip (screenshots are saved for a person to look at);
// - the header shows exactly one logo, the matching variant, whether the theme
//   comes from the colour scheme (auto) or from Starlight's theme select, and
//   axe finds no violation in either theme (beyond tests/a11y/allow.json, the
//   list `npm run a11y` uses);
// - og:image resolves to a 1200 x 630 PNG under 1 MB, and the social preview
//   export is 1280 x 640 under 1 MB.
//
// Screenshots go to $BRAND_SHOTS_DIR (or a new temporary directory); the run
// prints where. No assertion depends on elapsed time.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { preview } from 'astro';
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { AXE_TAGS, parseAllowList, applyAllowList } from '../a11y/lib.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const PAGES = ['/', '/guides/sign-and-verify/'];
const SITE = 'https://polyjose.dev';
const MB = 1_000_000;
// Light and dark tile and key colours of the mark (brand/src, favicon.svg).
const LIGHT = { tile: [0x16, 0x25, 0x5a], key: [0xf2, 0xb2, 0x2e] };
const DARK = { tile: [0x2f, 0x4b, 0xa6], key: [0xf7, 0xc0, 0x4a] };
// Tab-strip backgrounds the favicon is shown on.
// The repo's one reviewed axe exception (tests/a11y/allow.json: Starlight's
// search button), the same list `npm run a11y` uses.
const ALLOW = parseAllowList(readFileSync(join(ROOT, 'tests/a11y/allow.json'), 'utf8'));
const STRIPS = { white: '#FFFFFF', dark: '#202124' };

const shotsDir = process.env.BRAND_SHOTS_DIR
	? (mkdirSync(process.env.BRAND_SHOTS_DIR, { recursive: true }), process.env.BRAND_SHOTS_DIR)
	: mkdtempSync(join(tmpdir(), 'polyjose-brand-'));

let server;
let browser;
let origin;

before(async () => {
	assert.ok(existsSync(join(ROOT, 'dist', 'index.html')), 'dist/ is not built: run `npm run build` first');
	server = await preview({ root: ROOT, server: { host: '127.0.0.1', port: 0 }, logLevel: 'warn' });
	origin = `http://127.0.0.1:${server.port}`;
	browser = await chromium.launch();
});

after(async () => {
	await browser?.close();
	await server?.stop();
	console.log(`brand screenshots: ${shotsDir}`);
});

async function open(path, { scheme = 'light', width = 1280, height = 800 } = {}) {
	const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
	const page = await context.newPage();
	const response = await page.goto(`${origin}${path}`);
	assert.equal(response?.status(), 200, `${path}: HTTP ${response?.status()}`);
	return { context, page };
}

/** A URL from the page's head, on the local server, or null if it is external. */
function local(url) {
	if (url.startsWith(`${SITE}/`)) return `${origin}${url.slice(SITE.length)}`;
	if (url.startsWith('/') && !url.startsWith('//')) return `${origin}${url}`;
	return null;
}

function pngSize(bytes) {
	const b = Buffer.from(bytes);
	assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'a PNG signature');
	assert.equal(b.subarray(12, 16).toString('latin1'), 'IHDR');
	return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** The frames of an ICO file: {size, png}. Frames are PNG (checked). */
function icoFrames(bytes) {
	const b = Buffer.from(bytes);
	assert.equal(b.readUInt16LE(0), 0, 'ICO reserved');
	assert.equal(b.readUInt16LE(2), 1, 'ICO type is icon');
	const n = b.readUInt16LE(4);
	const frames = [];
	for (let i = 0; i < n; i++) {
		const e = 6 + i * 16;
		const size = b[e] || 256;
		const len = b.readUInt32LE(e + 8);
		const off = b.readUInt32LE(e + 12);
		const png = b.subarray(off, off + len);
		assert.deepEqual(pngSize(png), { width: size, height: size }, `ICO frame ${i}`);
		frames.push({ size, png });
	}
	return frames;
}

const near = (got, want, tol = 6) => got.every((v, i) => Math.abs(v - want[i]) <= tol);

// ---------------------------------------------------------------- no 404s

const EXPECTED_TYPE = [
	[/\.svg$/, /^image\/svg\+xml/],
	[/\.ico$/, /^image\/(x-icon|vnd\.microsoft\.icon)/],
	[/\.png$/, /^image\/png/],
	[/\.webmanifest$/, /^application\/(manifest\+json|json)|\+json/],
];

test('every head icon, manifest and image URL answers 200 with the right content type', async () => {
	const urls = new Set();
	for (const path of PAGES) {
		const { context, page } = await open(path);
		try {
			const found = await page.evaluate(() => [
				...[...document.querySelectorAll('link[href]')].map((e) => e.getAttribute('href')),
				...[...document.querySelectorAll('meta[content]')].map((e) => e.getAttribute('content')),
			]);
			for (const u of found) if (local(u)) urls.add(u);
			const manifestHref = await page.getAttribute('link[rel=manifest]', 'href');
			assert.ok(manifestHref, `${path}: has a manifest link`);
			const manifest = await (await page.request.get(local(manifestHref))).json();
			for (const icon of manifest.icons) urls.add(icon.src);
		} finally {
			await context.close();
		}
	}
	// The icon set must be there, not just whatever happens to be linked.
	for (const needed of ['/favicon.svg', '/favicon.ico', '/apple-touch-icon.png', '/site.webmanifest', `${SITE}/og.png`]) {
		const present = [...urls].some((u) => u === needed || u.endsWith(needed));
		assert.ok(present, `${needed} is linked from the head or manifest`);
	}
	const context = await browser.newContext();
	try {
		for (const u of urls) {
			const res = await context.request.get(local(u));
			assert.equal(res.status(), 200, `${u}: HTTP ${res.status()}`);
			const type = res.headers()['content-type'] ?? '';
			const path = new URL(local(u)).pathname;
			for (const [ext, want] of EXPECTED_TYPE) {
				if (ext.test(path)) assert.match(type, want, `${u}: content-type ${type}`);
			}
			console.log(`  ${res.status()} ${type.padEnd(30)} ${u}`);
		}
	} finally {
		await context.close();
	}
});

// --------------------------------------------------------------- manifest

test('the manifest parses, has its members and icons, and Chromium reports no errors', async () => {
	const { context, page } = await open('/');
	try {
		const res = await page.request.get(`${origin}/site.webmanifest`);
		const manifest = JSON.parse(await res.text());
		for (const member of ['name', 'short_name', 'start_url', 'display', 'background_color', 'theme_color', 'icons']) {
			assert.ok(manifest[member], `manifest.${member}`);
		}
		const key = (i) => `${i.sizes} ${i.purpose}`;
		assert.deepEqual(manifest.icons.map(key).sort(), ['192x192 any', '512x512 any', '512x512 maskable']);
		for (const icon of manifest.icons) {
			assert.equal(icon.type, 'image/png');
			const [w, h] = icon.sizes.split('x').map(Number);
			const png = await page.request.get(local(icon.src));
			assert.equal(png.status(), 200, icon.src);
			assert.deepEqual(pngSize(await png.body()), { width: w, height: h }, `${icon.src} is ${icon.sizes}`);
		}

		const cdp = await context.newCDPSession(page);
		await cdp.send('Page.enable');
		const parsed = await cdp.send('Page.getAppManifest');
		assert.deepEqual(parsed.errors, [], `Chromium manifest errors: ${JSON.stringify(parsed.errors)}`);
		assert.equal(parsed.url, `${origin}/site.webmanifest`);
		assert.ok(JSON.parse(parsed.data).icons.length === 3, 'Chromium parsed three icons');
	} finally {
		await context.close();
	}
});

test('the maskable icon keeps every non-background pixel inside the central 80% safe zone', async () => {
	const { context, page } = await open('/');
	try {
		const result = await page.evaluate(async (src) => {
			const img = new Image();
			img.src = src;
			await img.decode();
			const c = document.createElement('canvas');
			c.width = img.naturalWidth;
			c.height = img.naturalHeight;
			const g = c.getContext('2d');
			g.drawImage(img, 0, 0);
			const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
			const px = (x, y) => [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
			const bg = px(0, 0);
			// Full bleed: all four corners are the same opaque colour.
			const corners = [px(width - 1, 0), px(0, height - 1), px(width - 1, height - 1)];
			let maxR = 0;
			let marked = 0;
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const p = px(x, y);
					if (p.some((v, i) => Math.abs(v - bg[i]) > 8)) {
						marked++;
						maxR = Math.max(maxR, Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2));
					}
				}
			}
			return { bg, corners, maxR, marked, width };
		}, `${origin}/icon-mask.png`);
		assert.equal(result.bg[3], 255, 'the maskable icon is opaque');
		for (const c of result.corners) assert.deepEqual(c, result.bg, 'full-bleed background');
		assert.ok(result.marked > 1000, 'the mark is drawn');
		assert.ok(result.maxR <= 0.4 * result.width, `mark radius ${result.maxR.toFixed(1)} px exceeds the safe zone ${0.4 * result.width}`);
		console.log(`  maskable mark radius ${result.maxR.toFixed(1)} px of ${0.4 * result.width} allowed`);
	} finally {
		await context.close();
	}
});

// ---------------------------------------------------------- favicon pixels

/**
 * Draws `src` at size x size in a page with colour scheme `scheme` on `strip`,
 * saves a 1:1 screenshot and a nearest-neighbour enlargement, and returns the
 * RGB of tile and key sample points and the screenshot bytes.
 */
async function renderIcon(url, size, scheme, stripName, name) {
	// The served bytes as a data: URL, so reading pixels back does not taint the canvas.
	let src = url;
	if (url.startsWith('http')) {
		const res = await fetch(url);
		assert.equal(res.status, 200, url);
		const type = res.headers.get('content-type').split(';')[0];
		src = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
	}
	const context = await browser.newContext({ viewport: { width: 400, height: 300 }, colorScheme: scheme, deviceScaleFactor: 1 });
	const page = await context.newPage();
	try {
		await page.setContent(
			`<body style="margin:0;background:${STRIPS[stripName]}"><div style="padding:20px"><img id="i" width="${size}" height="${size}" style="display:block"></div>` +
				`<canvas id="big" style="display:block;margin:0 20px;image-rendering:pixelated"></canvas></body>`,
		);
		const sample = await page.evaluate(
			async ({ src, size }) => {
				const img = document.getElementById('i');
				img.src = src;
				await img.decode();
				const c = document.createElement('canvas');
				c.width = c.height = size;
				const g = c.getContext('2d');
				g.drawImage(img, 0, 0, size, size);
				const at = (fx, fy) => [...g.getImageData(Math.floor(fx * size), Math.floor(fy * size), 1, 1).data];
				const big = document.getElementById('big');
				big.width = big.height = 256;
				const b = big.getContext('2d');
				b.imageSmoothingEnabled = false;
				b.drawImage(c, 0, 0, 256, 256);
				return { tile: at(3.5 / 32, 17.5 / 32), key: at(16.5 / 32, 11.5 / 32), nat: [img.naturalWidth, img.naturalHeight] };
			},
			{ src, size },
		);
		const clip = { x: 20, y: 20, width: size, height: size };
		const real = await page.screenshot({ path: join(shotsDir, `${name}-${scheme}-on-${stripName}.png`), clip });
		await page.locator('#big').screenshot({ path: join(shotsDir, `${name}-${scheme}-on-${stripName}-enlarged.png`) });
		return { sample, real };
	} finally {
		await context.close();
	}
}

for (const size of [16, 32]) {
	test(`favicon.svg at ${size}x${size}: the mark, in the light and dark tile colours, on both tab strips`, async () => {
		const shots = {};
		for (const scheme of ['light', 'dark']) {
			for (const strip of Object.keys(STRIPS)) {
				const { sample, real } = await renderIcon(`${origin}/favicon.svg`, size, scheme, strip, `favicon-svg-${size}`);
				const want = scheme === 'light' ? LIGHT : DARK;
				const where = `${size}px ${scheme} on ${strip}`;
				assert.ok(sample.nat[0] > 0, `${where}: the SVG decoded`);
				assert.ok(near(sample.tile.slice(0, 3), want.tile), `${where}: tile ${sample.tile} wanted ${want.tile}`);
				assert.ok(near(sample.key.slice(0, 3), want.key, 24), `${where}: key ${sample.key} wanted ${want.key}`);
				assert.equal(sample.tile[3], 255, `${where}: the tile is opaque`);
				shots[`${scheme}-${strip}`] = real;
			}
		}
		for (const strip of Object.keys(STRIPS)) {
			assert.notDeepEqual(shots[`light-${strip}`], shots[`dark-${strip}`], `${size}px on ${strip}: the dark render differs from the light one`);
		}
	});
}

test('favicon.ico has 16, 32 and 48 frames that render at their size', async () => {
	const res = await fetch(`${origin}/favicon.ico`);
	const frames = icoFrames(new Uint8Array(await res.arrayBuffer()));
	assert.deepEqual(frames.map((f) => f.size), [16, 32, 48]);
	for (const f of frames) {
		const src = `data:image/png;base64,${f.png.toString('base64')}`;
		for (const strip of Object.keys(STRIPS)) {
			const { sample } = await renderIcon(src, f.size, 'light', strip, `favicon-ico-${f.size}`);
			assert.ok(near(sample.tile.slice(0, 3), LIGHT.tile), `ico ${f.size}: tile ${sample.tile}`);
			assert.ok(near(sample.key.slice(0, 3), LIGHT.key, 24), `ico ${f.size}: key ${sample.key}`);
		}
	}
});

// ------------------------------------------------------------ light / dark

const headerImages = (page) => page.locator('header.header img');

async function assertOneLogo(page, theme, where) {
	assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme, `${where}: data-theme`);
	const imgs = headerImages(page);
	let visible = [];
	for (let i = 0; i < (await imgs.count()); i++) {
		if (await imgs.nth(i).isVisible()) visible.push(await imgs.nth(i).getAttribute('src'));
	}
	assert.equal(visible.length, 1, `${where}: ${visible.length} visible header images: ${visible}`);
	assert.match(visible[0], new RegExp(`logo-${theme}`), `${where}: the ${theme} logo, got ${visible[0]}`);
}

async function assertNoAxeViolations(page, where) {
	const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
	const { failures } = applyAllowList(ALLOW, [{ page: where, variant: where, violations }]);
	assert.deepEqual(
		failures.map((f) => `${f.rule}: ${f.selector}`),
		[],
		`${where}: axe violations`,
	);
}

for (const path of PAGES) {
	const tag = path === '/' ? 'home' : 'docs';
	for (const theme of ['light', 'dark']) {
		test(`${path}: auto theme under colorScheme ${theme} shows only the ${theme} header logo, no axe violations`, async () => {
			const { context, page } = await open(path, { scheme: theme });
			try {
				assert.equal(await page.locator('starlight-theme-select select').first().inputValue(), 'auto');
				await assertOneLogo(page, theme, `${path} auto/${theme}`);
				await page.locator('header.header').screenshot({ path: join(shotsDir, `header-auto-${theme}-${tag}.png`) });
				await assertNoAxeViolations(page, `${path} auto/${theme}`);
			} finally {
				await context.close();
			}
		});
	}

	test(`${path}: the theme select swaps the header logo both ways, no axe violations`, async () => {
		const { context, page } = await open(path, { scheme: 'light' });
		try {
			const select = page.locator('starlight-theme-select select:visible').first();
			for (const theme of ['dark', 'light']) {
				await select.selectOption(theme);
				await assertOneLogo(page, theme, `${path} select/${theme}`);
				await page.locator('header.header').screenshot({ path: join(shotsDir, `header-select-${theme}-${tag}.png`) });
				await assertNoAxeViolations(page, `${path} select/${theme}`);
			}
			// A stored choice beats the colour scheme: dark chosen under a light scheme.
			await select.selectOption('dark');
			await page.reload();
			await assertOneLogo(page, 'dark', `${path} stored dark under light scheme`);
		} finally {
			await context.close();
		}
	});
}

// ------------------------------------------------------------------ images

test('og:image resolves to a 1200x630 PNG under 1 MB, as declared', async () => {
	const { context, page } = await open('/');
	try {
		const content = (sel) => page.getAttribute(sel, 'content');
		const url = await content('meta[property="og:image"]');
		assert.equal(url, `${SITE}/og.png`);
		assert.equal(await content('meta[property="og:image:width"]'), '1200');
		assert.equal(await content('meta[property="og:image:height"]'), '630');
		assert.ok(await content('meta[property="og:image:alt"]'), 'og:image:alt');
		assert.equal(await content('meta[name="twitter:card"]'), 'summary_large_image');
		const res = await page.request.get(local(url));
		assert.equal(res.status(), 200);
		const body = await res.body();
		assert.deepEqual(pngSize(body), { width: 1200, height: 630 });
		assert.ok(body.length < MB, `og.png is ${body.length} bytes`);
	} finally {
		await context.close();
	}
});

test('the GitHub social preview export is 1280x640 and under 1 MB', () => {
	const bytes = readFileSync(join(ROOT, 'brand/exports/social-preview-1280x640.png'));
	assert.deepEqual(pngSize(bytes), { width: 1280, height: 640 });
	assert.ok(bytes.length < MB, `${bytes.length} bytes`);
});
