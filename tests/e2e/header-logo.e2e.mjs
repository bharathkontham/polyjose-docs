// Browser check for the header logo (feature 0014, T04).
//
//   npm run build && node --test tests/e2e/header-logo.e2e.mjs
//
// It needs Chromium (`npx playwright install chromium`), so it is NOT named
// *.test.mjs and `npm run test:scripts` (browser-free) does not run it.
//
// Serves dist/ with Astro's programmatic preview server on an OS-assigned port
// and, at 375 px (phone) and 1280 px (desktop) wide, checks that:
// - the light lockup shows in the light theme and the dark lockup in the dark
//   theme, both when the theme follows the colour scheme (Playwright
//   `colorScheme` emulation, nothing stored) and after choosing it in
//   Starlight's theme select;
// - the logo is drawn at Starlight's logo height, calc(var(--sl-nav-height) -
//   2 * var(--sl-nav-pad-y)) (SiteTitle.astro): 32 px below 50em, 40 px above
//   (props.css), unstretched, inside the header and clear of the search button;
// - the header link to the home page is named "polyjose" once in the
//   accessibility tree: the images have alt '' and the title is sr-only text.
//
// Screenshots of the header, per width and theme, go to $HEADER_SHOTS_DIR (or
// a new temporary directory); the run prints where.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { preview } from 'astro';
import { chromium } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '../..');
const WIDTHS = [
	{ name: 'mobile', width: 375, height: 812, logoHeight: 32 },
	{ name: 'desktop', width: 1280, height: 800, logoHeight: 40 },
];
const THEMES = ['light', 'dark'];
const PAGES = ['/', '/guides/sign-and-verify/'];
// The lockup's viewBox (src/assets/brand/logo-*.svg): 490.52 x 93.65.
const LOGO_RATIO = 490.52 / 93.65;

const shotsDir = process.env.HEADER_SHOTS_DIR
	? (mkdirSync(process.env.HEADER_SHOTS_DIR, { recursive: true }), process.env.HEADER_SHOTS_DIR)
	: mkdtempSync(join(tmpdir(), 'polyjose-header-'));

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
	console.log(`header screenshots: ${shotsDir}`);
});

/** A page at `size`, with the colour scheme `scheme` and nothing stored. */
async function open(size, scheme, path = '/') {
	const context = await browser.newContext({
		viewport: { width: size.width, height: size.height },
		colorScheme: scheme,
	});
	const page = await context.newPage();
	const response = await page.goto(`${origin}${path}`);
	assert.equal(response?.status(), 200, `${path}: HTTP ${response?.status()}`);
	return { context, page };
}

const lightLogo = (page) => page.locator('a.site-title img[src*="logo-light"]');
const darkLogo = (page) => page.locator('a.site-title img[src*="logo-dark"]');

/** Fails unless the page is in `theme` and only that theme's logo shows. */
async function assertLogoFor(page, theme, where) {
	assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme, `${where}: data-theme`);
	const [shown, hidden] = theme === 'light' ? [lightLogo(page), darkLogo(page)] : [darkLogo(page), lightLogo(page)];
	assert.equal(await shown.isVisible(), true, `${where}: the ${theme} logo shows`);
	assert.equal(await hidden.isVisible(), false, `${where}: the other logo is hidden`);
	const loaded = await shown.evaluate((img) => img.complete && img.naturalWidth > 0);
	assert.ok(loaded, `${where}: the ${theme} logo loaded`);
}

/**
 * The theme select that is on screen. On a phone it is in the menu, which only
 * pages with a sidebar have (not the splash landing page).
 */
async function themeSelect(page) {
	const selects = page.locator('starlight-theme-select select');
	for (let i = 0; i < (await selects.count()); i++) {
		if (await selects.nth(i).isVisible()) return selects.nth(i);
	}
	await page.locator('button.sl-menu-button').click();
	for (let i = 0; i < (await selects.count()); i++) {
		if (await selects.nth(i).isVisible()) return selects.nth(i);
	}
	assert.fail('no theme select is visible, even with the menu open');
}

for (const size of WIDTHS) {
	for (const theme of THEMES) {
		test(`${size.name} (${size.width} px), ${theme} colour scheme: the ${theme} logo shows`, async () => {
			for (const path of PAGES) {
				const { context, page } = await open(size, theme, path);
				try {
					await assertLogoFor(page, theme, `${path} ${size.name} ${theme}`);
					const shot = `header-${size.name}-${theme}${path === '/' ? '' : '-docs'}.png`;
					await page.locator('header.header').screenshot({ path: join(shotsDir, shot) });
				} finally {
					await context.close();
				}
			}
		});
	}

	test(`${size.name} (${size.width} px): the theme select swaps the logo both ways`, async () => {
		const { context, page } = await open(size, 'light', '/guides/sign-and-verify/');
		try {
			await assertLogoFor(page, 'light', 'before');
			await (await themeSelect(page)).selectOption('dark');
			await assertLogoFor(page, 'dark', 'after choosing dark');
			await (await themeSelect(page)).selectOption('light');
			await assertLogoFor(page, 'light', 'after choosing light');
		} finally {
			await context.close();
		}
	});

	test(`${size.name} (${size.width} px): the logo is ${size.logoHeight} px tall, unstretched, and fits the header`, async () => {
		for (const [path, theme] of PAGES.flatMap((p) => THEMES.map((t) => [p, t]))) {
			const { context, page } = await open(size, theme, path);
			try {
				const logo = theme === 'light' ? lightLogo(page) : darkLogo(page);
				const box = await logo.boundingBox();
				assert.ok(box, `${theme}: the logo has a box`);
				assert.ok(Math.abs(box.height - size.logoHeight) < 0.5, `${path} ${theme}: height ${box.height}`);
				assert.ok(Math.abs(box.width / box.height - LOGO_RATIO) < 0.02, `${theme}: ratio ${box.width / box.height}`);
				const header = await page.locator('header.header').boundingBox();
				assert.ok(box.y >= header.y && box.y + box.height <= header.y + header.height, `${theme}: inside the header`);
				assert.ok(box.x >= header.x && box.x + box.width <= header.x + header.width, `${theme}: inside the header width`);
				// The search button, and on a phone the fixed menu button, sit to the right.
				for (const selector of ['site-search button[data-open-modal]', 'button.sl-menu-button']) {
					const button = page.locator(selector);
					if (!(await button.isVisible())) continue;
					const b = await button.boundingBox();
					assert.ok(box.x + box.width <= b.x, `${path} ${theme}: logo ends at ${box.x + box.width}, ${selector} starts at ${b.x}`);
				}
			} finally {
				await context.close();
			}
		}
	});

	test(`${size.name} (${size.width} px): the home link is named "polyjose" once`, async () => {
		for (const path of PAGES) {
			for (const theme of THEMES) {
				const { context, page } = await open(size, theme, path);
				try {
					const snapshot = await page.locator('a.site-title').ariaSnapshot();
					assert.equal(snapshot.trim(), '- link "polyjose":\n  - /url: /', `${path} ${theme}: ${snapshot}`);
					const header = await page.locator('header.header').ariaSnapshot();
					// Named once: the quoted name, not the GitHub URL's path.
					assert.equal(header.match(/"polyjose"/g)?.length, 1, `${path} ${theme}: ${header}`);
				} finally {
					await context.close();
				}
			}
		}
	});
}
