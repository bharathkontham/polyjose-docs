// The samples of Guides › Encrypt and decrypt (src/content/docs/guides/encrypt-and-decrypt.mdx).
// The Web run executes this same file with `@polyjose/node` replaced by `@polyjose/wasm`.
//
// JWE (RFC 7516) in the compact and JSON serializations, with ECDH-ES+A256KW (RFC 7518 §4.6,
// RFC 8037 §3.2), dir (RFC 7518 §4.5), A256KW (RFC 7518 §4.4), RSA-OAEP-256 (RFC 7518 §4.3,
// encryption only), PBES2 (RFC 7518 §4.8) and A256GCM content encryption (RFC 7518 §5.3). Keys are
// generated in each test, except the RSA public key, which is RFC 7515 Appendix A.2.1's. Every
// decryption failure has the one code DecryptionFailed (RFC 7516 §11.5).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64urlEncode,
  jweDecryptCompact,
  jweDecryptJson,
  jweEncryptCompact,
  jweEncryptJson,
  jwkGenerateEc,
  jwkGenerateForAlg,
  jwkGenerateOkp,
  jwkToPublic,
  PolyjoseError,
} from '@polyjose/node';
import { fixtureJwk } from './lib/fixtures.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The protected header of a compact JWE (RFC 7516 §7.1), decoded. */
function protectedHeaderOf(token) {
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
}

test('ECDH-ES+A256KW with A256GCM to a P-256 recipient', async () => {
  // docs:start encrypt-and-decrypt/ecdh-p256
  // The recipient generates a key pair and publishes the public half.
  const recipientKey = await jwkGenerateEc('P-256');
  const recipientPublicKey = await jwkToPublic(recipientKey);

  // The sender encrypts to the public key.
  const token = await jweEncryptCompact(new TextEncoder().encode('top secret'), {
    enc: 'A256GCM',
    recipients: [{ alg: 'ECDH-ES+A256KW', key: recipientPublicKey }],
  });

  // The recipient decrypts, naming the algorithms it accepts.
  const decrypted = await jweDecryptCompact(token, recipientKey, {
    allowedAlgs: ['ECDH-ES+A256KW'],
    allowedEnc: ['A256GCM'],
  });
  const text = new TextDecoder().decode(decrypted.plaintext); // "top secret"
  // docs:end encrypt-and-decrypt/ecdh-p256
  assert.equal(token.split('.').length, 5, 'five parts (RFC 7516 §7.1)');
  assert.equal(text, 'top secret');
  const header = protectedHeaderOf(token);
  assert.equal(header.alg, 'ECDH-ES+A256KW');
  assert.equal(header.enc, 'A256GCM');
  assert.equal(header.epk.crv, 'P-256', 'the ephemeral public key (RFC 7518 §4.6.1.1)');
  assert.equal(decrypted.protectedHeader?.alg, 'ECDH-ES+A256KW');
  assert.equal(decrypted.recipientIndex, 0);
});

test('ECDH-ES+A256KW with A256GCM to an X25519 recipient', async () => {
  // docs:start encrypt-and-decrypt/ecdh-x25519
  const recipientKey = await jwkGenerateOkp('X25519');
  const recipientPublicKey = await jwkToPublic(recipientKey);

  const token = await jweEncryptCompact(new TextEncoder().encode('top secret'), {
    enc: 'A256GCM',
    recipients: [{ alg: 'ECDH-ES+A256KW', key: recipientPublicKey }],
  });
  const decrypted = await jweDecryptCompact(token, recipientKey, {
    allowedAlgs: ['ECDH-ES+A256KW'],
    allowedEnc: ['A256GCM'],
  });
  // docs:end encrypt-and-decrypt/ecdh-x25519
  assert.equal(decoder.decode(decrypted.plaintext), 'top secret');
  assert.equal(protectedHeaderOf(token).epk.crv, 'X25519', 'RFC 8037 §3.2');
});

