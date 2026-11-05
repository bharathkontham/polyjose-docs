import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findPrivateRefs, scanSite } from './private-refs.mjs';
import { htmlUrlText, isAssetFile, isAssetUrl, listDistFiles } from './lib/dist-files.mjs';

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
  // Task, batch and fix numbers: two or three digits, any case, with one
  // separator from the wider set (adds `.`, `:` and `(`).
  ['F10', 'F10'],
  ['see f13.', 'f13'],
  ['T123', 'T123'],
  ['t 12', 't 12'],
  ['T-03', 'T-03'],
  ['T.03', 'T.03'],
  ['b:12', 'b:12'],
  ['f(10)', 'f(10'],
  ['F#12', 'F#12'],
  ['B\u221212', 'B\u221212'],
  ['the F05 fix', 'F05'],
  // A task, bug or fix word and its number.
  ['task 3', 'task 3'],
  ['Task #12', 'Task #12'],
  ['bug B03', 'bug B03'],
  ['fix F13', 'fix F13'],
  ['fix-2', 'fix-2'],
  ['bugs: 4', 'bugs: 4'],
  ['tasks (7)', 'tasks (7'],
  // Up to three separators, `no.`, `#`, `:`, `.` and `(` between a decision
  // record, requirements document or feature and its number.
  ['ADR - 0019', 'ADR - 0019'],
  ['ADR: 0019', 'ADR: 0019'],
  ['ADR  0019', 'ADR  0019'],
  ['ADR (0019)', 'ADR (0019'],
  ['ADR.0019', 'ADR.0019'],
  ['ADR no. 19', 'ADR no. 19'],
  ['ADR No.19', 'ADR No.19'],
  ['ADR number 7', 'ADR number 7'],
  ['ADR \u2116 19', 'ADR \u2116 19'],
  ['two ADRs: 12 and 13', 'ADRs: 12'],
  ['PRD: 3', 'PRD: 3'],
  ['PRD no. 2', 'PRD no. 2'],
  ['feature 12', 'feature 12'],
  ['feat 3', 'feat 3'],
  ['feat. 0011', 'feat. 0011'],
  ['features: 7', 'features: 7'],
  ['Feature #3', 'Feature #3'],
  ['feature no. 4', 'feature no. 4'],
  ['feature - 0003', 'feature - 0003'],
  ['Gate - 2', 'Gate - 2'],
  ['gate: 1', 'gate: 1'],
  // Folded before matching (NFKC and look-alike letters); the original text is quoted.
  ['\uFF21\uFF24\uFF32 0019', '\uFF21\uFF24\uFF32 0019'],
  ['\u0410DR 0019', '\u0410DR 0019'],
  ['ADR \u{1D7CE}\u{1D7CE}\u{1D7CF}\u{1D7D7}', 'ADR \u{1D7CE}\u{1D7CE}\u{1D7CF}\u{1D7D7}'],
  ['polyjose br\u0430in', 'br\u0430in'],
  ['\u042207', '\u042207'],
  ['\uFF54\uFF10\uFF17', '\uFF54\uFF10\uFF17'],
  ['GATE\u00A02', 'GATE\u00A02'],
  // More process terms.
  ['the git-ops agent', 'git-ops agent'],
  ['a gitops agent', 'gitops agent'],
  ['Git ops agents', 'Git ops agents'],
  ['the release agent', 'release agent'],
  ['a lead agent', 'lead agent'],
  ['run deliver-feature', 'deliver-feature'],
  ['/deliver_feature', 'deliver_feature'],
  ['the intake skill', 'intake skill'],
  ['in test-reports/', 'test-reports'],
  ['test_reports/x.md', 'test_reports'],
  ['ready-for-test', 'ready-for-test'],
  ['READY_FOR_TEST', 'READY_FOR_TEST'],
  ['the Phase A security review', 'Phase A security review'],
  ['phase B code review', 'phase B code review'],
  ['Phase A/B security reviews', 'Phase A/B security reviews'],
  ['phase-a code-review', 'phase-a code-review'],
  // More local paths.
  ['$HOME/bharathwork', '$HOME/'],
  ['${HOME}/src', '${HOME}/'],
  ['$home/x', '$home/'],
  ['$HOME/.cargo-old', '$HOME/'],
  ['/users/bharath', '/users/'],
  ['file:///users/x', '/users/'],
  ['"/USERS/me"', '/USERS/'],
  ['cd ~/bharathwork/joserust', '~/'],
  ['cd ~/src', '~/'],
  ['~/.cargo2/x', '~/'],
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
  'T1 or T1234',
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
  'feature-complete',
  'a featured 12-byte key',
  // Paths and the same text inside external URLs.
  'https://example.com/home/docs',
  'https://example.com/a-b/home/x',
  'https://example.com/~/x',
  'https://example.edu/~user/',
  'C:\\Windows',
  // The safe forms the criteria name.
  'x86_64',
  'ES256K',
  'RUSTSEC-2023-0071',
  'brainpoolP256r1',
  // Public tool directories under the home directory, and `cd ~/` itself.
  '~/.cargo/bin',
  '`~/.gradle/caches`',
  '~/.npm',
  '~/.config/gh/hosts.yml',
  'source "$HOME/.cargo/env"',
  '${HOME}/.gradle',
  'cd ~/',
  'cd ~/ && ls',
  '`cd ~/`',
  // A GitHub user page and other URL paths.
  'https://github.com/users/bharathkontham',
  'https://example.com/a/users/b',
  // Ordinary words near numbers.
  'BigInt64Array and Float32Array',
  'utf-16 and UTF-32',
  'int64',
  'base64url',
  'PBKDF2',
  'SHA-512 and AES-256',
  'draft-ietf-oauth-sd-jwt-12',
  '2026-11-06T12:00Z',
  'press F1',
  'the prefix 12',
  'debug 12',
  'the hotfix 3',
  'gate (10)',
  // Ordinary phrases that share words with process terms.
  'An independent security review is planned.',
  'Security reviewers',
  'a code review',
  'release notes',
  'releases 2 agents',
  'a lead to follow',
  'ready for testing',
  'the build is ready for test',
  'we deliver features to users',
  'the test reports',
  'phase A of the handshake',
  'the intake form',
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
    ['ADR\u00AD0019', 'ADR\u00AD0019'],
    ['A\u200BDR 1', 'A\u200BDR 1'],
    ['T\u200D07', 'T\u200D07'],
    ['polyjose bra\u2060in', 'bra\u2060in'],
    ['gate\uFEFF 2', 'gate\uFEFF 2'],
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
    [[3, 'ADR\u00AD 7']],
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

