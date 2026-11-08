// The samples of Get started › Node.js and Web (WASM) (src/content/docs/start/node.mdx, web.mdx).
// The Web run executes this same file with `@polyjose/node` replaced by `@polyjose/wasm`.
//
// The key is RFC 7515 Appendix A.3.1's P-256 key, a public test key. The JWS is the Compact
// Serialization (RFC 7515 §7.1) with ES256, ECDSA over P-256 and SHA-256 (RFC 7518 §3.4). ECDSA
// signatures are randomized, so each test checks what it can (the header part, the payload, the
// error code) and verifies what it signs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
// docs:start start/js-imports
import { jwsSignCompact, jwsVerifyCompact, PolyjoseError } from '@polyjose/node';
// docs:end start/js-imports
import { fixtureJwk, fixturePublicJwk } from './lib/fixtures.mjs';

/** BASE64URL(UTF8(`{"alg":"ES256"}`)) (RFC 7515 §5.1 steps 3-4). */
const ES256_HEADER_B64U = 'eyJhbGciOiJFUzI1NiJ9';

/** Signs `hello, polyjose` with the fixture P-256 key, as the first-sign sample does. */
function signedToken() {
  return jwsSignCompact(new TextEncoder().encode('hello, polyjose'), fixtureJwk('p256'), {
    protectedHeader: { alg: 'ES256' },
  });
}

test('first sign: ES256 in the compact serialization', async () => {
  const privateKey = fixtureJwk('p256');
  // docs:start start/js-first-sign
  const payload = new TextEncoder().encode('hello, polyjose');
  const token = await jwsSignCompact(payload, privateKey, {
    protectedHeader: { alg: 'ES256' },
  });
  // docs:end start/js-first-sign
  const parts = token.split('.');
  assert.equal(parts.length, 3, 'header.payload.signature (RFC 7515 §7.1)');
  assert.equal(parts[0], ES256_HEADER_B64U);
  assert.equal(parts[1], 'aGVsbG8sIHBvbHlqb3Nl', 'BASE64URL("hello, polyjose")');
  const verified = await jwsVerifyCompact(token, fixturePublicJwk('p256'), { allowedAlgs: ['ES256'] });
  assert.equal(new TextDecoder().decode(verified.payload), 'hello, polyjose');
});

test('first verify: an explicit allow-list', async () => {
  const token = await signedToken();
  const publicKey = fixturePublicJwk('p256');
  // docs:start start/js-first-verify
  const verified = await jwsVerifyCompact(token, publicKey, {
    allowedAlgs: ['ES256'],
  });
  const text = new TextDecoder().decode(verified.payload);
  // docs:end start/js-first-verify
  assert.equal(verified.alg, 'ES256');
  assert.equal(text, 'hello, polyjose');
  assert.equal(verified.protectedHeader?.alg, 'ES256');
  assert.equal(verified.signatureIndex, 0);
});

test('error code: AlgorithmNotAllowed when the allow-list leaves the alg out', async () => {
  const token = await signedToken();
  const publicKey = fixturePublicJwk('p256');
  // docs:start start/js-error-code
  // The token is ES256, but this verifier accepts only Ed25519.
  let code;
  try {
    await jwsVerifyCompact(token, publicKey, { allowedAlgs: ['Ed25519'] });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "AlgorithmNotAllowed"
  }
  // docs:end start/js-error-code
  assert.equal(code, 'AlgorithmNotAllowed');
});
