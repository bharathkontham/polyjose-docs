import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PLATFORMS,
  collectRegions,
  isSampleSource,
  resolveSamples,
  resolveSample,
  toWebImports,
  validateReasons,
  SamplesError,
} from '../../../src/lib/samples/resolve.mjs';

const reasons = {
  'zip-bindings': 'Compression (`zip`) is available only in the Rust crate, with the `deflate` feature.',
  'rsa-private': 'No RSA private keys.',
};

const region = (id, body) => `// docs:start ${id}\n${body}\n// docs:end ${id}\n`;

function allFive(id) {
  return {
    '/samples/rust/tests/guide.rs': region(id, 'let rust = 1;'),
    '/samples/js/guide.test.mjs': `import { sign } from "@polyjose/node";\n${region(id, 'import { sign } from "@polyjose/node";\nawait sign();')}`,
    '/samples/kotlin/src/test/kotlin/GuideTest.kt': region(id, 'val kotlin = 1'),
    '/samples/swift/Tests/SamplesTests/GuideTests.swift': region(id, 'let swift = 1'),
  };
}

test('the five platforms have fixed labels in a fixed order', () => {
  assert.deepEqual(
    PLATFORMS.map((p) => [p.key, p.label, p.dir]),
    [
      ['rust', 'Rust', 'rust'],
      ['node', 'Node.js', 'js'],
      ['web', 'Web', 'web'],
      ['kotlin', 'Kotlin', 'kotlin'],
      ['swift', 'Swift', 'swift'],
    ],
  );
});

test('collectRegions groups regions by platform, keyed by id, with a code language', () => {
  const regions = collectRegions({
    ...allFive('guide/a'),
    '/samples/web/browser.ts': region('guide/browser', 'const x: number = 1;'),
  });
  assert.equal(regions.rust.get('guide/a').lang, 'rust');
  assert.equal(regions.node.get('guide/a').lang, 'js');
  assert.equal(regions.web.get('guide/browser').lang, 'ts');
  assert.equal(regions.kotlin.get('guide/a').lang, 'kotlin');
  assert.equal(regions.swift.get('guide/a').lang, 'swift');
  assert.equal(regions.rust.get('guide/a').file, 'samples/rust/tests/guide.rs');
});

test('collectRegions accepts paths with or without a leading slash or a root prefix', () => {
  const regions = collectRegions({
    'samples/rust/tests/a.rs': region('x/a', 'a();'),
    '/repo/docs/samples/swift/Tests/A.swift': region('x/b', 'b()'),
  });
  assert.ok(regions.rust.has('x/a'));
  assert.ok(regions.swift.has('x/b'));
});

test('collectRegions fails when one platform defines an id in two files', () => {
  assert.throws(
    () =>
      collectRegions({
        '/samples/rust/tests/a.rs': region('x/dup', 'a();'),
        '/samples/rust/tests/b.rs': region('x/dup', 'b();'),
      }),
    (err) =>
      err instanceof SamplesError &&
      /samples\/rust\/tests\/b\.rs:1: .*"x\/dup".*already defined for Rust in samples\/rust\/tests\/a\.rs:1/.test(err.message),
  );
});

test('the same id on different platforms is fine', () => {
  const regions = collectRegions(allFive('x/same'));
  for (const key of ['rust', 'node', 'kotlin', 'swift']) assert.ok(regions[key].has('x/same'), key);
});

test('collectRegions passes extractor errors through with the file name', () => {
  assert.throws(
    () => collectRegions({ '/samples/kotlin/src/test/kotlin/A.kt': '// docs:start x/a\nval a = 1\n' }),
    /samples\/kotlin\/src\/test\/kotlin\/A\.kt:1: .*never closed/,
  );
});

test('isSampleSource skips fixtures, generated copies, build output and dependencies', () => {
  for (const ok of [
    'samples/rust/tests/a.rs',
    '/samples/js/guide.test.mjs',
    'samples/js/lib/fixtures.mjs',
    'samples/web/worker.ts',
    'samples/kotlin/src/test/kotlin/A.kt',
    'samples/swift/Tests/SamplesTests/ATests.swift',
    'samples/swift/Package.swift',
  ]) {
    assert.equal(isSampleSource(ok), true, ok);
  }
  for (const skip of [
    'samples/fixtures/keys.rs',
    'samples/.generated/wasm/guide.test.mjs',
    'samples/js/.generated/x.mjs',
    'samples/js/node_modules/@polyjose/node/index.mjs',
    'samples/rust/target/debug/build/x.rs',
    'samples/kotlin/build/generated/A.kt',
    'samples/swift/.build/checkouts/x/A.swift',
    'samples/rust/tests/a.txt',
    'samples/rust/tests/a.kt',
    'samples/kotlin/a.rs',
    'samples/js/a.swift',
    'samples/compare/a.rs',
    'src/lib/samples/a.mjs',
  ]) {
    assert.equal(isSampleSource(skip), false, skip);
  }
});

