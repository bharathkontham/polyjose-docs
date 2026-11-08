// The samples of Guides › Validate a JWT (src/content/docs/guides/validate-jwt.mdx).
// The Web run executes this same file with `@polyjose/node` replaced by `@polyjose/wasm`.
//
// Issuing and validating JWTs (RFC 7519 §7.1, §7.2) under the RFC 8725 defaults: `exp` required,
// 60 seconds of leeway, `aud` rejected unless audiences are configured, `typ` absent or `JWT`.
// Tokens are ES256 (RFC 7518 §3.4) with the RFC 7515 Appendix A.3.1 key. Tokens that depend on the
// clock set `exp` relative to the current time and are verified in the same test; the rest pass a
// fixed `now`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  jwkGenerateEc,
  jwkToPublic,
  jwtDecryptNested,
  jwtEncryptNested,
  jwtSign,
  jwtVerify,
  PolyjoseError,
} from '@polyjose/node';
import { fixtureJwk, fixturePublicJwk } from './lib/fixtures.mjs';

const ISSUER = 'https://issuer.example';
const AUDIENCE = 'https://api.example';
const SUBJECT = 'user-123';
/** A fixed instant for the samples that pass `now` (2023-11-14T22:13:20Z). */
const NOW = 1_700_000_000;

const signingKey = fixtureJwk('p256');
const publicKey = fixturePublicJwk('p256');

/** The current time in whole seconds since the epoch (RFC 7519 §2, NumericDate). */
function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

/** An ES256 JWT of `claims`, signed with the fixture P-256 key. */
function issue(claims, options = {}) {
  return jwtSign(claims, signingKey, { alg: 'ES256', ...options });
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

/** The JWS Protected Header of a compact token, decoded. */
function headerOf(token) {
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
}

test('issue a JWT', async () => {
  // docs:start validate-jwt/issue
  const now = Math.floor(Date.now() / 1000);
  const token = await jwtSign(
    {
      iss: 'https://issuer.example',
      sub: 'user-123',
      aud: 'https://api.example',
      exp: now + 300, // five minutes
    },
    signingKey,
    { alg: 'ES256' },
  );
  // docs:end validate-jwt/issue
  assert.equal(token.split('.').length, 3);
  assert.deepEqual(headerOf(token), { alg: 'ES256', typ: 'JWT' });
});

test('verify a JWT with an allow-list, issuer and audience', async () => {
  const token = await issue({ iss: ISSUER, sub: SUBJECT, aud: AUDIENCE, exp: nowSeconds() + 300 });
  // docs:start validate-jwt/verify
  const verified = await jwtVerify(token, publicKey, {
    allowedAlgs: ['ES256'],
    issuers: ['https://issuer.example'],
    audiences: ['https://api.example'],
  });
  const subject = verified.claims.sub; // "user-123"
  // docs:end validate-jwt/verify
  assert.equal(subject, SUBJECT);
  assert.equal(verified.alg, 'ES256');
  assert.equal(verified.header.typ, 'JWT');
  // A header parameter the verifier doesn't know, and that isn't in `crit`, is ignored
  // (RFC 7515 §4, RFC 7519 erratum 8060).
  const extra = await issue({ iss: ISSUER, aud: AUDIENCE, exp: nowSeconds() + 300 }, { header: { 'x-trace': 'abc' } });
  assert.equal(headerOf(extra)['x-trace'], 'abc');
  const again = await jwtVerify(extra, publicKey, { allowedAlgs: ['ES256'], issuers: [ISSUER], audiences: [AUDIENCE] });
  assert.equal(again.header['x-trace'], 'abc');
});

test('an expired token fails with TokenExpired', async () => {
  const token = await issue({ iss: ISSUER, exp: nowSeconds() - 120 });
  // docs:start validate-jwt/expired
  // `exp` was two minutes ago: more than the default 60 seconds of leeway.
  let code;
  try {
    await jwtVerify(token, publicKey, { allowedAlgs: ['ES256'] });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "TokenExpired"
  }
  // docs:end validate-jwt/expired
  assert.equal(code, 'TokenExpired');
});

test('a token used before nbf fails with TokenNotYetValid', async () => {
  const now = nowSeconds();
  const token = await issue({ iss: ISSUER, exp: now + 600, nbf: now + 300 });
  // docs:start validate-jwt/not-yet-valid
  // `nbf` is five minutes from now.
  let code;
  try {
    await jwtVerify(token, publicKey, { allowedAlgs: ['ES256'] });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "TokenNotYetValid"
  }
  // docs:end validate-jwt/not-yet-valid
  assert.equal(code, 'TokenNotYetValid');
});

test('a token with aud fails when no audience is configured', async () => {
  const token = await issue({ iss: ISSUER, aud: AUDIENCE, exp: nowSeconds() + 300 });
  // docs:start validate-jwt/aud-not-configured
  // The token has "aud", but the verifier names no audience.
  let code;
  try {
    await jwtVerify(token, publicKey, { allowedAlgs: ['ES256'] });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "InvalidClaim"
  }
  // docs:end validate-jwt/aud-not-configured
  assert.equal(code, 'InvalidClaim');
  // With the audience configured it verifies.
  const ok = await jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], audiences: [AUDIENCE] });
  assert.equal(ok.claims.aud, AUDIENCE);
});

