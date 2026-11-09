import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PIN_PLATFORMS, parsePin, pinPlatformFor, pinRelease, PinError } from '../../../src/lib/samples/pins.mjs';

const REV = '0123456789abcdef0123456789abcdef01234567';

test('pin files exist for rust, js, kotlin and swift', () => {
  assert.deepEqual([...PIN_PLATFORMS], ['rust', 'js', 'kotlin', 'swift']);
});

test('the committed pins name one polyjose commit, with 0.1.1 upcoming', () => {
  const revs = new Set();
  for (const platform of PIN_PLATFORMS) {
    const raw = JSON.parse(readFileSync(new URL(`../../../samples/pins/${platform}.json`, import.meta.url), 'utf8'));
    const pin = parsePin(raw, platform);
    assert.equal(pin.source, 'git', platform);
    assert.equal(pin.upcoming, '0.1.1', platform);
    revs.add(pin.rev);
  }
  assert.equal(revs.size, 1, 'every platform is tested against the same commit');
});

test('none mode', () => {
  assert.deepEqual(parsePin({ source: 'none', upcoming: '0.1.0' }), { source: 'none', upcoming: '0.1.0' });
});

test('git mode needs a full 40-hex lowercase commit', () => {
  assert.deepEqual(parsePin({ source: 'git', rev: REV, upcoming: '0.1.0' }), { source: 'git', rev: REV, upcoming: '0.1.0' });
  for (const rev of [REV.slice(0, 39), `${REV}0`, REV.toUpperCase(), 'main', `${REV.slice(0, 39)}g`, 1234, undefined]) {
    assert.throws(() => parsePin({ source: 'git', rev, upcoming: '0.1.0' }, 'rust'), PinError, String(rev));
  }
});

test('registry mode needs a SemVer version', () => {
  assert.deepEqual(parsePin({ source: 'registry', version: '0.1.0' }), { source: 'registry', version: '0.1.0' });
  assert.deepEqual(parsePin({ source: 'registry', version: '1.2.3-rc.1+build.5' }), {
    source: 'registry',
    version: '1.2.3-rc.1+build.5',
  });
  for (const version of ['0.1', 'v0.1.0', '01.0.0', '0.1.0-', '^0.1.0', '', undefined, 1]) {
    assert.throws(() => parsePin({ source: 'registry', version }, 'js'), PinError, String(version));
  }
});

test('upcoming must be SemVer in none and git mode', () => {
  assert.throws(() => parsePin({ source: 'none' }), /upcoming/);
  assert.throws(() => parsePin({ source: 'none', upcoming: 'next' }), /upcoming/);
  assert.throws(() => parsePin({ source: 'git', rev: REV }), /upcoming/);
});

test('unknown sources and fields are rejected, so a typo cannot pass silently', () => {
  assert.throws(() => parsePin({ source: 'npm', version: '0.1.0' }, 'js'), /samples\/pins\/js\.json: source must be one of none, git, registry/);
  assert.throws(() => parsePin({ source: 'registry', verison: '0.1.0' }), /verison/);
  assert.throws(() => parsePin({ source: 'registry', version: '0.1.0', rev: REV }), /"rev" is not allowed/);
  assert.throws(() => parsePin({ source: 'none', upcoming: '0.1.0', rev: REV }), /"rev" is not allowed/);
  assert.throws(() => parsePin(null), PinError);
  assert.throws(() => parsePin([]), PinError);
  assert.throws(() => parsePin('none'), PinError);
});

test('error messages name the pin file', () => {
  assert.throws(() => parsePin({ source: 'git', rev: 'abc', upcoming: '0.1.0' }, 'kotlin'), /samples\/pins\/kotlin\.json/);
});

test('pinRelease gives the version a page shows and whether it is published', () => {
  assert.deepEqual(pinRelease({ source: 'none', upcoming: '0.1.0' }), { version: '0.1.0', published: false });
  assert.deepEqual(pinRelease({ source: 'git', rev: REV, upcoming: '0.2.0' }), { version: '0.2.0', published: false });
  assert.deepEqual(pinRelease({ source: 'registry', version: '0.1.0' }), { version: '0.1.0', published: true });
});

test('pinPlatformFor maps page platforms to pin files', () => {
  assert.equal(pinPlatformFor('rust'), 'rust');
  assert.equal(pinPlatformFor('node'), 'js');
  assert.equal(pinPlatformFor('web'), 'js');
  assert.equal(pinPlatformFor('kotlin'), 'kotlin');
  assert.equal(pinPlatformFor('swift'), 'swift');
  assert.throws(() => pinPlatformFor('android'), /"android"/);
});