test('collectRegions ignores files that are not sample sources', () => {
  const regions = collectRegions({
    '/samples/rust/target/debug/x.rs': region('x/a', 'a();'),
    '/samples/.generated/wasm/a.test.mjs': region('x/a', 'a();'),
  });
  for (const p of PLATFORMS) assert.equal(regions[p.key].size, 0);
});

test('resolveSamples returns five tabs in order, each with code and language', () => {
  const tabs = resolveSamples({ id: 'guide/a', regions: collectRegions(allFive('guide/a')), reasons });
  assert.deepEqual(
    tabs.map((t) => [t.platform, t.label, t.kind, t.lang]),
    [
      ['rust', 'Rust', 'code', 'rust'],
      ['node', 'Node.js', 'code', 'js'],
      ['web', 'Web', 'code', 'js'],
      ['kotlin', 'Kotlin', 'code', 'kotlin'],
      ['swift', 'Swift', 'code', 'swift'],
    ],
  );
  assert.equal(tabs[0].code, 'let rust = 1;');
  assert.equal(tabs[1].code, 'import { sign } from "@polyjose/node";\nawait sign();');
});

test('the Web tab is the Node.js region with the import specifier rewritten', () => {
  const tabs = resolveSamples({ id: 'guide/a', regions: collectRegions(allFive('guide/a')), reasons });
  assert.equal(tabs[2].code, 'import { sign } from "@polyjose/wasm";\nawait sign();');
  assert.equal(tabs[2].file, 'samples/js/guide.test.mjs');
});

test('a region in samples/web wins over the rewritten Node.js region', () => {
  const files = { ...allFive('guide/a'), '/samples/web/browser.ts': region('guide/a', 'await init();') };
  const tabs = resolveSamples({ id: 'guide/a', regions: collectRegions(files), reasons });
  assert.equal(tabs[2].code, 'await init();');
  assert.equal(tabs[2].lang, 'ts');
  assert.equal(tabs[2].file, 'samples/web/browser.ts');
});

test('toWebImports rewrites only @polyjose/node import specifiers', () => {
  const source = [
    'import { jwsSignCompact, PolyjoseError } from "@polyjose/node";',
    "import * as pj from '@polyjose/node';",
    'export { errorCodes } from "@polyjose/node";',
    'import "@polyjose/node";',
    'const lazy = await import("@polyjose/node");',
    'const lazy2 = await import ( \'@polyjose/node\' );',
    '// Install "@polyjose/node" from npm.',
    'const name = "@polyjose/node";',
    'import { other } from "@polyjose/node-extra";',
    'import { sub } from "@polyjose/node/sub";',
    'console.log("from @polyjose/node");',
  ].join('\n');
  const expected = [
    'import { jwsSignCompact, PolyjoseError } from "@polyjose/wasm";',
    "import * as pj from '@polyjose/wasm';",
    'export { errorCodes } from "@polyjose/wasm";',
    'import "@polyjose/wasm";',
    'const lazy = await import("@polyjose/wasm");',
    'const lazy2 = await import ( \'@polyjose/wasm\' );',
    '// Install "@polyjose/node" from npm.',
    'const name = "@polyjose/node";',
    'import { other } from "@polyjose/node-extra";',
    'import { sub } from "@polyjose/node/sub";',
    'console.log("from @polyjose/node");',
  ].join('\n');
  assert.equal(toWebImports(source), expected);
});

test('toWebImports handles multi-line import lists', () => {
  const source = 'import {\n  a,\n  b,\n} from "@polyjose/node";\nconst x = 1;';
  assert.equal(toWebImports(source), 'import {\n  a,\n  b,\n} from "@polyjose/wasm";\nconst x = 1;');
});

test('an unavailable platform gets the reason from the table instead of code', () => {
  const files = allFive('guide/zip');
  delete files['/samples/kotlin/src/test/kotlin/GuideTest.kt'];
  delete files['/samples/swift/Tests/SamplesTests/GuideTests.swift'];
  delete files['/samples/js/guide.test.mjs'];
  const tabs = resolveSamples({
    id: 'guide/zip',
    regions: collectRegions(files),
    unavailable: { node: 'zip-bindings', web: 'zip-bindings', kotlin: 'zip-bindings', swift: 'zip-bindings' },
    reasons,
  });
  assert.equal(tabs[0].kind, 'code');
  for (const tab of tabs.slice(1)) {
    assert.equal(tab.kind, 'unavailable', tab.platform);
    assert.equal(tab.reasonKey, 'zip-bindings');
    assert.equal(tab.reason, reasons['zip-bindings']);
  }
});

