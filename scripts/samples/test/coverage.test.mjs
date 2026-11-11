import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { checkCoverage } from '../check-coverage.mjs';
import { findUsages } from '../usages.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = fileURLToPath(new URL('../check-coverage.mjs', import.meta.url));

const REASONS = JSON.stringify({ 'zip-bindings': 'Rust only.', 'rsa-private': 'No RSA private keys.' });
const region = (id, body = 'x();') => `// docs:start ${id}\n${body}\n// docs:end ${id}\n`;
const IMPORTS = "import Samples from '../../components/samples/Samples.astro';\n\n";

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** Writes a docs tree into a fresh temp dir and returns its path. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'samples-coverage-'));
  temps.push(root);
  const all = { 'src/data/unavailable.json': REASONS, ...files };
  for (const [path, content] of Object.entries(all)) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

/** A sample with the given id on every platform directory. */
function everywhere(id) {
  return {
    'samples/rust/tests/guide.rs': region(id),
    'samples/js/guide.test.mjs': region(id),
    'samples/kotlin/src/test/kotlin/GuideTest.kt': region(id),
    'samples/swift/Tests/SamplesTests/GuideTests.swift': region(id),
  };
}

function errorsOf(root) {
  return checkCoverage(root).errors.join('\n');
}

test('the real docs tree passes, including with no usages and no regions', () => {
  const result = checkCoverage(ROOT);
  assert.deepEqual(result.errors, []);
});

test('an empty tree with no samples directories passes', () => {
  const result = checkCoverage(tree({ 'src/content/docs/index.mdx': '# Home\n' }));
  assert.deepEqual(result.errors, []);
  assert.equal(result.usages, 0);
  assert.equal(result.regions, 0);
});

test('a page whose samples exist on every platform passes', () => {
  const root = tree({
    ...everywhere('guide/sign'),
    'src/content/docs/guides/guide.mdx': `${IMPORTS}<Samples id="guide/sign" />\n`,
  });
  const result = checkCoverage(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.usages, 1);
  assert.equal(result.regions, 4);
});

test('fails on an id used but defined on no platform', () => {
  const root = tree({ 'src/content/docs/guides/guide.mdx': `${IMPORTS}\n<Samples id="guide/ghost" />\n` });
  assert.match(errorsOf(root), /src\/content\/docs\/guides\/guide\.mdx:4: <Samples id="guide\/ghost"> is not defined on any platform/);
});

test('an id that every platform marks unavailable needs no region', () => {
  const all = '{{ rust: "rsa-private", node: "rsa-private", web: "rsa-private", kotlin: "rsa-private", swift: "rsa-private" }}';
  const root = tree({ 'src/content/docs/guides/guide.mdx': `${IMPORTS}<Samples id="guide/decrypt" unavailable=${all} />\n` });
  assert.deepEqual(checkCoverage(root).errors, []);
});

test('fails on a platform that lacks the region and has no unavailable entry', () => {
  const files = everywhere('guide/sign');
  delete files['samples/swift/Tests/SamplesTests/GuideTests.swift'];
  const root = tree({ ...files, 'src/content/docs/guides/guide.mdx': `${IMPORTS}<Samples id="guide/sign" />\n` });
  assert.match(errorsOf(root), /guide\.mdx:3: Sample "guide\/sign":[\s\S]*Swift \(samples\/swift\) has no region/);
});

test('fails on an orphan region, defined but never used', () => {
  const root = tree({
    ...everywhere('guide/sign'),
    'samples/kotlin/src/test/kotlin/ExtraTest.kt': region('guide/extra'),
    'src/content/docs/guides/guide.mdx': `${IMPORTS}<Samples id="guide/sign" />\n`,
  });
  const errors = errorsOf(root);
  assert.match(errors, /samples\/kotlin\/src\/test\/kotlin\/ExtraTest\.kt:1: region "guide\/extra" \(Kotlin\) is not used on any page/);
  assert.equal(checkCoverage(root).errors.length, 1);
});

test('every region of a tree with no pages is an orphan', () => {
  const root = tree(everywhere('guide/sign'));
  assert.equal(checkCoverage(root).errors.length, 4);
});

test('a samples/web region is used by <Samples> with the same id', () => {
  const root = tree({
    ...everywhere('guide/sign'),
    'samples/web/browser.ts': region('guide/sign', 'await init();'),
    'src/content/docs/guides/guide.mdx': `${IMPORTS}<Samples id="guide/sign" />\n`,
  });
  assert.deepEqual(checkCoverage(root).errors, []);
});

