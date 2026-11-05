// Checks samples/fixtures/keys.json against the RFC text it comes from.
//
// The excerpts below are copied verbatim from the RFC text at
// rfc-editor.org (RFC 7515 Appendix A.1.1, A.2.1, A.3.1 and RFC 8037
// Appendix A.1 and A.4), including the line breaks the RFCs add "for display
// purposes only". For the RSA key only the public members are copied. As a
// second, independent check, each key verifies the example signature that
// its RFC publishes, using Node's own crypto as the oracle.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac, createPublicKey, createPrivateKey, verify, timingSafeEqual } from 'node:crypto';

const RFC = {
  hmacJwk: String.raw`
{"kty":"oct",
 "k":"AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75
      aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow"
}
`,
  hmacJws: String.raw`
eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9
.
eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFt
cGxlLmNvbS9pc19yb290Ijp0cnVlfQ
.
dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
`,
  rsaJwk: String.raw`
{"kty":"RSA",
 "n":"ofgWCuLjybRlzo0tZWJjNiuSfb4p4fAkd_wWJcyQoTbji9k0l8W26mPddx
      HmfHQp-Vaw-4qPCJrcS2mJPMEzP1Pt0Bm4d4QlL-yRT-SFd2lZS-pCgNMs
      D1W_YpRPEwOWvG6b32690r2jZ47soMZo9wGzjb_7OMg0LOL-bSf63kpaSH
      SXndS5z5rexMdbBYUsLA9e-KXBdQOS-UTo7WTBEMa2R2CapHg665xsmtdV
      MTBQY4uDZlxvb3qCo5ZwKh9kG4LT6_I5IhlJH7aGhyxXFvUK-DWNmoudF8
      NAco9_h9iaGNj8q2ethFkMLs91kzk2PAcDTW9gb54h4FRWyuXpoQ",
 "e":"AQAB",
`,
  rsaJws: String.raw`
eyJhbGciOiJSUzI1NiJ9
.
eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFt
cGxlLmNvbS9pc19yb290Ijp0cnVlfQ
.
cC4hiUPoj9Eetdgtv3hF80EGrhuB__dzERat0XF9g2VtQgr9PJbu3XOiZj5RZmh7
AAuHIm4Bh-0Qc_lF5YKt_O8W2Fp5jujGbds9uJdbF9CUAr7t1dnZcAcQjbKBYNX4
BAynRFdiuB--f_nZLgrnbyTyWzO75vRK5h6xBArLIARNPvkSjtQBMHlb1L07Qe7K
0GarZRmB_eSN9383LcOLn6_dO--xi12jzDwusC-eOkHWEsqtFZESc6BfI7noOPqv
hJ1phCnvWh6IeYI2w9QOYEUipUTI8np6LbgGY9Fs98rqVt5AXLIhWkWywlVmtVrB
p0igcN_IoypGlUPQGe77Rw
`,
  p256Jwk: String.raw`
{"kty":"EC",
 "crv":"P-256",
 "x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
 "y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
 "d":"jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI"
}
`,
  p256Jws: String.raw`
eyJhbGciOiJFUzI1NiJ9
.
eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFt
cGxlLmNvbS9pc19yb290Ijp0cnVlfQ
.
DtEhU3ljbEg8L38VWAfUAqOyKAM6-Xx-F4GawxaepmXFCgfTjDxw5djxLa8ISlSA
pmWQxfKTUJqPP3-Kg6NU1Q
`,
  ed25519Jwk: String.raw`
{"kty":"OKP","crv":"Ed25519",
"d":"nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A",
"x":"11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"}
`,
  ed25519PrivateHex: String.raw`
9d 61 b1 9d ef fd 5a 60 ba 84 4a f4 92 ec 2c c4
44 49 c5 69 7b 32 69 19 70 3b ac 03 1c ae 7f 60
`,
  ed25519PublicHex: String.raw`
d7 5a 98 01 82 b1 0a b7 d5 4b fe d3 c9 64 07 3a
0e e1 72 f3 da a6 23 25 af 02 1a 68 f7 07 51 1a
`,
  ed25519Jws: String.raw`
eyJhbGciOiJFZERTQSJ9.RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc.hgyY0il_MGCj
P0JzlnLWG1PPOt7-09PGcvMg3AIbQR6dWbhijcNR4ki4iylGjg5BhVsPt9g7sVvpAr_Mu
M0KAg
`,
};

const fixtures = JSON.parse(readFileSync(new URL('../../../samples/fixtures/keys.json', import.meta.url), 'utf8'));

/** Removes the display line breaks and indentation the RFCs insert. */
const unwrap = (s) => s.replace(/\s+/g, '');

/** A string member of an RFC JWK excerpt, such as `"x":"..."`. */
function member(excerpt, name) {
  const m = new RegExp(`"${name}":"([^"]+)"`).exec(unwrap(excerpt));
  assert.ok(m, `${name} in excerpt`);
  return m[1];
}

/** The members of a complete RFC JWK excerpt. */
const parseJwk = (excerpt) => JSON.parse(unwrap(excerpt));

