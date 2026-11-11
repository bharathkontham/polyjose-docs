// The samples of Guides › Migrate › From jsonwebtoken (src/content/docs/guides/migrate/jsonwebtoken.mdx).
// The Web run executes this same file with `@polyjose/node` replaced by `@polyjose/wasm`.
//
// Each task is shown twice: a `migrate-jsonwebtoken/<task>-before` region using jsonwebtoken (the
// exact version in samples/js/package.json), then a `migrate-jsonwebtoken/<task>` region doing the
// same with polyjose. Both run here. The interop tests check that a JWT (RFC 7519) from either
// library verifies in the other, with ES256 (RFC 7518 §3.4) and HS256 (RFC 7518 §3.2), and the
// last tests pin the behaviour differences the guide states. Keys are the RFC 7515 Appendix A.3.1
// P-256 key in samples/fixtures/keys.json, converted to PEM with node:crypto (not with polyjose,
// so the interop tests don't depend on polyjose's own encoder), and random HMAC secrets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
// docs:start migrate-jsonwebtoken/import-before
import jwt from 'jsonwebtoken';
// docs:end migrate-jsonwebtoken/import-before
// docs:start migrate-jsonwebtoken/import
import { base64urlEncode, jwkFromPem, jwtSign, jwtVerify, jwtVerifyWithJwks, PolyjoseError } from '@polyjose/node';
// docs:end migrate-jsonwebtoken/import
import { jwkParse } from '@polyjose/node';
import { fixtureJwk, fixturePublicJwk } from './lib/fixtures.mjs';

const ISSUER = 'https://issuer.example';
const AUDIENCE = 'https://api.example';
const SUBJECT = 'user-123';

const privateKey = fixtureJwk('p256');
const publicKey = fixturePublicJwk('p256');
/** The fixture P-256 key as PKCS #8 and SPKI PEM (RFC 7468), as a jsonwebtoken user holds it. */
const privatePem = createPrivateKey({ key: privateKey, format: 'jwk' }).export({ type: 'pkcs8', format: 'pem' });
const publicPem = createPublicKey({ key: publicKey, format: 'jwk' }).export({ type: 'spki', format: 'pem' });

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** The decoded payload of a compact JWS (RFC 7515 §7.1), for checks only. */
const payloadOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
/** The decoded protected header of a compact JWS (RFC 7515 §7.1), for checks only. */
const headerOf = (token) => JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));

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

/** The class name and message of the error jsonwebtoken throws; fails the test if it doesn't throw. */
function jsonwebtokenError(fn) {
  try {
    fn();
  } catch (err) {
    return { name: err.name, message: err.message };
  }
  assert.fail('expected jsonwebtoken to throw');
}

/**
 * Stands in for an application's HTTP response: `reply(status, body)` records an answer, and
 * `done` resolves once `count` answers are in.
 */
function responder(count) {
  const replies = [];
  let settle;
  const done = new Promise((resolve) => {
    settle = resolve;
  });
  const reply = (status, body) => {
    replies.push(body === undefined ? [status] : [status, body]);
    if (replies.length === count) settle();
  };
  return { reply, replies, done };
}

/** An ES256 JWT from ISSUER for AUDIENCE, signed by jsonwebtoken. */
const jsonwebtokenToken = (claims = {}, options = {}) =>
  jwt.sign({ sub: SUBJECT, ...claims }, privatePem, { algorithm: 'ES256', issuer: ISSUER, audience: AUDIENCE, ...options });

