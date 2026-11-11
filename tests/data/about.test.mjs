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

/** Future-tense or design wording that must not return now polyjose is published. */
const futureWording = [
	/\bas designed\b/i,
	/\bis being built\b/i,
	/\bwill ship\b/i,
	/\bbefore 0\.1\.0 is released\b/i,
	/\bplanned for after the 0\.1\.0 release\b/i,
];

/** The sentence that frames the About page's list as the 0.2.0 release. */
const framingSentence = /This list describes polyjose 0\.2\.0\./;

const pages = {
	landing: '',
	about: 'about/why-polyjose/',
	reference: 'reference/api/',
};

describe('the future-wording checks themselves', () => {
	test('match the pre-release phrasings', () => {
		for (const old of [
			'This list describes polyjose 0.1.0 as designed.',
			'polyjose is being built as a pure-Rust implementation of JWS, JWE, JWK and JWT.',
			'a native addon that will ship with prebuilt binaries.',
			'Each binding passes the conformance tests before 0.1.0 is released.',
		]) {
			assert.ok(futureWording.some((re) => re.test(old)), old);
		}
	});
	test('accept the released phrasings', () => {
		for (const now of [
			'polyjose is a pure-Rust implementation of JWS, JWE, JWK and JWT.',
			'RFC coverage. polyjose 0.2.0 implements: RFC 7515 (JWS)',
			'The @polyjose/node package, a native addon that ships with prebuilt binaries.',
			'Every binding passes the same conformance tests.',
		]) {
			assert.ok(!futureWording.some((re) => re.test(now)), now);
		}
	});
	test('the framing sentence pattern matches only the full sentence', () => {
		assert.match('This list describes polyjose 0.2.0.', framingSentence);
		assert.doesNotMatch('This list describes polyjose 0.2.0', framingSentence);
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
		test('writes released capabilities and checks in the present tense', () => {
			for (const re of futureWording) assert.doesNotMatch(text, re);
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

	test('"Pick your platform" has one synced tab per platform, each with install, import and a guide link', () => {
		const start = body.indexOf('<starlight-tabs data-sync-key="platform"');
		assert.ok(start > 0, 'no platform tab group');
		const group = body.slice(start, body.indexOf('</starlight-tabs>', start));
		const labels = [...group.matchAll(/<a role="tab"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => textOf(m[1]));
		assert.deepEqual(labels, ['Rust', 'Node.js', 'Web', 'Kotlin', 'Swift']);
		const panels = group.split(/<div[^>]*role="tabpanel"/).slice(1);
		const expected = [
			['rust', 'cargo add polyjose@', 'use polyjose::'],
			['node', 'npm install @polyjose/node@', "from '@polyjose/node'", "require('@polyjose/node')"],
			['web', 'npm install @polyjose/wasm@', "from '@polyjose/wasm'", 'no init call'],
			['android', 'dev.polyjose:polyjose:', 'dev.polyjose:polyjose-jvm:', 'import dev.polyjose.'],
			['swift', '.package(url: "https://github.com/bharathkontham/polyjose"', 'Add Package Dependencies', 'import Polyjose'],
		];
		assert.equal(panels.length, expected.length, 'one panel per platform');
		panels.forEach((panel, i) => {
			const [guide, ...phrases] = expected[i];
			const text = textOf(panel);
			for (const phrase of phrases) assert.ok(text.includes(phrase), `${labels[i]} tab lacks ${JSON.stringify(phrase)}`);
			assert.match(panel, /data-install-status=/, `${labels[i]} tab does not use the shared install block`);
			assert.ok(linksOf(panel).some((l) => l.href === `/start/${guide}/` && /Full guide/.test(l.text)), `${labels[i]} tab has no full guide link`);
		});
	});

	test('the Node.js tab describes one package with prebuilt addons for every desktop and server OS', () => {
		assert.match(textOf(body), /One package, prebuilt for macOS, Linux \(glibc and musl\) and Windows/);
	});

	test('card descriptions contain no inline code (it fails dark-theme contrast inside cards)', () => {
		const descriptions = [...body.matchAll(/<div class="sl-link-card[\s\S]*?<span class="description[^"]*">([\s\S]*?)<\/span>/g)].map((m) => m[1]);
		assert.equal(descriptions.length, 3, 'expected a description on each of the three security cards');
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

	test('frames the "what makes polyjose different" list as the 0.2.0 release', () => {
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

	// The Rust and Kotlin references are published, so they are links. The
	// Swift package has no hosted reference yet, so its URL stays text.
	test('links the Rust and Kotlin references now they are published', () => {
		assert.ok(links.some((l) => l.href === 'https://docs.rs/polyjose'), 'no link to docs.rs');
		assert.ok(
			links.some((l) => l.href === 'https://javadoc.io/doc/dev.polyjose/polyjose-jvm'),
			'no link to javadoc.io',
		);
	});

	test('explains that the Swift package has no hosted reference yet', () => {
		assert.match(text, /doesn.t opt in yet/);
		assert.deepEqual(hrefsToHost(html, 'swiftpackageindex.com'), []);
	});

	test('links the generated JavaScript reference for both packages, and the build produced it', () => {
		assert.match(text, /\/api\/js\//);
		assert.match(text, /@polyjose\/node/);
		assert.match(text, /@polyjose\/wasm/);
		assert.match(text, /0\.1\.1 release \(commit 038779a\)/, 'says which source the reference was generated from');
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
