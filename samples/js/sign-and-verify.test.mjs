// The samples of Guides › Sign and verify (src/content/docs/guides/sign-and-verify.mdx).
// The Web run executes this same file with `@polyjose/node` replaced by `@polyjose/wasm`.
//
// JWS (RFC 7515) in the compact and JSON serializations, with ES256 (RFC 7518 §3.4), Ed25519
// (RFC 8037 §3.1, RFC 9864 §2.2), HS256 (RFC 7518 §3.2), RS256 and PS256 (RFC 7518 §3.3, §3.5),
// detached content (RFC 7515 Appendix F) and the unencoded payload option (RFC 7797). The keys are
// the RFC example keys in samples/fixtures/keys.json. ECDSA and PS256 signatures are randomized,
// so those tests check the parts they can and verify what they sign; HS256, EdDSA and RS256 also
// check the RFCs' own example signatures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  jwkGenerateForAlg,
  jwsSignCompact,
  jwsSignFlattened,
  jwsSignGeneral,
  jwsVerifyCompact,
  jwsVerifyJson,
  PolyjoseError,
} from '@polyjose/node';
import { fixtureJwk, fixturePublicJwk } from './lib/fixtures.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** RFC 7515 Appendix A.2.1: the RS256 JWS, signed with the A.2.1 RSA key. */
const RFC7515_A2_JWS =
  'eyJhbGciOiJSUzI1NiJ9' +
  '.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ' +
  '.cC4hiUPoj9Eetdgtv3hF80EGrhuB__dzERat0XF9g2VtQgr9PJbu3XOiZj5RZmh7AAuHIm4Bh-0Qc_lF5YKt_O8W2Fp5jujGbds9uJdbF9CUAr7t1dnZcAcQjbKBYNX4BAynRFdiuB--f_nZLgrnbyTyWzO75vRK5h6xBArLIARNPvkSjtQBMHlb1L07Qe7K0GarZRmB_eSN9383LcOLn6_dO--xi12jzDwusC-eOkHWEsqtFZESc6BfI7noOPqvhJ1phCnvWh6IeYI2w9QOYEUipUTI8np6LbgGY9Fs98rqVt5AXLIhWkWywlVmtVrBp0igcN_IoypGlUPQGe77Rw';
/** RFC 7515 Appendix A.2.1: the JWS Payload, with its CRLF line breaks. */
const RFC7515_A2_PAYLOAD = '{"iss":"joe",\r\n "exp":1300819380,\r\n "http://example.com/is_root":true}';
/** RFC 8037 Appendix A.4: the EdDSA JWS of "Example of Ed25519 signing" with the A.1 key. */
const RFC8037_A4_JWS =
  'eyJhbGciOiJFZERTQSJ9.RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc' +
  '.hgyY0il_MGCjP0JzlnLWG1PPOt7-09PGcvMg3AIbQR6dWbhijcNR4ki4iylGjg5BhVsPt9g7sVvpAr_MuM0KAg';
/** RFC 7797 §4.2: the detached HS256 JWS of "$.02" with b64 false, RFC 7515 A.1 key. */
const RFC7797_42_JWS =
  'eyJhbGciOiJIUzI1NiIsImI2NCI6ZmFsc2UsImNyaXQiOlsiYjY0Il19..A5dxf2s96_n5FLueVuW1Z_vh161FwXZC4YLPff6dmDY';

/** BASE64URL(UTF8(`{"alg":"ES256"}`)) (RFC 7515 §5.1 steps 3-4). */
const ES256_HEADER_B64U = 'eyJhbGciOiJFUzI1NiJ9';

