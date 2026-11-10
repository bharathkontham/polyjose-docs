// Checks the site menu and the footer links in the built pages: the header
// menu (Get started, Docs, GitHub), where it goes on a phone, and the links
// under every page's content.
//
// No browser is needed. The tests read dist/, so run `npm run build` first;
// without it they are skipped, with that reason.
//
// What is expected, and where it comes from:
// - Starlight 0.42.9 Header.astro renders the SocialIcons component in the
//   header's right group, which is shown from 50rem up; Sidebar.astro renders
//   MobileMenuFooter, which renders SocialIcons again, in the phone menu. The
//   site overrides SocialIcons with the menu, so the menu is in both places.
// - Pages without a sidebar (the landing page) have no Starlight phone menu,
//   so the site's Header override adds a menu button (popovertarget) and a
//   popover that holds the same menu.
// - Starlight Page.astro renders Footer at the end of every page's content,
//   splash pages included; the site's Footer override keeps Starlight's footer
//   and adds the site links after it.
// - aria-current (WAI-ARIA 1.2, §aria-current): "page" on the link to the
//   page itself, "true" on the link to the section the page is in.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { elementTree, elementChildren, hasClass } from '../../scripts/check/lib/html-text.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = join(root, 'dist');

const REPO = 'https://github.com/bharathkontham/polyjose';
const MENU = [
	['Get started', '/start/rust/'],
	['Docs', '/guides/sign-and-verify/'],
	['GitHub', REPO],
];
const FOOTER = [
	['Docs', '/guides/sign-and-verify/'],
	['Get started', '/start/rust/'],
	['GitHub', REPO],
	['Docs source', 'https://github.com/bharathkontham/polyjose-docs'],
	['Releases', `${REPO}/releases`],
	['Changelog', `${REPO}/blob/main/CHANGELOG.md`],
];

// page → [its aria-current per menu link, whether it has a sidebar]
const PAGES = {
	'index.html': { current: [null, null, null], sidebar: false },
	'start/rust/index.html': { current: ['page', null, null], sidebar: true },
	'guides/sign-and-verify/index.html': { current: [null, 'page', null], sidebar: true },
	'concepts/algorithms/index.html': { current: [null, 'true', null], sidebar: true },
};

const built = Object.keys(PAGES).every((p) => existsSync(join(dist, p)));
const skip = built ? false : 'dist/ is not built; run `npm run build` first';

function findAll(node, match, out = []) {
	for (const el of elementChildren(node)) {
		if (match(el)) out.push(el);
		findAll(el, match, out);
	}
	return out;
}

const textOf = (node) => node.children.map((c) => (c.name === undefined ? c.text : textOf(c))).join('');

/** The links of a nav: [visible text, href, aria-current or null, the <a>]. */
function links(nav) {
	return findAll(nav, (el) => el.name === 'a').map((a) => {
		const shown = a.children.filter((c) => c.name === undefined || !hasClass(c, 'sr-only'));
		const text = shown.map((c) => (c.name === undefined ? c.text : textOf(c))).join('').replace(/\s+/g, ' ').trim();
		return [text, a.attrs.get('href'), a.attrs.get('aria-current') ?? null, a];
	});
}

const isNav = (label) => (el) => el.name === 'nav' && el.attrs.get('aria-label') === label;
const within = (el, match) => {
	for (let e = el.parent; e; e = e.parent) if (match(e)) return true;
	return false;
};

for (const [page, expected] of Object.entries(PAGES)) {
	describe(`site menu and footer in dist/${page}`, () => {
		const tree = () => elementTree(readFileSync(join(dist, page), 'utf8'));

		test('the header menu links to Get started, Docs and GitHub', { skip }, () => {
			const header = findAll(tree(), (el) => el.name === 'header' && hasClass(el, 'header'));
			assert.equal(header.length, 1, 'one page header');
			const navs = findAll(header[0], isNav('Site'));
			assert.ok(navs.length >= 1, 'the header has nav "Site"');
			for (const nav of navs) {
				const got = links(nav);
				assert.deepEqual(got.map(([t, h]) => [t, h]), MENU);
				assert.deepEqual(got.map(([, , c]) => c), expected.current, 'aria-current');
				// Every link opens in the same tab.
				for (const [, , , a] of got) assert.equal(a.attrs.has('target'), false, `${a.attrs.get('href')}: no target`);
				// The GitHub link keeps the GitHub icon, decorative next to its text.
				const svg = findAll(got[2][3], (el) => el.name === 'svg');
				assert.equal(svg.length, 1, 'the GitHub link has its icon');
				assert.equal(svg[0].attrs.get('aria-hidden'), 'true', 'the icon is decorative');
			}
		});

		test('on a phone the menu is in a menu: Starlight\'s, or the site\'s own', { skip }, () => {
			const doc = tree();
			const sidebarMenu = findAll(doc, (el) => isNav('Site')(el) && within(el, (p) => p.attrs?.get('id') === 'starlight__sidebar'));
			const buttons = findAll(doc, (el) => el.name === 'button' && el.attrs.get('popovertarget') === 'site-menu');
			const popovers = findAll(doc, (el) => el.attrs.get('id') === 'site-menu');
			if (expected.sidebar) {
				assert.equal(sidebarMenu.length, 1, 'Starlight\'s menu holds the site menu');
				assert.equal(buttons.length + popovers.length, 0, 'no second menu button');
			} else {
				assert.equal(buttons.length, 1, 'one site menu button');
				assert.equal(popovers.length, 1, 'one site menu popover');
				assert.ok(popovers[0].attrs.has('popover'), 'it is a popover');
				assert.ok(textOf(buttons[0]).trim().length > 0, 'the button has a name');
				const inside = findAll(popovers[0], isNav('Site'));
				assert.equal(inside.length, 1, 'the popover holds the site menu');
				assert.deepEqual(links(inside[0]).map(([t, h]) => [t, h]), MENU);
			}
		});

		test('the footer links to the docs, Get started, GitHub, the docs source, releases and the changelog', { skip }, () => {
			const main = findAll(tree(), (el) => el.name === 'main');
			assert.equal(main.length, 1);
			const navs = findAll(main[0], isNav('Footer'));
			assert.equal(navs.length, 1, 'one footer nav');
			assert.deepEqual(links(navs[0]).map(([t, h]) => [t, h]), FOOTER);
			// It comes after Starlight's own footer, which stays.
			const footers = findAll(main[0], (el) => el.name === 'footer');
			assert.equal(footers.length, 1, 'Starlight\'s footer is kept');
			const order = findAll(main[0], (el) => el === footers[0] || el === navs[0]);
			assert.deepEqual(order, [footers[0], navs[0]], 'the links follow Starlight\'s footer');
		});

		test('every internal link of the menu and the footer is a built page', { skip }, () => {
			for (const [, href] of [...MENU, ...FOOTER]) {
				if (!href.startsWith('/')) continue;
				assert.ok(existsSync(join(dist, href, 'index.html')), `${href} is built`);
			}
		});
	});
}
