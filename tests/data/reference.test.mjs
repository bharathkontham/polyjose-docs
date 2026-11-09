// Tests for the platform reference pages. They read the built HTML in dist/, so run
// `npm run build` first (`npm run verify` does).
//
// The facts below moved here from the package READMEs (owner, 2026-11-09: READMEs are for using a
// package, the details live on the site). polyjose's own tests check the Node.js README links to
// /reference/node/; this file checks the page still states what a reader acts on. Importing helpers
// from another test file would run its tests a second time, so this file keeps its own small copies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** The visible text of a built page's content, white space collapsed. */
function pageText(route) {
	const file = `${dist}${route}index.html`;
	assert.ok(existsSync(file), `missing ${file}: run \`npm run build\` before this test`);
	const html = readFileSync(file, 'utf8');
	const at = html.indexOf('class="sl-markdown-content"');
	assert.ok(at > 0, `${route}: no .sl-markdown-content in page`);
	const body = html.slice(html.indexOf('>', at) + 1, html.indexOf('<footer', at));
	return body
		.replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
			e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (entities[e] ?? m),
		)
		.replace(/\s+/g, ' ');
}

test('Node.js package: the glibc floor, the distributions it covers, and Amazon Linux 2', () => {
	const text = pageText('reference/node/');
	assert.match(text, /glibc 2\.28 or later/);
	for (const distro of ['RHEL', 'Debian 11', 'Debian 12', 'Ubuntu 20.04', 'Ubuntu 22.04', 'Ubuntu 24.04', 'Amazon Linux 2023']) {
		assert.ok(text.includes(distro), `it lists ${distro}`);
	}
	assert.match(text, /Amazon Linux 2 \(glibc 2\.26\) is not supported/);
	assert.ok(text.includes('manylinux_2_28'), 'and how the floor is reached');
});

test('Node.js package: the load refusal code and every environment variable the loader reads', () => {
	const text = pageText('reference/node/');
	assert.ok(text.includes('ERR_POLYJOSE_ADDON_REFUSED'));
	for (const name of ['NAPI_RS_NATIVE_LIBRARY_PATH', 'NAPI_RS_FORCE_WASI', 'NAPI_RS_WASI_FLAVOR', 'NAPI_RS_ENFORCE_VERSION_CHECK']) {
		assert.ok(text.includes(name), `it documents ${name}`);
	}
});
