// The samples of Guides › Migrate › From panva/jose (src/content/docs/guides/migrate/panva-jose.mdx).
// The Web run executes this same file with `@polyjose/node` replaced by `@polyjose/wasm`.
//
// Each task is shown twice: a `migrate-panva-jose/<task>-before` region using jose (the exact
// version in samples/js/package.json), then a `migrate-panva-jose/<task>` region doing the same
// with polyjose. Both run here. The interop tests check that JWTs (RFC 7519) and JWEs (RFC 7516)
// made by either library are read by the other, and that both compute the same JWK thumbprint
// (RFC 7638); the last tests pin the behaviour differences the guide states. Keys are the
// RFC 7515 Appendix A.3.1 P-256 key and the RFC 8037 Appendix A.1 Ed25519 key in
// samples/fixtures/keys.json, plus keys generated in the tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
// docs:start migrate-panva-jose/import-before
import * as jose from 'jose';
// docs:end migrate-panva-jose/import-before
import * as polyjose from '@polyjose/node';
// docs:start migrate-panva-jose/import
import {
  jweDecryptCompact,
  jweEncryptCompact,
  jwkFromPem,
  jwkGenerateEc,
  jwkGenerateForAlg,
  jwkThumbprint,
  jwkToPem,
  jwkToPublic,
  jwsSignCompact,
  jwsVerifyCompact,
  jwtSign,
  jwtVerify,
  jwtVerifyWithJwks,
  PolyjoseError,
} from '@polyjose/node';
// docs:end migrate-panva-jose/import
import { fixtureJwk, fixturePublicJwk } from './lib/fixtures.mjs';

const ISSUER = 'https://issuer.example';
const AUDIENCE = 'https://api.example';
const SUBJECT = 'user-123';

const privateJwk = fixtureJwk('p256');
const publicJwk = fixturePublicJwk('p256');

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** The decoded payload of a compact JWS (RFC 7515 §7.1), for checks only. */
const payloadOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

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

/** The `code` of the JOSEError `promise` rejects with; fails the test if it resolves. */
async function joseCodeOf(promise) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof jose.errors.JOSEError) return err.code;
    throw err;
  }
  assert.fail('expected a JOSEError');
}

/** The fixture P-256 key pair as jose CryptoKeys. */
async function joseKeys() {
  return {
    privateKey: await jose.importJWK(privateJwk, 'ES256'),
    publicKey: await jose.importJWK(publicJwk, 'ES256'),
  };
}

/**
 * An ES256 JWT from `issuer` (ISSUER by default) for AUDIENCE, signed by jose, expiring in five
 * minutes unless `expires` says otherwise (`null`: no exp).
 */
async function joseToken(privateKey, { claims = {}, header = {}, issuer = ISSUER, expires = '5m' } = {}) {
  const jwt = new jose.SignJWT({ sub: SUBJECT, ...claims }).setProtectedHeader({ alg: 'ES256', ...header }).setIssuer(issuer).setAudience(AUDIENCE).setIssuedAt();
  if (expires !== null) jwt.setExpirationTime(expires);
  return jwt.sign(privateKey);
}

test('sign a JWT', async () => {
  const { privateKey } = await joseKeys();
  // docs:start migrate-panva-jose/sign-jwt-before
  // `privateKey` is a CryptoKey, from importJWK, importPKCS8 or generateKeyPair.
  const token = await new jose.SignJWT({ sub: 'user-123' })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuer('https://issuer.example')
    .setAudience('https://api.example')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  // docs:end migrate-panva-jose/sign-jwt-before
  const before = payloadOf(token);
  assert.equal(before.exp - before.iat, 300);

  {
    // docs:start migrate-panva-jose/sign-jwt
    // `privateJwk` is the JWK itself: polyjose has no import step.
    const now = Math.floor(Date.now() / 1000);
    const token = await jwtSign(
      {
        sub: 'user-123',
        iss: 'https://issuer.example',
        aud: 'https://api.example',
        iat: now,
        exp: now + 300,
      },
      privateJwk,
      { alg: 'ES256' }, // the header is {"alg":"ES256","typ":"JWT"}
    );
    // docs:end migrate-panva-jose/sign-jwt
    const after = payloadOf(token);
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    assert.equal(after.exp - after.iat, 300);
  }
});

