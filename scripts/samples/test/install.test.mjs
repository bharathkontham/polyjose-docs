import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installSnippets, COORDINATES } from '../../../src/lib/samples/install.mjs';

const REV = '0123456789abcdef0123456789abcdef01234567';
const registry = { source: 'registry', version: '0.1.0' };

function codeOf(platform, pin = registry) {
  return installSnippets(platform, pin)
    .snippets.map((s) => s.code)
    .join('\n');
}

test('the package coordinates are pinned', () => {
  assert.deepEqual(COORDINATES, {
    crate: 'polyjose',
    npmNode: '@polyjose/node',
    npmWasm: '@polyjose/wasm',
    mavenAndroid: 'dev.polyjose:polyjose',
    mavenJvm: 'dev.polyjose:polyjose-jvm',
    spmUrl: 'https://github.com/bharathkontham/polyjose',
    spmProduct: 'Polyjose',
  });
});

test('Rust: cargo add', () => {
  assert.equal(codeOf('rust'), 'cargo add polyjose@0.1.0');
});

test('Node.js and Web: npm install', () => {
  assert.equal(codeOf('node'), 'npm install @polyjose/node@0.1.0');
  assert.equal(codeOf('web'), 'npm install @polyjose/wasm@0.1.0');
});

test('Kotlin: Gradle Kotlin DSL lines for Android and the JVM', () => {
  const { snippets } = installSnippets('kotlin', registry);
  assert.equal(snippets.length, 2);
  assert.ok(snippets[0].code.includes('implementation("dev.polyjose:polyjose:0.1.0")'), snippets[0].code);
  assert.ok(snippets[1].code.includes('implementation("dev.polyjose:polyjose-jvm:0.1.0")'), snippets[1].code);
  assert.ok(snippets.every((s) => s.lang === 'kotlin' && s.title.startsWith('build.gradle.kts')));
});

test('Swift: Swift Package Manager dependency and product', () => {
  const code = codeOf('swift');
  assert.ok(code.includes('.package(url: "https://github.com/bharathkontham/polyjose", from: "0.1.0")'), code);
  assert.ok(code.includes('.product(name: "Polyjose", package: "polyjose")'), code);
});

test('languages and titles', () => {
  assert.deepEqual(
    ['rust', 'node', 'web', 'swift'].map((p) => installSnippets(p, registry).snippets.map((s) => [s.lang, s.title])),
    [[['sh', undefined]], [['sh', undefined]], [['sh', undefined]], [['swift', 'Package.swift']]],
  );
});

test('registry mode is published and uses the pinned version', () => {
  const result = installSnippets('rust', { source: 'registry', version: '1.4.2' });
  assert.equal(result.published, true);
  assert.equal(result.version, '1.4.2');
  assert.equal(result.snippets[0].code, 'cargo add polyjose@1.4.2');
});

test('git and none modes show the upcoming version and are not published', () => {
  for (const pin of [
    { source: 'none', upcoming: '0.1.0' },
    { source: 'git', rev: REV, upcoming: '0.1.0' },
  ]) {
    const result = installSnippets('node', pin);
    assert.equal(result.published, false, pin.source);
    assert.equal(result.version, '0.1.0');
    assert.equal(result.snippets[0].code, 'npm install @polyjose/node@0.1.0');
  }
});

test('an unknown platform or an invalid pin is an error', () => {
  assert.throws(() => installSnippets('android', registry), /"android"/);
  assert.throws(() => installSnippets('rust', { source: 'registry' }), /version/);
});
