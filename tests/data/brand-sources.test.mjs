// Checks for the brand sources in brand/: the SVGs in brand/src/, the usage
// guide (brand/README.md) and the font credit (brand/CREDITS.md). No browser
// is needed: the SVGs are parsed as text, and their geometry is computed from
// the shape coordinates.
//
// What is checked, and why:
// - Every source is one well-formed <svg> root with the SVG namespace, a
//   viewBox and a <title>, and has nothing that needs a font, a script or the
//   network: the files are served as-is and shown in READMEs and registries.
// - The mark and lockup colours match the colour table in brand/README.md, so
//   the guide and the artwork can't drift apart.
// - favicon.svg has a dark prefers-color-scheme block.
// - The icon shapes stay inside the zones the platforms crop to: the maskable
//   icon's safe circle (radius 40% of the size, W3C Web App Manifest,
//   "maskable" purpose), the avatar's inscribed circle (avatars render round)
//   and the app icon's padding.
// - The social images have the exact sizes the sites ask for (1200x630 for
//   Open Graph, 1280x640 for GitHub, with the content inside the central
//   1200x600) and an opaque background.
// - No font file is kept in brand/: the wordmark is outlined (SIL OFL 1.1
//   allows that) and no font is redistributed.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPrivateRefs } from '../../scripts/check/private-refs.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const brand = join(root, 'brand');
const src = join(brand, 'src');

/** Every SVG source the brand guide documents. */
export const SOURCES = [
	'mark-light.svg',
	'mark-dark.svg',
	'lockup-light.svg',
	'lockup-dark.svg',
	'favicon.svg',
	'app-icon.svg',
	'app-icon-maskable.svg',
	'avatar.svg',
	'og.svg',
	'social-preview.svg',
];

const SVG_NS = 'http://www.w3.org/2000/svg';

function readSource(name) {
	const file = join(src, name);
	assert.ok(existsSync(file), `missing brand/src/${name}`);
	return readFileSync(file, 'utf8');
}

// ---------------------------------------------------------------- XML

/**
 * A small XML reader for the hand-written sources: elements, attributes and
 * text. Throws on an unbalanced or malformed tag, a duplicate attribute, a
 * stray "<", or anything other than exactly one root element.
 */
export function parseXml(text) {
	const body = text.replace(/^﻿?\s*<\?xml[^?]*\?>/, '').replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length));
	const top = { name: '#document', attrs: {}, children: [], text: '' };
	const stack = [top];
	const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>|</g;
	let last = 0;
	for (const m of body.matchAll(tag)) {
		stack.at(-1).text += body.slice(last, m.index);
		last = m.index + m[0].length;
		if (m[0] === '<') throw new Error(`malformed tag at offset ${m.index}`);
		const [, closing, name, rawAttrs, selfClosing] = m;
		if (closing) {
			if (rawAttrs.trim() || selfClosing) throw new Error(`malformed closing tag </${name}>`);
			const open = stack.pop();
			if (!open || open.name !== name) throw new Error(`</${name}> closes <${open?.name}>`);
			continue;
		}
		const attrs = {};
		for (const a of rawAttrs.matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
			if (a[1] in attrs) throw new Error(`duplicate attribute ${a[1]} on <${name}>`);
			attrs[a[1]] = a[2] ?? a[3];
		}
		const el = { name, attrs, children: [], text: '', parent: stack.at(-1) };
		stack.at(-1).children.push(el);
		if (!selfClosing) stack.push(el);
	}
	stack.at(-1).text += body.slice(last);
	if (stack.length !== 1) throw new Error(`<${stack.at(-1).name}> is not closed`);
	if (top.children.length !== 1) throw new Error(`expected one root element, found ${top.children.length}`);
	if (top.text.trim()) throw new Error('text outside the root element');
	return top.children[0];
}

/** Every element in the tree, depth first. */
function* walk(el) {
	yield el;
	for (const c of el.children) yield* walk(c);
}