test('verify a JWT', async () => {
  const keys = await joseKeys();
  const token = await joseToken(keys.privateKey);
  const publicKey = keys.publicKey;
  // docs:start migrate-panva-jose/verify-jwt-before
  const { payload, protectedHeader } = await jose.jwtVerify(token, publicKey, {
    algorithms: ['ES256'],
    issuer: 'https://issuer.example',
    audience: 'https://api.example',
  });
  // docs:end migrate-panva-jose/verify-jwt-before
  assert.equal(payload.sub, SUBJECT);
  assert.equal(protectedHeader.alg, 'ES256');

  {
    // docs:start migrate-panva-jose/verify-jwt
    const { claims, header } = await jwtVerify(token, publicJwk, {
      allowedAlgs: ['ES256'], // required: there is no default list
      issuers: ['https://issuer.example'],
      audiences: ['https://api.example'],
    });
    // docs:end migrate-panva-jose/verify-jwt
    assert.deepEqual(claims, payload);
    assert.deepEqual(header, protectedHeader);
  }
});

test('JWS compact', async () => {
  const keys = await joseKeys();
  const privateKey = keys.privateKey;
  const publicKey = keys.publicKey;
  // docs:start migrate-panva-jose/jws-before
  const jws = await new jose.CompactSign(new TextEncoder().encode('hello'))
    .setProtectedHeader({ alg: 'ES256' })
    .sign(privateKey);
  const { payload } = await jose.compactVerify(jws, publicKey, { algorithms: ['ES256'] });
  // docs:end migrate-panva-jose/jws-before
  assert.equal(decoder.decode(payload), 'hello');

  {
    // docs:start migrate-panva-jose/jws
    const jws = await jwsSignCompact(new TextEncoder().encode('hello'), privateJwk, {
      protectedHeader: { alg: 'ES256' },
    });
    const { payload } = await jwsVerifyCompact(jws, publicJwk, { allowedAlgs: ['ES256'] });
    // docs:end migrate-panva-jose/jws
    assert.equal(decoder.decode(payload), 'hello');
    // Each library verifies the other's JWS.
    assert.equal(decoder.decode((await jose.compactVerify(jws, publicKey, { algorithms: ['ES256'] })).payload), 'hello');
  }
});

test('JWE compact', async () => {
  const recipient = await jose.generateKeyPair('ECDH-ES+A256KW', { extractable: true });
  const publicKey = recipient.publicKey;
  const privateKey = recipient.privateKey;
  // docs:start migrate-panva-jose/jwe-before
  const jwe = await new jose.CompactEncrypt(new TextEncoder().encode('top secret'))
    .setProtectedHeader({ alg: 'ECDH-ES+A256KW', enc: 'A256GCM' })
    .encrypt(publicKey);
  const { plaintext } = await jose.compactDecrypt(jwe, privateKey, {
    keyManagementAlgorithms: ['ECDH-ES+A256KW'],
    contentEncryptionAlgorithms: ['A256GCM'],
  });
  // docs:end migrate-panva-jose/jwe-before
  assert.equal(decoder.decode(plaintext), 'top secret');

  const recipientJwk = await jose.exportJWK(privateKey);
  const recipientPublicJwk = await jose.exportJWK(publicKey);
  {
    // docs:start migrate-panva-jose/jwe
    const jwe = await jweEncryptCompact(new TextEncoder().encode('top secret'), {
      enc: 'A256GCM',
      recipients: [{ alg: 'ECDH-ES+A256KW', key: recipientPublicJwk }],
    });
    const { plaintext } = await jweDecryptCompact(jwe, recipientJwk, {
      allowedAlgs: ['ECDH-ES+A256KW'], // keyManagementAlgorithms, required
      allowedEnc: ['A256GCM'], // contentEncryptionAlgorithms, required
    });
    // docs:end migrate-panva-jose/jwe
    assert.equal(decoder.decode(plaintext), 'top secret');
  }
});

