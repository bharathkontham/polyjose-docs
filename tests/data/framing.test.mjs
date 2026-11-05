// Framing tests for every Security and Concepts page. They read the built
// HTML, so run `npm run build` first (`npm run verify` does).
//
// polyjose 0.1.0 is in development and not published, so these pages describe
// it as designed, the same way About › Why polyjose frames its list. Each page
// opens with one framing sentence, and the design statements below it stay
// short. What the framing does not cover is checking machinery that doesn't
// exist yet (CI checks, test runs, vector passes, verification behaviour):
// that is written as planned, never as already running.
//
// This generalises the framing and present-tense checks in about.test.mjs to
// these pages. The helpers live here rather than being imported from that
// file, because importing a test file would run its tests a second time.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const dist = fileURLToPath(new URL('dist/', root));
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

/** The sentence every Security and Concepts page opens with. */
export const FRAMING =
	'This page describes polyjose 0.1.0 as designed. The library is in development and not published yet.';

/** Every page under /security/ and /concepts/. */
export const FRAMED_PAGES = [
	'security/model/',
	'security/not-supported/',
	'security/cryptographic-foundations/',
	'security/reporting/',
	'concepts/algorithms/',
	'concepts/errors/',
	'concepts/standards/',
	'concepts/one-api/',
];

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Visible text of an HTML fragment, one line per block element. */
export function textOf(html) {
	return html
		.replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, '')
		.replace(/<\/(p|li|h[1-6]|td|th|dt|dd|div|blockquote|tr|caption)>|<br\s*\/?>/gi, '\n')
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

/** The page's own content: inside .sl-markdown-content, up to the footer. */
export function bodyOf(html) {
	const at = html.indexOf('class="sl-markdown-content"');
	assert.ok(at > 0, 'no .sl-markdown-content in page');
	const start = html.indexOf('>', at) + 1;
	const end = html.indexOf('<footer', start);
	return html.slice(start, end > 0 ? end : undefined);
}

