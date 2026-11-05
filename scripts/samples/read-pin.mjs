#!/usr/bin/env node
// @ts-check
/**
 * Prints a validated pin as `key=value` lines for scripts/samples/run.sh:
 *
 *     source=git|registry|none
 *     rev=<40-hex commit>        (git mode only)
 *     version=<SemVer>           (registry: the pinned version; git and none: the upcoming one)
 *
 * The values are checked against strict patterns first, so the shell can
 * read them without quoting surprises.
 *
 * Usage: node scripts/samples/read-pin.mjs <docs repository> <rust|js|kotlin|swift>
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PIN_PLATFORMS, parsePin } from '../../src/lib/samples/pins.mjs';

const [root, platform] = process.argv.slice(2);
const fail = (/** @type {string} */ message) => {
  console.error(message);
  process.exit(1);
};

if (!root || !(/** @type {readonly string[]} */ (PIN_PLATFORMS).includes(platform))) {
  fail(`Usage: node scripts/samples/read-pin.mjs <docs repository> <${PIN_PLATFORMS.join('|')}>`);
}

const file = `samples/pins/${platform}.json`;
let text = '';
try {
  text = readFileSync(join(root, file), 'utf8');
} catch {
  fail(`${file} is missing`);
}
let raw;
try {
  raw = JSON.parse(text);
} catch (err) {
  fail(`${file} is not valid JSON: ${/** @type {Error} */ (err).message}`);
}
let pin;
try {
  pin = parsePin(raw, platform);
} catch (err) {
  fail(/** @type {Error} */ (err).message);
}
pin = /** @type {import('../../src/lib/samples/pins.mjs').Pin} */ (pin);

const lines = [`source=${pin.source}`];
if (pin.source === 'git') lines.push(`rev=${pin.rev}`);
lines.push(`version=${pin.source === 'registry' ? pin.version : pin.upcoming}`);
console.log(lines.join('\n'));