test('scans content, data, components, lib, samples, public, the config and the built site, and skips excluded directories', (t) => {
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
    'src/components/X.astro': '---\n---\n<a href="https://github.com/o/polyjose-brain">Source</a>\n',
    'src/components/overrides/Banner.astro': '<p>B03</p>',
    'src/components/node_modules/x.js': 'ADR 1',
    'src/lib/samples/x.mjs': "// see F13\nexport const x = 1;\n",
    'astro.config.mjs': "export default {\n  // see gate-2\n};\n",
    'public/robots.txt': 'User-agent: *\nDisallow: /home/runner\n',
    'public/logo.png': Buffer.from([0x89, 80, 78, 71, 0, 0, 65, 68, 82, 32, 49]),
    'src/pages/x.astro': 'ADR 1',
    'src/styles/x.css': 'ADR 1',
    'scripts/check/fixture.txt': 'ADR 1',
    'dist/guides/x/index.html': '<html><head><link href="/_astro/a.T45.css"></head>\n<body><p>Gate 1</p></body></html>',
    'dist/_astro/page.js': 'ADR 1',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { findings, scanned } = scanSite(root);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.line}:${f.match}`),
    [
      'astro.config.mjs:2:gate-2',
      'dist/_astro/page.js:1:ADR 1',
      'dist/guides/x/index.html:2:Gate 1',
      'public/robots.txt:2:/home/',
      'samples/rust/tests/a.rs:1:PRD 0001',
      'src/components/X.astro:3:brain',
      'src/components/overrides/Banner.astro:1:B03',
      'src/content/docs/a.mdx:5:ADR 0040',
      'src/data/x.json:1:T05',
      'src/lib/samples/x.mjs:1:F13',
    ],
  );
  assert.equal(scanned, 11);
});

test('finds identifiers in link and asset URLs of built pages, but not in /_astro/ assets', (t) => {
  const root = tree({
    'dist/index.html': [
      '<html><head>',
      '<link rel="stylesheet" href="/_astro/common.a-t12.css">',
      '<script type="module" src="/_astro/page.x-T12_ab.js"></script>',
      '<link rel="canonical" href="https://polyjose.dev/guides/feature-0003/">',
      '</head><body>',
      '<a href="https://github.com/o/polyjose-brain/blob/main/x.md">Source</a>',
      '<img alt="" src="/images/b03-diagram.svg" srcset="/_astro/i.t12.webp 1x, /img/t07@2x.webp 2x">',
      "<a href='/x/ADR%200019'>reasons</a>",
      '<a href="https://example.com/home/docs/">external</a> <a href="https://example.com/~/x">x</a>',
      '<a href="#adr&#45;0019">anchor</a> <a href="/_astro/../polyjose-brain/">up</a>',
      '</body></html>',
    ].join('\n'),
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { findings } = scanSite(root);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.line}:${f.match}`),
    [
      'dist/index.html:4:feature-0003',
      'dist/index.html:6:brain',
      'dist/index.html:7:b03',
      'dist/index.html:7:t07',
      'dist/index.html:8:ADR 0019',
      'dist/index.html:10:adr-0019',
      'dist/index.html:10:brain',
    ],
  );
  assert.ok(findings.every((f) => /in a link or asset URL/.test(f.label)), JSON.stringify(findings));
});

