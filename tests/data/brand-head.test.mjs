// Checks for the brand wiring of the site (feature 0014, T04): the web app
// manifest, the icon, theme-color and Open Graph tags in the built <head>, and
// the header logo markup.
//
// No browser is needed. The manifest tests read public/ and always run. The
// <head> and header tests read the built site, so run `npm run build` first;
// without dist/ they are skipped, with that reason. Whether the header shows
// the right logo in each theme is checked in a browser by
// tests/e2e/header-logo.e2e.mjs.
//
// Sources for what is expected:
// - Starlight 0.42.9 (installed dist/utils/head.js): the `favicon` option is
//   emitted as <link rel="shortcut icon" type> and sorted after every other
//   <link>, so a browser that finds several equally good icons takes the SVG,
//   the last one; a user <meta> replaces a default with the same `name` or
//   `property`, so og:title and twitter:card stay Starlight's own.
// - Evil Martians, "How to Favicon in 2026": the ICO is linked with
//   sizes="32x32", so Chrome does not take it over the SVG.
// - W3C Web Application Manifest, §"purpose member" and §"icons member":
//   `sizes` gives the icon's real pixel size; web.dev, "Adaptive icon support
//   in PWAs with maskable icons": ship `any` and `maskable` as separate icons,
//   never one icon with purpose "any maskable".
// - ogp.me §"Structured Properties": og:image:width, og:image:height and
//   og:image:alt describe og:image; Meta's sharing guide asks for 1200 x 630.
//   og:image is an absolute URL, because crawlers do not resolve relative ones.
// - Starlight SiteTitle.astro: with `logo: { light, dark, replacesTitle: true }`
//   the header has a dark image (hidden in the light theme), a light image
//   (hidden in the dark theme) and the site title as sr-only text.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPngInfo } from '../../scripts/brand/png-info.mjs';
import {
	tokens,
	decodeEntities,
	elementTree,
	elementChildren,
	hasClass,
} from '../../scripts/check/lib/html-text.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = join(root, 'dist');
const SITE = 'https://polyjose.dev';

/** Brand palette (brand/README.md, "Colours"): the light and the dark tile. */
const NAVY = '#16255a';
const DARK_TILE = '#2f4ba6';

/** The two pages the <head> checks read: the landing page and one deep page. */
const PAGES = ['index.html', 'guides/sign-and-verify/index.html'];

// ---------------------------------------------------------------------------
// The web app manifest (public/site.webmanifest).

const manifestPath = join(root, 'public', 'site.webmanifest');

