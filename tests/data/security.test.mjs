// Content tests for the three security pages: Security model, Not supported
// and Reporting a vulnerability. They read the built HTML in dist/, so run
// `npm run build` first (`npm run verify` does).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

// The response targets exactly as polyjose's SECURITY.md (main branch) states
// them: "We acknowledge reports within 72 hours and aim to publish a fix and an
// advisory within 30 days." Change these only together with SECURITY.md.
const SECURITY_MD_TARGETS = Object.freeze({ acknowledgeHours: 72, fixDays: 30 });

const SECURITY_MD_URL = 'https://github.com/bharathkontham/polyjose/blob/main/SECURITY.md';
const REPORT_URL = 'https://github.com/bharathkontham/polyjose/security/advisories/new';
const MARVIN_URL = 'https://rustsec.org/advisories/RUSTSEC-2023-0071.html';

/** The page's own content: the `<main>` element, without the sidebar or table of contents. */
function mainHtml(slug) {
  const file = `${dist}${slug}/index.html`;
  assert.ok(existsSync(file), `${file} is missing; run \`npm run build\` first`);
  const html = readFileSync(file, 'utf8');
  const start = html.indexOf('<main');
  const end = html.indexOf('</main>');
  assert.ok(start !== -1 && end > start, `${slug}: no <main> element`);
  return html.slice(start, end);
}