test('scans the sitemap and other non-HTML text files of the built site', (t) => {
  const root = tree({
    ...CLEAN_DIST,
    'dist/sitemap-index.xml': '<sitemapindex><sitemap><loc>https://polyjose.dev/sitemap-0.xml</loc></sitemap></sitemapindex>',
    'dist/sitemap-0.xml':
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>https://polyjose.dev/guides/t03-quality-gates/</loc></url>\n</urlset>',
    'dist/robots.txt': 'Sitemap: https://polyjose.dev/sitemap-index.xml\n# PRD 3\n',
    'dist/data/x.json': '{"source": "~/bharathwork/x"}',
    'dist/site.webmanifest': '{"name": "polyjose brain"}',
    'dist/feed.XML': '<feed><title>Gate 2</title></feed>',
    'dist/pagefind/pagefind-entry.json': '{"languages":{"en":{"hash":"en_b12a3f0","page_count":2}}}',
    'dist/pagefind/pagefind.en_1.pf_meta': 'ADR 1',
    'dist/_astro/page.js': 'ADR 1',
    'dist/_astro/style.css': 'ADR 1',
    'dist/logo.svg': '<svg><title>fine</title></svg>',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { findings, scanned } = scanSite(root);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.line}:${f.match}`),
    [
      'dist/_astro/page.js:1:ADR 1',
      'dist/_astro/style.css:1:ADR 1',
      'dist/data/x.json:1:~/',
      'dist/feed.XML:1:Gate 2',
      'dist/robots.txt:2:PRD 3',
      'dist/site.webmanifest:1:brain',
      'dist/sitemap-0.xml:3:t03',
    ],
  );
  assert.equal(scanned, 11);
});

test('isAssetUrl matches only built asset paths', () => {
  for (const url of ['/_astro/page.x-T12_ab.js', '_astro/a.css', '../_astro/a.css', './_astro/a.css']) {
    assert.equal(isAssetUrl(url), true, url);
  }
  for (const url of [
    '/guides/_astro/x',
    '/x/_astro/',
    'https://github.com/o/polyjose-brain/_astro/x',
    '//cdn.example/_astro/x',
    '/_astro',
    '/_astrox/a.js',
    '/_astro/../adr-0019/',
    '/_astro/./x/../../t07',
    '/_astro/%2e%2e/b03',
    '/_astro/a.js?from=t07',
    '/_astro/a.js#brain',
  ]) {
    assert.equal(isAssetUrl(url), false, url);
  }
});

test('htmlUrlText keeps link and asset URLs on their lines and drops everything else', () => {
  const html = '<p title="ADR 1">text T01</p>\n<a\n href="/a/b03">x</a><script src="/_astro/t07.js">var x = "/t08";</script>\n<img src="/i/t09.png">';
  const text = htmlUrlText(html);
  assert.equal(text.split('\n').length, html.split('\n').length);
  assert.deepEqual(
    findPrivateRefs(text).map((f) => [f.line, f.match]),
    [
      [3, 'b03'],
      [4, 't09'],
    ],
  );
});

test('listDistFiles separates built pages from the other text files', (t) => {
  const root = tree({
    'dist/a.html': '',
    'dist/b/index.HTML': '',
    'dist/sitemap-0.xml': '',
    'dist/r.txt': '',
    'dist/m.webmanifest': '',
    'dist/d.json': '',
    'dist/_astro/x.js': '',
    'dist/_astro/x.json': '',
    'dist/_astro/y.CSS': '',
    'dist/pagefind/p.mjs': '',
    'dist/icon.svg': '',
    'dist/_astro/x.js.map': '',
    'dist/i.png': '',
    'dist/pagefind/w.wasm': '',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(listDistFiles(root), {
    html: ['dist/a.html', 'dist/b/index.HTML'],
    text: ['dist/_astro/x.json', 'dist/d.json', 'dist/m.webmanifest', 'dist/r.txt', 'dist/sitemap-0.xml'],
    assets: ['dist/_astro/x.js', 'dist/_astro/x.js.map', 'dist/_astro/y.CSS', 'dist/icon.svg', 'dist/pagefind/p.mjs'],
  });
});

// Minified script, style and image content is full of short names next to
// numbers. In those files only the unmistakable patterns run.
const MINIFIED = [
  'let e=t(19,Wl=s[`${E.language}`]);t(12,pt=!0);c||t(24,c=g?12:30)',
  'e.$$.dirty[t/31|0]|=1<<t%31',
  '{t:12,b:16,f:10}',
  '.a{color:#f00;background:#b12;border-color:#F10}',
  '<path d="M10 20 t12 5 T30 40 b 12 f.10"/>',
  'var b64=1,f32=new Float32Array(2),t123=3',
  'gate(1);task(2);fix(3);bug:4',
];

test('assets: short names in minified code are not reported, the unmistakable patterns are', () => {
  for (const text of MINIFIED) {
    assert.deepEqual(findPrivateRefs(text, { asset: true }), [], text);
    assert.ok(findPrivateRefs(text).length > 0, `the text tier reports ${text}`);
  }
  for (const [text, match] of [
    ['var m="see ADR-0019"', 'ADR-0019'],
    ['x("PRD: 3")', 'PRD: 3'],
    ['{feature:"feature 0011"}', 'feature 0011'],
    ['import"/Users/bharath/x.js"', '/Users/'],
    ['"file:///home/runner/work/x"', '/home/'],
    ['"~/bharathwork"', '~/'],
    ['"$HOME/x"', '$HOME/'],
    ['"C:\\\\Users\\\\me"', 'C:\\\\Users'],
    ['/* .worktrees/x */', '.worktrees'],
    ['<title>polyjose-brain</title>', 'brain'],
    ['"the orchestrator"', 'orchestrator'],
    ['"a code-agent"', 'code-agent'],
    ['"git-ops agent"', 'git-ops agent'],
    ['"ready-for-test"', 'ready-for-test'],
    ['"test-reports/x"', 'test-reports'],
    ['"Phase A security review"', 'Phase A security review'],
    ['"overnight delegation"', 'overnight delegation'],
  ]) {
    const found = findPrivateRefs(text, { asset: true });
    assert.deepEqual(
      found.map((f) => f.match),
      [match],
      text,
    );
  }
});

test('reports an identifier inside a longer one once', () => {
  assert.deepEqual(
    findPrivateRefs('see task T03 and fix F13 (bug B04)').map((f) => f.match),
    ['task T03', 'fix F13', 'bug B04'],
  );
});

test('quotes the original text and its line after folding', () => {
  const found = findPrivateRefs('fine\n\uFF21DR\u00AD\u00A0\u{1D7CE}19 and \u042207\nok');
  assert.deepEqual(
    found.map((f) => [f.line, f.match]),
    [
      [2, '\uFF21DR\u00AD\u00A0\u{1D7CE}19'],
      [2, '\u042207'],
    ],
  );
});

test('isAssetFile names built script, style, image and source map files', () => {
  for (const f of ['dist/_astro/a.js', 'dist/x.MJS', 'dist/a.cjs', 'dist/a.css', 'dist/i.svg', 'dist/a.js.map', 'public/favicon.svg']) {
    assert.equal(isAssetFile(f), true, f);
  }
  for (const f of ['dist/a.html', 'dist/a.json', 'dist/a.txt', 'dist/a.png', 'src/lib/a.mjs', 'samples/js/a.js']) {
    assert.equal(isAssetFile(f), false, f);
  }
});

test('scans the content of built scripts, styles and images, hashed names included', (t) => {
  const root = tree({
    ...CLEAN_DIST,
    'dist/_astro/page.x-T12_ab.js': 'let e=t(19,Wl=s);t(12,pt=!0);\nconst why="ADR-0019";',
    'dist/_astro/common.b34.css': '.a{color:#f00}\n/* /Users/me/site */\n',
    'dist/_astro/ec.t07.js': 'function n(e){return t(10,e)}',
    'dist/pagefind/pagefind-ui.js': 'let a={t:12,f:10};t(23,F)',
    'dist/pagefind/pagefind-ui.css': '.p{fill:#b12}',
    'dist/icon.svg': '<svg><path d="M1 2 t12 5"/><desc>from polyjose-brain</desc></svg>',
    'dist/_astro/page.js.map': '{"sources":["file:///home/runner/work/x.ts"]}',
    'public/favicon.svg': '<svg><path d="M1 2 t12 5 f10"/></svg>',
    'public/logo.svg': '<svg><title>see feature 0011</title></svg>',
    'public/notes.txt': 'T03',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { findings, scanned } = scanSite(root);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.line}:${f.match}`),
    [
      'dist/_astro/common.b34.css:2:/Users/',
      'dist/_astro/page.js.map:1:/home/',
      'dist/_astro/page.x-T12_ab.js:2:ADR-0019',
      'dist/icon.svg:1:brain',
      'public/logo.svg:1:feature 0011',
      'public/notes.txt:1:T03',
    ],
  );
  assert.equal(scanned, 11);
});