test('sign a JWT', async () => {
  // docs:start migrate-jsonwebtoken/sign-before
  // `privatePem` is a PKCS #8 PEM string: -----BEGIN PRIVATE KEY-----
  const token = jwt.sign({ sub: 'user-123' }, privatePem, {
    algorithm: 'ES256',
    expiresIn: '5m',
    issuer: 'https://issuer.example',
    audience: 'https://api.example',
  });
  // docs:end migrate-jsonwebtoken/sign-before
  const before = payloadOf(token);
  assert.equal(before.exp - before.iat, 300);

  {
    // docs:start migrate-jsonwebtoken/sign
    // `privateKey` is a JWK: {"kty":"EC","crv":"P-256","x":"...","y":"...","d":"..."}
    const now = Math.floor(Date.now() / 1000);
    const token = await jwtSign(
      {
        sub: 'user-123',
        iss: 'https://issuer.example',
        aud: 'https://api.example',
        iat: now,
        exp: now + 300, // expiresIn: '5m'
      },
      privateKey,
      { alg: 'ES256' },
    );
    // docs:end migrate-jsonwebtoken/sign
    const after = payloadOf(token);
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'the same claims as jsonwebtoken writes');
    assert.equal(after.exp - after.iat, 300);
    assert.deepEqual(headerOf(token), { alg: 'ES256', typ: 'JWT' });
  }
});

test('an HMAC secret', async () => {
  // Stands in for the application's shared secret, which never appears in source code.
  const secret = randomBytes(32);
  // docs:start migrate-jsonwebtoken/secret-before
  // `secret` holds the shared secret's bytes (a Buffer).
  const token = jwt.sign({ sub: 'user-123' }, secret, { algorithm: 'HS256', expiresIn: '5m' });
  const claims = jwt.verify(token, secret, { algorithms: ['HS256'] });
  // docs:end migrate-jsonwebtoken/secret-before
  assert.equal(claims.sub, SUBJECT);

  {
    // docs:start migrate-jsonwebtoken/secret
    // The same bytes as an oct JWK: "k" is their base64url (RFC 7518 §6.4.1).
    const key = { kty: 'oct', k: await base64urlEncode(secret) };

    const now = Math.floor(Date.now() / 1000);
    const token = await jwtSign({ sub: 'user-123', iat: now, exp: now + 300 }, key, { alg: 'HS256' });
    const { claims } = await jwtVerify(token, key, { allowedAlgs: ['HS256'] });
    // docs:end migrate-jsonwebtoken/secret
    assert.equal(claims.sub, SUBJECT);
  }
});

test('PEM keys become JWKs', async () => {
  // Stands in for a key file protected with a passphrase, as jsonwebtoken reads it with
  // { key, passphrase }.
  const passphrase = randomBytes(16).toString('hex');
  const encryptedPem = createPrivateKey({ key: privateKey, format: 'jwk' }).export({
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase,
  });
  // docs:start migrate-jsonwebtoken/keys
  // PKCS #8, SEC 1 and PKCS #1 private keys, and SPKI and PKCS #1 public keys.
  const signingKey = await jwkFromPem(privatePem);
  const verifyingKey = await jwkFromPem(publicPem);

  // polyjose doesn't read an encrypted PEM. Decrypt it with node:crypto and export a JWK.
  const unlocked = createPrivateKey({ key: encryptedPem, passphrase }).export({ format: 'jwk' });
  // docs:end migrate-jsonwebtoken/keys
  assert.equal(signingKey.d, privateKey.d);
  assert.deepEqual(verifyingKey, publicKey);
  assert.equal(unlocked.d, privateKey.d);
  assert.equal(await codeOf(jwkFromPem(encryptedPem)), 'UnsupportedAlgorithm');
  const token = await jwtSign({ exp: nowSeconds() + 300 }, unlocked, { alg: 'ES256' });
  assert.equal((await jwtVerify(token, verifyingKey, { allowedAlgs: ['ES256'] })).alg, 'ES256');
});

test('verify a JWT', async () => {
  const token = jsonwebtokenToken({}, { expiresIn: '5m' });
  // docs:start migrate-jsonwebtoken/verify-before
  const claims = jwt.verify(token, publicPem, {
    algorithms: ['ES256'],
    issuer: 'https://issuer.example',
    audience: 'https://api.example',
    clockTolerance: 30,
  });
  // claims.sub === "user-123"
  // docs:end migrate-jsonwebtoken/verify-before
  assert.equal(claims.sub, SUBJECT);

  {
    // docs:start migrate-jsonwebtoken/verify
    const { claims } = await jwtVerify(token, publicKey, {
      allowedAlgs: ['ES256'],
      issuers: ['https://issuer.example'],
      audiences: ['https://api.example'],
      leeway: 30, // clockTolerance; polyjose's default is 60 seconds
    });
    // claims.sub === "user-123"
    // docs:end migrate-jsonwebtoken/verify
    assert.equal(claims.sub, SUBJECT);
  }
});

