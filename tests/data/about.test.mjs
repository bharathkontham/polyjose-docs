// Content tests for the landing page, About › Why polyjose and Reference › API
// reference. They read the built HTML, so run `npm run build` first.
//
// The rules come from the site's honesty rules (README, "Writing rules"):
// no pre-release wording, polyjose is never called audited, no unmeasured numbers,
// other JOSE libraries are named with respect, and links that would point at
// pages that don't exist yet are not links.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePin } from '../../src/lib/samples/pins.mjs';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

/** The parsed pin in samples/pins/<platform>.json. */
function pinOf(platform) {
	const file = fileURLToPath(new URL(`../../samples/pins/${platform}.json`, import.meta.url));
	return parsePin(JSON.parse(readFileSync(file, 'utf8')), platform);
}

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

/**
 * Every href in a whole page (anchors, but also <link> and anything else)
 * whose host is `host` or a subdomain of it.
 */
export function hrefsToHost(html, host) {
	const escaped = host.replace(/[.]/g, '\\.');
	const re = new RegExp(`\\bhref\\s*=\\s*["']?(?:https?:)?//(?:[^/"'\\s>]*\\.)?${escaped}(?=[/:"'\\s>?#]|$)[^"'\\s>]*`, 'gi');
	return [...html.matchAll(re)].map((m) => m[0]);
}

