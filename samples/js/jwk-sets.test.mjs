// The samples of Guides › JWK Sets (src/content/docs/guides/jwk-sets.mdx).
// The Web run executes this same file with `@polyjose/node` replaced by `@polyjose/wasm`.
//
// Validating JWTs against a JWK Set (RFC 7517 §5) and choosing a key from one. The set is
// samples/fixtures/jwks.json: the public halves of the RFC 7515 A.3.1 P-256 key and the RFC 8037
// A.1 Ed25519 key, each with a `kid` (RFC 7517 §4.5), `alg` (§4.4) and `use` (§4.2). The tokens
// are signed with the private halves, whose `kid` the JWT header carries (RFC 7515 §4.1.4).
// The last sample keeps a set of one's own keys, with an RSA private member (RFC 7518 §6.3.2) for
// RSA-OAEP-256 decryption, and publishes its public halves (RFC 7517 §4).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  jweDecryptCompact,
  jweEncryptCompact,
  jwksSelect,
  jwkToPublic,
  jwtSign,
  jwtVerifyWithJwks,
  PolyjoseError,
} from '@polyjose/node';
import { fixtureJwk } from './lib/fixtures.mjs';

/**
 * The text of samples/fixtures/jwks.json, found by walking up from this file (the Web run
 * executes a copy of it from another directory).
 */
function readJwksFixture() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, 'fixtures', 'jwks.json');
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
    const parent = dirname(dir);
    if (parent === dir) throw new Error('samples/fixtures/jwks.json not found');
    dir = parent;
  }
}

const ISSUER = 'https://issuer.example';
const AUDIENCE = 'https://api.example';
/** A fixture private key with a `kid`, so the signed JWT names it (RFC 7515 §4.1.4). */
const signingKey = (name, kid) => ({ ...fixtureJwk(name), kid });
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** A JWT from ISSUER for AUDIENCE, valid for five minutes. */
function issue(key, alg, claims = {}) {
  return jwtSign({ iss: ISSUER, sub: 'user-123', aud: AUDIENCE, exp: nowSeconds() + 300, ...claims }, key, { alg });
}

/** The PolyjoseError code `promise` rejects with; fails the test if it resolves. */
async function codeOf(promise) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof PolyjoseError) return err.code;
    throw err;
  }
  assert.fail('expected a PolyjoseError');
}

test('verify a JWT against a JWK Set', async () => {
  // Stands in for the body of the issuer's jwks_uri response, fetched and cached by the app.
  const jwksText = readJwksFixture();
  const token = await issue(signingKey('p256', 'p256-2026'), 'ES256');
  // docs:start jwk-sets/verify
  // `jwksText` is the JWK Set your application fetched from the issuer's jwks_uri.
  const verified = await jwtVerifyWithJwks(token, jwksText, {
    allowedAlgs: ['ES256', 'Ed25519'],
    issuers: ['https://issuer.example'],
    audiences: ['https://api.example'],
  });
  // verified.kid === "p256-2026", verified.keyIndex === 0
  // docs:end jwk-sets/verify
  assert.equal(verified.kid, 'p256-2026');
  assert.equal(verified.keyIndex, 0);
  assert.equal(verified.claims.sub, 'user-123');
  const second = await jwtVerifyWithJwks(await issue(signingKey('ed25519', 'ed25519-2026'), 'Ed25519'), jwksText, {
    allowedAlgs: ['ES256', 'Ed25519'],
    issuers: [ISSUER],
    audiences: [AUDIENCE],
  });
  assert.equal(second.kid, 'ed25519-2026');
  assert.equal(second.keyIndex, 1);
});

test('no key in the set fits: NoMatchingKey', async () => {
  const jwksText = readJwksFixture();
  const token = await issue(signingKey('p256', 'retired-2025'), 'ES256');
  // docs:start jwk-sets/no-matching-key
  // The token names a kid the set doesn't have, such as a retired key.
  let code;
  try {
    await jwtVerifyWithJwks(token, jwksText, {
      allowedAlgs: ['ES256', 'Ed25519'],
      issuers: ['https://issuer.example'],
      audiences: ['https://api.example'],
    });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "NoMatchingKey"
  }
  // docs:end jwk-sets/no-matching-key
  assert.equal(code, 'NoMatchingKey');
  // An alg outside the allow-list fails before any key is chosen.
  const ok = await issue(signingKey('p256', 'p256-2026'), 'ES256');
  assert.equal(await codeOf(jwtVerifyWithJwks(ok, jwksText, { allowedAlgs: ['Ed25519'], issuers: [ISSUER], audiences: [AUDIENCE] })), 'AlgorithmNotAllowed');
});