test('checks fail in a fixed order: exp before iss', async () => {
  const token = await issue({ iss: 'https://other.example', exp: nowSeconds() - 120 });
  // docs:start validate-jwt/check-order
  // Both expired and from the wrong issuer: the expiry is checked first.
  let code;
  try {
    await jwtVerify(token, publicKey, {
      allowedAlgs: ['ES256'],
      issuers: ['https://issuer.example'],
    });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "TokenExpired", not "InvalidClaim"
  }
  // docs:end validate-jwt/check-order
  assert.equal(code, 'TokenExpired');
  const fresh = await issue({ iss: 'https://other.example', exp: nowSeconds() + 300 });
  assert.equal(await codeOf(jwtVerify(fresh, publicKey, { allowedAlgs: ['ES256'], issuers: [ISSUER] })), 'InvalidClaim');
});

test('leeway', async () => {
  const token = await issue({ iss: ISSUER, exp: NOW });
  // docs:start validate-jwt/leeway
  // 30 seconds after `exp`: inside the default leeway of 60 seconds.
  const verified = await jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], now: NOW + 30 });

  // With 10 seconds of leeway the same token has expired.
  let code;
  try {
    await jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], now: NOW + 30, leeway: 10 });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "TokenExpired"
  }
  // docs:end validate-jwt/leeway
  assert.equal(verified.claims.exp, NOW);
  assert.equal(code, 'TokenExpired');
  // At most 600 seconds of leeway.
  assert.equal(await codeOf(jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], now: NOW, leeway: 601 })), 'InvalidClaim');
});

test('maxAge makes iat required', async () => {
  const now = nowSeconds();
  const token = await issue({ iss: ISSUER, exp: now + 300 });
  // docs:start validate-jwt/max-age
  // Accept tokens issued at most five minutes ago. This token has no "iat".
  let code;
  try {
    await jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], maxAge: 300 });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "InvalidClaim"
  }
  // docs:end validate-jwt/max-age
  assert.equal(code, 'InvalidClaim');
  const withIat = await issue({ iss: ISSUER, exp: now + 300, iat: now });
  const ok = await jwtVerify(withIat, publicKey, { allowedAlgs: ['ES256'], maxAge: 300 });
  assert.equal(ok.claims.iat, now);
});

test('requiredClaims', async () => {
  const token = await issue({ iss: ISSUER, exp: nowSeconds() + 300 });
  // docs:start validate-jwt/required-claims
  // This token has no "jti".
  let code;
  try {
    await jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], requiredClaims: ['jti'] });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "InvalidClaim"
  }
  // docs:end validate-jwt/required-claims
  assert.equal(code, 'InvalidClaim');
});