test('keys: generate, import and export', async () => {
  // docs:start migrate-panva-jose/keys-before
  const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
  const publicJwk = await jose.exportJWK(publicKey);
  const thumbprint = await jose.calculateJwkThumbprint(publicJwk);

  const spkiPem = await jose.exportSPKI(publicKey);
  const imported = await jose.importSPKI(spkiPem, 'ES256');
  // docs:end migrate-panva-jose/keys-before
  assert.equal(publicJwk.crv, 'P-256');
  assert.equal(thumbprint.length, 43);
  assert.equal(imported.type, 'public');
  assert.equal(privateKey.type, 'private');

  {
    // docs:start migrate-panva-jose/keys
    // Keys are JWKs throughout: JSON text or plain objects.
    const privateJwk = await jwkGenerateForAlg('ES256'); // "alg": "ES256" binds it to ES256
    const publicJwk = await jwkToPublic(privateJwk);
    const thumbprint = await jwkThumbprint(publicJwk);

    const spkiPem = await jwkToPem(publicJwk, 'spki');
    const imported = await jwkFromPem(spkiPem);
    // docs:end migrate-panva-jose/keys
    assert.equal(privateJwk.alg, 'ES256');
    assert.equal(publicJwk.d, undefined);
    assert.equal(thumbprint, await jose.calculateJwkThumbprint(publicJwk), 'the same RFC 7638 thumbprint');
    assert.equal(imported.x, publicJwk.x);
    // The PEM polyjose writes is read by jose, and the other way round.
    assert.equal((await jose.importSPKI(spkiPem, 'ES256')).type, 'public');
    assert.equal((await jwkFromPem(await jose.exportSPKI(publicKey))).crv, 'P-256');
  }
});

test('a local JWK Set', async () => {
  const jwks = {
    keys: [
      { ...publicJwk, kid: 'p256-2026', alg: 'ES256', use: 'sig' },
      { ...fixturePublicJwk('ed25519'), kid: 'ed25519-2026', alg: 'Ed25519', use: 'sig' },
    ],
  };
  const token = await joseToken(await jose.importJWK(privateJwk, 'ES256'), { header: { kid: 'p256-2026' } });
  // docs:start migrate-panva-jose/local-jwks-before
  const JWKS = jose.createLocalJWKSet(jwks);
  const { payload } = await jose.jwtVerify(token, JWKS, {
    algorithms: ['ES256', 'Ed25519'],
    issuer: 'https://issuer.example',
    audience: 'https://api.example',
  });
  // docs:end migrate-panva-jose/local-jwks-before
  assert.equal(payload.sub, SUBJECT);

  {
    // docs:start migrate-panva-jose/local-jwks
    const { claims, kid } = await jwtVerifyWithJwks(token, jwks, {
      allowedAlgs: ['ES256', 'Ed25519'],
      issuers: ['https://issuer.example'],
      audiences: ['https://api.example'],
    });
    // kid === "p256-2026"
    // docs:end migrate-panva-jose/local-jwks
    assert.equal(kid, 'p256-2026');
    assert.deepEqual(claims, payload);
  }
});

