import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkPage, routeOf, AUDITED_PAGES, CONSTANT_TIME_PREFIX } from './honesty.mjs';

const SCRIPT = new URL('./honesty.mjs', import.meta.url).pathname;
const NOTICE = '<div class="prerelease-notice" role="note" data-prerelease-notice><p>Pre-1.0</p></div>';
const page = (body, notice = NOTICE) => `<!DOCTYPE html><html><head><title>t</title></head><body>${notice}<main>${body}</main></body></html>`;
const rules = (route, html) => checkPage(route, html).map((f) => f.rule);

test('routeOf maps built files to their URL path', () => {
  assert.equal(routeOf('index.html'), '/');
  assert.equal(routeOf('security/model/index.html'), '/security/model/');
  assert.equal(routeOf('404.html'), '/404.html');
});

test('the allow-lists are exact', () => {
  assert.deepEqual([...AUDITED_PAGES].sort(), ['/about/why-polyjose/', '/security/cryptographic-foundations/']);
  assert.equal(CONSTANT_TIME_PREFIX, '/security/');
});

// (a) the pre-1.0 notice
test('(a) fails on a page without the pre-1.0 notice', () => {
  assert.deepEqual(rules('/guides/x/', page('<p>Hello</p>', '')), ['prerelease-notice']);
});

test('(a) does not count the marker written as text, in a class or in a script', () => {
  const fake = '<p>data-prerelease-notice</p><div class="data-prerelease-notice"></div><script>"<div data-prerelease-notice>"</script>';
  assert.deepEqual(rules('/guides/x/', page(fake, '')), ['prerelease-notice']);
});

test('(a) allowed: a page carrying the notice passes', () => {
  assert.deepEqual(rules('/guides/x/', page('<p>Hello</p>')), []);
});

// (b) claiming that polyjose is audited, on any page, the allowed pages included
for (const claim of [
  'polyjose is audited.',
  'Polyjose has been independently audited.',
  'POLYJOSE was professionally audited by a firm.',
  'The polyjose bindings are audited.',
  'polyjose and its primitives <em>are</em> audited.',
]) {
  for (const route of ['/', '/about/why-polyjose/', '/security/cryptographic-foundations/']) {
    test(`(b) fails on ${JSON.stringify(claim)} at ${route}`, () => {
      assert.ok(rules(route, page(`<p>${claim}</p>`)).includes('audit-claim'));
    });
  }
}

test('(b) allowed: the audit status of the primitives, on an allowed page', () => {
  const html = page(
    '<p>polyjose is built to be audited. No independent audit of polyjose itself has been published yet.</p>' +
      '<p>The aes-gcm crate was audited by NCC Group in 2020.</p>',
  );
  assert.deepEqual(rules('/security/cryptographic-foundations/', html), []);
  assert.deepEqual(rules('/about/why-polyjose/', html), []);
});

test('(b) a sentence break stops the match', () => {
  const html = page('<p>This page is about polyjose. RustCrypto crates are audited.</p>');
  assert.deepEqual(rules('/security/cryptographic-foundations/', html), []);
});

// (c) the word "audited" outside the two allowed pages
for (const route of ['/', '/about/', '/security/model/', '/security/cryptographic-foundations/extra/', '/about/why-polyjose/x/', '/guides/sign-and-verify/', '/404.html']) {
  test(`(c) fails on "audited" at ${route}`, () => {
    assert.deepEqual(rules(route, page('<p>The primitives are Audited by others.</p>')), ['audited-word']);
  });
}

test('(c) counts readable attributes such as the page description', () => {
  const html = page('<p>x</p>').replace('<title>', '<meta name="description" content="Audited code"><title>');
  assert.deepEqual(rules('/guides/x/', html), ['audited-word']);
});

test('(c) allowed: "audited" on the two allowed pages, and "audit" or "unaudited" elsewhere', () => {
  const html = page('<p>The aes-gcm crate was audited in 2020.</p>');
  assert.deepEqual(rules('/security/cryptographic-foundations/', html), []);
  assert.deepEqual(rules('/about/why-polyjose/', html), []);
  assert.deepEqual(rules('/guides/x/', page('<p>An audit is planned. The code is unaudited.</p>')), []);
});

// (d) "constant-time" outside /security/**
for (const phrase of ['constant-time', 'Constant time', 'constant&nbsp;time', 'constant‑time', 'constant-<em>time</em>', 'constant\ntime']) {
  test(`(d) fails on ${JSON.stringify(phrase)} outside the security pages`, () => {
    assert.deepEqual(rules('/concepts/algorithms/', page(`<p>Uses ${phrase} comparison.</p>`)), ['constant-time']);
  });
}

test('(d) fails on /security without the trailing path and on look-alike prefixes', () => {
  for (const route of ['/securityx/', '/about/security/', '/']) {
    assert.deepEqual(rules(route, page('<p>constant-time</p>')), ['constant-time'], route);
  }
});

test('(d) allowed: anywhere under /security/', () => {
  for (const route of ['/security/model/', '/security/cryptographic-foundations/', '/security/a/b/']) {
    assert.deepEqual(rules(route, page('<p>The subtle crate documents constant-time equality.</p>')), [], route);
  }
});

test('ignores the words inside scripts, styles and asset names', () => {
  const html = page('<p>ok</p><script>const s = "polyjose is audited, constant-time";</script><style>.audited{}</style><img src="/_astro/audited.png" alt="">');
  assert.deepEqual(rules('/guides/x/', html), []);
});

test('findings carry the line and the matched text', () => {
  const [f] = checkPage('/guides/x/', `${NOTICE}\n<p>\nsee constant-time\n</p>`);
  assert.equal(f.line, 3);
  assert.equal(f.match, 'constant-time');
});

function dist(files) {
  const root = mkdtempSync(join(tmpdir(), 'honesty-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, 'dist', rel)), { recursive: true });
    writeFileSync(join(root, 'dist', rel), body);
  }
  return root;
}

test('the CLI exits 1 and names each failing page and rule', (t) => {
  const root = dist({
    'index.html': page('<p>fine</p>'),
    'guides/x/index.html': page('<p>constant-time</p>'),
    'start/rust/index.html': page('<p>hi</p>', ''),
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [SCRIPT, '--dist', join(root, 'dist')], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /dist\/guides\/x\/index\.html:1 \(\/guides\/x\/\): "constant-time"/);
  assert.match(run.stderr, /dist\/start\/rust\/index\.html \(\/start\/rust\/\): no pre-1\.0 notice/);
  assert.doesNotMatch(run.stderr, /dist\/index\.html/);
  assert.doesNotMatch(run.stdout + run.stderr, /brain/i);
});

test('the CLI exits 0 on clean pages', (t) => {
  const root = dist({ 'index.html': page('<p>fine</p>'), '404.html': page('<p>missing</p>') });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [SCRIPT, '--dist', join(root, 'dist')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /2 pages/);
});

test('the CLI fails when there are no built pages', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'honesty-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [SCRIPT, '--dist', join(root, 'dist')], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /npm run build/);
});
