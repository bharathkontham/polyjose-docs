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
  ['polyjose-brain', 'brain'],
  ['/Users/someone/src', '/Users/'],
  ['in .worktrees/x', '.worktrees'],
  ['the orchestrator merges', 'orchestrator'],
  ['The Orchestrator merges', 'Orchestrator'],
  ['a code-agent worker', 'code-agent'],
  // Any case, and any separator between the word and the number.
  ['adr-0019', 'adr-0019'],
  ['adr/0019-x.md', 'adr/0019'],
  ['see adr/12345', 'adr/1'],
  ['ADR_0019', 'ADR_0019'],
  ['ADR#19', 'ADR#19'],
  ['ADR\u20110019', 'ADR\u20110019'],
  ['ADR\u20100019', 'ADR\u20100019'],
  ['ADR\n0019', 'ADR\n0019'],
  ['prds/0003-jwe.md', 'prds/0003'],
  ['prd_7', 'prd_7'],
  ['feature-0003', 'feature-0003'],
  ['feature_0003', 'feature_0003'],
  ['FEATURES#0011', 'FEATURES#0011'],
  ['after gate-2', 'gate-2'],
  ['GATE_3', 'GATE_3'],
  ['gate1', 'gate1'],
  // Batch and task numbers, also inside branch and file names.
  ['B03', 'B03'],
  ['the b12 batch', 'b12'],
  ['b03-foundations-no-sha1', 'b03'],
  ['t07', 't07'],
  ['feature/docs-site-t03-quality-gates', 't03'],
  ['docs_site_t03_quality', 't03'],
  // The internal repository, by name.
  ['polyjose brain', 'brain'],
  ['The Brain says', 'Brain'],
  ['polyjose_brain', 'brain'],
  // Local paths.
  ['~/bharathwork/joserust', '~/'],
  ['cd `~/src`', '~/'],
  ['/home/runner/work', '/home/'],
  ['file:///home/runner', '/home/'],
  ['"/home/x"', '/home/'],
  ['C:\\Users\\me', 'C:\\Users'],
  ['"d:\\\\users\\\\me"', 'd:\\\\users'],
  ['in .Worktrees/x', '.Worktrees'],
  // Process terms.
  ['an owner directive', 'owner directive'],
  ['Owner-Directives', 'Owner-Directives'],
  ['overnight delegation', 'overnight delegation'],
  ['the planner agent', 'planner agent'],
  ['two tester agents', 'tester agents'],
  ['the orchestrators', 'orchestrators'],
  ['a code agent', 'code agent'],
  ['code_agent', 'code_agent'],
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
  'Gate 4',
  'T1 or T123',
  // The RFC 7797 header parameter, in any case and spelling.
  'b64',
  'B64',
  '`b64: false` needs `crit`',
  '{"b64":false,"crit":["b64"]}',
  'B64_PAYLOAD',
  // RFC numbers and sections.
  'RFC 7797',
  'RFC 7515 §4.1.11',
  'rfc7518',
  'RFC 7520 §4.1',
  // Hyphenated prose with a word starting with "t" after the hyphen.
  'well-tested',
  'non-trivial',
  'a self-test',
  'built-in tools',
  // Algorithm names, curves, advisories, shrinkers and hashed asset names. (A
  // hash can also contain `-T12_`; asset URLs are excluded by path instead, see
  // the dist tests below.)
  'A256CBC-HS512',
  'ECDH-ES+A256KW',
  'P-384 and P-521',
  'RUSTSEC-2024-0344',
  'R8 and ProGuard',
  'Code.astro_astro_type_script_index_0_lang.C3fM4Kra.js',
  'common.BoOHtkVB.css',
  'pagefind.en_e7e6941272.pf_meta',
  'en_b12a3f0.pf_fragment',
  // Words that contain an identifier-like word.
  'brainpoolP256r1',
  'brains and brainstorm',
  'a gate',
  'the gateway',
  'gate 10',
  'delegate 2 keys',
  'navigate 3 pages',
  'the owner of the key',
  'a compiler directive',
  'quadrant 7',
  'feature 12',
  // Paths and the same text inside external URLs.
  'https://example.com/home/docs',
  'https://example.com/a-b/home/x',
  'https://example.com/~/x',
  'https://example.edu/~user/',
  'C:\\Windows',
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

test('ignores invisible characters inside an identifier', () => {
  for (const [text, match] of [
    ['ADR\u00AD0019', 'ADR0019'],
    ['A\u200BDR 1', 'ADR 1'],
    ['T\u200D07', 'T07'],
    ['polyjose bra\u2060in', 'brain'],
    ['gate\uFEFF 2', 'gate 2'],
  ]) {
    const found = findPrivateRefs(text);
    assert.equal(found.length, 1, `${JSON.stringify(text)}: ${JSON.stringify(found)}`);
    assert.equal(found[0].match, match);
  }
});

test('keeps line numbers when invisible characters are removed', () => {
  const found = findPrivateRefs('a\u00AD\u200Bb\nok\n\u00ADADR\u00AD 7');
  assert.deepEqual(
    found.map((f) => [f.line, f.match]),
    [[3, 'ADR 7']],
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
