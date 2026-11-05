// Tests for the Concepts pages: the data files they render from, and the
// built HTML in dist/ (run `npm run build` first; `npm run verify` does).
//
// The IANA spellings, usage locations, requirement levels and references below
// were copied from the IANA "JSON Web Signature and Encryption Algorithms" and
// "JSON Web Encryption Compression Algorithms" registries
// (https://www.iana.org/assignments/jose/). The RFC titles come from
// rfc-editor.org. They are fixtures on purpose: a data file that drifts from the
// registry fails here, instead of being compared with itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

const algorithms = readJson('src/data/algorithms.json');
const errorCodes = readJson('src/data/error-codes.json');
const standards = readJson('src/data/standards.json');

// name -> [usage location, JOSE Implementation Requirements, reference]
const IANA = {
	HS256: ['alg', 'Required', 'RFC 7518 §3.2'],
	HS384: ['alg', 'Optional', 'RFC 7518 §3.2'],
	HS512: ['alg', 'Optional', 'RFC 7518 §3.2'],
	RS256: ['alg', 'Recommended', 'RFC 7518 §3.3'],
	RS384: ['alg', 'Optional', 'RFC 7518 §3.3'],
	RS512: ['alg', 'Optional', 'RFC 7518 §3.3'],
	ES256: ['alg', 'Recommended+', 'RFC 7518 §3.4'],
	ES384: ['alg', 'Optional', 'RFC 7518 §3.4'],
	ES512: ['alg', 'Optional', 'RFC 7518 §3.4'],
	PS256: ['alg', 'Optional', 'RFC 7518 §3.5'],
	PS384: ['alg', 'Optional', 'RFC 7518 §3.5'],
	PS512: ['alg', 'Optional', 'RFC 7518 §3.5'],
	none: ['alg', 'Optional', 'RFC 7518 §3.6'],
	RSA1_5: ['alg', 'Recommended-', 'RFC 7518 §4.2'],
	'RSA-OAEP': ['alg', 'Recommended+', 'RFC 7518 §4.3'],
	'RSA-OAEP-256': ['alg', 'Optional', 'RFC 7518 §4.3'],
	A128KW: ['alg', 'Recommended', 'RFC 7518 §4.4'],
	A192KW: ['alg', 'Optional', 'RFC 7518 §4.4'],
	A256KW: ['alg', 'Recommended', 'RFC 7518 §4.4'],
	dir: ['alg', 'Recommended', 'RFC 7518 §4.5'],
	'ECDH-ES': ['alg', 'Recommended+', 'RFC 7518 §4.6'],
	'ECDH-ES+A128KW': ['alg', 'Recommended', 'RFC 7518 §4.6'],
	'ECDH-ES+A192KW': ['alg', 'Optional', 'RFC 7518 §4.6'],
	'ECDH-ES+A256KW': ['alg', 'Recommended', 'RFC 7518 §4.6'],
	A128GCMKW: ['alg', 'Optional', 'RFC 7518 §4.7'],
	A192GCMKW: ['alg', 'Optional', 'RFC 7518 §4.7'],
	A256GCMKW: ['alg', 'Optional', 'RFC 7518 §4.7'],
	'PBES2-HS256+A128KW': ['alg', 'Optional', 'RFC 7518 §4.8'],
	'PBES2-HS384+A192KW': ['alg', 'Optional', 'RFC 7518 §4.8'],
	'PBES2-HS512+A256KW': ['alg', 'Optional', 'RFC 7518 §4.8'],
	'A128CBC-HS256': ['enc', 'Required', 'RFC 7518 §5.2.3'],
	'A192CBC-HS384': ['enc', 'Optional', 'RFC 7518 §5.2.4'],
	'A256CBC-HS512': ['enc', 'Required', 'RFC 7518 §5.2.5'],
	A128GCM: ['enc', 'Recommended', 'RFC 7518 §5.3'],
	A192GCM: ['enc', 'Optional', 'RFC 7518 §5.3'],
	A256GCM: ['enc', 'Recommended', 'RFC 7518 §5.3'],
	ES256K: ['alg', 'Optional', 'RFC 8812 §3.2'],
	// EdDSA is defined by RFC 8037 §3.1; RFC 9864 §4.1.2 set it to Deprecated
	// and IANA now references RFC 9864 §2.2 for it.
	EdDSA: ['alg', 'Deprecated', 'RFC 9864 §2.2'],
	Ed25519: ['alg', 'Optional', 'RFC 9864 §2.2'],
};
const IANA_ZIP = { DEF: ['zip', null, 'RFC 7516'] };

