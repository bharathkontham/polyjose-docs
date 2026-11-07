// Browser-free checks of the exporter: argument parsing and the missing-source
// check, which runs before any browser is launched. The rendering itself is
// covered by export.integration.mjs (npm run brand:export:test).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseArgs, missingSources, UsageError } from '../export.mjs';
import { SOURCES } from '../targets.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = fileURLToPath(new URL('../export.mjs', import.meta.url));
const FIXTURE_SRC = join(import.meta.dirname, 'fixtures', 'src');

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});
const tmp = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};

/** Runs the CLI with no Playwright browser available. */
const run = (args) =>
  spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '/nonexistent' },
  });

test('defaults: sources from brand/src, outputs under the repo root', () => {
  assert.deepEqual(parseArgs([]), { src: resolve(ROOT, 'brand/src'), out: resolve(ROOT), help: false });
});

test('--src and --out, as separate or = values, resolve against the working directory', () => {
  assert.deepEqual(parseArgs(['--src', 'a/src', '--out', '/tmp/x']), {
    src: resolve('a/src'),
    out: '/tmp/x',
    help: false,
  });
  assert.deepEqual(parseArgs(['--src=a', '--out=b']), { src: resolve('a'), out: resolve('b'), help: false });
});

test('--help', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
});

test('rejects unknown flags, positional arguments and missing values', () => {
  for (const argv of [['--bogus'], ['file.svg'], ['--src'], ['--out'], ['--src', '--out', 'x'], ['--src=']]) {
    assert.throws(() => parseArgs(argv), UsageError, JSON.stringify(argv));
  }
});

test('missingSources: none for the fixtures, all for an empty directory', () => {
  assert.deepEqual(missingSources(FIXTURE_SRC), []);
  assert.deepEqual(missingSources(tmp('brand-src-empty-')), [...SOURCES]);
});

test('missingSources: a directory with a source name is not a source', () => {
  const dir = tmp('brand-src-dir-');
  for (const name of SOURCES) copyFileSync(join(FIXTURE_SRC, name), join(dir, name));
  rmSync(join(dir, 'og.svg'));
  mkdirSync(join(dir, 'og.svg'));
  assert.deepEqual(missingSources(dir), ['og.svg']);
});

test('the CLI exits non-zero, names every missing source and writes nothing, without a browser', () => {
  const src = tmp('brand-src-partial-');
  const out = tmp('brand-out-');
  for (const name of SOURCES.filter((n) => n !== 'avatar.svg' && n !== 'og.svg')) {
    copyFileSync(join(FIXTURE_SRC, name), join(src, name));
  }
  const r = run(['--src', src, '--out', out]);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /missing source.*\bog\.svg\b/s);
  assert.match(r.stderr, /\bavatar\.svg\b/);
  assert.doesNotMatch(r.stderr, /favicon\.svg/);
  assert.deepEqual(readdirSync(out), []);
});

test('the CLI exits non-zero when the source directory does not exist', () => {
  const r = run(['--src', join(tmp('brand-nosrc-'), 'nope'), '--out', tmp('brand-out-')]);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /missing source/);
});

test('without a Playwright browser the CLI exits 1 with the install hint and writes nothing', () => {
  // PLAYWRIGHT_BROWSERS_PATH=/nonexistent (see run) makes the launch fail at
  // once, so this needs no browser and starts none.
  const out = tmp('brand-out-');
  const r = run(['--src', FIXTURE_SRC, '--out', out]);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /npx playwright install chromium/);
  assert.deepEqual(readdirSync(out), []);
});

test('the CLI exits 2 on a usage error and 0 on --help, without a browser', () => {
  const bad = run(['--bogus']);
  assert.equal(bad.status, 2, bad.stderr);
  assert.match(bad.stderr, /--bogus/);
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--src/);
});
