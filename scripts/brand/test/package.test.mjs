// ADR 0053: the brand pipeline adds no dependency. These are the dependency
// lists of package.json on origin/main (8d9aa1a) when the pipeline was added;
// a change to them is a separate, deliberate decision, not part of the brand
// work, and must update this snapshot in the same commit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8'));
const lock = JSON.parse(readFileSync(`${ROOT}package-lock.json`, 'utf8'));

const DEPENDENCIES = {
  '@astrojs/starlight': '0.42.9',
  astro: '7.4.6',
  'starlight-links-validator': '0.27.0',
};
const DEV_DEPENDENCIES = {
  '@astrojs/check': '0.9.12',
  '@axe-core/playwright': '4.14.0',
  '@playwright/test': '1.64.1',
  typescript: '6.0.3',
};
const OVERRIDES = { 'playwright-core': '$@playwright/test' };

test('dependencies and devDependencies are unchanged', () => {
  assert.deepEqual(pkg.dependencies, DEPENDENCIES);
  assert.deepEqual(pkg.devDependencies, DEV_DEPENDENCIES);
  assert.deepEqual(pkg.overrides, OVERRIDES);
  for (const key of ['optionalDependencies', 'peerDependencies', 'bundleDependencies', 'bundledDependencies']) {
    assert.equal(pkg[key], undefined, key);
  }
});

test('the lockfile root lists the same dependencies', () => {
  const root = lock.packages[''];
  assert.deepEqual(root.dependencies, DEPENDENCIES);
  assert.deepEqual(root.devDependencies, DEV_DEPENDENCIES);
});

test('the brand scripts run the exporter and its browser test', () => {
  assert.equal(pkg.scripts['brand:export'], 'node scripts/brand/export.mjs');
  assert.equal(pkg.scripts['brand:export:test'], 'node --test scripts/brand/test/export.integration.mjs');
});

test('the browser test is outside the test:scripts glob', () => {
  assert.equal(pkg.scripts['test:scripts'], 'node --test "scripts/**/*.test.mjs" "tests/data/*.test.mjs"');
  assert.doesNotMatch('scripts/brand/test/export.integration.mjs', /\.test\.mjs$/);
});

test('build, test:scripts and the install hooks never export or launch the exporter', () => {
  for (const name of ['build', 'test:scripts', 'preinstall', 'install', 'postinstall', 'prepare', 'prebuild', 'postbuild']) {
    const script = pkg.scripts[name] ?? '';
    assert.doesNotMatch(script, /brand|export\.mjs/, name);
  }
});