/** Visible text: tags, scripts and styles removed, common entities decoded, whitespace collapsed. */
function textOf(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The DOM `textContent` of a fragment: tags removed without adding spaces, so
 * `<code>RSA1_5</code>.` reads `RSA1_5.`. Entities are decoded; whitespace is
 * kept as written, apart from trimming the ends.
 */
function textContent(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

/** The HTML from the `<h2>` with this id up to the next `<h2>`. */
function sectionHtml(html, id) {
  const start = html.indexOf(`<h2 id="${id}"`);
  assert.ok(start !== -1, `no <h2 id="${id}">`);
  const end = html.indexOf('<h2', start + 1);
  return html.slice(start, end === -1 ? undefined : end);
}

function hrefs(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
}

function page(slug) {
  const html = mainHtml(slug);
  return { html, text: textOf(html), links: hrefs(html) };
}

function assertPhrases(text, item, phrases) {
  for (const phrase of phrases) {
    const ok = phrase instanceof RegExp ? phrase.test(text) : text.includes(phrase);
    assert.ok(ok, `${item}: expected ${phrase instanceof RegExp ? phrase : JSON.stringify(phrase)} in the page text`);
  }
}

const pages = ['security/model', 'security/not-supported', 'security/reporting'];

test('no security page calls polyjose audited or claims constant-time behaviour', () => {
  for (const slug of pages) {
    const { text } = page(slug);
    assert.doesNotMatch(text, /audited/i, `${slug} uses the word "audited"`);
    assert.doesNotMatch(text, /constant[- ]time/i, `${slug} makes a constant-time claim`);
  }
});

test('Security model: each fact is stated', async (t) => {
  const { text, links } = page('security/model');

  await t.test('1. cryptography', () => {
    assertPhrases(text, 'primitives', ['RustCrypto', 'dalek-cryptography', 'OpenSSL', 'ring', 'aws-lc']);
    assertPhrases(text, 'composition', [/never implements? (them|a primitive|its own)/i]);
    assertPhrases(text, 'randomness', ['operating system', 'CSPRNG']);
  });

  await t.test('2. dependencies', () => {
    assertPhrases(text, 'core dependencies', ['subtle', 'zeroize', 'getrandom']);
    assertPhrases(text, 'own utilities', ['base64url', 'JSON', 'DER', 'PEM', /\berror (types|handling)\b|\berrors\b/]);
    assertPhrases(text, 'allowlist', [/\btest suite\b[^.]*\ballowlist\b/]);
    assert.ok(links.includes('/security/cryptographic-foundations/'), 'links to Security › Cryptographic foundations');
  });

  await t.test('3. algorithm verification', () => {
    assertPhrases(text, 'allow-lists', ['allow-list', 'enc', /empty list/i]);
    assertPhrases(text, 'none', [/`?none`? is never accepted/i]);
    assertPhrases(text, 'keys', [/under 2048 bits/, /on the curve/i]);
    assertPhrases(text, 'embedded keys', ['jwk', 'jku', 'x5c', 'kid', /never select/i]);
    assertPhrases(text, 'citations', [
      'RFC 8725 §2.1',
      'Weak Signatures and Insufficient Signature Validation',
      'RFC 8725 §3.1',
      'RFC 8725 §3.2',
    ]);
    assert.doesNotMatch(text, /algorithm confusion/i, 'RFC 8725 §2.1 is not titled "algorithm confusion"');
  });

  await t.test('4. JWS', () => {
    assertPhrases(text, 'limits', [/serialized JWS may be at most 1 MiB/, /at most 16 signatures/]);
    assertPhrases(text, 'Ed25519', [/Ed25519[^.]*strict/]);
    assertPhrases(text, 'b64', ['b64', 'crit', 'RFC 7797 §6']);
  });

  await t.test('5. JWE', () => {
    assertPhrases(text, 'one decryption error', ['DecryptionFailed', 'padding oracle']);
    assertPhrases(text, 'PBES2', [/(?<![\d,])at most 10,000 by default/, /up to 1,000,000(?![\d,])/, 'RFC 7518 §4.8.1.2', 'RFC 8725 §3.5', /high-entropy/i]);
    assertPhrases(text, 'limits', [/serialized JWE may be at most 1 MiB/, /at most 16 recipients/]);
    assertPhrases(text, 'compression', [/(?<![\d,])250,000 bytes/, 'deflate', 'RFC 8725 §3.6']);
  });

  await t.test('6. JWT defaults', () => {
    assertPhrases(text, 'exp', [/`?exp`? is required/i]);
    assertPhrases(text, 'leeway', [/(?<![\d,])60 seconds by default/, /capped at (?<![\d,])600 seconds/]);
    assertPhrases(text, 'aud', ['aud']);
    assertPhrases(text, 'typ', ['typ', 'JWT']);
    assertPhrases(text, 'nesting', [/one level of nesting/i, /separate entry points/i]);
    assertPhrases(text, 'clock', [/whole seconds/i]);
    assertPhrases(text, 'citations', [
      'RFC 7519 §4.1.3',
      'RFC 7519 §4.1.4',
      'RFC 8725 §3.8',
      'RFC 8725 §3.9',
      'RFC 8725 §3.11',
      'RFC 8725 §3.12',
    ]);
  });

  await t.test('7. JWK Sets', () => {
    assertPhrases(text, 'filter', ['kid', 'alg', 'use', 'key_ops']);
    assertPhrases(text, 'bound', [/at most 8\b/i, /in order/i]);
    assertPhrases(text, 'RSA private key in a set', [/set (that )?contain(s|ing) an RSA private key/i]);
  });

  await t.test('8. secrets in memory', () => {
    assertPhrases(text, 'Rust side', [/zeroized/i, 'Debug', /error messages/i]);
    assertPhrases(text, 'host strings', [/strings/i, 'Uint8Array', 'ByteArray', 'Data']);
    assertPhrases(text, 'how to wipe', ['fill(0)', 'resetBytes']);
    assertPhrases(text, 'UniFFI residuals', [/one un-wiped copy/i, /record argument/i, /returned secret/i]);
    assertPhrases(text, 'UniFFI residuals, byte results', [/returned secret byte array[^.]*at least two/i]);
    assertPhrases(text, 'records redact their secrets', ['JwsSigner', 'JweRecipient', 'toString', 'description', '<redacted, ', /never log/i]);
    assert.doesNotMatch(text, /print every field, including the key/i, 'the Kotlin and Swift records redact their keys');
  });

  await t.test('9. errors', () => {
    assertPhrases(text, 'stable codes', [/stable/i, /never (include|contain)/i]);
    assert.ok(links.includes('/concepts/errors/'), 'links to Concepts › Errors');
  });

  await t.test('10. status', () => {
    assertPhrases(text, 'status', ['pre-1.0', /independent (security )?review[^.]*\bis planned before 1\.0/i]);
  });
});

test('Not supported: every item has its fixed heading id, reason and alternative', async (t) => {
  const { html, text, links } = page('security/not-supported');
  const ids = ['rsa-private-keys', 'rsa1_5', 'sha-1', 'zip-in-bindings', 'decode-without-verify', 'out-of-scope', 'java'];

  await t.test('heading ids', () => {
    for (const id of ids) {
      assert.match(html, new RegExp(`<h2 id="${id}"`), `an <h2> with id "${id}"`);
    }
  });

  await t.test('RSA private keys', () => {
    assert.ok(links.includes(MARVIN_URL), 'links the RUSTSEC-2023-0071 advisory');
    assertPhrases(text, 'reason and alternative', [
      'RUSTSEC-2023-0071',
      'Marvin',
      'RS256',
      'PS256',
      'RSA-OAEP-256',
      'UnsupportedAlgorithm',
      /fixed `?rsa`? release/i,
    ]);
  });

  await t.test('RSA1_5', () => {
    assertPhrases(text, 'RSA1_5', ['RSA1_5', /either direction/i, 'RFC 8725 §3.2']);
  });

  await t.test('SHA-1', () => {
    assertPhrases(text, 'SHA-1', ['RSA-OAEP', /SHA-1 thumbprints/i, 'x5t', 'ECDH-ES']);
  });

  await t.test('zip in the bindings', () => {
    assertPhrases(text, 'zip', ['zip', 'compress: true', 'deflate', 'Node', 'Kotlin', 'Swift']);
  });

  await t.test('decode without verify, out of scope, Java', () => {
    assertPhrases(text, 'decode', [/decode/i, 'JWS', 'JWE']);
    assertPhrases(text, 'out of scope', ['Ed448', 'X448', 'X.509', 'HPKE', 'COSE', '0.1.0']);
    assertPhrases(text, 'Java', ['Java', 'Kotlin', /awkward/i]);
  });

  // The pointer to the JWK Sets guide, which shows key selection from a set.
  await t.test('decode without verify: points to the JWK Sets guide', () => {
    const start = html.indexOf('<h2 id="decode-without-verify"');
    const end = html.indexOf('<h2', start + 1);
    assert.ok(start !== -1 && end > start, 'no decode-without-verify section');
    const section = textOf(html.slice(start, end));
    assert.ok(links.includes('/guides/jwk-sets/'), 'links the JWK Sets guide');
    assert.match(section, /pass the issuer[’']s whole JWK Set and let polyjose select candidates; the JWK Sets guide shows how\./);
    assert.doesNotMatch(section, /will cover|when it arrives/, 'the guide is written now');
  });
});

// The public conformance statement, as its text content renders (the code
// spans around RSA-OAEP and RSA1_5 become plain text). It is published
// verbatim on Concepts › Algorithms and here; tests/data/concepts.test.mjs
// holds the same string. Change it only together with the accepted decision.
const CONFORMANCE =
  'Conforms to RFC 7518: implements every algorithm marked Required. It deliberately omits RSA-OAEP (SHA-1), RSA signing and decryption (pending RUSTSEC-2023-0071, see the security page) and RSA1_5.';
const CONFORMANCE_FRAMING = 'When 0.1.0 is released, it will conform as follows:';

test('Not supported: the SHA-1 section quotes the conformance statement verbatim', async (t) => {
  const section = sectionHtml(page('security/not-supported').html, 'sha-1');
  const quotes = [...section.matchAll(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi)];
  assert.equal(quotes.length, 1, 'one blockquote in the SHA-1 section');
  const [whole, inner] = quotes[0];

  await t.test('text content, character for character', () => {
    assert.equal(textContent(inner), CONFORMANCE);
  });

  await t.test('code spans and the link', () => {
    assert.deepEqual(
      [...inner.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/gi)].map((m) => textContent(m[1])),
      ['RSA-OAEP', 'RSA1_5'],
      'exactly RSA-OAEP and RSA1_5 are code spans',
    );
    assert.match(inner, /omits <code\b[^>]*>RSA-OAEP<\/code> \(SHA-1\)/);
    assert.match(inner, /and <code\b[^>]*>RSA1_5<\/code>\./);
    const anchors = [...inner.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
    assert.equal(anchors.length, 1, 'only "the security page" is a link');
    assert.equal(textContent(anchors[0][2]), 'the security page');
    // The reader is already on the security page, so it links the heading.
    assert.match(anchors[0][1], /\bhref="#rsa-private-keys"/);
  });

  await t.test('the framing line comes right before it', () => {
    const before = section.slice(0, section.indexOf(whole));
    const paragraphs = [...before.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
    assert.ok(paragraphs.length > 0, 'no paragraph before the blockquote');
    const last = paragraphs.at(-1);
    assert.equal(textContent(last[1]), CONFORMANCE_FRAMING);
    const between = before.slice(last.index + last[0].length);
    assert.equal(textContent(between), '', 'nothing between the framing line and the blockquote');
  });
});

test('Reporting: private channel, SECURITY.md, targets as SECURITY.md states them, scope', () => {
  const { text, links } = page('security/reporting');
  assert.ok(links.includes(REPORT_URL), 'links GitHub private vulnerability reporting');
  assert.ok(links.includes(SECURITY_MD_URL), 'links SECURITY.md on GitHub');
  assertPhrases(text, 'channel', ['Report a vulnerability', /public issue/i]);
  assertPhrases(text, 'targets', [
    `${SECURITY_MD_TARGETS.acknowledgeHours} hours`,
    `${SECURITY_MD_TARGETS.fixDays} days`,
  ]);
  assertPhrases(text, 'scope', [
    /signature or MAC bypass/i,
    /algorithm confusion/i,
    /key or plaintext disclosure/i,
    /timing side channels/i,
    /panics on untrusted input/i,
    /memory/i,
  ]);
});