test('dir with A256GCM and a shared key', async () => {
  // docs:start encrypt-and-decrypt/dir
  // With "dir" the shared key is the content encryption key itself.
  const sharedKey = await jwkGenerateForAlg('A256GCM');
  const token = await jweEncryptCompact(new TextEncoder().encode('top secret'), {
    enc: 'A256GCM',
    recipients: [{ alg: 'dir', key: sharedKey }],
  });
  const decrypted = await jweDecryptCompact(token, sharedKey, {
    allowedAlgs: ['dir'],
    allowedEnc: ['A256GCM'],
  });
  // docs:end encrypt-and-decrypt/dir
  assert.equal(token.split('.')[1], '', 'no JWE Encrypted Key with dir (RFC 7518 §4.5)');
  assert.equal(sharedKey.alg, 'A256GCM');
  assert.equal(decoder.decode(decrypted.plaintext), 'top secret');
});

test('A256KW with A256GCM and a shared key', async () => {
  // docs:start encrypt-and-decrypt/a256kw
  // The shared key wraps a fresh content encryption key for each message.
  const sharedKey = await jwkGenerateForAlg('A256KW');
  const token = await jweEncryptCompact(new TextEncoder().encode('top secret'), {
    enc: 'A256GCM',
    recipients: [{ alg: 'A256KW', key: sharedKey }],
  });
  const decrypted = await jweDecryptCompact(token, sharedKey, {
    allowedAlgs: ['A256KW'],
    allowedEnc: ['A256GCM'],
  });
  // docs:end encrypt-and-decrypt/a256kw
  assert.equal(sharedKey.alg, 'A256KW');
  assert.equal(Buffer.from(token.split('.')[1], 'base64url').length, 40, 'a wrapped 256-bit key (RFC 3394)');
  assert.equal(decoder.decode(decrypted.plaintext), 'top secret');
});

test('RSA-OAEP-256 encryption to an RSA public key', async () => {
  const rsaPublicKey = fixtureJwk('rsa-public');
  // docs:start encrypt-and-decrypt/rsa-oaep-256
  // `rsaPublicKey` is the recipient's public JWK: {"kty":"RSA","n":"...","e":"AQAB"}.
  const token = await jweEncryptCompact(new TextEncoder().encode('top secret'), {
    enc: 'A256GCM',
    recipients: [{ alg: 'RSA-OAEP-256', key: rsaPublicKey }],
  });
  // docs:end encrypt-and-decrypt/rsa-oaep-256
  const parts = token.split('.');
  assert.equal(parts.length, 5);
  assert.deepEqual(protectedHeaderOf(token), { alg: 'RSA-OAEP-256', enc: 'A256GCM' });
  assert.equal(Buffer.from(parts[1], 'base64url').length, 256, 'one 2048-bit RSA block');
});

/** Stands in for a password the user enters: random bytes, so no password is written in source. */
const examplePassword = () => crypto.getRandomValues(new Uint8Array(24));

test('PBES2 with a password and the default iteration count', async () => {
  const password = examplePassword();
  // docs:start encrypt-and-decrypt/pbes2
  // `password` holds the password's UTF-8 bytes, as the user entered them: never a literal in
  // source code. A password is an oct key whose "k" is the base64url of those bytes.
  const passwordKey = { kty: 'oct', k: await base64urlEncode(password) };

  const token = await jweEncryptCompact(new TextEncoder().encode('top secret'), {
    enc: 'A256GCM',
    recipients: [{ alg: 'PBES2-HS256+A128KW', key: passwordKey }],
  });
  const decrypted = await jweDecryptCompact(token, passwordKey, {
    allowedAlgs: ['PBES2-HS256+A128KW'],
    allowedEnc: ['A256GCM'],
  });
  // docs:end encrypt-and-decrypt/pbes2
  assert.equal(decoder.decode(decrypted.plaintext), 'top secret');
  const header = protectedHeaderOf(token);
  assert.equal(header.p2c, 10000, 'the default iteration count');
  assert.equal(Buffer.from(header.p2s, 'base64url').length, 16, 'a 16-byte salt input (RFC 7518 §4.8.1.1)');
});