test('the callback form', async () => {
  const token = jsonwebtokenToken({}, { expiresIn: '5m' });
  const { reply, replies, done } = responder(2);
  // docs:start migrate-jsonwebtoken/callback-before
  jwt.verify(token, publicPem, { algorithms: ['ES256'], audience: 'https://api.example' }, (err, claims) => {
    if (err) return reply(401);
    reply(200, claims.sub);
  });
  // docs:end migrate-jsonwebtoken/callback-before
  // docs:start migrate-jsonwebtoken/callback
  // Every polyjose call returns a Promise: there is no callback form, and no synchronous one.
  jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], audiences: ['https://api.example'] }).then(
    (verified) => reply(200, verified.claims.sub),
    () => reply(401),
  );
  // docs:end migrate-jsonwebtoken/callback
  await done;
  assert.deepEqual(replies, [
    [200, SUBJECT],
    [200, SUBJECT],
  ]);
});

test('choose the key by kid', async () => {
  const keyById = { 'p256-2026': publicPem };
  const jwks = { keys: [{ ...publicKey, kid: 'p256-2026', alg: 'ES256', use: 'sig' }] };
  const token = jsonwebtokenToken({}, { expiresIn: '5m', keyid: 'p256-2026' });
  assert.equal(headerOf(token).kid, 'p256-2026');
  const { reply, replies, done } = responder(1);
  // docs:start migrate-jsonwebtoken/jwks-before
  // A key function looks up the token's kid, often through a JWKS client.
  const getKey = (header, callback) => callback(null, keyById[header.kid]);
  jwt.verify(token, getKey, { algorithms: ['ES256'], audience: 'https://api.example' }, (err, claims) => {
    if (err) return reply(401);
    reply(200, claims.sub);
  });
  // docs:end migrate-jsonwebtoken/jwks-before
  await done;
  assert.deepEqual(replies, [[200, SUBJECT]]);

  {
    // docs:start migrate-jsonwebtoken/jwks
    // `jwks` is the issuer's JWK Set, which your application fetches and caches.
    const verified = await jwtVerifyWithJwks(token, jwks, {
      allowedAlgs: ['ES256'],
      issuers: ['https://issuer.example'],
      audiences: ['https://api.example'],
    });
    // verified.kid === "p256-2026"
    // docs:end migrate-jsonwebtoken/jwks
    assert.equal(verified.kid, 'p256-2026');
    assert.equal(verified.claims.sub, SUBJECT);
  }
});

test('decode without verifying', async () => {
  const token = jsonwebtokenToken({}, { expiresIn: '5m', keyid: 'p256-2026' });
  // docs:start migrate-jsonwebtoken/decode-before
  // Not verified: anyone could have written these claims.
  const { header, payload } = jwt.decode(token, { complete: true });
  // docs:end migrate-jsonwebtoken/decode-before
  assert.equal(header.kid, 'p256-2026');
  assert.equal(payload.sub, SUBJECT);

  {
    // docs:start migrate-jsonwebtoken/decode
    // polyjose reads the header and claims only from a token it has verified.
    const { header, claims } = await jwtVerify(token, publicKey, {
      allowedAlgs: ['ES256'],
      audiences: ['https://api.example'],
    });
    // docs:end migrate-jsonwebtoken/decode
    assert.equal(header.kid, 'p256-2026');
    assert.equal(claims.sub, SUBJECT);
  }
});