// What polyjose does with each identifier.
const EXPECTED_STATUS = {
	'jws-alg': {
		HS256: 'yes', HS384: 'yes', HS512: 'yes',
		RS256: 'verify-only', RS384: 'verify-only', RS512: 'verify-only',
		PS256: 'verify-only', PS384: 'verify-only', PS512: 'verify-only',
		ES256: 'yes', ES384: 'yes', ES512: 'yes', ES256K: 'yes',
		Ed25519: 'yes', EdDSA: 'yes', none: 'no',
	},
	'jwe-alg': {
		'RSA-OAEP-256': 'encrypt-only',
		A128KW: 'yes', A192KW: 'yes', A256KW: 'yes',
		A128GCMKW: 'yes', A192GCMKW: 'yes', A256GCMKW: 'yes', dir: 'yes',
		'ECDH-ES': 'yes', 'ECDH-ES+A128KW': 'yes', 'ECDH-ES+A192KW': 'yes', 'ECDH-ES+A256KW': 'yes',
		'PBES2-HS256+A128KW': 'yes', 'PBES2-HS384+A192KW': 'yes', 'PBES2-HS512+A256KW': 'yes',
		'RSA-OAEP': 'no', RSA1_5: 'no',
	},
	'jwe-enc': {
		'A128CBC-HS256': 'yes', 'A192CBC-HS384': 'yes', 'A256CBC-HS512': 'yes',
		A128GCM: 'yes', A192GCM: 'yes', A256GCM: 'yes',
	},
	zip: { DEF: 'yes' },
};
const GROUP_OPERATIONS = {
	'jws-alg': ['sign', 'verify'],
	'jwe-alg': ['encrypt', 'decrypt'],
	'jwe-enc': ['encrypt', 'decrypt'],
	zip: ['compress', 'decompress'],
};
const GROUP_USAGE = { 'jws-alg': 'alg', 'jwe-alg': 'alg', 'jwe-enc': 'enc', zip: 'zip' };
const STATUSES = ['yes', 'verify-only', 'encrypt-only', 'no'];
// Fixed heading ids on Security › Not supported.
const NOT_SUPPORTED_IDS = ['rsa-private-keys', 'rsa1_5', 'sha-1', 'zip-in-bindings', 'decode-without-verify', 'out-of-scope', 'java'];

const ERROR_CODES = [
	'InvalidBase64', 'InvalidJson', 'InvalidHeader', 'InvalidFormat', 'UnsupportedAlgorithm',
	'AlgorithmNotAllowed', 'InvalidKey', 'KeyAlgorithmMismatch', 'InvalidSignature', 'DecryptionFailed',
	'UnknownCritical', 'TokenExpired', 'TokenNotYetValid', 'InvalidClaim', 'NoMatchingKey',
	'RandomnessUnavailable',
];

const RFC_TITLES = {
	7515: 'JSON Web Signature (JWS)',
	7516: 'JSON Web Encryption (JWE)',
	7517: 'JSON Web Key (JWK)',
	7518: 'JSON Web Algorithms (JWA)',
	7519: 'JSON Web Token (JWT)',
	7520: 'Examples of Protecting Content Using JSON Object Signing and Encryption (JOSE)',
	7638: 'JSON Web Key (JWK) Thumbprint',
	7797: 'JSON Web Signature (JWS) Unencoded Payload Option',
	8037: 'CFRG Elliptic Curve Diffie-Hellman (ECDH) and Signatures in JSON Object Signing and Encryption (JOSE)',
	8725: 'JSON Web Token Best Current Practices',
	8812: 'CBOR Object Signing and Encryption (COSE) and JSON Object Signing and Encryption (JOSE) Registrations for Web Authentication (WebAuthn) Algorithms',
	9068: 'JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens',
	9278: 'JWK Thumbprint URI',
	9864: 'Fully-Specified Algorithms for JSON Object Signing and Encryption (JOSE) and CBOR Object Signing and Encryption (COSE)',
};