const hex = (s) => Buffer.from(s.replace(/\s+/g, ''), 'hex');
const b64u = (s) => Buffer.from(s, 'base64url');

/** Splits an RFC compact JWS excerpt into signing input and signature. */
function compact(excerpt) {
  const [header, payload, signature] = unwrap(excerpt).split('.');
  return { input: Buffer.from(`${header}.${payload}`, 'ascii'), signature: b64u(signature) };
}

test('the fixture file has exactly the four RFC keys', () => {
  assert.deepEqual(Object.keys(fixtures.keys), ['hmac', 'rsa-public', 'p256', 'ed25519']);
  assert.match(fixtures.note, /published in RFC 7515 and RFC 8037/);
  assert.match(fixtures.note, /never in an application/);
});

test('each key cites its RFC section', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(fixtures.keys).map(([name, k]) => [name, [k.source, k.url]])),
    {
      hmac: ['RFC 7515, Appendix A.1.1', 'https://www.rfc-editor.org/rfc/rfc7515#appendix-A.1.1'],
      'rsa-public': ['RFC 7515, Appendix A.2.1 (public members only)', 'https://www.rfc-editor.org/rfc/rfc7515#appendix-A.2.1'],
      p256: ['RFC 7515, Appendix A.3.1', 'https://www.rfc-editor.org/rfc/rfc7515#appendix-A.3.1'],
      ed25519: ['RFC 8037, Appendix A.1', 'https://www.rfc-editor.org/rfc/rfc8037#appendix-A.1'],
    },
  );
});

test('RFC 7515 A.1.1: the HMAC key matches the RFC text', () => {
  assert.deepEqual(fixtures.keys.hmac.jwk, parseJwk(RFC.hmacJwk));
});

test('RFC 7515 A.1.1: the HMAC key reproduces the RFC example signature', () => {
  const { input, signature } = compact(RFC.hmacJws);
  const mac = createHmac('sha256', b64u(fixtures.keys.hmac.jwk.k)).update(input).digest();
  assert.ok(timingSafeEqual(mac, signature));
});

test('RFC 7515 A.2.1: the RSA key holds the public members only, matching the RFC text', () => {
  const jwk = fixtures.keys['rsa-public'].jwk;
  assert.deepEqual(Object.keys(jwk), ['kty', 'n', 'e']);
  assert.equal(jwk.kty, member(RFC.rsaJwk, 'kty'));
  assert.equal(jwk.n, member(RFC.rsaJwk, 'n'));
  assert.equal(jwk.e, member(RFC.rsaJwk, 'e'));
  for (const secret of ['d', 'p', 'q', 'dp', 'dq', 'qi']) assert.equal(jwk[secret], undefined, secret);
});

test('RFC 7515 A.2.1: the RSA public key verifies the RFC example RS256 signature', () => {
  const key = createPublicKey({ key: fixtures.keys['rsa-public'].jwk, format: 'jwk' });
  assert.equal(key.asymmetricKeyDetails.modulusLength, 2048);
  assert.equal(key.asymmetricKeyDetails.publicExponent, 65537n);
  const { input, signature } = compact(RFC.rsaJws);
  assert.ok(verify('sha256', input, key, signature));
});

test('RFC 7515 A.3.1: the P-256 key pair matches the RFC text', () => {
  assert.deepEqual(fixtures.keys.p256.jwk, parseJwk(RFC.p256Jwk));
});

test('RFC 7515 A.3.1: the P-256 private key belongs to its public key and verifies the RFC example ES256 signature', () => {
  const { jwk } = fixtures.keys.p256;
  const derived = createPublicKey(createPrivateKey({ key: jwk, format: 'jwk' })).export({ format: 'jwk' });
  assert.deepEqual([derived.x, derived.y], [jwk.x, jwk.y]);
  const { input, signature } = compact(RFC.p256Jws);
  const pub = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, format: 'jwk' });
  assert.ok(verify('sha256', input, { key: pub, dsaEncoding: 'ieee-p1363' }, signature));
});

test('RFC 8037 A.1: the Ed25519 key pair matches the RFC text and its hex dumps', () => {
  const { jwk } = fixtures.keys.ed25519;
  assert.deepEqual(jwk, parseJwk(RFC.ed25519Jwk));
  assert.deepEqual(b64u(jwk.d), hex(RFC.ed25519PrivateHex));
  assert.deepEqual(b64u(jwk.x), hex(RFC.ed25519PublicHex));
});

test('RFC 8037 A.1 and A.4: the Ed25519 private key belongs to its public key and verifies the RFC example signature', () => {
  const { jwk } = fixtures.keys.ed25519;
  const derived = createPublicKey(createPrivateKey({ key: jwk, format: 'jwk' })).export({ format: 'jwk' });
  assert.equal(derived.x, jwk.x);
  const { input, signature } = compact(RFC.ed25519Jws);
  const pub = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, format: 'jwk' });
  assert.ok(verify(null, input, pub, signature));
});
