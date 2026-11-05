// Content tests for the landing page, About › Why polyjose and Reference › API
// reference. They read the built HTML, so run `npm run build` first.
//
// The rules come from the site's honesty rules (README, "Writing rules"):
// pre-1.0 is stated, polyjose is never called audited, no unmeasured numbers,
// other JOSE libraries are named with respect, and links that would point at
// pages that don't exist yet are not links.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

function load(route) {
	const file = `${dist}${route}index.html`;
	assert.ok(existsSync(file), `missing ${file}: run \`npm run build\` before this test`);
	return readFileSync(file, 'utf8');
}

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Visible text of an HTML fragment, one line per block element. */
export function textOf(html) {
	return html
		.replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, '')
		.replace(/<\/(p|li|h[1-6]|td|th|dt|dd|div|blockquote|tr)>|<br\s*\/?>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
			if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
			return entities[e] ?? m;
		})
		.replace(/[ \t]+/g, ' ')
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.join('\n');
}

/** The page's own content, without the header, the banner or the footer. */
function bodyOf(html) {
	const start = html.indexOf('class="sl-markdown-content"');
	assert.ok(start > 0, 'no .sl-markdown-content in page');
	const end = html.indexOf('<footer', start);
	return html.slice(start, end > 0 ? end : undefined);
}

/** Every anchor in a fragment, as { href, text }. */
function linksOf(html) {
	return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
		href: m[1],
		text: textOf(m[2]),
	}));
}