// The operations of the binding surface, in camelCase, grouped as on the page.
const OPERATIONS = {
	Utilities: ['version', 'errorCodes', 'base64urlEncode', 'base64urlDecode'],
	JWK: [
		'jwkParse', 'jwkToPublic', 'jwkThumbprint', 'jwkThumbprintUri', 'jwksSelect',
		'jwkGenerateOct', 'jwkGenerateEc', 'jwkGenerateOkp', 'jwkGenerateForAlg',
		'jwkFromPem', 'jwkFromDer', 'jwkToPem', 'jwkToDer',
	],
	JWS: ['jwsSignCompact', 'jwsSignFlattened', 'jwsSignGeneral', 'jwsVerifyCompact', 'jwsVerifyJson'],
	JWE: ['jweEncryptCompact', 'jweEncryptJson', 'jweDecryptCompact', 'jweDecryptJson'],
	JWT: ['jwtSign', 'jwtVerify', 'jwtVerifyWithJwks', 'jwtEncryptNested', 'jwtDecryptNested', 'jwtDecryptNestedWithJwks'],
};

// The conformance statement, as its text content renders (code spans become
// plain text). It must match character for character.
const CONFORMANCE =
	'Conforms to RFC 7518: implements every algorithm marked Required. It deliberately omits RSA-OAEP (SHA-1), RSA signing and decryption (pending RUSTSEC-2023-0071, see the security page) and RSA1_5.';

const rows = (groupId) => algorithms.groups.find((g) => g.id === groupId)?.rows ?? [];
const allRows = () => algorithms.groups.flatMap((g) => g.rows.map((r) => ({ group: g.id, ...r })));
const refOf = (spec) => `RFC ${spec.rfc}${spec.section ? ` §${spec.section}` : ''}`;

// --- Built HTML helpers -------------------------------------------------

const decode = (s) =>
	s
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');
const textOf = (fragment) =>
	decode(fragment.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ''));

function page(slug) {
	const file = new URL(`dist/${slug}/index.html`, root);
	assert.ok(existsSync(file), `dist/${slug}/index.html is missing: run \`npm run build\` first`);
	const html = readFileSync(file, 'utf8');
	const main = html.match(/<main\b[\s\S]*?<\/main>/i);
	assert.ok(main, `no <main> in dist/${slug}/index.html`);
	return main[0];
}
const all = (html, re) => [...html.matchAll(re)];
const codeTexts = (html) => new Set(all(html, /<code\b[^>]*>([\s\S]*?)<\/code>/gi).map((m) => textOf(m[1])));

// --- algorithms.json ----------------------------------------------------

test('algorithms.json has the four groups with their operations', () => {
	assert.deepEqual(
		algorithms.groups.map((g) => g.id),
		['jws-alg', 'jwe-alg', 'jwe-enc', 'zip'],
	);
	for (const g of algorithms.groups) {
		assert.deepEqual(g.operations, GROUP_OPERATIONS[g.id], `${g.id} operations`);
		assert.equal(g.header, GROUP_USAGE[g.id], `${g.id} header parameter`);
		assert.ok(g.caption?.length > 0, `${g.id} needs a caption`);
	}
});

test('every identifier is spelled exactly as in the IANA registry', () => {
	for (const r of allRows()) {
		// Object keys compare by exact code units, so this is a byte-for-byte check.
		const registry = r.group === 'zip' ? IANA_ZIP : IANA;
		assert.ok(Object.hasOwn(registry, r.name), `${JSON.stringify(r.name)} is not an IANA spelling`);
		const iana = registry[r.name];
		assert.equal(iana[0], GROUP_USAGE[r.group], `${r.name} is registered for ${iana[0]}, not ${r.group}`);
	}
});