test('every platform can be unavailable, even with no regions at all', () => {
  const all = Object.fromEntries(PLATFORMS.map((p) => [p.key, 'rsa-private']));
  const tabs = resolveSamples({ id: 'guide/none', regions: collectRegions({}), unavailable: all, reasons });
  assert.equal(tabs.length, 5);
  assert.ok(tabs.every((t) => t.kind === 'unavailable'));
});

test('web may be unavailable while its Node.js region exists', () => {
  const tabs = resolveSamples({
    id: 'guide/a',
    regions: collectRegions(allFive('guide/a')),
    unavailable: { web: 'zip-bindings' },
    reasons,
  });
  assert.equal(tabs[1].kind, 'code');
  assert.equal(tabs[2].kind, 'unavailable');
});

function failsWith(args, pattern) {
  assert.throws(
    () => resolveSamples({ reasons, ...args }),
    (err) => {
      assert.ok(err instanceof SamplesError, String(err));
      assert.match(err.message, pattern);
      return true;
    },
  );
}

test('a missing platform fails, naming the id and the platform', () => {
  const files = allFive('guide/a');
  delete files['/samples/kotlin/src/test/kotlin/GuideTest.kt'];
  failsWith({ id: 'guide/a', regions: collectRegions(files) }, /"guide\/a".*Kotlin \(samples\/kotlin\)/s);
});

test('every missing platform is listed in one error', () => {
  failsWith(
    { id: 'guide/nowhere', regions: collectRegions({}) },
    /"guide\/nowhere"[\s\S]*Rust[\s\S]*Node\.js[\s\S]*Web[\s\S]*Kotlin[\s\S]*Swift/,
  );
});

test('a missing Node.js region also leaves Web missing unless samples/web defines it', () => {
  const files = allFive('guide/a');
  delete files['/samples/js/guide.test.mjs'];
  failsWith({ id: 'guide/a', regions: collectRegions(files) }, /Node\.js \(samples\/js\)[\s\S]*Web \(samples\/web or samples\/js\)/);
});

test('an unavailable key missing from the reasons table fails', () => {
  failsWith(
    { id: 'guide/a', regions: collectRegions(allFive('guide/a')), unavailable: { web: 'no-such-reason' } },
    /"guide\/a".*"no-such-reason".*unavailable\.json/s,
  );
});

test('free text instead of a reason key fails', () => {
  failsWith(
    { id: 'guide/a', regions: collectRegions(allFive('guide/a')), unavailable: { web: 'Not on the web, sorry' } },
    /"Not on the web, sorry".*not a key/,
  );
});

test('an unknown platform name in unavailable fails', () => {
  failsWith(
    { id: 'guide/a', regions: collectRegions(allFive('guide/a')), unavailable: { android: 'zip-bindings' } },
    /"android" is not a platform.*rust, node, web, kotlin, swift/,
  );
});

test('a platform marked unavailable that defines the region fails', () => {
  failsWith(
    { id: 'guide/a', regions: collectRegions(allFive('guide/a')), unavailable: { kotlin: 'zip-bindings' } },
    /"guide\/a".*Kotlin.*unavailable.*samples\/kotlin\/src\/test\/kotlin\/GuideTest\.kt/s,
  );
});

test('an invalid sample id fails', () => {
  failsWith({ id: 'NotAnId', regions: collectRegions({}) }, /"NotAnId" is not a valid sample id/);
});

test('resolveSample returns one platform', () => {
  const regions = collectRegions(allFive('start/a'));
  assert.equal(resolveSample({ platform: 'rust', id: 'start/a', regions }).code, 'let rust = 1;');
  assert.equal(resolveSample({ platform: 'web', id: 'start/a', regions }).code, 'import { sign } from "@polyjose/wasm";\nawait sign();');
  assert.throws(() => resolveSample({ platform: 'swift', id: 'start/missing', regions }), /"start\/missing".*Swift/);
  assert.throws(() => resolveSample({ platform: 'android', id: 'start/a', regions }), /"android" is not a platform/);
});

test('validateReasons accepts the site table and rejects bad entries', () => {
  const table = JSON.parse(readFileSync(new URL('../../../src/data/unavailable.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => validateReasons(table));
  for (const key of ['zip-bindings', 'rsa-private', 'sha1']) {
    assert.equal(typeof table[key], 'string', key);
  }
  assert.match(table['zip-bindings'], /^Compression \(`zip`\) is available only in the Rust crate, with the `deflate` feature/);
  assert.throws(() => validateReasons([]), /must be an object/);
  assert.throws(() => validateReasons({ 'Bad Key': 'x' }), /"Bad Key"/);
  assert.throws(() => validateReasons({ ok: '' }), /"ok".*non-empty/);
  assert.throws(() => validateReasons({ ok: 3 }), /"ok".*non-empty/);
});