/** Text split into sentences (and list items, headings, cells). */
export function sentencesOf(text) {
	return text
		.split('\n')
		.flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z`"(])/))
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 * Sentences that put a number next to a measurable claim (vectors, fuzzing,
 * crate counts, benchmarks). RFC numbers are not claims and are ignored.
 */
export function unmeasuredNumberClaims(text) {
	return sentencesOf(text).filter((s) => {
		if (!/vector|fuzz|crates?\b|benchmark/i.test(s)) return false;
		const withoutRfcs = s.replace(/\bRFCs?\s*\d+(?:\s*(?:[–\-/,]|and|to)\s*(?:RFC\s*)?\d+)*/gi, '');
		return /\d/.test(withoutRfcs);
	});
}

const pages = {
	landing: '',
	about: 'about/why-polyjose/',
	reference: 'reference/api/',
};

describe('the number-claim check itself', () => {
	test('flags digits next to vectors, fuzzing, crates and benchmarks', () => {
		assert.equal(unmeasuredNumberClaims('It passes 1,200 test vectors.').length, 1);
		assert.equal(unmeasuredNumberClaims('We ran 500 hours of fuzzing.').length, 1);
		assert.equal(unmeasuredNumberClaims('The core depends on 12 crates.').length, 1);
		assert.equal(unmeasuredNumberClaims('It is 3x faster in our benchmarks.').length, 1);
	});
	test('ignores RFC numbers and sentences without those words', () => {
		assert.equal(unmeasuredNumberClaims('Every algorithm ships with the RFC 7520 test vectors.').length, 0);
		assert.equal(unmeasuredNumberClaims('Test vectors from RFC 7515, RFC 7516 and RFC 7520 run everywhere.').length, 0);
		assert.equal(unmeasuredNumberClaims('It implements RFC 7518 and RFC 9864.').length, 0);
	});
});

for (const [name, route] of Object.entries(pages)) {
	describe(`${name} page: site-wide rules`, () => {
		const html = load(route);
		const text = textOf(bodyOf(html));
		test('carries the pre-1.0 banner', () => {
			assert.match(html, /data-prerelease-notice/);
		});
		test('never says constant-time (only the Security pages may)', () => {
			assert.doesNotMatch(textOf(html), /constant[- ]time/i);
		});
		test('makes no unmeasured number claims', () => {
			assert.deepEqual(unmeasuredNumberClaims(text), []);
		});
		test('never describes polyjose as audited', () => {
			assert.doesNotMatch(
				textOf(html),
				/polyjose[^.]{0,60}\b(is|has been|was|are)\s+(independently\s+|professionally\s+)?audited\b/i,
			);
		});
	});
}

describe('landing page', () => {
	const html = load(pages.landing);
	const body = bodyOf(html);
	const text = textOf(body);

	test('uses the splash template with the tagline', () => {
		assert.match(html, /<html[^>]*\bdata-has-hero\b/);
		assert.doesNotMatch(html, /id="starlight__sidebar"/);
		const tagline = html.match(/<div class="tagline[^"]*">([\s\S]*?)<\/div>/);
		assert.ok(tagline, 'no hero tagline');
		assert.equal(textOf(tagline[1]), 'One JOSE implementation, every platform.');
	});

	test('the hero has "Get started" and "Why polyjose"', () => {
		const actions = html.match(/<div class="sl-flex actions[^"]*">([\s\S]*?)<\/div>/);
		assert.ok(actions, 'no hero actions');
		assert.deepEqual(linksOf(actions[1]), [
			{ href: '/start/rust/', text: 'Get started' },
			{ href: '/about/why-polyjose/', text: 'Why polyjose' },
		]);
	});

	test('a card grid links each of the five platforms to its get-started page', () => {
		assert.ok((body.match(/class="card-grid/g) ?? []).length >= 2, 'expected a platform grid and a security grid');
		const hrefs = linksOf(body).map((l) => l.href);
		for (const p of ['rust', 'node', 'web', 'android', 'apple']) {
			assert.ok(hrefs.includes(`/start/${p}/`), `no card for /start/${p}/`);
		}
	});

	test('three cards link the security pages', () => {
		const cards = [...body.matchAll(/<div class="sl-link-card[\s\S]*?<a\b[^>]*href="(\/security\/[^"]+)"/g)].map((m) => m[1]);
		assert.equal(new Set(cards).size, 3, `security cards: ${cards.join(', ')}`);
	});

	test('the body states pre-1.0 and not yet published', () => {
		assert.match(text, /pre-1\.0/i);
		assert.match(text, /not (yet )?published|not been published|nothing is published/i);
	});

	test('never uses the word "audited"', () => {
		assert.doesNotMatch(textOf(html), /audited/i);
	});
});

describe('About › Why polyjose', () => {
	const html = load(pages.about);
	const body = bodyOf(html);
	const text = textOf(body);
	const sentences = sentencesOf(text);

	test('opens with the one-line pitch', () => {
		assert.match(text, /One JOSE implementation, every platform\./);
	});

	test('covers the problem, the differences, the audience and the license', () => {
		const headings = [...body.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => textOf(m[1]));
		for (const re of [/problem/i, /different/i, /who/i, /open source/i]) {
			assert.ok(headings.some((h) => re.test(h)), `no heading matching ${re}: ${headings.join(' | ')}`);
		}
		assert.match(text, /\bMIT\b/);
	});

	test('states pre-1.0 in the body and links the security policy', () => {
		assert.match(text, /pre-1\.0/i);
		assert.ok(linksOf(body).some((l) => l.href === '/security/reporting/'), 'no link to /security/reporting/');
	});

	test('lists every RFC polyjose implements', () => {
		for (const rfc of [7515, 7516, 7517, 7518, 7519, 7520, 7638, 9278, 7797, 8037, 8725, 8812, 9864]) {
			assert.match(text, new RegExp(`RFC ${rfc}\\b`), `RFC ${rfc} missing`);
		}
	});

	test('names the five platforms, with Kotlin as the JVM language', () => {
		for (const re of [/\bRust\b/, /Node\.js/, /WebAssembly|WASM/, /Android/, /Kotlin/, /Swift/]) {
			assert.match(text, re);
		}
		assert.doesNotMatch(text, /Kotlin\/Java/);
		assert.match(text, /\bJava\b[^.\n]*\bworks\b[^.\n]*\bawkward/i);
	});

	test('names panva/jose, Nimbus and JOSESwift with respect', () => {
		for (const name of ['panva/jose', 'Nimbus', 'JOSESwift']) assert.match(text, new RegExp(name));
		const credit = sentences.filter((s) => /panva\/jose/.test(s) && /Nimbus/.test(s) && /JOSESwift/.test(s));
		assert.ok(credit.some((s) => /credit/i.test(s) && /interop/i.test(s)), 'no sentence crediting all three and testing interop');
		const named = sentences.filter((s) => /panva\/jose|Nimbus|JOSESwift/.test(s));
		for (const s of named) {
			assert.doesNotMatch(s, /\b(bugs?|buggy|broken|insecure|poor|worse|flawed|unsafe)\b/i, s);
		}
	});

	test('does not name other libraries by name', () => {
		assert.doesNotMatch(text, /jsonwebtoken|josekit/i);
	});

	test('"audited" appears only as "built to be audited", followed by the no-audit sentence', () => {
		const hits = sentences.map((s, i) => [s, i]).filter(([s]) => /audited/i.test(s));
		assert.ok(hits.length > 0, 'expected the "built to be audited" sentence');
		for (const [s, i] of hits) {
			assert.match(s, /built to be audited/i, s);
			assert.equal((s.match(/audited/gi) ?? []).length, 1, s);
			assert.match(sentences[i + 1] ?? '', /no independent audit of polyjose has been published/i, `after: ${s}`);
		}
	});

	test('contains none of the internal material', () => {
		for (const re of [/go-to engineer/i, /story angles?/i, /proof points?/i, /\bchannels\b/i, /\bADRs?\b/, /outreach/i]) {
			assert.doesNotMatch(text, re);
		}
	});
});

describe('Reference › API reference', () => {
	const html = load(pages.reference);
	const body = bodyOf(html);
	const text = textOf(body);
	const links = linksOf(body);

	test('links the Rust, Kotlin and Swift references', () => {
		for (const href of [
			'https://docs.rs/polyjose',
			'https://javadoc.io/doc/dev.polyjose/polyjose-jvm',
			'https://swiftpackageindex.com/bharathkontham/polyjose/documentation/polyjose',
		]) {
			assert.ok(links.some((l) => l.href === href), `no link to ${href}`);
		}
	});

	test('names /api/js/ for both JavaScript packages, as plain text until it is generated', () => {
		assert.match(text, /\/api\/js\//);
		assert.match(text, /@polyjose\/node/);
		assert.match(text, /@polyjose\/wasm/);
		assert.ok(!links.some((l) => l.href.includes('/api/js')), 'the /api/js/ reference must not be a link yet');
	});

	test('badges each reference "available when 0.1.0 is published"', () => {
		const badges = [...body.matchAll(/<span class="sl-badge[^"]*"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => textOf(m[1]));
		assert.equal(badges.filter((b) => b === 'available when 0.1.0 is published').length, 4, badges.join(' | '));
	});

	test('explains the shared operation names and links Concepts › One API', () => {
		assert.ok(links.some((l) => l.href === '/concepts/one-api/'), 'no link to /concepts/one-api/');
		assert.match(text, /camelCase/);
		assert.match(text, /snake_case/);
	});

	test('never uses the word "audited"', () => {
		assert.doesNotMatch(textOf(html), /audited/i);
	});
});