test('handle errors', async () => {
  const token = jsonwebtokenToken({ exp: nowSeconds() - 120 });
  /** Records which branch each library took. */
  const branches = [];
  const reject = (why) => branches.push(why);
  // docs:start migrate-jsonwebtoken/errors-before
  try {
    jwt.verify(token, publicPem, { algorithms: ['ES256'], audience: 'https://api.example' });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) reject('expired');
    else if (err instanceof jwt.NotBeforeError) reject('not yet valid');
    else if (err instanceof jwt.JsonWebTokenError) reject('invalid');
    else throw err;
  }
  // docs:end migrate-jsonwebtoken/errors-before
  // docs:start migrate-jsonwebtoken/errors
  try {
    await jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], audiences: ['https://api.example'] });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    if (err.code === 'TokenExpired') reject('expired');
    else if (err.code === 'TokenNotYetValid') reject('not yet valid');
    else reject('invalid'); // every other code: see Errors
  }
  // docs:end migrate-jsonwebtoken/errors
  assert.deepEqual(branches, ['expired', 'expired']);
});

test('interop: an ES256 JWT from jsonwebtoken verifies in polyjose', async () => {
  const token = jsonwebtokenToken({ scope: 'read' }, { expiresIn: '5m', notBefore: 0, jwtid: 'token-1' });
  const verified = await jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], issuers: [ISSUER], audiences: [AUDIENCE], requiredClaims: ['jti'] });
  assert.equal(verified.alg, 'ES256');
  assert.equal(verified.header.typ, 'JWT');
  assert.deepEqual(verified.claims, payloadOf(token));
  assert.equal(verified.claims.scope, 'read');
});

test('interop: an ES256 JWT from polyjose verifies in jsonwebtoken', async () => {
  const now = nowSeconds();
  const token = await jwtSign({ iss: ISSUER, sub: SUBJECT, aud: AUDIENCE, iat: now, nbf: now, exp: now + 300 }, privateKey, { alg: 'ES256' });
  const claims = jwt.verify(token, publicPem, { algorithms: ['ES256'], issuer: ISSUER, audience: AUDIENCE, subject: SUBJECT });
  assert.deepEqual(claims, { iss: ISSUER, sub: SUBJECT, aud: AUDIENCE, iat: now, nbf: now, exp: now + 300 });
});

test('interop: HS256 in both directions with the same secret', async () => {
  const secret = randomBytes(32);
  const key = { kty: 'oct', k: await base64urlEncode(secret) };
  const fromJsonwebtoken = jwt.sign({ sub: SUBJECT }, secret, { algorithm: 'HS256', expiresIn: '5m' });
  assert.equal((await jwtVerify(fromJsonwebtoken, key, { allowedAlgs: ['HS256'] })).claims.sub, SUBJECT);
  const now = nowSeconds();
  const fromPolyjose = await jwtSign({ sub: SUBJECT, exp: now + 300 }, key, { alg: 'HS256' });
  assert.equal(jwt.verify(fromPolyjose, secret, { algorithms: ['HS256'] }).sub, SUBJECT);
});

test('the error mapping in the guide', async () => {
  const now = nowSeconds();
  const valid = jsonwebtokenToken({}, { expiresIn: '5m' });
  const otherKey = createPrivateKey({ key: fixtureJwk('rsa-private'), format: 'jwk' });
  const cases = [
    { token: jsonwebtokenToken({ exp: now - 120 }), name: 'TokenExpiredError', code: 'TokenExpired' },
    { token: jsonwebtokenToken({ exp: now + 600, nbf: now + 300 }), name: 'NotBeforeError', code: 'TokenNotYetValid' },
    { token: `${valid.slice(0, valid.lastIndexOf('.'))}.${jsonwebtokenToken({ sub: 'other' }, { expiresIn: '5m' }).split('.')[2]}`, name: 'JsonWebTokenError', message: 'invalid signature', code: 'InvalidSignature' },
    { token: jwt.sign({ sub: SUBJECT }, otherKey, { algorithm: 'RS256', expiresIn: '5m', audience: AUDIENCE }), name: 'JsonWebTokenError', message: 'invalid algorithm', code: 'AlgorithmNotAllowed' },
    { token: jsonwebtokenToken({}, { expiresIn: '5m', issuer: 'https://other.example' }), issuer: ISSUER, name: 'JsonWebTokenError', message: /^jwt issuer invalid/, code: 'InvalidClaim' },
    { token: jsonwebtokenToken({}, { expiresIn: '5m', audience: 'https://other.example' }), name: 'JsonWebTokenError', message: /^jwt audience invalid/, code: 'InvalidClaim' },
    { token: 'not-a-jwt', name: 'JsonWebTokenError', message: 'jwt malformed', code: 'InvalidFormat' },
  ];
  for (const c of cases) {
    const before = jsonwebtokenError(() => jwt.verify(c.token, publicPem, { algorithms: ['ES256'], audience: AUDIENCE, issuer: c.issuer }));
    assert.equal(before.name, c.name, c.code);
    if (c.message) assert.match(before.message, c.message instanceof RegExp ? c.message : new RegExp(`^${c.message}$`), c.code);
    const options = { allowedAlgs: ['ES256'], audiences: [AUDIENCE], ...(c.issuer ? { issuers: [c.issuer] } : {}) };
    assert.equal(await codeOf(jwtVerify(c.token, publicKey, options)), c.code, before.message);
  }
});