/** An ES256 compact JWS of "hello", signed with the fixture P-256 key. */
function es256Token() {
  return jwsSignCompact(encoder.encode('hello'), fixtureJwk('p256'), { protectedHeader: { alg: 'ES256' } });
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

test('ES256 in the compact serialization', async () => {
  const privateKey = fixtureJwk('p256');
  // docs:start sign-and-verify/es256
  const payload = new TextEncoder().encode('hello');
  const token = await jwsSignCompact(payload, privateKey, {
    protectedHeader: { alg: 'ES256' },
  });
  // docs:end sign-and-verify/es256
  const parts = token.split('.');
  assert.equal(parts.length, 3, 'header.payload.signature (RFC 7515 §7.1)');
  assert.equal(parts[0], ES256_HEADER_B64U);
  const verified = await jwsVerifyCompact(token, fixturePublicJwk('p256'), { allowedAlgs: ['ES256'] });
  assert.equal(decoder.decode(verified.payload), 'hello');
});

test('Ed25519 (RFC 9864) sign and verify', async () => {
  const privateKey = fixtureJwk('ed25519');
  const publicKey = fixturePublicJwk('ed25519');
  // docs:start sign-and-verify/ed25519
  const token = await jwsSignCompact(new TextEncoder().encode('hello'), privateKey, {
    protectedHeader: { alg: 'Ed25519' },
  });
  const verified = await jwsVerifyCompact(token, publicKey, { allowedAlgs: ['Ed25519'] });
  // docs:end sign-and-verify/ed25519
  assert.equal(verified.alg, 'Ed25519');
  assert.equal(decoder.decode(verified.payload), 'hello');
  assert.deepEqual(verified.protectedHeader, { alg: 'Ed25519' });
});

test('a deprecated EdDSA token still verifies (RFC 8037 Appendix A.4)', async () => {
  const token = RFC8037_A4_JWS;
  const publicKey = fixturePublicJwk('ed25519');
  // docs:start sign-and-verify/eddsa
  // A token from an issuer that still signs with the polymorphic "EdDSA" identifier.
  const verified = await jwsVerifyCompact(token, publicKey, { allowedAlgs: ['EdDSA'] });
  // verified.alg === "EdDSA"
  // docs:end sign-and-verify/eddsa
  assert.equal(verified.alg, 'EdDSA');
  assert.equal(decoder.decode(verified.payload), 'Example of Ed25519 signing');
});

test('HS256 with a generated 32-byte key that names its algorithm', async () => {
  // docs:start sign-and-verify/hs256
  // A random 256-bit oct key with "alg": "HS256", so it can be used for nothing else.
  const key = await jwkGenerateForAlg('HS256');
  const token = await jwsSignCompact(new TextEncoder().encode('hello'), key, {
    protectedHeader: { alg: 'HS256' },
  });
  const verified = await jwsVerifyCompact(token, key, { allowedAlgs: ['HS256'] });
  // docs:end sign-and-verify/hs256
  assert.equal(key.kty, 'oct');
  assert.equal(key.alg, 'HS256');
  assert.equal(Buffer.from(String(key.k), 'base64url').length, 32, 'a 256-bit key (RFC 7518 §3.2)');
  assert.equal(decoder.decode(verified.payload), 'hello');
  // The RFC 7515 A.1 example token verifies with the A.1 key.
  const rfc = await jwsVerifyCompact(
    'eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9' +
      '.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ' +
      '.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    fixtureJwk('hmac'),
    { allowedAlgs: ['HS256'] },
  );
  assert.equal(decoder.decode(rfc.payload), RFC7515_A2_PAYLOAD);
});

test('an algorithm outside the allow-list fails with AlgorithmNotAllowed', async () => {
  const token = await es256Token();
  const publicKey = fixturePublicJwk('p256');
  // docs:start sign-and-verify/not-allowed
  // The token is ES256; this verifier accepts only Ed25519.
  let code;
  try {
    await jwsVerifyCompact(token, publicKey, { allowedAlgs: ['Ed25519'] });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "AlgorithmNotAllowed"
  }
  // docs:end sign-and-verify/not-allowed
  assert.equal(code, 'AlgorithmNotAllowed');
});

test('a tampered token fails with InvalidSignature', async () => {
  const token = await es256Token();
  const publicKey = fixturePublicJwk('p256');
  const otherPayload = Buffer.from('hellO').toString('base64url');
  // docs:start sign-and-verify/tampered
  // Swap the payload part for another one, keeping the header and signature.
  const [header, , signature] = token.split('.');
  const tampered = `${header}.${otherPayload}.${signature}`;
  let code;
  try {
    await jwsVerifyCompact(tampered, publicKey, { allowedAlgs: ['ES256'] });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "InvalidSignature"
  }
  // docs:end sign-and-verify/tampered
  assert.equal(code, 'InvalidSignature');
});

test('RS256 from an identity provider verifies with its RSA public JWK (RFC 7515 A.2)', async () => {
  const token = RFC7515_A2_JWS;
  const rsaPublicKey = fixtureJwk('rsa-public');
  // docs:start sign-and-verify/rs256
  // `rsaPublicKey` is the provider's public JWK: {"kty":"RSA","n":"...","e":"AQAB"}.
  const verified = await jwsVerifyCompact(token, rsaPublicKey, { allowedAlgs: ['RS256'] });
  const claims = JSON.parse(new TextDecoder().decode(verified.payload));
  // claims.iss === "joe"
  // docs:end sign-and-verify/rs256
  assert.equal(verified.alg, 'RS256');
  assert.equal(decoder.decode(verified.payload), RFC7515_A2_PAYLOAD);
  assert.equal(claims.iss, 'joe');
});

test('RS256 and PS256 signing with an RSA private JWK (RFC 7515 A.2)', async () => {
  const rsaPrivateKey = fixtureJwk('rsa-private');
  const rsaPublicKey = fixtureJwk('rsa-public');
  const payload = encoder.encode(RFC7515_A2_PAYLOAD);
  // docs:start sign-and-verify/rsa-sign
  // `rsaPrivateKey` is an RSA private JWK with n, e, d, p, q, dp, dq and qi (RFC 7518 §6.3.2).
  const token = await jwsSignCompact(payload, rsaPrivateKey, { protectedHeader: { alg: 'RS256' } });

  // Verifiers need only the public half: {"kty":"RSA","n":"...","e":"AQAB"}.
  const verified = await jwsVerifyCompact(token, rsaPublicKey, { allowedAlgs: ['RS256'] });
  // docs:end sign-and-verify/rsa-sign
  // RSASSA-PKCS1-v1_5 is deterministic (RFC 8017 §8.2.1): the RFC's own token, octet for octet.
  assert.equal(token, RFC7515_A2_JWS);
  assert.equal(verified.alg, 'RS256');
  assert.equal(decoder.decode(verified.payload), RFC7515_A2_PAYLOAD);
  // PS256 (RFC 7518 §3.5) is randomized, so it is checked by verifying it.
  const ps256 = await jwsSignCompact(payload, rsaPrivateKey, { protectedHeader: { alg: 'PS256' } });
  const verifiedPs256 = await jwsVerifyCompact(ps256, rsaPublicKey, { allowedAlgs: ['PS256'] });
  assert.equal(verifiedPs256.alg, 'PS256');
  assert.equal(decoder.decode(verifiedPs256.payload), RFC7515_A2_PAYLOAD);
  // A public key can't sign.
  assert.equal(
    await codeOf(jwsSignCompact(payload, rsaPublicKey, { protectedHeader: { alg: 'RS256' } })),
    'KeyAlgorithmMismatch',
  );
});

test('flattened JSON serialization with one signer', async () => {
  const privateKey = fixtureJwk('p256');
  const publicKey = fixturePublicJwk('p256');
  // docs:start sign-and-verify/flattened
  const jws = await jwsSignFlattened(new TextEncoder().encode('hello'), {
    key: privateKey,
    protectedHeader: { alg: 'ES256' },
  });
  // jws is JSON text: {"payload":"...","protected":"...","signature":"..."}
  const verified = await jwsVerifyJson(jws, publicKey, { allowedAlgs: ['ES256'] });
  // docs:end sign-and-verify/flattened
  const parsed = JSON.parse(jws);
  assert.deepEqual(Object.keys(parsed).sort(), ['payload', 'protected', 'signature']);
  assert.equal(parsed.protected, ES256_HEADER_B64U);
  assert.equal(verified.signatureIndex, 0);
  assert.equal(decoder.decode(verified.payload), 'hello');
});

test('general JSON serialization with two signers', async () => {
  const p256Key = fixtureJwk('p256');
  const ed25519Key = fixtureJwk('ed25519');
  const ed25519PublicKey = fixturePublicJwk('ed25519');
  // docs:start sign-and-verify/general
  const jws = await jwsSignGeneral(new TextEncoder().encode('hello'), [
    { key: p256Key, protectedHeader: { alg: 'ES256' } },
    { key: ed25519Key, protectedHeader: { alg: 'Ed25519' } },
  ]);
  // A verifier holding only the Ed25519 public key checks the signature it can.
  const verified = await jwsVerifyJson(jws, ed25519PublicKey, { allowedAlgs: ['Ed25519'] });
  // verified.signatureIndex === 1: the second signature verified
  // docs:end sign-and-verify/general
  assert.equal(JSON.parse(jws).signatures.length, 2);
  assert.equal(verified.signatureIndex, 1);
  assert.equal(verified.alg, 'Ed25519');
  assert.equal(decoder.decode(verified.payload), 'hello');
  const first = await jwsVerifyJson(jws, fixturePublicJwk('p256'), { allowedAlgs: ['ES256'] });
  assert.equal(first.signatureIndex, 0);
});

test('a detached payload (RFC 7515 Appendix F)', async () => {
  const privateKey = fixtureJwk('p256');
  const publicKey = fixturePublicJwk('p256');
  // docs:start sign-and-verify/detached
  const payload = new TextEncoder().encode('a large document sent separately');
  const token = await jwsSignCompact(payload, privateKey, {
    protectedHeader: { alg: 'ES256' },
    detached: true,
  });
  // token is "header..signature": the payload part is empty.
  const verified = await jwsVerifyCompact(token, publicKey, {
    allowedAlgs: ['ES256'],
    detachedPayload: payload,
  });
  // docs:end sign-and-verify/detached
  const parts = token.split('.');
  assert.equal(parts.length, 3);
  assert.equal(parts[1], '', 'no payload in the token (RFC 7515 Appendix F)');
  assert.equal(decoder.decode(verified.payload), 'a large document sent separately');
});

test('the unencoded payload option (RFC 7797)', async () => {
  const key = fixtureJwk('hmac');
  // docs:start sign-and-verify/unencoded
  // "b64": false signs the payload octets as they are; "crit" makes sure a
  // verifier that does not understand b64 rejects the token (RFC 7797 §6).
  const payload = new TextEncoder().encode('$.02');
  const token = await jwsSignCompact(payload, key, {
    protectedHeader: { alg: 'HS256', b64: false, crit: ['b64'] },
    detached: true,
  });
  const verified = await jwsVerifyCompact(token, key, {
    allowedAlgs: ['HS256'],
    detachedPayload: payload,
  });
  // docs:end sign-and-verify/unencoded
  assert.equal(token.split('.')[1], '');
  assert.equal(decoder.decode(verified.payload), '$.02');
  assert.equal(verified.protectedHeader?.b64, false);
  // RFC 7797 §4.2's own example verifies the same way.
  const rfc = await jwsVerifyCompact(RFC7797_42_JWS, key, {
    allowedAlgs: ['HS256'],
    detachedPayload: encoder.encode('$.02'),
  });
  assert.equal(decoder.decode(rfc.payload), '$.02');
});

test('read the protected header after verification', async () => {
  const privateKey = fixtureJwk('p256');
  const publicKey = fixturePublicJwk('p256');
  const token = await jwsSignCompact(encoder.encode('hello'), privateKey, {
    protectedHeader: { alg: 'ES256', kid: 'key-1' },
  });
  // docs:start sign-and-verify/read-header
  const verified = await jwsVerifyCompact(token, publicKey, { allowedAlgs: ['ES256'] });
  // Only now is the header authenticated.
  const kid = verified.protectedHeader?.kid; // "key-1"
  // docs:end sign-and-verify/read-header
  assert.equal(kid, 'key-1');
  assert.equal(await codeOf(jwsVerifyCompact(token, fixturePublicJwk('ed25519'), { allowedAlgs: ['ES256'] })), 'KeyAlgorithmMismatch');
});