test("a token from another issuer fails against this issuer's set", async () => {
  const jwksText = readJwksFixture();
  const token = await issue(signingKey('p256', 'p256-2026'), 'ES256', { iss: 'https://other.example' });
  // docs:start jwk-sets/issuer
  // Pass each issuer's set together with that issuer.
  let code;
  try {
    await jwtVerifyWithJwks(token, jwksText, {
      allowedAlgs: ['ES256', 'Ed25519'],
      issuers: ['https://issuer.example'],
      audiences: ['https://api.example'],
    });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "InvalidClaim": the iss doesn't match
  }
  // docs:end jwk-sets/issuer
  assert.equal(code, 'InvalidClaim');
});

test('select one key from a set', async () => {
  const jwksText = readJwksFixture();
  // docs:start jwk-sets/select
  const key = await jwksSelect(jwksText, { kid: 'p256-2026', alg: 'ES256' });
  // key is the P-256 public JWK with "kid": "p256-2026"
  // docs:end jwk-sets/select
  assert.equal(key.kid, 'p256-2026');
  assert.equal(key.kty, 'EC');
  assert.equal(key.crv, 'P-256');
  assert.equal(key.d, undefined);
  assert.equal(await codeOf(jwksSelect(jwksText, { kid: 'retired-2025' })), 'NoMatchingKey');
});

test('a selector that matches two keys: MultipleMatchingKeys', async () => {
  const jwksText = readJwksFixture();
  // docs:start jwk-sets/select-ambiguous
  // Both keys are signing keys, so "use": "sig" alone doesn't pick one.
  let code;
  try {
    await jwksSelect(jwksText, { keyUse: 'sig' });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "MultipleMatchingKeys"
  }
  // docs:end jwk-sets/select-ambiguous
  assert.equal(code, 'MultipleMatchingKeys');
});

test('a set of your own keys holds an RSA-OAEP-256 decryption key', async () => {
  const privateJwks = {
    keys: [
      { ...fixtureJwk('p256'), kid: 'p256-2026', alg: 'ES256', use: 'sig' },
      { ...fixtureJwk('rsa-private'), kid: 'enc-2026', alg: 'RSA-OAEP-256', use: 'enc' },
    ],
  };
  // A sender encrypts to the published RSA key.
  const token = await jweEncryptCompact(new TextEncoder().encode('top secret'), {
    enc: 'A256GCM',
    recipients: [{ alg: 'RSA-OAEP-256', key: { ...fixtureJwk('rsa-public'), kid: 'enc-2026' } }],
  });
  // docs:start jwk-sets/rsa-private
  // `privateJwks` is your own set, private members included: never publish it as it is.
  const key = await jwksSelect(privateJwks, { kid: 'enc-2026', alg: 'RSA-OAEP-256' });
  const decrypted = await jweDecryptCompact(token, key, {
    allowedAlgs: ['RSA-OAEP-256'],
    allowedEnc: ['A256GCM'],
  });

  // Publish the public halves only.
  const published = { keys: await Promise.all(privateJwks.keys.map((k) => jwkToPublic(k))) };
  // docs:end jwk-sets/rsa-private
  assert.equal(new TextDecoder().decode(decrypted.plaintext), 'top secret');
  assert.equal(key.kid, 'enc-2026');
  assert.equal(key.d, fixtureJwk('rsa-private').d, 'the RSA private member is kept as imported');
  assert.equal(published.keys.length, 2);
  for (const k of published.keys) {
    for (const secret of ['d', 'p', 'q', 'dp', 'dq', 'qi']) assert.equal(k[secret], undefined, `${k.kid}: ${secret}`);
  }
  assert.deepEqual(published.keys[1], { ...fixtureJwk('rsa-public'), kid: 'enc-2026', alg: 'RSA-OAEP-256', use: 'enc' });
});
