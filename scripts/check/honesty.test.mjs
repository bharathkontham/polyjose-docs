import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkPage, routeOf, sentences, AUDITED_PAGES, REGISTER_ATTRIBUTE, CONSTANT_TIME_PREFIX } from './honesty.mjs';

const SCRIPT = new URL('./honesty.mjs', import.meta.url).pathname;
const NOTICE =
  '<div class="prerelease-notice" role="note" data-prerelease-notice><p><strong>Pre-1.0:</strong> polyjose is not published yet.</p></div>';
const FOUNDATIONS = '/security/cryptographic-foundations/';
/** Wraps a fragment in an audit-register element (the table rows and the legend). */
const register = (body, tag = 'ul') => `<${tag} data-audit-register>${body}</${tag}>`;
const page = (body, notice = NOTICE) => `<!DOCTYPE html><html><head><title>t</title></head><body>${notice}<main>${body}</main></body></html>`;
const rules = (route, html) => checkPage(route, html).map((f) => f.rule);

test('routeOf maps built files to their URL path', () => {
  assert.equal(routeOf('index.html'), '/');
  assert.equal(routeOf('security/model/index.html'), '/security/model/');
  assert.equal(routeOf('404.html'), '/404.html');
});

test('the allow-lists are exact', () => {
  assert.deepEqual([...AUDITED_PAGES], [FOUNDATIONS]);
  assert.equal(REGISTER_ATTRIBUTE, 'data-audit-register');
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

test('(a) fails when the marked element does not say "Pre-1.0" and "not published"', () => {
  for (const notice of [
    '<div data-prerelease-notice></div>',
    '<div data-prerelease-notice><p>Beta</p></div>',
    '<div data-prerelease-notice><p>Pre-1.0</p></div>',
    '<div data-prerelease-notice><p>polyjose is not published yet.</p></div>',
    '<div data-prerelease-notice aria-label="Pre-1.0: not published"></div>',
  ]) {
    assert.deepEqual(rules('/guides/x/', page('<p>Hello</p>', notice)), ['prerelease-notice'], notice);
  }
});

test('(a) a notice in a template, or hidden, or aria-hidden, does not count', () => {
  for (const notice of [
    `<template>${NOTICE}</template>`,
    NOTICE.replace('data-prerelease-notice', 'data-prerelease-notice hidden'),
    NOTICE.replace('data-prerelease-notice', 'data-prerelease-notice aria-hidden="true"'),
    `<div aria-hidden="true">${NOTICE}</div>`,
    `<div hidden>${NOTICE}</div>`,
    '<div data-prerelease-notice><p>Pre-1.0: polyjose is <span hidden>not published</span> ready.</p></div>',
  ]) {
    assert.deepEqual(rules('/guides/x/', page('<p>Hello</p>', notice)), ['prerelease-notice'], notice);
  }
});

test('(a) allowed: a page carrying the notice passes', () => {
  assert.deepEqual(rules('/guides/x/', page('<p>Hello</p>')), []);
  const spread = '<div data-prerelease-notice><p><strong>PRE-1.0:</strong> polyjose is <em>not</em>\n published yet</p></div>';
  assert.deepEqual(rules('/guides/x/', page('<p>Hello</p>', spread)), []);
});

// (b) claiming that polyjose is audited, on any page, the allowed pages included
// Each claim is checked in running text and inside the audit register on the
// one page that has it, so the register gives no cover to a claim.
const CLAIMS = [
  'polyjose is audited.',
  'Polyjose has been independently audited.',
  'POLYJOSE was professionally audited by a firm.',
  'The polyjose bindings are audited.',
  'polyjose and its primitives <em>are</em> audited.',
  // The bypasses found in review.
  'polyjose 0.1.0 is audited.',
  'polyjose, version 0.1.0 of the library that this page has been describing at some length, is audited.',
  'polyjose is fully audited.',
  'polyjose is third-party audited.',
  'polyjose is third\u2011party audited.',
  'polyjose is third&#8209;party audited.',
  'polyjose is fully&nbsp;audited.',
  'The library is audited.',
  'This library has been independently audited by a firm.',
  'polyjose has passed an independent security audit.',
  'polyjose 0.1.0 has completed its audit.',
  'polyjose has undergone a full audit.',
  'polyjose received a clean audit report.',
  'An independent audit of polyjose 0.1.0 was completed in 2026.',
  'polyjose is audit\u00ADed.',
  'polyjose is audit&shy;ed.',
  'polyjose is au\u200Bdited.',
  'The JOSE layer is fully audited.',
  'Its primitives are third-party audited.',
];

for (const claim of CLAIMS) {
  for (const [where, route, body] of [
    ['on /', '/', `<p>${claim}</p>`],
    ['in the text of the foundations page', FOUNDATIONS, `<p>${claim}</p>`],
    ['inside the register', FOUNDATIONS, register(`<li>${claim}</li>`)],
  ]) {
    test(`(b) fails on ${JSON.stringify(claim)} ${where}`, () => {
      assert.ok(rules(route, page(body)).includes('audit-claim'), JSON.stringify(checkPage(route, page(body))));
    });
  }
}

test('(b) allowed: statements that polyjose is not audited, and the pre-1.0 framing', () => {
  for (const ok of [
    'This page describes polyjose 0.1.0 as designed. The library is in development and not published yet.',
    'This list describes polyjose 0.1.0 as designed. The library is in development and not published yet.',
    'No independent audit of polyjose has been published yet.',
    'polyjose itself has not yet had an independent audit. One is planned before 1.0.',
    'polyjose is pre-1.0. Until that audit is published, treat polyjose as code without an independent review of its own.',
    'polyjose passes the RFC, NIST and Wycheproof test vectors against that exact version.',
    'Built for independent review. The design aims to make an audit of polyjose practical.',
  ]) {
    assert.deepEqual(rules('/guides/x/', page(`<p>${ok}</p>`)), [], ok);
    assert.deepEqual(rules(FOUNDATIONS, page(`<p>${ok}</p>`)), [], ok);
  }
});

test('(b) allowed: the register wording and audit facts about the primitives, inside the register', () => {
  const legend = register(
    '<li><strong>Audited</strong>: a public independent report covers the library.</li>' +
      '<li><strong>Audited, earlier release</strong>: a public independent review exists, but it covered an earlier release line than the one polyjose uses.</li>' +
      '<li><strong>No public independent audit found</strong>: no public independent audit of the library itself was found.</li>',
  );
  const rows = register(
    '<tr><th>k256</th><td>The secp256k1 curve for ES256K signatures.</td><td><strong>Audited.</strong> NCC Group report (2023)</td></tr>',
    'table',
  );
  const crate = register('<li>The aes-gcm crate was audited by NCC Group in 2020.</li>');
  assert.deepEqual(rules(FOUNDATIONS, page(legend + rows + crate)), []);
});

test('(b) a sentence break stops the match', () => {
  const html = page(`<p>This page is about polyjose.</p>${register('<li>RustCrypto crates are audited.</li>')}`);
  assert.deepEqual(rules(FOUNDATIONS, html), []);
  assert.deepEqual(rules(FOUNDATIONS, page(`<p>This page is about polyjose. ${register('<span>RustCrypto crates are audited.</span>', 'span')}</p>`)), []);
});

test('sentences splits on sentence ends and block boundaries, not on version dots', () => {
  assert.deepEqual(sentences('polyjose 0.1.0 is audited. The library is new!\u2029Next one? Yes'), [
    'polyjose 0.1.0 is audited.',
    'The library is new!',
    'Next one?',
    'Yes',
  ]);
});

// (c) the word "audited" outside the two allowed pages
for (const route of ['/', '/about/', '/about/why-polyjose/', '/security/model/', '/security/cryptographic-foundations/extra/', '/about/why-polyjose/x/', '/guides/sign-and-verify/', '/404.html']) {
  test(`(c) fails on "audited" at ${route}`, () => {
    assert.deepEqual(rules(route, page('<p>The primitives are Audited by others.</p>')), ['audited-word']);
  });
  test(`(c) the register marker gives no cover at ${route}`, () => {
    assert.deepEqual(rules(route, page(register('<li>The aes-gcm crate was audited.</li>'))), ['audited-word']);
  });
}

test('(c) fails on "audited" in the foundations page outside the register', () => {
  for (const body of [
    '<p>The aes-gcm crate was audited in 2020.</p>',
    '<p>An audited JOSE library.</p>',
    '<h2>Audited crates</h2>',
    `<p>Before.</p>${register('<li>Audited: a report covers it.</li>')}<p>After: audited.</p>`,
    `<div data-audit-register-x><p>The aes-gcm crate was audited.</p></div>`,
    `<p class="data-audit-register">The aes-gcm crate was audited.</p>`,
    `<p>data-audit-register The aes-gcm crate was audited.</p>`,
  ]) {
    assert.ok(rules(FOUNDATIONS, page(body)).includes('audited-word'), body);
  }
  const head = page(register('<li>Audited.</li>')).replace('<title>', '<meta name="description" content="Audited crates"><title>');
  assert.deepEqual(rules(FOUNDATIONS, head), ['audited-word']);
});

for (const [name, word] of [
  ['a soft hyphen', 'audit\u00ADed'],
  ['&shy;', 'audit&shy;ed'],
  ['&#173;', 'au&#173;dited'],
  ['a zero-width space', 'aud\u200Bited'],
  ['a zero-width non-joiner', 'aud\u200Cited'],
  ['a zero-width joiner', 'aud\u200Dited'],
  ['a word joiner', 'aud\u2060ited'],
]) {
  test(`(c) fails on "audited" split by ${name}`, () => {
    assert.deepEqual(rules('/guides/x/', page(`<p>An ${word} JOSE library.</p>`)), ['audited-word']);
    assert.deepEqual(rules(FOUNDATIONS, page(`<p>An ${word} JOSE library.</p>`)), ['audited-word']);
  });
}

test('(c) the line of a finding after a register is still right', () => {
  const html = `${NOTICE}\n${register('<li>\nAudited\n</li>')}\n<p>\naudited\n</p>`;
  const [f] = checkPage(FOUNDATIONS, html);
  assert.equal(f.rule, 'audited-word');
  assert.equal(f.line, 6);
});

test('(c) counts readable attributes such as the page description', () => {
  const html = page('<p>x</p>').replace('<title>', '<meta name="description" content="Audited code"><title>');
  assert.deepEqual(rules('/guides/x/', html), ['audited-word']);
});

test('(c) allowed: "audited" inside the register on the foundations page, and "audit" or "unaudited" elsewhere', () => {
  const html = page(`<p>Audit status, as published.</p>${register('<li>The aes-gcm crate was audited in 2020.</li>')}`);
  assert.deepEqual(rules(FOUNDATIONS, html), []);
  const rows = register('<tr data-crate="k256"><td><strong>Audited.</strong> <a href="/r">report</a><p>Reviewed by NCC Group.</p></td></tr>', 'tr');
  assert.deepEqual(rules(FOUNDATIONS, page(`<table><tbody>${rows}</tbody></table>`)), []);
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