/** Text split into sentences (and list items, headings, cells). */
export function sentencesOf(text) {
	return text
		.split('\n')
		.flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z`"(]|polyjose\b)/))
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 * True when the first thing in the body (as bodyOf() returns it) is a
 * paragraph holding exactly the framing sentence.
 */
export function opensWithFraming(body) {
	const first = body.trimStart().match(/^<p>([\s\S]*?)<\/p>/);
	return first !== null && textOf(first[1]) === FRAMING;
}

// Testing and checking machinery: CI, tests, test vectors, conformance and
// interop runs, Wycheproof, per-pull-request checks, fuzzing. Initialization
// vectors are cipher inputs, not test vectors, so they are not machinery.
const MACHINERY = /\bCI\b|\btest(s|ed)?\b|\btest suite\b|(?<!\binitiali[sz]ation )\bvectors?\b|\bconformance\b|\binterop\w*|\bWycheproof\b|\bpull requests?\b|\bfuzz\w*/i;
// A verb that says the machinery runs, passes, catches or covers something today.
const RUNNING =
	/\b(runs?|ran|reruns?|pass(es|ed)?|checks?|checked|rechecks?|fails?|stops?|verif(y|ies)|ships|tests?|tested|fuzz(ed)?|blocks?|scans?|scanned|enforces?|covers?)\b/gi;
// Running-verb forms that are also nouns. One of these is not a running verb
// when it heads or modifies a noun phrase ("the tests", "test vectors", "the
// AES block cipher", "fuzz targets") or follows "hard to" and the like, which
// says something is difficult, not that it runs ("hard to test").
const ALSO_A_NOUN = /^(tests?|fuzz|blocks?|scans?)$/i;
const NOUN_BEFORE = /\b(a|an|the|each|every|any|no|its|their|this|these|those|one|conformance|unit|integration|property|interop|platform|planned|full|own)\s+$/i;
const NOUN_AFTER = /^\s+(vectors?|suites?|cases?|runs?|harness(es)?|ciphers?|sizes?|results?|data|files?|keys?|targets?|coverage)\b/i;
const DIFFICULTY_BEFORE = /\b(hard|easy|difficult|impossible)\s+to\s+$/i;
// What excuses a running verb: one of these in the same clause. A plan is
// "is planned" or "are planned"; a design goal is "designed to" or "designed
// so that"; the future is "will". "designed" alone ("the designed API"), a
// "planned" adjective, "required to", "aims" or "before release" is not enough.
const GOVERNS = /\bdesigned to\b|\bdesigned so that\b|\b(is|are) planned\b|\bwill\b/i;
// Where one clause ends and the next begins: a semicolon, a colon, a dash, or a
// comma before a conjunction or "which".
const CLAUSE_BREAK = /\s*[;:]\s+|\s*—\s*|\s+–\s+|,\s+(?=(?:and|but|or|so|yet|while|whereas|which|because|although|though|since|unless)\b)/i;

/** The clauses of one sentence, split at CLAUSE_BREAK. */
export function clausesOf(sentence) {
	return sentence
		.split(CLAUSE_BREAK)
		.map((c) => c.trim())
		.filter(Boolean);
}

/** The running verbs in a clause, leaving out noun uses of ALSO_A_NOUN. */
export function runningVerbsOf(clause) {
	return [...clause.matchAll(RUNNING)]
		.filter((m) => {
			if (!ALSO_A_NOUN.test(m[0])) return true;
			const before = clause.slice(0, m.index);
			const after = clause.slice(m.index + m[0].length);
			return !NOUN_BEFORE.test(before) && !NOUN_AFTER.test(after) && !DIFFICULTY_BEFORE.test(before);
		})
		.map((m) => m[0]);
}

/**
 * Sentences that describe checking machinery as already running. A sentence
 * that names the machinery is flagged when one of its clauses has a running
 * verb that no plan, design goal or "will" in that same clause governs. A
 * sentence that only names the machinery ("Its examples are test vectors") is
 * not a claim that it runs.
 */
export function unbuiltCheckClaims(text) {
	return sentencesOf(text).filter(
		(s) => MACHINERY.test(s) && clausesOf(s).some((c) => runningVerbsOf(c).length > 0 && !GOVERNS.test(c)),
	);
}

/**
 * Phrasings these pages and their data files used for things not built yet.
 * The Phase A review found them; none may come back.
 */
export const OLD_PHRASINGS = [
	/\bThis page describes how polyjose is built\b/i,
	/\bCI fails if\b/i,
	/\bthe tests that check them on every platform\b/i,
	/\bAdvisories are checked on every pull request\b/i,
	/\bpolyjose passes the RFC, NIST and Wycheproof\b/i,
	/\bupgraded only through a change that reruns\b/i,
	/\bpolyjose implements all three\b/i,
	/\bmeans the operation works\b/i,
	/\bpolyjose implements the JOSE (specifications|standards)\b/i,
	/\bVerifying works\b/i,
	/\bencrypting to an RSA public key work\b/i,
	/\bEach library is pinned to an exact version\b/i,
	/\bIt is required to pass the RFC, NIST and Wycheproof\b/i,
];

/** A data note that says an operation already "works" (verified behaviour). */
const WORKS = /\bworks?\b/i;

describe('the framing check itself', () => {
	const wrap = (inner) => bodyOf(`<div class="sl-markdown-content">${inner}</div><footer></footer>`);
	test('accepts the framing sentence as the first paragraph', () => {
		assert.ok(opensWithFraming(wrap(`<p>${FRAMING}</p><p>polyjose recognises the identifiers.</p>`)));
		assert.ok(opensWithFraming(wrap(` \n <p>${FRAMING}</p>`)), 'leading whitespace is not content');
	});
	test('rejects a page where anything comes before it', () => {
		assert.ok(!opensWithFraming(wrap(`<p>polyjose implements JOSE.</p><p>${FRAMING}</p>`)));
		assert.ok(!opensWithFraming(wrap(`<h2 id="a">A</h2><p>${FRAMING}</p>`)));
		assert.ok(!opensWithFraming(wrap(`<blockquote><p>${FRAMING}</p></blockquote>`)));
	});
	test('rejects a missing, shortened or extended sentence', () => {
		assert.ok(!opensWithFraming(wrap('<p>This page describes polyjose 0.1.0 as designed.</p>')));
		assert.ok(!opensWithFraming(wrap(`<p>${FRAMING} It is fast.</p>`)));
		assert.ok(!opensWithFraming(wrap('<p>This list describes polyjose 0.1.0 as designed. The library is in development and not published yet.</p>')));
		assert.ok(!opensWithFraming(wrap('')));
	});
});

describe('the unbuilt-check check itself', () => {
	test('flags the phrasings the review found', () => {
		for (const old of [
			"CI fails if the core's dependency tree contains any crate that isn't on an allowlist.",
			'Until then, the protections on this page rest on the RFCs, the tests that check them on every platform, and the libraries listed.',
			'Advisories are checked on every pull request.',
			'polyjose passes the RFC, NIST and Wycheproof test vectors against that exact version.',
			'Each library is upgraded only through a change that reruns the full test suite.',
			'The same conformance vectors run on every platform.',
		]) {
			assert.equal(unbuiltCheckClaims(old).length, 1, old);
		}
	});
	test('accepts plans, design goals and sentences that only name the machinery', () => {
		for (const now of [
			"A CI check is planned that fails when the core's dependency tree contains a crate that isn't on an allowlist.",
			'Conformance tests that check them on every platform are planned before release.',
			'A RustSec advisory check is planned for every pull request.',
			"It will be required to pass the RFC, NIST and Wycheproof test vectors at that exact version, in polyjose's planned conformance tests.",
			'An upgrade will go only through a change that reruns the full test suite.',
			'Its examples are test vectors for the algorithms polyjose implements.',
			'polyjose runs its checks in a fixed order.',
		]) {
			assert.deepEqual(unbuiltCheckClaims(now), [], now);
		}
	});
	test('flags the added running verbs: tested, fuzzed, blocks, scanned, enforces, covers', () => {
		for (const old of [
			'polyjose is tested against the Wycheproof vectors on every platform.',
			'The test suite tests every binding.',
			'Conformance vectors test each binding.',
			'The JWS and JWE parsers are fuzzed in CI.',
			'We fuzz every parser in CI.',
			'cargo deny blocks any crate that is not on the allowlist in CI.',
			'CI checks block a merge when a vector fails.',
			'CI scans each pull request for RustSec advisories.',
			'Every pull request is scanned for RustSec advisories.',
			'The CI job enforces the allowlist.',
			'The conformance suite covers every algorithm.',
			'Wycheproof vectors cover the edge cases.',
		]) {
			assert.equal(unbuiltCheckClaims(old).length, 1, old);
		}
	});
	test('excuses a running verb only when "designed to", "designed so that", "is/are planned" or "will" governs it in the same clause', () => {
		for (const now of [
			'The JWS and JWE parsers are designed to be fuzzed in CI.',
			'CI is designed so that a failing test vector blocks the merge.',
			'A CI job is planned that scans every pull request for RustSec advisories.',
			'Conformance tests that cover every algorithm are planned before release.',
			'cargo deny will block any crate that is not on the allowlist in CI.',
		]) {
			assert.deepEqual(unbuiltCheckClaims(now), [], now);
		}
		for (const old of [
			// A stray "designed" elsewhere in the sentence.
			'polyjose is designed around RFC 8725, and its parsers are fuzzed in CI.',
			'The designed API is tested on every platform.',
			// A plan or "will" in another clause.
			'An interop suite is planned; the conformance vectors already pass.',
			'Bindings will follow, and every pull request is scanned for advisories.',
			// Markers that excused a sentence before and no longer do.
			'It is required to pass the RFC, NIST and Wycheproof test vectors at that exact version.',
			"It is required to pass the test vectors, in polyjose's planned conformance tests.",
			'The plan is that CI blocks any crate outside the allowlist.',
			'Conformance vectors run before release.',
		]) {
			assert.equal(unbuiltCheckClaims(old).length, 1, old);
		}
	});
	test('does not read a noun, or "hard to test", as a running verb', () => {
		for (const now of [
			'The test suite and its fuzz targets are listed in the repository.',
			"polyjose's conformance tests are listed in the repository.",
			'Cryptographic primitives are easy to get subtly wrong and hard to test into correctness.',
			'That covers content encryption keys, initialization vectors, PBES2 salts, ephemeral ECDH keys and generated keys.',
		]) {
			assert.deepEqual(unbuiltCheckClaims(now), [], now);
		}
	});
	test('splits a sentence into clauses at semicolons, colons, dashes and a comma before a conjunction', () => {
		assert.deepEqual(clausesOf('A is planned; B runs.'), ['A is planned', 'B runs.']);
		assert.deepEqual(clausesOf('Audited: a report covers it.'), ['Audited', 'a report covers it.']);
		assert.deepEqual(clausesOf('A will run — B passes.'), ['A will run', 'B passes.']);
		assert.deepEqual(clausesOf('A will run, and B passes, which C checks.'), ['A will run', 'and B passes', 'which C checks.']);
		assert.deepEqual(clausesOf('It passes the RFC, NIST and Wycheproof vectors.'), ['It passes the RFC, NIST and Wycheproof vectors.']);
	});
	test('the old-phrasing list matches each old sentence and none of the rewrites', () => {
		for (const old of [
			'This page describes how polyjose is built and the safe defaults it applies.',
			'polyjose implements all three.',
			'**Yes** means the operation works.',
			'polyjose implements the JOSE specifications below.',
			'polyjose implements the JOSE standards (JWS, JWE, JWK and JWT).',
			'Verifying works, so tokens from identity providers can be checked.',
			'Verifying RSA signatures and encrypting to an RSA public key work.',
			'Each library is pinned to an exact version.',
			"It is required to pass the RFC, NIST and Wycheproof test vectors at that exact version, in polyjose's planned conformance tests.",
		]) {
			assert.ok(OLD_PHRASINGS.some((re) => re.test(old)), old);
		}
		for (const now of [
			FRAMING,
			'polyjose 0.1.0 is designed to implement all three.',
			'Yes means the operation is part of the 0.1.0 design.',
			'polyjose 0.1.0 is designed to implement the JOSE specifications below.',
			'Verify only, so that tokens from identity providers can be checked.',
			'polyjose 0.1.0 is designed to pin each library to an exact version.',
			"It will be required to pass the RFC, NIST and Wycheproof test vectors at that exact version, in polyjose's planned conformance tests.",
		]) {
			assert.ok(!OLD_PHRASINGS.some((re) => re.test(now)), now);
		}
	});
});

for (const route of FRAMED_PAGES) {
	describe(`/${route}`, () => {
		const file = `${dist}${route}index.html`;
		assert.ok(existsSync(file), `missing ${file}: run \`npm run build\` before this test`);
		const body = bodyOf(readFileSync(file, 'utf8'));
		const text = textOf(body);

		test('opens with the "as designed" framing sentence, before any other content', () => {
			assert.ok(opensWithFraming(body), `first content: ${JSON.stringify(text.split('\n')[0])}`);
			assert.equal(text.indexOf(FRAMING), 0);
		});

		test('describes unbuilt checks and tests as planned, not running', () => {
			assert.deepEqual(unbuiltCheckClaims(text), []);
		});

		test('none of the phrasings the review found comes back', () => {
			for (const re of OLD_PHRASINGS) assert.doesNotMatch(text, re);
		});
	});
}

describe('data notes rendered on these pages', () => {
	const notes = [
		...readJson('src/data/algorithms.json').groups.flatMap((g) => g.rows.filter((r) => r.note).map((r) => [`algorithms.json ${r.name}`, r.note])),
		...Object.entries(readJson('src/data/unavailable.json')).map(([key, reason]) => [`unavailable.json ${key}`, reason]),
	];

	test('there are notes to check', () => {
		assert.ok(notes.length > 10, `only ${notes.length} notes found`);
	});

	test('no note says an operation already works', () => {
		for (const [where, note] of notes) assert.doesNotMatch(note, WORKS, where);
	});

	test('no note uses a phrasing the review found, or describes checks as running', () => {
		for (const [where, note] of notes) {
			for (const re of OLD_PHRASINGS) assert.doesNotMatch(note, re, where);
			assert.deepEqual(unbuiltCheckClaims(note), [], where);
		}
	});
});