test('differences: exp is required, and an aud is checked even when no audience is configured', async () => {
  // jsonwebtoken writes no exp without expiresIn, and accepts the token.
  const noExp = jsonwebtokenToken();
  assert.equal(payloadOf(noExp).exp, undefined);
  assert.equal(jwt.verify(noExp, publicPem, { algorithms: ['ES256'] }).sub, SUBJECT);
  assert.equal(await codeOf(jwtVerify(noExp, publicKey, { allowedAlgs: ['ES256'], audiences: [AUDIENCE] })), 'InvalidClaim');
  const verified = await jwtVerify(noExp, publicKey, { allowedAlgs: ['ES256'], audiences: [AUDIENCE], allowMissingExp: true });
  assert.equal(verified.claims.sub, SUBJECT);
  // A token with aud verified without an audience: jsonwebtoken accepts it, polyjose doesn't (RFC 7519 §4.1.3).
  const withAud = jsonwebtokenToken({}, { expiresIn: '5m' });
  assert.equal(jwt.verify(withAud, publicPem, { algorithms: ['ES256'] }).aud, AUDIENCE);
  assert.equal(await codeOf(jwtVerify(withAud, publicKey, { allowedAlgs: ['ES256'] })), 'InvalidClaim');
});

test('differences: clock tolerance defaults, and no option skips exp or nbf', async () => {
  const now = nowSeconds();
  const token = jsonwebtokenToken({ exp: now - 30 });
  // 30 seconds after exp: jsonwebtoken (no tolerance by default) rejects it, polyjose (60 seconds by default) accepts it.
  assert.equal(jsonwebtokenError(() => jwt.verify(token, publicPem, { algorithms: ['ES256'], audience: AUDIENCE, clockTimestamp: now })).name, 'TokenExpiredError');
  assert.equal((await jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], audiences: [AUDIENCE], now })).claims.sub, SUBJECT);
  // `clockTimestamp` is `now`; `leeway: 0` is jsonwebtoken's default, and leeway is at most 600 seconds.
  assert.equal(await codeOf(jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], audiences: [AUDIENCE], now, leeway: 0 })), 'TokenExpired');
  assert.equal(await codeOf(jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], audiences: [AUDIENCE], now, leeway: 10 })), 'TokenExpired');
  assert.equal(await codeOf(jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], audiences: [AUDIENCE], now, leeway: 601 })), 'InvalidClaim');
  // jsonwebtoken's ignoreExpiration and ignoreNotBefore have no polyjose counterpart: an unknown option is a TypeError.
  for (const option of ['ignoreExpiration', 'ignoreNotBefore', 'clockTolerance', 'algorithms']) {
    await assert.rejects(jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], [option]: true }), TypeError, option);
  }
  // Audiences are strings compared exactly: no RegExp.
  await assert.rejects(jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], audiences: [/api/] }), TypeError);
  // maxAge is a number of seconds, not a time span string.
  await assert.rejects(jwtVerify(token, publicKey, { allowedAlgs: ['ES256'], maxAge: '2 days' }), TypeError);
});