test('fails on <Sample> outside start/ and guides/migrate/', () => {
  const root = tree({
    'samples/rust/tests/guide.rs': region('guide/one'),
    'src/content/docs/guides/guide.mdx': `import Sample from '../../components/samples/Sample.astro';\n\n<Sample platform="rust" id="guide/one" />\n`,
  });
  assert.match(
    errorsOf(root),
    /guides\/guide\.mdx:3: <Sample> is only for get-started pages \(start\/\) and migration guides \(guides\/migrate\/\); use <Samples> here/,
  );
});

test('<Sample> on a page whose path only starts like guides/migrate/ fails', () => {
  const root = tree({
    'samples/js/guide.test.mjs': region('migrated/one'),
    'src/content/docs/guides/migrated.mdx': '<Sample platform="node" id="migrated/one" />\n',
    'src/content/docs/guides/migrate-other/x.mdx': '<Sample platform="node" id="migrated/one" />\n',
  });
  const errors = checkCoverage(root).errors;
  assert.equal(errors.length, 2, errors.join('\n'));
  assert.match(errors[0], /guides\/migrate-other\/x\.mdx:1: <Sample> is only for/);
  assert.match(errors[1], /guides\/migrated\.mdx:1: <Sample> is only for/);
});

test('<Sample> on a migration guide passes, for the polyjose region and a before region in the same file', () => {
  const file = region('migrate-jose/sign-before', 'await new SignJWT({}).sign(key);') + region('migrate-jose/sign', 'await jwtSign({}, key, { alg });');
  const root = tree({
    'samples/js/migrate-jose.test.mjs': file,
    'src/content/docs/guides/migrate/jose.mdx': [
      "import Sample from '../../../components/samples/Sample.astro';",
      '',
      '<Sample platform="node" id="migrate-jose/sign-before" title="jose" />',
      '<Sample platform="node" id="migrate-jose/sign" title="polyjose" />',
      '',
    ].join('\n'),
  });
  const result = checkCoverage(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.usages, 2);
  assert.equal(result.regions, 2);
});

test('a before region that no migration guide shows is an orphan', () => {
  const root = tree({
    'samples/js/migrate-jose.test.mjs': region('migrate-jose/sign-before') + region('migrate-jose/sign'),
    'src/content/docs/guides/migrate/jose.mdx': '<Sample platform="node" id="migrate-jose/sign" />\n',
  });
  const errors = checkCoverage(root).errors;
  assert.equal(errors.length, 1, errors.join('\n'));
  assert.match(errors[0], /migrate-jose\.test\.mjs:1: region "migrate-jose\/sign-before" \(Node\.js\) is not used on any page/);
});

test('<Sample> under start/ passes and marks only its own platform as used', () => {
  const root = tree({
    'samples/rust/tests/start.rs': region('start/rust-first-sign'),
    'samples/swift/Tests/SamplesTests/StartTests.swift': region('start/rust-first-sign'),
    'src/content/docs/start/rust.mdx': `import Sample from '../../components/samples/Sample.astro';\n\n<Sample platform="rust" id="start/rust-first-sign" />\n`,
  });
  const errors = checkCoverage(root).errors;
  assert.equal(errors.length, 1, errors.join('\n'));
  assert.match(errors[0], /StartTests\.swift:1: region "start\/rust-first-sign" \(Swift\) is not used/);
});

test('<Sample> fails on a missing region or an unknown platform', () => {
  const root = tree({
    'src/content/docs/start/rust.mdx': '<Sample platform="rust" id="start/missing" />\n<Sample platform="android" id="start/missing" />\n',
  });
  const errors = errorsOf(root);
  assert.match(errors, /start\/rust\.mdx:1: Sample "start\/missing": Rust \(samples\/rust\) has no region/);
  assert.match(errors, /start\/rust\.mdx:2: "android" is not a platform/);
});

test('fails on an unavailable key missing from unavailable.json', () => {
  const files = everywhere('guide/zip');
  delete files['samples/kotlin/src/test/kotlin/GuideTest.kt'];
  const root = tree({ ...files, 'src/content/docs/guides/guide.mdx': `<Samples id="guide/zip" unavailable={{ kotlin: "zip-everywhere" }} />\n` });
  assert.match(errorsOf(root), /guide\.mdx:1: Sample "guide\/zip":[\s\S]*Kotlin: "zip-everywhere" is not a key in src\/data\/unavailable\.json/);
});

test('fails on an unknown platform in unavailable', () => {
  const root = tree({ ...everywhere('guide/a'), 'src/content/docs/g.mdx': `<Samples id="guide/a" unavailable={{ android: "zip-bindings" }} />\n` });
  assert.match(errorsOf(root), /g\.mdx:1: Sample "guide\/a": "android" is not a platform/);
});

test('fails on a marker error in a sample file', () => {
  const root = tree({ 'samples/rust/tests/bad.rs': '// docs:start a/b\nx();\n' });
  assert.match(errorsOf(root), /samples\/rust\/tests\/bad\.rs:1: region "a\/b" is never closed/);
});

