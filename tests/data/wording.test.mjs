// Wording tests from the Phase A review. The page tests read the built HTML in
// dist/, so run `npm run build` first (`npm run verify` does). The README tests
// read the source files.
//
// - Security model: `getrandom` is the operating-system randomness primitive.
//   Only `subtle` and `zeroize` are support crates; they are part of the
//   primitives' own security model.
// - Reporting a vulnerability: a private report is visible to the maintainers
//   and anyone they invite, not only "between you and the maintainers".
// - README: no rule claims an automated check that doesn't exist, and the
//   audit wording rule matches the honesty lint.
// - samples/README: the sibling-checkout rule matches scripts/samples/run.sh.
//
// Importing the helpers from framing.test.mjs would run its tests a second
// time, so this file keeps its own small copies.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const dist = fileURLToPath(new URL('dist/', root));
const source = (path) => readFileSync(new URL(path, root), 'utf8');

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Visible text of an HTML fragment, one line per block element. */
function textOf(html) {
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

/** Sentences of a text: lines split after `.!?` followed by white space. */
function sentencesOf(text) {
	return text
		.split('\n')
		.flatMap((line) => line.split(/(?<=[.!?])\s+/))
		.map((s) => s.trim())
		.filter(Boolean);
}

/** The visible text of a built page's own content (inside .sl-markdown-content). */
function pageText(route) {
	const file = `${dist}${route}index.html`;
	assert.ok(existsSync(file), `missing ${file}: run \`npm run build\` before this test`);
	const html = readFileSync(file, 'utf8');
	const at = html.indexOf('class="sl-markdown-content"');
	assert.ok(at > 0, `${route}: no .sl-markdown-content in page`);
	const start = html.indexOf('>', at) + 1;
	const end = html.indexOf('<footer', start);
	return textOf(html.slice(start, end > 0 ? end : undefined));
}

const SUPPORT_CRATE = /\bsupport crates?\b/i;
const OS_RANDOMNESS_PRIMITIVE = /\boperating[- ]system randomness primitive\b/i;

/** Problems with how a text describes getrandom and the support crates. */
function dependencyWordingProblems(text) {
	const problems = [];
	const sentences = sentencesOf(text);
	const support = sentences.filter((s) => SUPPORT_CRATE.test(s));
	if (!support.some((s) => /`?subtle`?/.test(s) && /`?zeroize`?/.test(s))) {
		problems.push('no sentence names subtle and zeroize as the support crates');
	}
	for (const s of support) {
		if (/\bgetrandom\b/.test(s)) problems.push(`getrandom is called a support crate: ${s}`);
		if (/\bthree\b[^.]*\bsupport crates\b/i.test(s)) problems.push(`counts three support crates: ${s}`);
	}
	if (!sentences.some((s) => /\bgetrandom\b/.test(s) && OS_RANDOMNESS_PRIMITIVE.test(s))) {
		problems.push('no sentence describes getrandom as the operating-system randomness primitive');
	}
	return problems;
}

const PRIVATE_AUDIENCE = /\bprivate to the maintainers and anyone they invite\b/i;
const OLD_AUDIENCE = /\bprivate between you and the maintainers\b/i;

describe('the dependency wording check itself', () => {
	test('flags the old sentence', () => {
		const old =
			'**Randomness comes only from the operating system\'s CSPRNG**, through the `getrandom` crate.\n' +
			'The core crate depends only on cryptographic primitive crates plus three small support crates: `subtle`, `zeroize` and `getrandom`.';
		const problems = dependencyWordingProblems(old);
		assert.ok(problems.some((p) => p.startsWith('getrandom is called a support crate')), problems.join('\n'));
		assert.ok(problems.some((p) => p.startsWith('counts three')), problems.join('\n'));
		assert.ok(problems.some((p) => p.startsWith('no sentence describes getrandom')), problems.join('\n'));
	});
	test('flags a page that drops the support crates', () => {
		assert.ok(dependencyWordingProblems('`getrandom` is the operating-system randomness primitive.').length > 0);
	});
	test('accepts getrandom as the primitive and subtle and zeroize as the support crates', () => {
		const now =
			'`getrandom` is one of the primitive crates: it is the operating-system randomness primitive.\n' +
			'The two support crates are `subtle` and `zeroize`.';
		assert.deepEqual(dependencyWordingProblems(now), []);
	});
});

describe('/security/model/', () => {
	const text = pageText('security/model/');
	test('getrandom is the operating-system randomness primitive; only subtle and zeroize are support crates', () => {
		assert.deepEqual(dependencyWordingProblems(text), []);
	});
});

describe('/security/reporting/', () => {
	const text = pageText('security/reporting/');
	test('a private report is private to the maintainers and anyone they invite', () => {
		assert.match(text, PRIVATE_AUDIENCE);
		assert.doesNotMatch(text, OLD_AUDIENCE);
	});
});

describe('README.md writing rules', () => {
	const readme = source('README.md');
	const rules = readme.slice(readme.indexOf('## Writing rules'));
	const section = rules.slice(0, rules.indexOf('\n## ', 1) > 0 ? rules.indexOf('\n## ', 1) : undefined);

	test('claims no automated check for every rule', () => {
		assert.doesNotMatch(section, /\bautomatically\b/i);
	});

	test('says the benchmark and adoption rule is checked in review, not by a script', () => {
		const line = section.split('\n').find((l) => /\bbenchmark\b/i.test(l) && /\badoption\b/i.test(l));
		assert.ok(line, 'no benchmark and adoption rule');
		assert.match(section, /benchmark and adoption rule[^.]*\breview\b/i);
	});

	test('the audit wording rule matches the honesty lint: the register only, About included', () => {
		const line = section.split('\n').find((l) => /\baudited\b/i.test(l) && /\bNever describe polyjose as audited\b/.test(l));
		assert.ok(line, 'no audit wording rule');
		assert.match(line, /\baudit register\b/i);
		assert.match(line, /Security › Cryptographic foundations/);
		assert.match(line, /\blegend\b/i);
		assert.match(line, /\bnowhere else\b[^.]*\bAbout\b/i);
		assert.doesNotMatch(line, /\bCryptographic foundations and About pages\b/);
	});
});

describe('samples/README.md sibling checkout', () => {
	const text = source('samples/README.md');
	test('the sibling must have no uncommitted changes and no untracked files that polyjose doesn\'t ignore', () => {
		const line = text.split('\n').find((l) => l.startsWith('- **Locally**'));
		assert.ok(line, 'no "Locally" item');
		assert.match(line, /\bno uncommitted changes and no untracked files that polyjose doesn't ignore\b/);
	});
});