function viewBoxOf(svg) {
	const v = (svg.attrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
	assert.equal(v.length, 4, 'viewBox has four numbers');
	assert.ok(v.every(Number.isFinite), 'viewBox numbers are finite');
	const [x, y, w, h] = v;
	return { x, y, w, h };
}

// ---------------------------------------------------------------- geometry

/**
 * The transform of one `transform` attribute as { s, tx, ty } (uniform scale,
 * then translate). Only translate and uniform scale are used in the sources;
 * anything else throws, so a check can never pass on geometry it misread.
 */
export function parseTransform(value = '') {
	let t = { s: 1, tx: 0, ty: 0 };
	for (const m of value.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
		const n = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
		let step;
		if (m[1] === 'translate') step = { s: 1, tx: n[0], ty: n[1] ?? 0 };
		else if (m[1] === 'scale' && (n.length === 1 || n[0] === n[1])) step = { s: n[0], tx: 0, ty: 0 };
		else throw new Error(`unsupported transform ${m[0]}`);
		t = compose(t, step);
	}
	if (value.replace(/(\w+)\s*\([^)]*\)/g, '').trim()) throw new Error(`unsupported transform "${value}"`);
	return t;
}

/** outer ∘ inner: apply `inner` first. */
function compose(outer, inner) {
	return { s: outer.s * inner.s, tx: outer.s * inner.tx + outer.tx, ty: outer.s * inner.ty + outer.ty };
}

/** The transform from an element's coordinates to the root's user space. */
function ctm(el) {
	let t = { s: 1, tx: 0, ty: 0 };
	for (let e = el; e && e.name !== '#document'; e = e.parent) {
		if (e.name !== 'svg') t = compose(parseTransform(e.attrs.transform), t);
	}
	return t;
}

/**
 * Points of an arc (SVG 1.1 implementation notes F.6.5, circular arcs only:
 * every arc in the sources has rx = ry and no rotation), sampled densely.
 */
function arcPoints(x0, y0, r, large, sweep, x1, y1) {
	if (r === 0 || (x0 === x1 && y0 === y1)) return [[x1, y1]];
	const hx = (x0 - x1) / 2;
	const hy = (y0 - y1) / 2;
	const lambda = (hx * hx + hy * hy) / (r * r);
	if (lambda > 1) r *= Math.sqrt(lambda);
	const num = r * r * r * r - r * r * hy * hy - r * r * hx * hx;
	const den = r * r * hy * hy + r * r * hx * hx;
	const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
	const cxp = coef * hy;
	const cyp = -coef * hx;
	const cx = cxp + (x0 + x1) / 2;
	const cy = cyp + (y0 + y1) / 2;
	const a0 = Math.atan2((hy - cyp) / r, (hx - cxp) / r);
	let da = Math.atan2((-hy - cyp) / r, (-hx - cxp) / r) - a0;
	if (sweep && da < 0) da += 2 * Math.PI;
	if (!sweep && da > 0) da -= 2 * Math.PI;
	const pts = [];
	for (let i = 0; i <= 128; i++) {
		const a = a0 + (da * i) / 128;
		pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
	}
	return pts;
}

/**
 * The points that bound a path: every vertex, every Bézier control point (a
 * Bézier curve lies inside the convex hull of its control points, so this is
 * conservative) and dense samples of every arc.
 */