test('an RFC 9068 access token', async () => {
  // docs:start validate-jwt/access-token
  const now = Math.floor(Date.now() / 1000);
  const token = await jwtSign(
    {
      iss: 'https://issuer.example',
      sub: 'user-123',
      aud: 'https://api.example',
      client_id: 'client-1',
      exp: now + 300,
      iat: now,
      jti: 'token-1',
    },
    signingKey,
    { alg: 'ES256', accessToken: true }, // "typ": "at+jwt"
  );

  const verified = await jwtVerify(token, publicKey, {
    allowedAlgs: ['ES256'],
    issuers: ['https://issuer.example'],
    audiences: ['https://api.example'],
    profile: 'access_token',
  });
  // docs:end validate-jwt/access-token
  assert.equal(headerOf(token).typ, 'at+jwt');
  assert.equal(verified.header.typ, 'at+jwt');
  assert.equal(verified.claims.client_id, 'client-1');
  // Without `jti` the profile refuses the token (RFC 9068 §2.2).
  const noJti = await issue(
    { iss: ISSUER, sub: SUBJECT, aud: AUDIENCE, client_id: 'client-1', exp: now + 300, iat: now },
    { accessToken: true },
  );
  assert.equal(
    await codeOf(jwtVerify(noJti, publicKey, { allowedAlgs: ['ES256'], issuers: [ISSUER], audiences: [AUDIENCE], profile: 'access_token' })),
    'InvalidClaim',
  );
});

test('an explicitly typed token fails generic validation', async () => {
  const now = nowSeconds();
  const token = await issue(
    { iss: ISSUER, sub: SUBJECT, aud: AUDIENCE, client_id: 'client-1', exp: now + 300, iat: now, jti: 'token-1' },
    { accessToken: true },
  );
  // docs:start validate-jwt/typed-rejected
  // An "at+jwt" token offered where a plain JWT is expected.
  let code;
  try {
    await jwtVerify(token, publicKey, {
      allowedAlgs: ['ES256'],
      issuers: ['https://issuer.example'],
      audiences: ['https://api.example'],
    });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "InvalidHeader"
  }
  // docs:end validate-jwt/typed-rejected
  assert.equal(code, 'InvalidHeader');
  // Naming the type accepts it.
  const ok = await jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], issuers: [ISSUER], audiences: [AUDIENCE], typ: 'at+jwt' });
  assert.equal(ok.claims.jti, 'token-1');
});

test('a fixed now', async () => {
  const token = await issue({ iss: ISSUER, iat: NOW, exp: NOW + 300 });
  // docs:start validate-jwt/fixed-now
  // Validate as of a given instant, in whole seconds since the epoch.
  const verified = await jwtVerify(token, publicKey, {
    allowedAlgs: ['ES256'],
    now: 1_700_000_000,
  });
  // docs:end validate-jwt/fixed-now
  assert.equal(verified.claims.exp, NOW + 300);
  // The same token has long expired by the real clock.
  assert.equal(await codeOf(jwtVerify(token, publicKey, { allowedAlgs: ['ES256'] })), 'TokenExpired');
});

test('nested JWT: sign, then encrypt', async () => {
  const now = nowSeconds();
  const signedJwt = await issue({ iss: ISSUER, sub: SUBJECT, aud: AUDIENCE, exp: now + 300 });
  const recipientKey = await jwkGenerateEc('P-256');
  const recipientPublicKey = await jwkToPublic(recipientKey);
  // docs:start validate-jwt/nested
  // The issuer encrypts its signed JWT to the recipient.
  const nested = await jwtEncryptNested(signedJwt, {
    enc: 'A256GCM',
    recipients: [{ alg: 'ECDH-ES+A256KW', key: recipientPublicKey }],
  });

  // The recipient decrypts with its key, then verifies the inner JWT with the issuer's key.
  const result = await jwtDecryptNested(
    nested,
    recipientKey,
    { allowedAlgs: ['ECDH-ES+A256KW'], allowedEnc: ['A256GCM'] },
    publicKey,
    {
      allowedAlgs: ['ES256'],
      issuers: ['https://issuer.example'],
      audiences: ['https://api.example'],
    },
  );
  const subject = result.inner.claims.sub; // "user-123"
  // docs:end validate-jwt/nested
  assert.equal(subject, SUBJECT);
  assert.equal(result.outerHeader.cty, 'JWT', 'RFC 7519 §5.2');
  assert.equal(result.recipientIndex, 0);
  assert.equal(nested.split('.').length, 5);
  // A nested JWT is not a signed JWT: jwtVerify refuses its five parts.
  assert.equal(await codeOf(jwtVerify(nested, publicKey, { allowedAlgs: ['ES256'] })), 'InvalidFormat');
});