test('fails on the same id twice on one platform', () => {
  const root = tree({ 'samples/js/a.test.mjs': region('a/b'), 'samples/js/b.test.mjs': region('a/b') });
  assert.match(errorsOf(root), /samples\/js\/b\.test\.mjs:1: region "a\/b" is already defined for Node\.js in samples\/js\/a\.test\.mjs:1/);
});

test('fails on an invalid unavailable.json', () => {
  const root = tree({ 'src/data/unavailable.json': '{ "zip-bindings": "" }' });
  assert.match(errorsOf(root), /"zip-bindings" must have non-empty reason text/);
  const missing = tree({ 'src/data/unavailable.json': null });
  assert.match(errorsOf(missing), /src\/data\/unavailable\.json/);
});

test('fails on an id that is not a string literal', () => {
  const root = tree({ 'src/content/docs/g.mdx': '<Samples id={someId} />\n<Samples />\n' });
  const errors = errorsOf(root);
  assert.match(errors, /g\.mdx:1: <Samples> id must be a string literal/);
  assert.match(errors, /g\.mdx:2: <Samples> needs an id/);
});

test('ignores sample files in build output, dependencies and generated copies', () => {
  const root = tree({
    'samples/rust/target/debug/x.rs': region('a/b'),
    'samples/js/node_modules/pkg/x.mjs': region('a/b'),
    'samples/.generated/wasm/x.test.mjs': region('a/b'),
    'samples/kotlin/build/x.kt': region('a/b'),
    'samples/swift/.build/x.swift': region('a/b'),
    'samples/fixtures/x.rs': region('a/b'),
  });
  assert.deepEqual(checkCoverage(root), { errors: [], usages: 0, regions: 0 });
});

test('findUsages reads ids, platforms, titles and unavailable objects', () => {
  const mdx = [
    "import Samples from '../../components/samples/Samples.astro';",
    '',
    '<Samples id="a/b" title="Sign" />',
    "<Samples id='a/c' unavailable={{ kotlin: \"zip-bindings\", 'swift': 'rsa-private', }} />",
    '<Samples',
    '  id={"a/d"}',
    '  unavailable={{',
    '    node: "zip-bindings",',
    '  }}',
    '/>',
    '<Sample platform="rust" id="start/x" />',
    '<SamplesTable id="not/this" />',
  ].join('\n');
  const { usages, errors } = findUsages(mdx, 'p.mdx');
  assert.deepEqual(errors, []);
  assert.deepEqual(
    usages.map((u) => [u.component, u.line, u.id, u.platform, u.unavailable]),
    [
      ['Samples', 3, 'a/b', undefined, {}],
      ['Samples', 4, 'a/c', undefined, { kotlin: 'zip-bindings', swift: 'rsa-private' }],
      ['Samples', 5, 'a/d', undefined, { node: 'zip-bindings' }],
      ['Sample', 11, 'start/x', 'rust', {}],
    ],
  );
});

test('findUsages skips code fences, inline code and comments', () => {
  const mdx = [
    'Use `<Samples id="inline/code" />` in a page.',
    '',
    '```mdx',
    '<Samples id="fenced/code" />',
    '```',
    '',
    '{/* <Samples id="jsx/comment" /> */}',
    '<!-- <Samples id="html/comment" /> -->',
    '<Samples id="real/one" />',
  ].join('\n');
  const { usages } = findUsages(mdx, 'p.mdx');
  assert.deepEqual(
    usages.map((u) => [u.id, u.line]),
    [['real/one', 9]],
  );
});

test('findUsages rejects an unavailable value it cannot read', () => {
  const { errors } = findUsages('<Samples id="a/b" unavailable={{ kotlin: reason }} />\n<Samples id="a/c" unavailable={map} />', 'p.mdx');
  assert.equal(errors.length, 2);
  assert.match(errors[0], /p\.mdx:1: <Samples> unavailable must be an object literal/);
  assert.match(errors[1], /p\.mdx:2: <Samples> unavailable must be an object literal/);
});

test('the command exits 0 with a summary on the real tree', () => {
  const run = spawnSync(process.execPath, [CLI], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Sample coverage OK: [1-9]\d* usages, [1-9]\d* regions/);
});

test('the command exits 1 and lists the problems', () => {
  const root = tree({ 'src/content/docs/g.mdx': '<Samples id="guide/ghost" />\n' });
  const run = spawnSync(process.execPath, [CLI, '--root', root], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /g\.mdx:1: <Samples id="guide\/ghost"> is not defined on any platform/);
  assert.match(run.stderr, /Sample coverage failed: 1 problem/);
});