test('backstop: the whole source of a built page is checked for the unmistakable patterns', (t) => {
  const root = tree({
    'dist/index.html': [
      '<!doctype html><html><head><title>Hi</title>',
      '<script>const s = "/home/runner/work";</script>',
      '<style>.x{color:#f00} /* ADR-0019 */</style>',
      '<script type="module" src="/_astro/page.x-T12_ab.js"></script>',
      '</head><body>',
      '<!-- see the release agent -->',
      '<div data-note="test-reports/" class="t12 b34">fine</div>',
      '<p>ADR-0007 in text</p>',
      '<svg><path d="M1 2 t12 5"/></svg>',
      '</body></html>',
    ].join('\n'),
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { findings } = scanSite(root);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.line}:${f.match}`),
    [
      'dist/index.html:2:/home/',
      'dist/index.html:3:ADR-0019',
      'dist/index.html:6:release agent',
      'dist/index.html:7:test-reports',
      'dist/index.html:8:ADR-0007',
    ],
  );
  // Text the page shows is reported once, from the page text.
  assert.equal(findings.filter((f) => f.match === 'ADR-0007').length, 1);
  assert.doesNotMatch(findings.find((f) => f.match === 'ADR-0007').label, /page source/);
  assert.match(findings.find((f) => f.match === 'ADR-0019').label, /in the page source/);
});

test('the CLI quotes the original text of a folded match', (t) => {
  const root = tree({ ...CLEAN_DIST, 'src/content/docs/a.mdx': 'x\nsee \uFF21DR-0019\n' });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.ok(run.stderr.includes('src/content/docs/a.mdx:2: internal identifier "\uFF21DR-0019"'), run.stderr);
  assert.doesNotMatch(run.stdout + run.stderr, /brain/i);
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
