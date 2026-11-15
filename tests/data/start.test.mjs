// Tests for the Get started pages. They read the built HTML in dist/, so run `npm run build`
// first (`npm run verify` does).
//
// Each page installs one platform and shows that platform's samples, which scripts/samples/run.sh
// runs against polyjose. The facts below are the ones a reader acts on and that owner decisions
// fixed on 2026-11-08 and 2026-11-15: the Apple platforms are iOS and macOS only, the Kotlin jar
// needs a Kotlin 2.4 compiler, and the Web page names only the runtimes it is tested in.
// Importing helpers from another test file would run its tests a second time, so this file keeps
// its own small copies.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

/** What an <Install> block says for a platform's committed pin: published only for a registry pin. */
function installStatus(platform) {
	const file = platform === 'node' || platform === 'web' ? 'js' : platform;
	const pin = JSON.parse(readFileSync(new URL(`../../samples/pins/${file}.json`, import.meta.url), 'utf8'));
	return pin.source === 'registry' ? 'published' : 'unpublished';
}

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodes the character references of HTML text. */
function decode(text) {
	return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
		if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
		return entities[e] ?? m;
	});
}

/** Visible text of an HTML fragment, white space collapsed. */
function textOf(html) {
	return decode(html.replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
}

/** A built page: its whole HTML, its content's HTML and its content's text. */
function page(route) {
	const file = `${dist}${route}index.html`;
	assert.ok(existsSync(file), `missing ${file}: run \`npm run build\` before this test`);
	const html = readFileSync(file, 'utf8');
	const at = html.indexOf('class="sl-markdown-content"');
	assert.ok(at > 0, `${route}: no .sl-markdown-content in page`);
	const body = html.slice(html.indexOf('>', at) + 1, html.indexOf('<footer', at));
	return { html, body, text: textOf(body) };
}

/** The text of every code block in the content. */
function codeBlocks(body) {
	return [...body.matchAll(/<pre\b[\s\S]*?<\/pre>/g)].map((m) => decode(m[0].replace(/<div class="ec-line">/g, '\n').replace(/<[^>]+>/g, '')));
}

const PAGES = {
	rust: 'start/rust/',
	node: 'start/node/',
	web: 'start/web/',
	kotlin: 'start/android/',
	swift: 'start/swift/',
};

describe('every Get started page', () => {
	for (const [platform, route] of Object.entries(PAGES)) {
		test(`${route} installs ${platform} and shows sign, verify and error samples`, () => {
			const { body, text } = page(route);
			assert.doesNotMatch(text, /arrives with the 0\.1\.0 release/, 'the stub text is gone');
			const statuses = [...body.matchAll(/data-install-status="([a-z]+)"/g)].map((m) => m[1]);
			assert.ok(statuses.length > 0, 'an <Install> block');
			assert.deepEqual([...new Set(statuses)], [installStatus(platform)], 'the install block matches the pin in samples/pins');
			assert.doesNotMatch(text, /not (yet )?published|will become 0\.1\.0/i);
			assert.match(text, /run as tests against polyjose\b/);
			const code = codeBlocks(body).join('\n');
			assert.match(code, /SignCompact|sign_compact/, 'a first sign');
			assert.match(code, /VerifyCompact|verify_compact/, 'a first verify');
			assert.match(code, /Ed25519/, 'the error sample allows only Ed25519');
			assert.match(text, /AlgorithmNotAllowed/);
		});
	}
});

describe('platform facts', () => {
	test('Rust: MSRV and the off-by-default deflate feature', () => {
		const { text } = page(PAGES.rust);
		assert.match(text, /Rust 1\.89 or later/);
		assert.match(text, /deflate .*off by default/);
	});

	test('Node.js: the Node floor and the glibc floor', () => {
		const { text } = page(PAGES.node);
		assert.match(text, /Node\.js 22\.12 or later/);
		assert.match(text, /glibc 2\.28 or later/);
		assert.match(text, /ESM only/);
		assert.match(text, /macOS on Apple silicon: arm64/);
		assert.match(text, /all seven addons/);
		assert.doesNotMatch(text, /macOS: x64/, 'no macOS x64 addon');
	});

	test('Web: CSP, tested runtimes, and the @polyjose/wasm import', () => {
		const { body, text } = page(PAGES.web);
		assert.match(text, /'wasm-unsafe-eval'/);
		assert.match(text, /own tests run the package in Node\.js 22\.12 or later, in headless Chrome and in Cloudflare Workers \(workerd\)/);
		assert.doesNotMatch(text, /Deno|Bun/, 'only verified runtimes are named');
		const code = codeBlocks(body).join('\n');
		assert.match(code, /from '@polyjose\/wasm'/);
		assert.doesNotMatch(code, /@polyjose\/node/, 'the Web page never shows the Node package');
	});

	test('Android and JVM: the Kotlin 2.4 floor, minSdk and both artifacts', () => {
		const { text } = page(PAGES.kotlin);
		assert.match(text, /Kotlin 2\.4 compiler or newer/);
		assert.match(text, /minSdk 23/);
		assert.match(text, /dev\.polyjose:polyjose \(AAR\)/);
		assert.match(text, /dev\.polyjose:polyjose-jvm \(jar\)/);
		assert.match(text, /macOS \(arm64\), Linux \(arm64, x86-64\) and Windows \(x86-64\)/, 'the jar\'s four natives');
	});

	test('Swift: iOS and macOS only, with the minimums Package.swift declares', () => {
		const { html, text } = page(PAGES.swift);
		assert.match(text, /iOS 16 or later, and macOS 13 or later/);
		assert.match(text, /macOS and iOS Simulator code is arm64 only/);
		assert.match(text, /EXCLUDED_ARCHS\[sdk=iphonesimulator\*\] = x86_64/, 'the iOS Simulator setting, in the target\'s build settings');
		const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
		for (const other of ['tvOS', 'watchOS', 'visionOS']) {
			assert.ok(!text.includes(other), `the page names ${other}`);
			assert.ok(!description.includes(other), `the description names ${other}`);
		}
	});
});

// Each binding's Get started page links its example app in the polyjose-examples repository
// (owner, 2026-11-15). Rust has none yet.
describe('example apps', () => {
	const EXAMPLES = 'https://github.com/bharathkontham/polyjose-examples/tree/main/';
	const FOLDERS = { node: 'node', web: 'web', kotlin: 'android', swift: 'ios' };
	for (const [platform, folder] of Object.entries(FOLDERS)) {
		test(`${PAGES[platform]} links the ${folder} example app`, () => {
			const { body } = page(PAGES[platform]);
			assert.ok(body.includes(`href="${EXAMPLES}${folder}"`), `links ${EXAMPLES}${folder}`);
		});
	}
	test('the Rust page links no example app', () => {
		assert.doesNotMatch(page(PAGES.rust).body, /polyjose-examples/);
	});
});