/** The manifest, parsed; fails the calling test when it is missing or not JSON. */
function manifest() {
	assert.ok(existsSync(manifestPath), 'public/site.webmanifest is missing');
	return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

/** The purposes of a manifest icon, as a list (W3C manifest: default "any"). */
const purposes = (icon) => (icon.purpose ?? 'any').trim().split(/\s+/);

describe('site.webmanifest', () => {
	test('parses as JSON', () => {
		assert.equal(typeof manifest(), 'object');
	});

	test('names the site and opens the landing page in the browser', () => {
		const m = manifest();
		assert.equal(m.name, 'polyjose');
		assert.equal(m.short_name, 'polyjose');
		assert.equal(m.start_url, '/');
		assert.equal(m.display, 'browser');
	});

	test('background_color and theme_color are the navy of the opaque icons', () => {
		const m = manifest();
		assert.equal(m.background_color?.toLowerCase(), NAVY);
		assert.equal(m.theme_color?.toLowerCase(), NAVY);
	});

	test('icons: 192 any, 512 any and 512 maskable, each a PNG with sizes', () => {
		const got = manifest().icons.map((i) => `${i.sizes} ${purposes(i).join(' ')} ${i.type}`);
		assert.deepEqual(got, ['192x192 any image/png', '512x512 any image/png', '512x512 maskable image/png']);
	});

	test('no icon is both any and maskable', () => {
		for (const icon of manifest().icons) {
			const p = purposes(icon);
			assert.ok(!(p.includes('any') && p.includes('maskable')), `${icon.src}: purpose "${icon.purpose}"`);
		}
	});

	test('every icon is a file in public/ whose real size is its sizes', () => {
		for (const icon of manifest().icons) {
			assert.match(icon.src, /^\/[^/]/, `${icon.src}: a root-relative path`);
			const file = join(root, 'public', icon.src);
			assert.ok(existsSync(file), `${icon.src} is not in public/`);
			const { width, height } = readPngInfo(readFileSync(file));
			assert.equal(`${width}x${height}`, icon.sizes, icon.src);
		}
	});
});

// ---------------------------------------------------------------------------
// The built <head>.

const built = PAGES.every((p) => existsSync(join(dist, p)));
const skip = built ? false : 'dist/ is not built; run `npm run build` first';

/** The <link> and <meta> tags of a built page's <head>, in order, with decoded attributes. */
function headTags(page) {
	const html = readFileSync(join(dist, page), 'utf8');
	const end = html.indexOf('</head>');
	assert.ok(end > 0, `${page}: no </head>`);
	const out = [];
	for (const t of tokens(html.slice(0, end))) {
		if (t.type !== 'tag' || t.closing || (t.name !== 'link' && t.name !== 'meta')) continue;
		const attrs = new Map([...t.attrs].map(([k, v]) => [k, decodeEntities(v)]));
		out.push({ name: t.name, attrs, raw: t.raw });
	}
	return out;
}

const links = (tags, rel) => tags.filter((t) => t.name === 'link' && t.attrs.get('rel') === rel);
const metas = (tags, key, value) => tags.filter((t) => t.name === 'meta' && t.attrs.get(key) === value);

/** The single `content` of a meta tag; fails unless there is exactly one. */
function one(tags, key, value) {
	const found = metas(tags, key, value);
	assert.equal(found.length, 1, `exactly one <meta ${key}="${value}">`);
	return found[0].attrs.get('content');
}

/**
 * The dist/ file a URL names when it is root-relative or on polyjose.dev, else
 * null. A path ending in `/` names that directory's index.html.
 */
function distFileOf(url) {
	let path;
	if (url.startsWith(`${SITE}/`)) path = url.slice(SITE.length);
	else if (url.startsWith('/') && !url.startsWith('//')) path = url;
	else return null;
	path = decodeURIComponent(path.replace(/[?#].*$/, ''));
	if (path.endsWith('/')) path += 'index.html';
	return join(dist, path);
}

for (const page of PAGES) {
	describe(`built <head> of dist/${page}`, () => {
		test('exactly one ICO icon, linked as 32x32', { skip }, () => {
			const icons = links(headTags(page), 'icon');
			assert.deepEqual(
				icons.map((t) => [t.attrs.get('href'), t.attrs.get('sizes')]),
				[['/favicon.ico', '32x32']],
			);
		});

		test('one SVG shortcut icon, after the ICO', { skip }, () => {
			const tags = headTags(page);
			const svg = links(tags, 'shortcut icon');
			assert.equal(svg.length, 1);
			assert.equal(svg[0].attrs.get('href'), '/favicon.svg');
			assert.equal(svg[0].attrs.get('type'), 'image/svg+xml');
			const ico = links(tags, 'icon').find((t) => t.attrs.get('href') === '/favicon.ico');
			assert.ok(ico, 'the ICO is linked');
			assert.ok(tags.indexOf(svg[0]) > tags.indexOf(ico), 'the SVG comes after the ICO, so it wins');
		});

		test('one apple-touch-icon and one manifest link', { skip }, () => {
			const tags = headTags(page);
			assert.deepEqual(links(tags, 'apple-touch-icon').map((t) => t.attrs.get('href')), ['/apple-touch-icon.png']);
			assert.deepEqual(links(tags, 'manifest').map((t) => t.attrs.get('href')), ['/site.webmanifest']);
		});

		test('two theme-color metas, for the light and the dark colour scheme', { skip }, () => {
			const got = metas(headTags(page), 'name', 'theme-color').map((t) => [
				t.attrs.get('media'),
				t.attrs.get('content').toLowerCase(),
			]);
			assert.deepEqual(got, [
				['(prefers-color-scheme: light)', NAVY],
				['(prefers-color-scheme: dark)', DARK_TILE],
			]);
		});

		test('og:image is the absolute og.png URL, 1200 x 630, with alt text', { skip }, () => {
			const tags = headTags(page);
			assert.equal(one(tags, 'property', 'og:image'), `${SITE}/og.png`);
			assert.equal(one(tags, 'property', 'og:image:width'), '1200');
			assert.equal(one(tags, 'property', 'og:image:height'), '630');
			const alt = one(tags, 'property', 'og:image:alt');
			assert.ok(alt.trim().length > 0, 'og:image:alt is not empty');
			assert.equal(one(tags, 'name', 'twitter:image:alt'), alt);
		});

		test('og:image:width and height are the real size of og.png', { skip }, () => {
			const tags = headTags(page);
			const { width, height } = readPngInfo(readFileSync(join(dist, 'og.png')));
			assert.equal(one(tags, 'property', 'og:image:width'), String(width));
			assert.equal(one(tags, 'property', 'og:image:height'), String(height));
		});

		test("Starlight's own og:title and twitter:card stay, once each", { skip }, () => {
			const tags = headTags(page);
			assert.equal(one(tags, 'name', 'twitter:card'), 'summary_large_image');
			assert.ok(one(tags, 'property', 'og:title').length > 0);
		});

		test('every root-relative or polyjose.dev URL in the head is a built file', { skip }, () => {
			const urls = headTags(page).flatMap((t) =>
				[t.attrs.get('href'), t.name === 'meta' ? t.attrs.get('content') : undefined].filter(Boolean),
			);
			const checked = [];
			for (const url of urls) {
				const file = distFileOf(url);
				if (file === null) continue;
				checked.push(url);
				assert.ok(existsSync(file), `${url} has no file in dist/`);
			}
			for (const url of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/site.webmanifest', `${SITE}/og.png`]) {
				assert.ok(checked.includes(url), `${url} was checked`);
			}
		});
	});
}

describe('built site: manifest and its icons', () => {
	test('dist/site.webmanifest is the one in public/, and its icons are built', { skip }, () => {
		const builtManifest = readFileSync(join(dist, 'site.webmanifest'), 'utf8');
		assert.equal(builtManifest, readFileSync(manifestPath, 'utf8'));
		for (const icon of JSON.parse(builtManifest).icons) {
			assert.ok(existsSync(distFileOf(icon.src)), `${icon.src} has no file in dist/`);
		}
	});
});

// ---------------------------------------------------------------------------
// The header logo (Starlight SiteTitle.astro).

/** The first element in `node`'s subtree that `match` accepts, depth first. */
function find(node, match) {
	for (const el of elementChildren(node)) {
		if (match(el)) return el;
		const deeper = find(el, match);
		if (deeper) return deeper;
	}
	return null;
}

/** Every element in `node`'s subtree that `match` accepts, in document order. */
function findAll(node, match, out = []) {
	for (const el of elementChildren(node)) {
		if (match(el)) out.push(el);
		findAll(el, match, out);
	}
	return out;
}

for (const page of PAGES) {
	describe(`header logo in dist/${page}`, () => {
		const siteTitle = () => {
			const tree = elementTree(readFileSync(join(dist, page), 'utf8'));
			const a = find(tree, (el) => el.name === 'a' && hasClass(el, 'site-title'));
			assert.ok(a, 'the header has a.site-title');
			return a;
		};

		test('a light and a dark logo image, each hidden in the other theme, both decorative', { skip }, () => {
			const imgs = findAll(siteTitle(), (el) => el.name === 'img');
			assert.equal(imgs.length, 2);
			const darkImg = imgs.find((el) => hasClass(el, 'light:sl-hidden'));
			const lightImg = imgs.find((el) => hasClass(el, 'dark:sl-hidden'));
			assert.ok(darkImg && lightImg, 'one image per theme');
			for (const img of imgs) assert.equal(img.attrs.get('alt'), '', 'alt is empty: the title is the name');
			assert.match(lightImg.attrs.get('src'), /\/logo-light\.[\w-]+\.svg$/);
			assert.match(darkImg.attrs.get('src'), /\/logo-dark\.[\w-]+\.svg$/);
		});

		test('each logo image is the lockup committed in src/assets/brand/', { skip }, () => {
			const imgs = findAll(siteTitle(), (el) => el.name === 'img');
			assert.equal(imgs.length, 2);
			for (const img of imgs) {
				const src = img.attrs.get('src');
				const file = distFileOf(src);
				assert.ok(file && existsSync(file), `${src} has no file in dist/`);
				const variant = /logo-(light|dark)/.exec(src)[1];
				const committed = readFileSync(join(root, 'src', 'assets', 'brand', `logo-${variant}.svg`), 'utf8');
				assert.equal(readFileSync(file, 'utf8'), committed, `${src} is logo-${variant}.svg`);
			}
		});

		test('the site title is kept once, as screen-reader-only text', { skip }, () => {
			const spans = findAll(siteTitle(), (el) => el.name === 'span');
			assert.equal(spans.length, 1);
			assert.ok(hasClass(spans[0], 'sr-only'), 'the title is sr-only');
			assert.equal(spans[0].children.map((c) => c.text ?? '').join('').trim(), 'polyjose');
		});
	});
}
