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
    assertPhrases(text, 'own utilities', ['base64url', 'JSON', 'DER', 'PEM', 'errors']);
    assertPhrases(text, 'allowlist', [/CI\b[^.]*\ballowlist\b/]);
    assert.ok(links.includes('/security/cryptographic-foundations/'), 'links to Security › Cryptographic foundations');
  });

  await t.test('3. algorithm verification', () => {
    assertPhrases(text, 'allow-lists', ['allow-list', 'enc', /empty list/i]);
    assertPhrases(text, 'none', [/`?none`? is never accepted/i]);
    assertPhrases(text, 'keys', ['2048 bits', /on the curve/i]);
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
    assertPhrases(text, 'limits', ['1 MiB', '16 signatures']);
    assertPhrases(text, 'Ed25519', [/Ed25519[^.]*strict/]);
    assertPhrases(text, 'b64', ['b64', 'crit', 'RFC 7797 §6']);
  });

  await t.test('5. JWE', () => {
    assertPhrases(text, 'one decryption error', ['DecryptionFailed', 'padding oracle']);
    assertPhrases(text, 'PBES2', ['10,000', '1,000,000', 'RFC 7518 §4.8.1.2', 'RFC 8725 §3.5', /high-entropy/i]);
    assertPhrases(text, 'limits', ['16 recipients']);
    assertPhrases(text, 'compression', ['250,000 bytes', 'deflate', 'RFC 8725 §3.6']);
  });

  await t.test('6. JWT defaults', () => {
    assertPhrases(text, 'exp', [/`?exp`? is required/i]);
    assertPhrases(text, 'leeway', ['60 seconds', '600 seconds']);
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
    assertPhrases(text, 'records that print keys', ['JwsSigner', 'JweRecipient', 'toString', 'description', /never log/i]);
  });

  await t.test('9. errors', () => {
    assertPhrases(text, 'stable codes', [/stable/i, /never (include|contain)/i]);
    assert.ok(links.includes('/concepts/errors/'), 'links to Concepts › Errors');
  });

  await t.test('10. status', () => {
    assertPhrases(text, 'status', ['pre-1.0', /independent (security )?review/i, '1.0']);
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