test('differences: no iat unless you set it, an allow-list is required, none is never accepted', async () => {
  const now = nowSeconds();
  // jsonwebtoken adds iat unless noTimestamp; polyjose writes only the claims it is given.
  assert.equal(typeof payloadOf(jwt.sign({}, privatePem, { algorithm: 'ES256' })).iat, 'number');
  assert.deepEqual(payloadOf(await jwtSign({ exp: now + 300 }, privateKey, { alg: 'ES256' })), { exp: now + 300 });
  // jsonwebtoken picks default algorithms from the key; polyjose has no default allow-list.
  const token = jsonwebtokenToken({}, { expiresIn: '5m' });
  assert.equal(jwt.verify(token, publicPem, { audience: AUDIENCE }).sub, SUBJECT);
  assert.equal(await codeOf(jwtVerify(token, publicKey, { audiences: [AUDIENCE] })), 'AlgorithmNotAllowed');
  // An unsecured token from jsonwebtoken is refused even when "none" is in the allow-list.
  const unsecured = jwt.sign({ sub: SUBJECT, exp: now + 300 }, null, { algorithm: 'none' });
  assert.equal(headerOf(unsecured).alg, 'none');
  assert.equal(await codeOf(jwtVerify(unsecured, publicKey, { allowedAlgs: ['none'] })), 'AlgorithmNotAllowed');
  assert.equal(await codeOf(jwtSign({ exp: now + 300 }, privateKey, { alg: 'none' })), 'AlgorithmNotAllowed');
});

test('differences: key strength and key binding', async () => {
  // A secret shorter than the hash output (RFC 7518 §3.2): jsonwebtoken signs with it, polyjose refuses it.
  const shortSecret = Buffer.from('shhhhh');
  const shortToken = jwt.sign({ sub: SUBJECT }, shortSecret, { algorithm: 'HS256', expiresIn: '5m' });
  const shortKey = { kty: 'oct', k: await base64urlEncode(shortSecret) };
  assert.equal(await codeOf(jwtVerify(shortToken, shortKey, { allowedAlgs: ['HS256'] })), 'InvalidKey');
  assert.equal(await codeOf(jwtSign({ exp: nowSeconds() + 300 }, shortKey, { alg: 'HS256' })), 'InvalidKey');
  // RSA keys under 2048 bits (jsonwebtoken's allowInsecureKeySizes) are refused.
  const rsa1024 = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ format: 'jwk' });
  assert.equal(await codeOf(jwkParse(rsa1024)), 'InvalidKey');
  // A key is bound to its algorithm family: a P-256 key can't verify an HS256 token, an oct key
  // can't verify ES256, and a key whose "alg" names ES384 can't verify ES256.
  const token = jsonwebtokenToken({}, { expiresIn: '5m' });
  const secret = randomBytes(32);
  const hs256 = jwt.sign({ sub: SUBJECT }, secret, { algorithm: 'HS256', expiresIn: '5m' });
  assert.equal(await codeOf(jwtVerify(hs256, publicKey, { allowedAlgs: ['HS256'] })), 'KeyAlgorithmMismatch');
  assert.equal(await codeOf(jwtVerify(token, { kty: 'oct', k: await base64urlEncode(secret) }, { allowedAlgs: ['ES256'], audiences: [AUDIENCE] })), 'KeyAlgorithmMismatch');
  assert.equal(await codeOf(jwtVerify(token, { ...publicKey, alg: 'ES384' }, { allowedAlgs: ['ES256'], audiences: [AUDIENCE] })), 'KeyAlgorithmMismatch');
  // PEM text where a JWK belongs is not guessed at, and a KeyObject is not a JWK.
  assert.equal(await codeOf(jwtVerify(token, publicPem, { allowedAlgs: ['ES256'], audiences: [AUDIENCE] })), 'InvalidJson');
  await assert.rejects(jwtVerify(token, createPublicKey(publicPem), { allowedAlgs: ['ES256'], audiences: [AUDIENCE] }), TypeError);
});