test('PBES2 above the decrypt bound needs maxPbes2Count', async () => {
  const passwordKey = { kty: 'oct', k: await base64urlEncode(examplePassword()) };
  // docs:start encrypt-and-decrypt/pbes2-limit
  const token = await jweEncryptCompact(new TextEncoder().encode('top secret'), {
    enc: 'A256GCM',
    recipients: [{ alg: 'PBES2-HS256+A128KW', key: passwordKey, p2c: 20000 }],
  });
  const options = { allowedAlgs: ['PBES2-HS256+A128KW'], allowedEnc: ['A256GCM'] };

  // 20,000 iterations is above the default bound of 10,000.
  let code;
  try {
    await jweDecryptCompact(token, passwordKey, options);
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "DecryptionFailed"
  }

  // Raising the bound lets it through.
  const decrypted = await jweDecryptCompact(token, passwordKey, { ...options, maxPbes2Count: 20000 });
  // docs:end encrypt-and-decrypt/pbes2-limit
  assert.equal(code, 'DecryptionFailed');
  assert.equal(protectedHeaderOf(token).p2c, 20000);
  assert.equal(decoder.decode(decrypted.plaintext), 'top secret');
});

test('JSON serialization with two recipients and AAD', async () => {
  const sharedKey = await jwkGenerateForAlg('A256KW');
  const recipientKey = await jwkGenerateEc('P-256');
  const recipientPublicKey = await jwkToPublic(recipientKey);
  // docs:start encrypt-and-decrypt/json
  const jwe = await jweEncryptJson(
    new TextEncoder().encode('top secret'),
    {
      enc: 'A256GCM',
      aad: new TextEncoder().encode('order-42'),
      recipients: [
        { alg: 'A256KW', key: sharedKey },
        { alg: 'ECDH-ES+A256KW', key: recipientPublicKey },
      ],
    },
    'general',
  );

  // The second recipient decrypts with its own key.
  const decrypted = await jweDecryptJson(jwe, recipientKey, {
    allowedAlgs: ['A256KW', 'ECDH-ES+A256KW'],
    allowedEnc: ['A256GCM'],
  });
  // decrypted.recipientIndex === 1, and decrypted.aad holds "order-42"
  // docs:end encrypt-and-decrypt/json
  assert.equal(JSON.parse(jwe).recipients.length, 2);
  assert.equal(decrypted.recipientIndex, 1);
  assert.ok(decrypted.aad);
  assert.equal(decoder.decode(decrypted.aad), 'order-42');
  assert.equal(decoder.decode(decrypted.plaintext), 'top secret');
  const first = await jweDecryptJson(jwe, sharedKey, { allowedAlgs: ['A256KW'], allowedEnc: ['A256GCM'] });
  assert.equal(first.recipientIndex, 0);
});

test('every decryption failure is DecryptionFailed', async () => {
  const sharedKey = await jwkGenerateForAlg('A256KW');
  const token = await jweEncryptCompact(encoder.encode('top secret'), {
    enc: 'A256GCM',
    recipients: [{ alg: 'A256KW', key: sharedKey }],
  });
  // docs:start encrypt-and-decrypt/decryption-failed
  const wrongKey = await jwkGenerateForAlg('A256KW');
  let code;
  try {
    await jweDecryptCompact(token, wrongKey, { allowedAlgs: ['A256KW'], allowedEnc: ['A256GCM'] });
  } catch (err) {
    if (!(err instanceof PolyjoseError)) throw err;
    code = err.code; // "DecryptionFailed", whatever went wrong
  }
  // docs:end encrypt-and-decrypt/decryption-failed
  assert.equal(code, 'DecryptionFailed');
  // A modified ciphertext fails with the same code.
  const parts = token.split('.');
  const ciphertext = Buffer.from(parts[3], 'base64url');
  ciphertext[0] ^= 1;
  parts[3] = ciphertext.toString('base64url');
  await assert.rejects(
    jweDecryptCompact(parts.join('.'), sharedKey, { allowedAlgs: ['A256KW'], allowedEnc: ['A256GCM'] }),
    (err) => err instanceof PolyjoseError && err.code === 'DecryptionFailed',
  );
});