export function pathPoints(d) {
	const tokens = [...d.matchAll(/[MmLlHhVvCcQqAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)].map((m) => m[0]);
	const rest = d.replace(/[MmLlHhVvCcQqAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[\s,]/g, '');
	if (rest) throw new Error(`unsupported path data "${rest.slice(0, 20)}"`);
	const pts = [];
	let i = 0;
	let cmd = '';
	let x = 0;
	let y = 0;
	let sx = 0;
	let sy = 0;
	const num = () => {
		const v = Number(tokens[i++]);
		if (!Number.isFinite(v)) throw new Error(`expected a number in path data at token ${i - 1}`);
		return v;
	};
	while (i < tokens.length) {
		if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
		else if (!cmd) throw new Error('path data must start with a command');
		const rel = cmd === cmd.toLowerCase();
		const ox = rel ? x : 0;
		const oy = rel ? y : 0;
		switch (cmd.toUpperCase()) {
			case 'M':
				x = ox + num();
				y = oy + num();
				sx = x;
				sy = y;
				pts.push([x, y]);
				cmd = rel ? 'l' : 'L';
				break;
			case 'L':
				x = ox + num();
				y = oy + num();
				pts.push([x, y]);
				break;
			case 'H':
				x = ox + num();
				pts.push([x, y]);
				break;
			case 'V':
				y = oy + num();
				pts.push([x, y]);
				break;
			case 'C':
				for (let k = 0; k < 3; k++) pts.push([ox + num(), oy + num()]);
				[x, y] = pts.at(-1);
				break;
			case 'Q':
				for (let k = 0; k < 2; k++) pts.push([ox + num(), oy + num()]);
				[x, y] = pts.at(-1);
				break;
			case 'A': {
				const rx = num();
				const ry = num();
				const rot = num();
				const large = num();
				const sweep = num();
				const x1 = ox + num();
				const y1 = oy + num();
				if (rx !== ry || rot !== 0) throw new Error('only circular, unrotated arcs are supported');
				pts.push(...arcPoints(x, y, Math.abs(rx), large, sweep, x1, y1));
				x = x1;
				y = y1;
				break;
			}
			case 'Z':
				x = sx;
				y = sy;
				break;
			default:
				throw new Error(`unsupported path command ${cmd}`);
		}
	}
	return pts;
}

const n = (el, a) => {
	const v = Number(el.attrs[a] ?? 0);
	assert.ok(Number.isFinite(v), `<${el.name}> ${a} is a number`);
	return v;
};

/**
 * The shapes of one element in root user space, as discs { x, y, r }: a point
 * is a disc of radius 0. Rounded rect corners are treated as square
 * (conservative). Elements that draw nothing return []. Unknown drawing
 * elements throw.
 */
export function discsOf(el) {
	const t = ctm(el);
	const P = ([px, py]) => ({ x: t.s * px + t.tx, y: t.s * py + t.ty, r: 0 });
	switch (el.name) {
		case 'rect': {
			const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => n(el, a));
			return [P([x, y]), P([x + w, y]), P([x, y + h]), P([x + w, y + h])];
		}
		case 'circle':
			return [{ ...P([n(el, 'cx'), n(el, 'cy')]), r: t.s * n(el, 'r') }];
		case 'path':
			return pathPoints(el.attrs.d ?? '').map(P);
		case 'polygon':
		case 'polyline': {
			const v = (el.attrs.points ?? '').trim().split(/[\s,]+/).map(Number);
			const out = [];
			for (let k = 0; k + 1 < v.length; k += 2) out.push(P([v[k], v[k + 1]]));
			return out;
		}
		case 'svg':
		case 'g':
		case 'title':
		case 'desc':
		case 'style':
			return [];
		default:
			throw new Error(`no geometry rule for <${el.name}>`);
	}
}

/** The drawn discs of every shape in the file except the background. */
function contentDiscs(svg) {
	return [...walk(svg)].filter((el) => !hasClass(el, 'bg')).flatMap(discsOf);
}

function bboxOf(discs) {
	return {
		x0: Math.min(...discs.map((d) => d.x - d.r)),
		y0: Math.min(...discs.map((d) => d.y - d.r)),
		x1: Math.max(...discs.map((d) => d.x + d.r)),
		y1: Math.max(...discs.map((d) => d.y + d.r)),
	};
}

const hasClass = (el, c) => (el.attrs.class ?? '').split(/\s+/).includes(c);

/** The background: a rect with class "bg" that exactly covers the viewBox, with a solid fill. */
function assertOpaqueBackground(svg, name) {
	const vb = viewBoxOf(svg);
	const bg = [...walk(svg)].filter((el) => hasClass(el, 'bg'));
	assert.equal(bg.length, 1, `${name}: one element with class "bg"`);
	const [r] = bg;
	assert.equal(r.name, 'rect', `${name}: the background is a <rect>`);
	assert.equal(r.parent, svg, `${name}: the background is a direct child of <svg>`);
	assert.equal(svg.children.find((c) => !['title', 'desc', 'style'].includes(c.name)), r, `${name}: the background is drawn first`);
	assert.deepEqual(
		['x', 'y', 'width', 'height'].map((a) => n(r, a)),
		[vb.x, vb.y, vb.w, vb.h],
		`${name}: the background covers the whole viewBox`,
	);
	assert.ok(!r.attrs.rx && !r.attrs.ry, `${name}: the background has square corners`);
	assert.match(r.attrs.fill ?? '', /^#[0-9A-Fa-f]{6}$/, `${name}: the background fill is a solid colour`);
	for (const a of ['opacity', 'fill-opacity', 'transform']) assert.ok(!(a in r.attrs), `${name}: the background has no ${a}`);
}

// ---------------------------------------------------------------- README colour table

/**
 * The colour table under "## Colours" in brand/README.md: one row per role,
 * `| Role | `class` | `#light` | `#dark` |`. Returns { class: { light, dark } }.
 */
export function readPalette(readme) {
	const section = readme.split(/^## /m).find((s) => /^Colou?rs\b/i.test(s));
	assert.ok(section, 'brand/README.md has a "## Colours" section');
	const roles = {};
	for (const line of section.split('\n')) {
		const m = line.match(/^\|[^|]+\|\s*`([a-z]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/);
		if (m) roles[m[1]] = { light: m[2].toUpperCase(), dark: m[3].toUpperCase() };
	}
	return roles;
}

/** Background colours for the opaque icons and social images, from the line "Background: `#hex`". */
function readBackground(readme) {
	const m = readme.match(/^Background[^`\n]*`(#[0-9A-Fa-f]{6})`/m);
	assert.ok(m, 'brand/README.md names the background colour as "Background: `#RRGGBB`"');
	return m[1].toUpperCase();
}

function readText(name) {
	const file = join(brand, name);
	assert.ok(existsSync(file), `missing brand/${name}`);
	return readFileSync(file, 'utf8');
}

/** The colour of a fill on `el` or the nearest ancestor that sets one. */
function fillOf(el) {
	for (let e = el; e && e.name !== '#document'; e = e.parent) if (e.attrs.fill) return e.attrs.fill.toUpperCase();
	return null;
}

function colours(text) {
	return new Set([...text.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase()));
}

/** The `.class{fill:#hex}` rules inside the prefers-color-scheme: dark block of a <style>. */
function darkRules(styleText) {
	const m = styleText.match(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{([\s\S]*)\}\s*$/);
	if (!m) return null;
	const rules = {};
	for (const r of m[1].matchAll(/\.([a-z]+)\s*\{\s*fill\s*:\s*(#[0-9A-Fa-f]{6})\s*;?\s*\}/g)) rules[r[1]] = r[2].toUpperCase();
	return rules;
}

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
function luminance(hex) {
	const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	const [r, g, b] = v.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
export function contrast(a, b) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------- tests

describe('brand/src SVG sources', () => {
	for (const name of SOURCES) {
		test(`${name} is one well-formed <svg> with a viewBox and a <title>`, () => {
			const text = readSource(name);
			const svg = parseXml(text);
			assert.equal(svg.name, 'svg', 'the root element is <svg>');
			assert.equal(svg.attrs.xmlns, SVG_NS, 'the root has the SVG namespace');
			const vb = viewBoxOf(svg);
			assert.ok(vb.w > 0 && vb.h > 0, 'the viewBox has a positive size');
			const title = svg.children.find((c) => c.name === 'title');
			assert.ok(title && title.text.trim(), 'a non-empty <title> is a direct child of <svg>');
		});

		test(`${name} needs no font, script, raster or network`, () => {
			const text = readSource(name);
			for (const [re, what] of [
				[/<text\b/i, '<text>'],
				[/<image\b/i, '<image>'],
				[/<script\b/i, '<script>'],
				[/<foreignObject\b/i, '<foreignObject>'],
				[/href\s*=\s*["']\s*https?:/i, 'an external href'],
				[/href\s*=\s*["']\s*(?!#)/i, 'a non-fragment href'],
				[/font-family/i, 'font-family'],
				[/@font-face|@import/i, 'a CSS import or font'],
				[/url\(\s*["']?\s*(?!#)/i, 'an external url()'],
				[/\son[a-z]+\s*=/i, 'an event handler attribute'],
				[/data:/i, 'a data: URL'],
			]) {
				assert.doesNotMatch(text, re, `${name} must not contain ${what}`);
			}
		});
	}
});

describe('colours match the table in brand/README.md', () => {
	const palette = () => readPalette(readText('README.md'));

	test('the table has the tile, letter, keyhole and wordmark roles', () => {
		assert.deepEqual(Object.keys(palette()).sort(), ['ink', 'key', 'letter', 'tile']);
	});

	for (const scheme of ['light', 'dark']) {
		for (const kind of ['mark', 'lockup']) {
			const name = `${kind}-${scheme}.svg`;
			test(`${name} uses the ${scheme} colours of each role`, () => {
				const roles = palette();
				const svg = parseXml(readSource(name));
				const expected = kind === 'mark' ? ['tile', 'letter', 'key'] : ['tile', 'letter', 'key', 'ink'];
				for (const role of expected) {
					const els = [...walk(svg)].filter((el) => hasClass(el, role));
					assert.ok(els.length > 0, `${name} has an element with class "${role}"`);
					for (const el of els) assert.equal(fillOf(el), roles[role][scheme], `${name}: .${role} fill`);
				}
				const allowed = new Set(expected.map((r) => roles[r][scheme]));
				for (const c of colours(readSource(name))) assert.ok(allowed.has(c), `${name}: ${c} is not a ${scheme} ${kind} colour`);
			});
		}
	}

	test('favicon.svg: light colours by default, dark colours in a prefers-color-scheme: dark block', () => {
		const roles = palette();
		const svg = parseXml(readSource('favicon.svg'));
		for (const role of ['tile', 'letter', 'key']) {
			const els = [...walk(svg)].filter((el) => hasClass(el, role));
			assert.ok(els.length > 0, `favicon.svg has an element with class "${role}"`);
			for (const el of els) assert.equal(fillOf(el), roles[role].light, `favicon.svg: default .${role} fill is the light colour`);
		}
		const style = [...walk(svg)].find((el) => el.name === 'style');
		assert.ok(style, 'favicon.svg has a <style>');
		const rules = darkRules(style.text.trim());
		assert.ok(rules, 'the <style> is an @media (prefers-color-scheme: dark) block');
		for (const role of ['tile', 'letter', 'key']) {
			if (roles[role].light !== roles[role].dark) {
				assert.equal(rules[role], roles[role].dark, `favicon.svg: dark .${role} fill`);
			}
		}
		for (const [cls, c] of Object.entries(rules)) assert.equal(c, roles[cls]?.dark, `favicon.svg: dark rule .${cls} uses the dark colour`);
	});

	// R4: the favicon's light colours must also read on a dark tab strip,
	// because some browsers (Safari 26, Firefox's stored icons) ignore the dark
	// media query in SVG favicons. For a tiled mark the tile is the ground and
	// the letter carries the shape: on a light strip the tile's silhouette
	// shows, and on a dark strip the white p does, inside its own opaque tile.
	// So contrast is measured on the fill that carries the shape on each
	// strip, not on the tile against the dark strip.
	test('favicon.svg: the light colours read on light and dark tab strips (3:1, WCAG 2.x contrast)', () => {
		const roles = palette();
		const tile = roles.tile.light;
		const letter = roles.letter.light;
		assert.ok(contrast(tile, '#FFFFFF') >= 3, `tile ${tile} on a light strip #FFFFFF: ${contrast(tile, '#FFFFFF').toFixed(2)}:1`);
		assert.ok(contrast(letter, tile) >= 3, `letter ${letter} on the tile ${tile}: ${contrast(letter, tile).toFixed(2)}:1`);
		assert.ok(contrast(letter, '#202124') >= 3, `letter ${letter} on a dark strip #202124: ${contrast(letter, '#202124').toFixed(2)}:1`);
	});

	test('the icons and social images use only palette colours', () => {
		const readme = readText('README.md');
		const roles = readPalette(readme);
		const allowed = new Set([readBackground(readme), ...Object.values(roles).flatMap((r) => [r.light, r.dark])]);
		for (const name of ['app-icon.svg', 'app-icon-maskable.svg', 'avatar.svg', 'og.svg', 'social-preview.svg']) {
			for (const c of colours(readSource(name))) assert.ok(allowed.has(c), `${name}: ${c} is not in the palette`);
		}
	});
});

describe('icons stay inside the platform crop zones', () => {
	for (const name of ['app-icon.svg', 'app-icon-maskable.svg', 'avatar.svg']) {
		test(`${name} is an opaque square`, () => {
			const svg = parseXml(readSource(name));
			const vb = viewBoxOf(svg);
			assert.equal(vb.w, vb.h, `${name} is square`);
			assertOpaqueBackground(svg, name);
		});
	}

	test('app-icon-maskable.svg: every shape of the mark lies inside the centred circle of radius 40% (W3C manifest safe zone)', () => {
		const svg = parseXml(readSource('app-icon-maskable.svg'));
		const vb = viewBoxOf(svg);
		const cx = vb.x + vb.w / 2;
		const cy = vb.y + vb.h / 2;
		const discs = contentDiscs(svg);
		assert.ok(discs.length > 0, 'the mark has shapes');
		const far = Math.max(...discs.map((d) => Math.hypot(d.x - cx, d.y - cy) + d.r));
		assert.ok(far <= 0.4 * vb.w, `farthest point ${far.toFixed(3)} is outside the safe circle ${0.4 * vb.w}`);
	});

	test('avatar.svg: every shape of the mark lies inside the inscribed circle (avatars render round)', () => {
		const svg = parseXml(readSource('avatar.svg'));
		const vb = viewBoxOf(svg);
		const cx = vb.x + vb.w / 2;
		const cy = vb.y + vb.h / 2;
		const far = Math.max(...contentDiscs(svg).map((d) => Math.hypot(d.x - cx, d.y - cy) + d.r));
		assert.ok(far <= 0.5 * vb.w, `farthest point ${far.toFixed(3)} is outside the inscribed circle ${0.5 * vb.w}`);
	});

	test('app-icon.svg: the mark keeps at least 11% padding on every side (20 px of 180)', () => {
		const svg = parseXml(readSource('app-icon.svg'));
		const vb = viewBoxOf(svg);
		const b = bboxOf(contentDiscs(svg));
		const pad = (20 / 180) * vb.w - 1e-9;
		assert.ok(b.x0 - vb.x >= pad, `left padding ${b.x0 - vb.x}`);
		assert.ok(b.y0 - vb.y >= pad, `top padding ${b.y0 - vb.y}`);
		assert.ok(vb.x + vb.w - b.x1 >= pad, `right padding ${vb.x + vb.w - b.x1}`);
		assert.ok(vb.y + vb.h - b.y1 >= pad, `bottom padding ${vb.y + vb.h - b.y1}`);
	});
});

describe('social images', () => {
	for (const [name, w, h, safe] of [
		['og.svg', 1200, 630, { w: 1200, h: 630 }],
		['social-preview.svg', 1280, 640, { w: 1200, h: 600 }],
	]) {
		test(`${name} is exactly ${w}x${h} with an opaque background`, () => {
			const svg = parseXml(readSource(name));
			assert.deepEqual(viewBoxOf(svg), { x: 0, y: 0, w, h }, `${name} viewBox`);
			assert.equal(svg.attrs.width, String(w), `${name} width`);
			assert.equal(svg.attrs.height, String(h), `${name} height`);
			assertOpaqueBackground(svg, name);
		});

		test(`${name}: all content lies inside the central ${safe.w}x${safe.h}`, () => {
			const svg = parseXml(readSource(name));
			const b = bboxOf(contentDiscs(svg));
			const x0 = (w - safe.w) / 2;
			const y0 = (h - safe.h) / 2;
			assert.ok(b.x0 >= x0 && b.x1 <= x0 + safe.w, `content x ${b.x0.toFixed(1)}..${b.x1.toFixed(1)} is outside ${x0}..${x0 + safe.w}`);
			assert.ok(b.y0 >= y0 && b.y1 <= y0 + safe.h, `content y ${b.y0.toFixed(1)}..${b.y1.toFixed(1)} is outside ${y0}..${y0 + safe.h}`);
		});
	}
});

describe('usage guide and credits', () => {
	test('brand/README.md has the usage sections', () => {
		const readme = readText('README.md');
		const headings = [...readme.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim().toLowerCase());
		for (const h of ['files', 'minimum sizes', 'clear space', 'colours', "do and don't"]) {
			assert.ok(headings.some((x) => x.startsWith(h)), `brand/README.md has a "## ${h}" section`);
		}
		for (const name of SOURCES) assert.ok(readme.includes(name), `brand/README.md says where ${name} is used`);
		assert.match(readme, /16\s*px/, 'minimum mark size 16 px');
		assert.match(readme, /20\s*px/, 'minimum lockup height 20 px');
		assert.match(readme, /0\.25/, 'clear space of 0.25 x the mark width');
		assert.match(readme, /derived works of other marks are not allowed/i);
	});

	test('brand/CREDITS.md credits Inter 4.1 under the SIL OFL 1.1', () => {
		const credits = readText('CREDITS.md');
		for (const s of [
			'Inter',
			'4.1',
			'The Inter Project Authors',
			'SIL Open Font License',
			'1.1',
			'https://openfontlicense.org',
			'9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e',
		]) {
			assert.ok(credits.includes(s), `brand/CREDITS.md mentions ${s}`);
		}
		assert.match(credits, /outline/i, 'says the glyphs were converted to outlines');
		assert.match(credits, /no font file is (?:redistributed|stored|included)/i, 'says no font file is redistributed');
	});

	test('brand/tools/outline.mjs documents how the outlines were made', () => {
		const tool = readText('tools/outline.mjs');
		assert.match(tool, /fontkitten/);
		assert.match(tool, /InterDisplay-SemiBold/);
	});
});

describe('brand/ files', () => {
	const files = () => {
		const out = [];
		const visit = (dir) => {
			for (const e of readdirSync(dir)) {
				const p = join(dir, e);
				if (statSync(p).isDirectory()) visit(p);
				else out.push(p);
			}
		};
		visit(brand);
		return out;
	};

	test('no font binary is kept in brand/', () => {
		for (const f of files()) {
			const rel = relative(root, f);
			assert.ok(!['.ttf', '.otf', '.woff', '.woff2', '.ttc', '.eot'].includes(extname(f).toLowerCase()), `${rel} is a font file`);
			const head = readFileSync(f).subarray(0, 4);
			const magic = head.toString('latin1');
			assert.ok(
				!['wOFF', 'wOF2', 'OTTO', 'true', 'ttcf'].includes(magic) && !head.equals(Buffer.from([0, 1, 0, 0])),
				`${rel} is a font file`,
			);
		}
	});

	test('no internal identifier or local path in brand/ (these files are published)', () => {
		// The exported PNG and ICO files are compressed pixel data, where short
		// letter-number runs such as "F25" turn up by chance. They are scanned
		// with the asset patterns only, as lint:refs scans built images; text
		// files (SVG, Markdown, scripts) get the full pattern set.
		const binary = new Set(['.png', '.ico']);
		for (const f of files()) {
			const asset = binary.has(extname(f).toLowerCase());
			const found = findPrivateRefs(readFileSync(f, 'utf8'), { asset });
			assert.deepEqual(found, [], `${relative(root, f)}: ${found.map((x) => `line ${x.line} "${x.match}" (${x.label})`).join(', ')}`);
		}
	});
});