/** Text split into sentences (and list items, headings, cells). */
export function sentencesOf(text) {
	return text
		.split('\n')
		// A sentence starts with a capital, a quote or a bracket, or with one of
		// the lowercase names the site uses at the start of sentences.
		.flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z`"(]|polyjose\b|panva\/jose\b)/))
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 * Sentences that put a number next to a measurable claim (vectors, fuzzing,
 * crate counts, benchmarks). RFC numbers are not claims and are ignored.
 */
export function unmeasuredNumberClaims(text) {
	return sentencesOf(text).filter((s) => {
		// "crates.io" is the registry's name, not a crate count.
		if (!/vector|fuzz|crates?\b(?!\.io)|benchmark/i.test(s)) return false;
		const withoutRfcs = s.replace(/\bRFCs?\s*\d+(?:\s*(?:[–\-/,]|and|to)\s*(?:RFC\s*)?\d+)*/gi, '');
		return /\d/.test(withoutRfcs);
	});
}

/**
 * Sentences that describe testing or checking machinery that doesn't exist yet
 * (conformance runs, interop tests, CI checks, notices files) in the present
 * tense. Such a sentence must say it is planned or a design goal.
 */
export function presentTenseMachineryClaims(text) {
	const topic = /conformance|interop|CI check|allow-?list|THIRD-PARTY-NOTICES/i;
	const planned = /\b(will|planned|plan|designed|meant|aims?|required to)\b|before (0\.1\.0|release)/i;
	return sentencesOf(text).filter((s) => topic.test(s) && !planned.test(s));
}

/** Present-tense phrasings that have been used for things not built yet. */
const notYetTrue = [
	/\btests interoperability against\b/i,
	/\bconformance test vectors run on every platform\b/i,
	/\bconformance tests run on each\b/i,
	/\bA CI check stops\b/i,
	/\bEvery algorithm ships with\b/i,
	/\bnative addon with prebuilt binaries\b/i,
];

/**
 * JWS, JWE and JWT are not built yet, so capabilities are written as the 0.1.0
 * design. These are the present-tense phrasings that said otherwise.
 */
const capabilityStatedAsBuilt = [
	/\bpolyjose is a pure-Rust implementation of\b/i,
	/\bpolyjose implements\b/i,
	/\bMisuse-resistant defaults, following RFC 8725\b/i,
];

/** The sentence that frames the About page's list as the 0.1.0 design. */
const framingSentence = /This list describes polyjose 0\.1\.0 as designed\./;

const pages = {
	landing: '',
	about: 'about/why-polyjose/',
	reference: 'reference/api/',
};

describe('the capability phrasing checks themselves', () => {
	test('match the present-tense phrasings', () => {
		for (const old of [
			'polyjose is a pure-Rust implementation of JWS, JWE, JWK and JWT.',
			'RFC coverage. polyjose implements: RFC 7515 (JWS)',
			'Misuse-resistant defaults, following RFC 8725:',
		]) {
			assert.ok(capabilityStatedAsBuilt.some((re) => re.test(old)), old);
		}
	});
	test('accept the 0.1.0 design phrasings', () => {
		for (const now of [
			'polyjose is being built as a pure-Rust implementation of JWS, JWE, JWK and JWT.',
			'RFC coverage. polyjose 0.1.0 is designed to implement: RFC 7515 (JWS)',
			'Misuse-resistant defaults. The API is designed around RFC 8725:',
		]) {
			assert.ok(!capabilityStatedAsBuilt.some((re) => re.test(now)), now);
		}
	});
	test('the framing sentence pattern matches only the full sentence', () => {
		assert.match('This list describes polyjose 0.1.0 as designed.', framingSentence);
		assert.doesNotMatch('This list describes polyjose 0.1.0.', framingSentence);
	});
});

describe('the registry-link check itself', () => {
	test('finds hrefs to the host and its subdomains, in any element', () => {
		assert.equal(hrefsToHost('<a href="https://docs.rs/polyjose">x</a>', 'docs.rs').length, 1);
		assert.equal(hrefsToHost('<a class="x" href="https://docs.rs">x</a>', 'docs.rs').length, 1);
		assert.equal(hrefsToHost("<a href='http://www.javadoc.io/doc/x'>x</a>", 'javadoc.io').length, 1);
		assert.equal(hrefsToHost('<link rel="preconnect" href="//swiftpackageindex.com/">', 'swiftpackageindex.com').length, 1);
		assert.equal(hrefsToHost('<a href=https://docs.rs/polyjose>x</a>', 'docs.rs').length, 1);
	});
	test('ignores the URL as text and other hosts that only contain the name', () => {
		assert.equal(hrefsToHost('<code>https://docs.rs/polyjose</code>', 'docs.rs').length, 0);
		assert.equal(hrefsToHost('<a href="https://notdocs.rs/x">x</a>', 'docs.rs').length, 0);
		assert.equal(hrefsToHost('<a href="https://docs.rs.example.com/x">x</a>', 'docs.rs').length, 0);
		assert.equal(hrefsToHost('<a href="/reference/api/#docs.rs">x</a>', 'docs.rs').length, 0);
	});
});

describe('the present-tense check itself', () => {
	test('flags machinery described as already running', () => {
		assert.equal(presentTenseMachineryClaims('The same conformance vectors run on every platform.').length, 1);
		assert.equal(presentTenseMachineryClaims('polyjose tests interop against panva/jose.').length, 1);
		assert.equal(presentTenseMachineryClaims('A CI check stops the tree from growing.').length, 1);
	});
	test('accepts plans and design goals', () => {
		assert.equal(presentTenseMachineryClaims('It is designed so that every platform runs the same conformance vectors.').length, 0);
		assert.equal(presentTenseMachineryClaims('Interop tests against them are planned before release.').length, 0);
		assert.equal(presentTenseMachineryClaims('A CI check will stop the tree from growing.').length, 0);
	});
});

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
		assert.equal(unmeasuredNumberClaims('Version 0.1.0 is not on crates.io yet.').length, 0);
		assert.equal(unmeasuredNumberClaims('Java is awkward in 0.1.0. polyjose runs the same test vectors.').length, 0);
		assert.equal(unmeasuredNumberClaims('Version 0.1.0 is not on crates.io and needs 40 crates.').length, 1);
	});
});

for (const [name, route] of Object.entries(pages)) {
	describe(`${name} page: site-wide rules`, () => {
		const html = load(route);
		const text = textOf(bodyOf(html));
		test('carries no pre-release notice or wording', () => {
			assert.doesNotMatch(html, /data-prerelease-notice|prerelease-notice/);
			assert.doesNotMatch(textOf(html), /pre-1\.0|not (yet )?published|isn.t published|may change before 1\.0/i);
		});
		test('never says constant-time (only the Security pages may)', () => {
			assert.doesNotMatch(textOf(html), /constant[- ]time/i);
		});
		test('makes no unmeasured number claims', () => {
			assert.deepEqual(unmeasuredNumberClaims(text), []);
		});
		test('describes unbuilt tests and checks as planned, not running', () => {
			assert.deepEqual(presentTenseMachineryClaims(text), []);
			for (const re of notYetTrue) assert.doesNotMatch(text, re);
		});
		test('describes capabilities as the 0.1.0 design, not as built', () => {
			for (const re of capabilityStatedAsBuilt) assert.doesNotMatch(text, re);
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
		for (const p of ['rust', 'node', 'web', 'android', 'swift']) {
			assert.ok(hrefs.includes(`/start/${p}/`), `no card for /start/${p}/`);
		}
	});

	test('card descriptions contain no inline code (it fails dark-theme contrast inside cards)', () => {
		const descriptions = [...body.matchAll(/<div class="sl-link-card[\s\S]*?<span class="description[^"]*">([\s\S]*?)<\/span>/g)].map((m) => m[1]);
		assert.equal(descriptions.length, 8, 'expected a description on each of the eight cards');
		for (const d of descriptions) assert.doesNotMatch(d, /<code\b/i, d);
	});

	test('three cards link the security pages', () => {
		const cards = [...body.matchAll(/<div class="sl-link-card[\s\S]*?<a\b[^>]*href="(\/security\/[^"]+)"/g)].map((m) => m[1]);
		assert.equal(new Set(cards).size, 3, `security cards: ${cards.join(', ')}`);
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

	test('frames the "what makes polyjose different" list as the 0.1.0 design', () => {
		assert.match(text, framingSentence);
		const framing = text.search(framingSentence);
		const heading = text.search(/What makes polyjose different/);
		const firstItem = text.search(/One core for five platforms/);
		assert.ok(heading >= 0 && heading < framing && framing < firstItem, 'framing sentence must sit between the heading and the list');
	});

	test('covers the problem, the differences, the audience and the license', () => {
		const headings = [...body.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => textOf(m[1]));
		for (const re of [/problem/i, /different/i, /who/i, /open source/i]) {
			assert.ok(headings.some((h) => re.test(h)), `no heading matching ${re}: ${headings.join(' | ')}`);
		}
		assert.match(text, /\bMIT\b/);
	});

	test('links the security policy', () => {
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

	test('never uses the word "audited", anywhere on the page', () => {
		assert.doesNotMatch(textOf(html), /audited/i);
	});

	test('"Built for independent review" links polyjose\'s audit status, which only Cryptographic foundations states', () => {
		const at = sentences.findIndex((s) => /^Built for independent review\.$/.test(s));
		assert.ok(at >= 0, `no "Built for independent review." item: ${sentences.filter((s) => /review/i.test(s)).join(' | ')}`);
		assert.ok(linksOf(body).some((l) => l.href === '/security/cryptographic-foundations/#polyjose-itself'), 'no link to polyjose\'s audit status');
		assert.doesNotMatch(text, /independent audit of polyjose|polyjose itself has not/i, 'the audit status is stated on one page only');
		assert.doesNotMatch(text, /audit[^.]*planned|planned[^.]*audit|before 1\.0/i, 'no audit plan');
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

	// A registry page for a name that isn't published yet could be taken by
	// someone else, so each one is a link only once the platform's pin is
	// `registry`. Until then the page shows the URL as text.
	for (const { platform, host, url } of [
		{ platform: 'rust', host: 'docs.rs', url: 'https://docs.rs/polyjose' },
		{ platform: 'kotlin', host: 'javadoc.io', url: 'https://javadoc.io/doc/dev.polyjose/polyjose-jvm' },
		{
			platform: 'swift',
			host: 'swiftpackageindex.com',
			url: 'https://swiftpackageindex.com/bharathkontham/polyjose/documentation/polyjose',
		},
	]) {
		const pin = pinOf(platform);
		if (pin.source === 'registry') {
			test(`links ${url}, because the ${platform} pin is registry`, () => {
				assert.ok(links.some((l) => l.href === url), `no link to ${url}`);
			});
		} else {
			test(`shows ${url} as text with no link to ${host}, because the ${platform} pin is ${pin.source}`, () => {
				const shown = new RegExp(`(?<![\\w/.-])${url.replace(/[.?/]/g, '\\$&')}(?![\\w/.-])`);
				assert.match(text, shown, `${url} is not in the page text`);
				assert.deepEqual(hrefsToHost(html, host), [], `the page links ${host} before ${platform} is published`);
			});
		}
	}

	test('links the generated JavaScript reference for both packages, and the build produced it', () => {
		assert.match(text, /\/api\/js\//);
		assert.match(text, /@polyjose\/node/);
		assert.match(text, /@polyjose\/wasm/);
		assert.match(text, /commit 30a4a72/, 'says which source the reference was generated from');
		const js = links.filter((l) => l.href.startsWith('/api/js'));
		assert.deepEqual(js.map((l) => l.href), ['/api/js/index.html'], 'one link, to the generated index page');
		assert.ok(existsSync(`${dist}api/js/index.html`), 'npm run build generates dist/api/js/index.html');
	});

	test('badges Kotlin and Swift "not generated yet", and nothing as waiting for a release', () => {
		const badges = [...body.matchAll(/<span class="sl-badge[^"]*"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => textOf(m[1]));
		assert.deepEqual(badges, ['not generated yet', 'not generated yet'], badges.join(' | '));
		assert.match(text, /empty documentation archive/, 'says why there is no Kotlin reference');
		assert.match(text, /doesn.t opt in yet/, 'says why there is no Swift reference');
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
