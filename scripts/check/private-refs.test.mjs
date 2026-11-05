import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findPrivateRefs, scanSite } from './private-refs.mjs';

const SCRIPT = new URL('./private-refs.mjs', import.meta.url).pathname;

// One fixture per pattern. Each must be reported.
const TRIGGERS = [
  ['ADR 0040', 'ADR 0040'],
  ['see ADR-12 for why', 'ADR-12'],
  ['ADR7', 'ADR7'],
  ['PRD 0001', 'PRD 0001'],
  ['PRD-3', 'PRD-3'],
  ['feature 0011', 'feature 0011'],
  ['features/0011-docs', 'features/0011'],
  ['Feature 0007 adds', 'Feature 0007'],
  ['done in T03.', 'T03'],
  ['after Gate 2', 'Gate 2'],
  ['polyjose-brain', '-brain'],
  ['/Users/someone/src', '/Users/'],
  ['in .worktrees/x', '.worktrees'],
  ['the orchestrator merges', 'orchestrator'],
  ['The Orchestrator merges', 'Orchestrator'],
  ['a code-agent worker', 'code-agent'],
];

for (const [text, match] of TRIGGERS) {
  test(`reports ${JSON.stringify(text)}`, () => {
    const found = findPrivateRefs(text);
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.equal(found[0].match, match);
    assert.equal(found[0].line, 1);
    assert.ok(found[0].label.length > 0);
  });
}

// Public names that look similar. None may be reported.
const SAFE = [
  'RS256',
  'RSA1_5',
  'P-256',
  'RFC 7518',
  'Android shrinks with R8',
  'A128CBC-HS256',
  'ECDH-ES+A128KW',
  'RUSTSEC-2023-0071',
  'index.BT12xy.js',
  'page.T12abc.css',
  '2026-01-01T12:00:00Z',
  'ES256K and PS384',
  'requirement R12',
  'the brain of the operation',
  'Gate 4',
  'T1 or T123',
];

for (const text of SAFE) {
  test(`does not report ${JSON.stringify(text)}`, () => {
    assert.deepEqual(findPrivateRefs(text), []);
  });
}

test('reports every match with its line', () => {
  const found = findPrivateRefs('ok\nADR 1 and T01\n\nPRD 2');
  assert.deepEqual(
    found.map((f) => [f.line, f.match]),
    [
      [2, 'ADR 1'],
      [2, 'T01'],
      [4, 'PRD 2'],
    ],
  );
});

test('has no suppression syntax', () => {
  for (const text of [
    'ADR 0040 <!-- private-refs-ignore -->',
    '// eslint-disable-next-line\nADR 0040',
    'ADR 0040 {/* lint:refs ignore */}',
  ]) {
    assert.ok(findPrivateRefs(text).length >= 1, text);
  }
});

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'private-refs-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

const CLEAN_DIST = { 'dist/index.html': '<html><body><p>Hello</p></body></html>' };

test('scans content, data, samples and built text, and skips excluded directories', (t) => {
  const root = tree({
    ...CLEAN_DIST,
    'src/content/docs/a.mdx': '---\ntitle: A\n---\nfine\nsee ADR 0040\n',
    'src/data/x.json': '{"note": "T05"}',
    'samples/rust/tests/a.rs': '// PRD 0001\n',
    'samples/rust/target/debug/x.rs': 'ADR 1',
    'samples/js/node_modules/p/index.js': 'ADR 1',
    'samples/kotlin/build/x.kt': 'ADR 1',
    'samples/swift/.build/x.swift': 'ADR 1',
    'samples/.generated/wasm/a.test.mjs': 'ADR 1',
    'samples/.polyjose/README.md': 'ADR 1',
    'samples/fixtures/keys/blob.bin': Buffer.from([0, 1, 2, 65, 68, 82, 32, 49]),
    'src/components/X.astro': 'ADR 1',
    'scripts/check/fixture.txt': 'ADR 1',
    'dist/guides/x/index.html': '<html><head><link href="/_astro/a.T45.css"></head>\n<body><p>Gate 1</p></body></html>',
    'dist/_astro/page.js': 'ADR 1',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { findings, scanned } = scanSite(root);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.line}:${f.match}`),
    [
      'dist/guides/x/index.html:2:Gate 1',
      'samples/rust/tests/a.rs:1:PRD 0001',
      'src/content/docs/a.mdx:5:ADR 0040',
      'src/data/x.json:1:T05',
    ],
  );
  assert.equal(scanned, 5);
});

test('the CLI exits 1, names file:line and the match, and says "internal identifier"', (t) => {
  const root = tree({ ...CLEAN_DIST, 'src/content/docs/a.mdx': 'x\nsee T03\n' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /src\/content\/docs\/a\.mdx:2: internal identifier "T03"/);
  assert.doesNotMatch(run.stdout + run.stderr, /brain/i);
});

test('the CLI exits 0 on a clean tree', (t) => {
  const root = tree({ ...CLEAN_DIST, 'src/content/docs/a.mdx': 'RS256 and RFC 7518\n' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

test('the CLI fails when there is no built site to scan', (t) => {
  const root = tree({ 'src/content/docs/a.mdx': 'fine\n' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /npm run build/);
});