test('requirement levels and references match the registry', () => {
	for (const r of allRows().filter((x) => x.group !== 'zip')) {
		const [, level, ref] = IANA[r.name];
		assert.equal(r.level, level, `${r.name} level`);
		const levelRef = r.levelSpec ? refOf(r.levelSpec) : refOf(r.spec);
		if (r.name === 'EdDSA') {
			assert.equal(refOf(r.spec), 'RFC 8037 §3.1', 'EdDSA is defined by RFC 8037 §3.1');
			assert.equal(levelRef, 'RFC 9864 §4.1.2', 'EdDSA was deprecated by RFC 9864 §4.1.2');
		} else {
			assert.equal(refOf(r.spec), ref, `${r.name} reference`);
		}
	}
	const [def] = rows('zip');
	assert.equal(refOf(def.spec), 'RFC 7516 §4.1.3');
});

test('each group lists exactly the expected identifiers with the expected status', () => {
	for (const [groupId, expected] of Object.entries(EXPECTED_STATUS)) {
		const got = Object.fromEntries(rows(groupId).map((r) => [r.name, r.status]));
		assert.deepEqual(got, expected, groupId);
		assert.equal(rows(groupId).length, Object.keys(expected).length, `${groupId} has a duplicate row`);
	}
});

test('statuses are valid for their group and link into Not supported when limited', () => {
	for (const r of allRows()) {
		assert.ok(STATUSES.includes(r.status), `${r.name}: unknown status ${r.status}`);
		if (r.status === 'verify-only') assert.equal(r.group, 'jws-alg', `${r.name}: verify-only outside JWS`);
		if (r.status === 'encrypt-only') assert.equal(r.group, 'jwe-alg', `${r.name}: encrypt-only outside JWE alg`);
		if (r.notSupported !== undefined) {
			assert.ok(NOT_SUPPORTED_IDS.includes(r.notSupported), `${r.name}: unknown Not supported id ${r.notSupported}`);
		}
		const limited = r.status !== 'yes' || r.group === 'zip';
		if (limited && r.name !== 'none') assert.ok(r.notSupported, `${r.name} needs a Not supported link key`);
		assert.ok(r.description?.length > 0, `${r.name} needs a description`);
		assert.ok(r.key?.length > 0, `${r.name} needs a key type`);
	}
	const key = (name) => allRows().find((r) => r.name === name).notSupported;
	for (const n of ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'RSA-OAEP-256']) assert.equal(key(n), 'rsa-private-keys');
	assert.equal(key('RSA-OAEP'), 'sha-1');
	assert.equal(key('RSA1_5'), 'rsa1_5');
	assert.equal(key('DEF'), 'zip-in-bindings');
});

test('Ed25519 is recommended, EdDSA deprecated, none never accepted', () => {
	const byName = Object.fromEntries(rows('jws-alg').map((r) => [r.name, r]));
	assert.equal(byName.Ed25519.recommended, true);
	assert.equal(byName.EdDSA.deprecated, true);
	assert.match(byName.none.note, /never accepted/i);
	assert.match(byName.none.note, /AlgorithmNotAllowed/);
});

test('ECDH-ES covers P-256, P-384, P-521 and X25519; PBES2 is bounded', () => {
	for (const r of rows('jwe-alg').filter((x) => x.name.startsWith('ECDH-ES'))) {
		for (const crv of ['P-256', 'P-384', 'P-521', 'X25519']) assert.ok(r.key.includes(crv), `${r.name} missing ${crv}`);
	}
	for (const r of rows('jwe-alg').filter((x) => x.name.startsWith('PBES2-'))) {
		assert.match(r.note, /10,000/, `${r.name} must state the iteration bound`);
	}
	assert.match(rows('zip')[0].note, /deflate/);
});

test('every algorithm RFC 7518 marks Required is implemented', () => {
	const required = Object.entries(IANA).filter(([, [, level]]) => level === 'Required').map(([n]) => n);
	assert.deepEqual(required.sort(), ['A128CBC-HS256', 'A256CBC-HS512', 'HS256']);
	for (const n of required) assert.equal(allRows().find((r) => r.name === n).status, 'yes', n);
});

// --- error-codes.json ---------------------------------------------------

test('error-codes.json lists exactly the stable codes', () => {
	const codes = errorCodes.codes.map((c) => c.code);
	assert.equal(new Set(codes).size, codes.length, 'duplicate code');
	assert.deepEqual([...codes].sort(), [...ERROR_CODES].sort());
});

