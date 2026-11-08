// Helpers shared by the JavaScript samples. Nothing here is shown on a page.
//
// The keys come from samples/fixtures/keys.json: example keys published in RFC 7515 and RFC 8037.
// Their private parts are printed in the RFCs, so they protect nothing. Never use them in an
// application.
//
// The Web run executes a copy of these files from samples/.generated/web, so keys.json is found by
// walking up from this file rather than at a fixed relative path.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function findKeysJson() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, 'fixtures', 'keys.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('samples/fixtures/keys.json not found above ' + fileURLToPath(import.meta.url));
    dir = parent;
  }
}

const keys = JSON.parse(readFileSync(findKeysJson(), 'utf8')).keys;

/**
 * The fixture JWK named `name`, as a plain object: `hmac` (RFC 7515 A.1.1), `rsa-public` (A.2.1,
 * public members only), `p256` (A.3.1) or `ed25519` (RFC 8037 A.1).
 *
 * @param {string} name
 * @returns {Record<string, string>}
 */
export function fixtureJwk(name) {
  const entry = keys[name];
  if (!entry) throw new Error(`keys.json has no key ${JSON.stringify(name)}`);
  return { ...entry.jwk };
}

/**
 * The public half of the fixture JWK named `name` (RFC 7517 §4, RFC 7518 §6.2.1, RFC 8037 §2):
 * the private member `d` removed. What a verifier holds.
 *
 * @param {string} name
 * @returns {Record<string, string>}
 */
export function fixturePublicJwk(name) {
  const { d: _private, ...publicJwk } = fixtureJwk(name);
  if (publicJwk.kty === 'oct') throw new Error(`keys.${name} is an oct key, which has no public half`);
  return publicJwk;
}