test('a remote JWK Set', async () => {
  const jwks = { keys: [{ ...publicJwk, kid: 'p256-2026', alg: 'ES256', use: 'sig' }] };
  // Stands in for the issuer's jwks_uri: a local HTTP server that serves the set.
  let requests = 0;
  const server = createServer((_request, res) => {
    requests++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(jwks));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const jwksUri = `http://127.0.0.1:${server.address().port}/.well-known/jwks.json`;
  try {
    const token = await joseToken(await jose.importJWK(privateJwk, 'ES256'), { header: { kid: 'p256-2026' } });
    // docs:start migrate-panva-jose/remote-jwks-before
    // jose fetches the set, caches it, and fetches it again for a kid it doesn't know.
    const JWKS = jose.createRemoteJWKSet(new URL(jwksUri));
    const { payload } = await jose.jwtVerify(token, JWKS, {
      algorithms: ['ES256'],
      issuer: 'https://issuer.example',
      audience: 'https://api.example',
    });
    // docs:end migrate-panva-jose/remote-jwks-before
    assert.equal(payload.sub, SUBJECT);
    assert.equal(requests, 1);

    {
      // docs:start migrate-panva-jose/remote-jwks
      // polyjose makes no network requests: fetch the set yourself, and cache it.
      const response = await fetch(jwksUri);
      const jwksText = await response.text();
      const { claims } = await jwtVerifyWithJwks(token, jwksText, {
        allowedAlgs: ['ES256'],
        issuers: ['https://issuer.example'],
        audiences: ['https://api.example'],
      });
      // docs:end migrate-panva-jose/remote-jwks
      assert.deepEqual(claims, payload);
      assert.equal(requests, 2);
    }
    // A URL is not a JWK Set: polyjose never fetches one.
    assert.equal(await codeOf(jwtVerifyWithJwks(token, jwksUri, { allowedAlgs: ['ES256'], issuers: [ISSUER], audiences: [AUDIENCE] })), 'InvalidJson');
    await assert.rejects(jwtVerifyWithJwks(token, new URL(jwksUri), { allowedAlgs: ['ES256'] }), TypeError);
    assert.equal(requests, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('handle errors', async () => {
  const keys = await joseKeys();
  const token = await joseToken(keys.privateKey, { expires: nowSeconds() - 120 });
  const publicKey = keys.publicKey;
  /** Records which branch each library took. */
  const branches = [];
  const reject = (why) => branches.push(why);
  // docs:start migrate-panva-jose/errors-before
  try {
    await jose.jwtVerify(token, publicKey, { algorithms: ['ES256'], audience: 'https://api.example' });
  } catch (err) {
    if (err instanceof jose.errors.JWTExpired) reject('expired');
    else if (err.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') reject(`bad claim ${err.claim}`);
    else if (err instanceof jose.errors.JOSEError) reject('invalid');
    else throw err;
  }
  // docs:end migrate-panva-jose/errors-before
  // docs:start migrate-panva-jose/errors
  try {
    await jwtVerify(token, publicJwk, { allowedAlgs: ['ES256'], audiences: ['https://api.example'] });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    if (err.code === 'TokenExpired') reject('expired');
    else if (err.code === 'InvalidClaim') reject('bad claim'); // err.message may name the claim
    else reject('invalid'); // every other code: see Errors
  }
  // docs:end migrate-panva-jose/errors
  assert.deepEqual(branches, ['expired', 'expired']);
});

test('interop: JWTs in both directions', async () => {
  const keys = await joseKeys();
  const fromJose = await joseToken(keys.privateKey, { claims: { scope: 'read' }, header: { typ: 'JWT' } });
  const verified = await jwtVerify(fromJose, publicJwk, { allowedAlgs: ['ES256'], issuers: [ISSUER], audiences: [AUDIENCE] });
  assert.deepEqual(verified.claims, payloadOf(fromJose));
  assert.equal(verified.claims.scope, 'read');

  const now = nowSeconds();
  const ed25519 = fixtureJwk('ed25519');
  const fromPolyjose = await jwtSign({ iss: ISSUER, sub: SUBJECT, aud: AUDIENCE, iat: now, exp: now + 300 }, ed25519, { alg: 'Ed25519' });
  const { payload, protectedHeader } = await jose.jwtVerify(fromPolyjose, await jose.importJWK(fixturePublicJwk('ed25519'), 'Ed25519'), {
    algorithms: ['Ed25519'],
    issuer: ISSUER,
    audience: AUDIENCE,
    typ: 'JWT',
  });
  assert.deepEqual(payload, { iss: ISSUER, sub: SUBJECT, aud: AUDIENCE, iat: now, exp: now + 300 });
  assert.deepEqual(protectedHeader, { alg: 'Ed25519', typ: 'JWT' });
});

test('interop: JWEs in both directions', async () => {
  const recipient = await jwkGenerateEc('P-256');
  const recipientPublic = await jwkToPublic(recipient);
  const options = { allowedAlgs: ['ECDH-ES+A256KW', 'A256KW', 'dir'], allowedEnc: ['A256GCM', 'A128CBC-HS256'] };

  // jose encrypts to a polyjose key; polyjose decrypts.
  for (const enc of ['A256GCM', 'A128CBC-HS256']) {
    const jwe = await new jose.CompactEncrypt(encoder.encode('top secret'))
      .setProtectedHeader({ alg: 'ECDH-ES+A256KW', enc })
      .encrypt(await jose.importJWK(recipientPublic, 'ECDH-ES+A256KW'));
    assert.equal(decoder.decode((await jweDecryptCompact(jwe, recipient, options)).plaintext), 'top secret', enc);
  }
  // polyjose encrypts; jose decrypts.
  const shared = await jwkGenerateForAlg('A256KW');
  const jwe = await jweEncryptCompact(encoder.encode('top secret'), { enc: 'A256GCM', recipients: [{ alg: 'A256KW', key: shared }] });
  const { plaintext } = await jose.compactDecrypt(jwe, await jose.importJWK(shared, 'A256KW'), {
    keyManagementAlgorithms: ['A256KW'],
    contentEncryptionAlgorithms: ['A256GCM'],
  });
  assert.equal(decoder.decode(plaintext), 'top secret');
});

test('the error mapping in the guide', async () => {
  const keys = await joseKeys();
  const now = nowSeconds();
  const valid = await joseToken(keys.privateKey);
  const other = await joseToken(keys.privateKey, { claims: { sub: 'other' } });
  const jwks = { keys: [{ ...publicJwk, kid: 'p256-2026' }] };
  const unknownKid = await joseToken(keys.privateKey, { header: { kid: 'retired-2025' } });
  const options = { algorithms: ['ES256'], issuer: ISSUER, audience: AUDIENCE };
  const polyOptions = { allowedAlgs: ['ES256'], issuers: [ISSUER], audiences: [AUDIENCE] };
  const cases = [
    { token: await joseToken(keys.privateKey, { expires: now - 120 }), jose: 'ERR_JWT_EXPIRED', code: 'TokenExpired' },
    { token: await joseToken(keys.privateKey, { claims: { nbf: now + 300 } }), jose: 'ERR_JWT_CLAIM_VALIDATION_FAILED', claim: 'nbf', code: 'TokenNotYetValid' },
    { token: await joseToken(keys.privateKey, { issuer: 'https://other.example' }), jose: 'ERR_JWT_CLAIM_VALIDATION_FAILED', claim: 'iss', code: 'InvalidClaim' },
    { token: `${valid.slice(0, valid.lastIndexOf('.'))}.${other.split('.')[2]}`, jose: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED', code: 'InvalidSignature' },
    { token: await jwtSign({ exp: now + 300 }, fixtureJwk('ed25519'), { alg: 'Ed25519' }), jose: 'ERR_JOSE_ALG_NOT_ALLOWED', code: 'AlgorithmNotAllowed' },
    { token: 'not-a-jwt', jose: 'ERR_JWS_INVALID', code: 'InvalidFormat' },
  ];
  for (const c of cases) {
    let claim;
    const joseCode = await joseCodeOf(
      jose.jwtVerify(c.token, keys.publicKey, options).catch((err) => {
        claim = err.claim;
        throw err;
      }),
    );
    assert.equal(joseCode, c.jose, c.code);
    if (c.claim) assert.equal(claim, c.claim, c.code);
    assert.equal(await codeOf(jwtVerify(c.token, publicJwk, polyOptions)), c.code, c.jose);
  }
  // A JWK Set without the token's kid.
  assert.equal(await joseCodeOf(jose.jwtVerify(unknownKid, jose.createLocalJWKSet(jwks), options)), 'ERR_JWKS_NO_MATCHING_KEY');
  assert.equal(await codeOf(jwtVerifyWithJwks(unknownKid, jwks, polyOptions)), 'NoMatchingKey');
  // A JWE that doesn't decrypt.
  const shared = await jwkGenerateForAlg('A256KW');
  const wrong = await jwkGenerateForAlg('A256KW');
  const jwe = await jweEncryptCompact(encoder.encode('top secret'), { enc: 'A256GCM', recipients: [{ alg: 'A256KW', key: shared }] });
  assert.equal(
    await joseCodeOf(jose.compactDecrypt(jwe, await jose.importJWK(wrong, 'A256KW'), { keyManagementAlgorithms: ['A256KW'], contentEncryptionAlgorithms: ['A256GCM'] })),
    'ERR_JWE_DECRYPTION_FAILED',
  );
  assert.equal(await codeOf(jweDecryptCompact(jwe, wrong, { allowedAlgs: ['A256KW'], allowedEnc: ['A256GCM'] })), 'DecryptionFailed');
});

test('differences: allow-lists are required, and none is never accepted', async () => {
  const keys = await joseKeys();
  const token = await joseToken(keys.privateKey);
  // jose defaults to the algorithms that fit the key; polyjose has no default allow-list.
  assert.equal((await jose.jwtVerify(token, keys.publicKey, { issuer: ISSUER, audience: AUDIENCE })).payload.sub, SUBJECT);
  assert.equal(await codeOf(jwtVerify(token, publicJwk, { issuers: [ISSUER], audiences: [AUDIENCE] })), 'AlgorithmNotAllowed');
  const shared = await jwkGenerateForAlg('A256KW');
  const jwe = await jweEncryptCompact(encoder.encode('top secret'), { enc: 'A256GCM', recipients: [{ alg: 'A256KW', key: shared }] });
  assert.equal(await codeOf(jweDecryptCompact(jwe, shared, { allowedAlgs: ['A256KW'] })), 'AlgorithmNotAllowed');
  // An UnsecuredJWT is refused even with "none" in the allow-list, and polyjose can't make one.
  const unsecured = new jose.UnsecuredJWT({ sub: SUBJECT }).setExpirationTime('5m').encode();
  assert.equal(await codeOf(jwtVerify(unsecured, publicJwk, { allowedAlgs: ['none'] })), 'AlgorithmNotAllowed');
  assert.equal(await codeOf(jwtSign({ exp: nowSeconds() + 300 }, privateJwk, { alg: 'none' })), 'AlgorithmNotAllowed');
});

test('differences: exp, aud and leeway', async () => {
  const keys = await joseKeys();
  // No exp: jose accepts it, polyjose requires exp unless allowMissingExp.
  const noExp = await joseToken(keys.privateKey, { expires: null });
  assert.equal(payloadOf(noExp).exp, undefined);
  assert.equal((await jose.jwtVerify(noExp, keys.publicKey, { algorithms: ['ES256'] })).payload.sub, SUBJECT);
  assert.equal(await codeOf(jwtVerify(noExp, publicJwk, { allowedAlgs: ['ES256'], audiences: [AUDIENCE] })), 'InvalidClaim');
  assert.equal((await jwtVerify(noExp, publicJwk, { allowedAlgs: ['ES256'], audiences: [AUDIENCE], allowMissingExp: true })).claims.sub, SUBJECT);
  // A token with aud and no audience configured: jose accepts it, polyjose doesn't.
  const token = await joseToken(keys.privateKey);
  assert.equal((await jose.jwtVerify(token, keys.publicKey, { algorithms: ['ES256'] })).payload.aud, AUDIENCE);
  assert.equal(await codeOf(jwtVerify(token, publicJwk, { allowedAlgs: ['ES256'] })), 'InvalidClaim');
  // 30 seconds after exp: jose (no tolerance by default) rejects it, polyjose (60 seconds by default) accepts it.
  const now = nowSeconds();
  const late = await joseToken(keys.privateKey, { expires: now - 30 });
  assert.equal(await joseCodeOf(jose.jwtVerify(late, keys.publicKey, { algorithms: ['ES256'], audience: AUDIENCE, currentDate: new Date(now * 1000) })), 'ERR_JWT_EXPIRED');
  assert.equal((await jwtVerify(late, publicJwk, { allowedAlgs: ['ES256'], audiences: [AUDIENCE], now })).claims.sub, SUBJECT);
  // Times are numbers of seconds: no '5m' or '2 hours' strings, and no Date.
  await assert.rejects(jwtVerify(token, publicJwk, { allowedAlgs: ['ES256'], audiences: [AUDIENCE], maxAge: '2 hours' }), TypeError);
  await assert.rejects(jwtVerify(token, publicJwk, { allowedAlgs: ['ES256'], audiences: [AUDIENCE], now: new Date() }), TypeError);
  await assert.rejects(jwtVerify(token, publicJwk, { allowedAlgs: ['ES256'], audiences: [AUDIENCE], clockTolerance: 30 }), TypeError);
});

test('differences: keys are JWKs, bound to their algorithm', async () => {
  const keys = await joseKeys();
  const payload = encoder.encode('hello');
  // A CryptoKey (Web Crypto) is not a key polyjose takes, extractable or not.
  await assert.rejects(jwsSignCompact(payload, keys.privateKey, { protectedHeader: { alg: 'ES256' } }), TypeError);
  const nonExtractable = (await jose.generateKeyPair('ES256')).privateKey;
  assert.equal(nonExtractable.extractable, false);
  await assert.rejects(jwsSignCompact(payload, nonExtractable, { protectedHeader: { alg: 'ES256' } }), TypeError);
  // A key whose "alg" names one algorithm can't be used with another, and a P-256 key can't sign EdDSA.
  const es256Key = await jwkGenerateForAlg('ES256');
  assert.equal(await codeOf(jwsSignCompact(payload, es256Key, { protectedHeader: { alg: 'ES384' } })), 'KeyAlgorithmMismatch');
  assert.equal(await codeOf(jwsSignCompact(payload, privateJwk, { protectedHeader: { alg: 'Ed25519' } })), 'KeyAlgorithmMismatch');
});

test('differences: nothing reads a token without verifying it, and no encrypt-only JWT', () => {
  // jose has decodeJwt, decodeProtectedHeader and UnsecuredJWT.decode; polyjose exports no
  // decode, peek or unsecured function, and the only decoder is base64url.
  assert.equal(typeof jose.decodeJwt, 'function');
  assert.equal(typeof jose.decodeProtectedHeader, 'function');
  assert.deepEqual(
    Object.keys(polyjose).filter((name) => /decode|peek|unsecured|unverified|remote|fetch/i.test(name)),
    ['base64urlDecode'],
  );
  // JWT encryption is nested (sign, then encrypt): there is no encrypt-only JWT like EncryptJWT.
  assert.equal(typeof jose.EncryptJWT, 'function');
  assert.deepEqual(
    Object.keys(polyjose).filter((name) => /^jwt(En|De)crypt/.test(name)).sort(),
    ['jwtDecryptNested', 'jwtDecryptNestedWithJwks', 'jwtEncryptNested'],
  );
});