test('each error code has a one-sentence meaning and typical causes', () => {
	for (const c of errorCodes.codes) {
		assert.match(c.meaning, /^[A-Z`].*\.$/, `${c.code}: meaning must be a sentence`);
		assert.equal((c.meaning.match(/[.!?](\s|$)/g) ?? []).length, 1, `${c.code}: meaning must be one sentence`);
		assert.ok(Array.isArray(c.causes) && c.causes.length > 0, `${c.code}: needs causes`);
		for (const cause of c.causes) assert.ok(typeof cause === 'string' && cause.length > 0, `${c.code}: empty cause`);
	}
});

// --- standards.json -----------------------------------------------------

test('standards.json lists the fourteen RFCs with titles, links and scope', () => {
	assert.deepEqual(
		standards.rfcs.map((s) => s.rfc),
		Object.keys(RFC_TITLES).map(Number),
	);
	for (const s of standards.rfcs) {
		assert.equal(s.title, RFC_TITLES[s.rfc], `RFC ${s.rfc} title`);
		assert.equal(s.url, `https://www.rfc-editor.org/rfc/rfc${s.rfc}`, `RFC ${s.rfc} url`);
		assert.ok(s.implements?.length > 0, `RFC ${s.rfc}: what polyjose implements`);
	}
	const by = Object.fromEntries(standards.rfcs.map((s) => [s.rfc, s]));
	assert.deepEqual(by[7518].updatedBy, [9864]);
	assert.deepEqual(by[8037].updatedBy, [9864]);
});

test('standards.json cites verified erratum 8060 and never 7518 erratum 8526', () => {
	assert.deepEqual(standards.errata, [
		{
			eid: 8060,
			rfc: 7519,
			section: '7.2',
			status: 'Verified',
			url: 'https://www.rfc-editor.org/errata/eid8060',
			summary: standards.errata[0].summary,
		},
	]);
	assert.match(standards.errata[0].summary, /crit/);
	assert.doesNotMatch(JSON.stringify(standards), /8526/);
});

// --- Built pages --------------------------------------------------------

test('Algorithms: the conformance statement is published verbatim', () => {
	const html = page('concepts/algorithms');
	const quotes = all(html, /<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi);
	const statement = quotes.find((m) => textOf(m[1]).includes('Conforms to RFC 7518'));
	assert.ok(statement, 'no blockquote with the conformance statement');
	assert.equal(textOf(statement[1]).trim(), CONFORMANCE);
	const inner = statement[1];
	assert.match(inner, /<code\b[^>]*>RSA-OAEP<\/code> \(SHA-1\)/);
	assert.match(inner, /<code\b[^>]*>RSA1_5<\/code>\./);
	assert.match(inner, /<a\b[^>]*href="\/security\/not-supported\/"[^>]*>the security page<\/a>/);
	assert.equal(all(inner, /<code\b/g).length, 2, 'only the two identifiers are code spans');
	assert.equal(all(inner, /<a\b/g).length, 1, 'only "the security page" is a link');
});

test('Algorithms: alternatives and the Required set follow the statement', () => {
	const html = page('concepts/algorithms');
	const after = html.slice(html.indexOf('</blockquote>'));
	const text = textOf(after);
	const alternatives = text.indexOf('RSA-OAEP-256');
	assert.ok(alternatives >= 0, 'alternatives sentence missing');
	assert.match(text.slice(Math.max(0, alternatives - 200), alternatives + 200), /ECDH-ES for new recipients/);
	assert.match(after, /href="https:\/\/www\.rfc-editor\.org\/rfc\/rfc7518#section-3\.1"/);
	assert.match(after, /href="https:\/\/www\.rfc-editor\.org\/rfc\/rfc7518#section-5\.1"/);
	const required = text.slice(text.indexOf('Required'));
	for (const n of ['HS256', 'A128CBC-HS256', 'A256CBC-HS512']) assert.ok(required.includes(n), `Required set misses ${n}`);
});

test('Algorithms: the matrix renders as captioned tables with every identifier', () => {
	const html = page('concepts/algorithms');
	const tables = all(html, /<table\b[^>]*>([\s\S]*?)<\/table>/gi);
	assert.equal(tables.length, algorithms.groups.length, 'one table per group');
	tables.forEach((t, i) => {
		const caption = t[1].match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i);
		assert.ok(caption, `table ${i} has no caption`);
		assert.equal(textOf(caption[1]).trim(), algorithms.groups[i].caption);
		assert.match(t[1], /<th\b[^>]*scope="col"/, `table ${i} needs column headers`);
		const rowHeaders = all(t[1], /<th\b[^>]*scope="row"[^>]*>([\s\S]*?)<\/th>/gi).map((m) => textOf(m[1]).trim());
		assert.deepEqual(rowHeaders, algorithms.groups[i].rows.map((r) => r.name), `table ${i} row headers`);
	});
	const codes = codeTexts(html);
	for (const r of allRows()) assert.ok(codes.has(r.name), `${r.name} is not shown as code`);
	// Until the Not supported headings land, links point at the page itself.
	for (const m of all(html, /href="(\/security\/not-supported\/[^"]*)"/g)) {
		assert.equal(m[1], '/security/not-supported/', 'link to the page, not a heading');
	}
});

test('One API: types, rules and every operation name', () => {
	const html = page('concepts/one-api');
	const text = textOf(html);
	const codes = codeTexts(html);
	for (const t of ['Uint8Array', 'ByteArray', 'Data', 'Vec<u8>', 'u32', 'number', 'UInt', 'UInt32']) {
		assert.ok(codes.has(t), `${t} missing`);
	}
	for (const s of ['@polyjose/node', '@polyjose/wasm', 'AlgorithmNotAllowed', 'jws_verify_compact', 'jwsVerifyCompact']) {
		assert.ok(text.includes(s), `${s} missing`);
	}
	assert.match(text, /whole seconds/);
	assert.match(text, /Promise/);
	for (const [group, names] of Object.entries(OPERATIONS)) {
		assert.ok(all(html, /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi).some((m) => textOf(m[1]).trim() === group), `no ${group} heading`);
		for (const n of names) assert.ok(codes.has(n), `operation ${n} missing`);
	}
	assert.match(text, /not published yet/);
});

test('Errors: every code, how each platform exposes it, and the JWT order', () => {
	const html = page('concepts/errors');
	const text = textOf(html);
	const codes = codeTexts(html);
	for (const c of ERROR_CODES) assert.ok(codes.has(c), `${c} missing`);
	for (const s of ['Error::code()', 'PolyjoseError.code', 'PolyjoseException.code()', 'PolyjoseError.code()']) {
		assert.ok(codes.has(s), `${s} missing`);
	}
	assert.match(text, /never on the message/i);
	assert.match(text, /never contain/i);
	assert.match(text, /first failing check decides/i);
	assert.match(html, /<ol\b/, 'the JWT check order is an ordered list');
	assert.match(html, /<caption\b/, 'the codes table has a caption');
});

test('Standards: every RFC, the 9864 updates and erratum 8060', () => {
	const html = page('concepts/standards');
	const text = textOf(html);
	for (const s of standards.rfcs) {
		assert.ok(html.includes(`href="${s.url}"`), `no link to RFC ${s.rfc}`);
		assert.ok(text.includes(s.title), `RFC ${s.rfc} title missing`);
	}
	assert.ok(html.includes('href="https://www.rfc-editor.org/errata/eid8060"'));
	assert.match(text, /Verified/);
	assert.match(text, /updated by RFC 9864/i);
	assert.match(text, /duplicate/i);
	assert.doesNotMatch(text, /8526/);
});

test('Concepts pages keep to the public writing rules', () => {
	for (const slug of ['concepts/algorithms', 'concepts/one-api', 'concepts/errors', 'concepts/standards']) {
		const text = textOf(page(slug));
		assert.doesNotMatch(text, /audited/i, `${slug}: "audited" is not allowed here`);
		assert.doesNotMatch(text, /constant[- ]time/i, `${slug}: constant-time claims belong on the Security pages`);
		assert.doesNotMatch(text, /\bADR[ -]?\d|\bPRD[ -]?\d|\bT\d{2}\b|\bGate [1-3]\b|-brain\b|\borchestrator\b|\bcode-agent\b/, `${slug}: private reference`);
	}
});
