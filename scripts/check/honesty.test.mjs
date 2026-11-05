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
/** The Banner override's container, the first element in <main>. */
const banner = (inner) => `<div class="site-banner" data-site-banner>${inner}</div>`;
const FOUNDATIONS = '/security/cryptographic-foundations/';
/** Wraps a fragment in an audit-register element (the table rows and the legend). */
const register = (body, tag = 'ul') => `<${tag} data-audit-register>${body}</${tag}>`;
const page = (body, notice = NOTICE) =>
  `<!DOCTYPE html><html><head><title>t</title></head><body><header class="header"><a href="/">polyjose</a></header>` +
  `<main>${banner(notice)}${body}</main></body></html>`;
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
    '<div class="prerelease-notice" data-prerelease-notice></div>',
    '<div class="prerelease-notice" data-prerelease-notice><p>Beta</p></div>',
    '<div class="prerelease-notice" data-prerelease-notice><p>Pre-1.0</p></div>',
    '<div class="prerelease-notice" data-prerelease-notice><p>polyjose is not published yet.</p></div>',
    '<div class="prerelease-notice" data-prerelease-notice aria-label="Pre-1.0: not published"></div>',
    '<div class="prerelease-notice" data-prerelease-notice title="Pre-1.0: not published"><img alt="Pre-1.0: not published"></div>',
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
    '<div class="prerelease-notice" data-prerelease-notice><p>Pre-1.0: polyjose is <span hidden>not published</span> ready.</p></div>',
    '<div class="prerelease-notice" data-prerelease-notice><p>Pre-1.0: polyjose is <span class="sr-only">not published</span> ready.</p></div>',
  ]) {
    assert.deepEqual(rules('/guides/x/', page('<p>Hello</p>', notice)), ['prerelease-notice'], notice);
  }
});

test('(a) allowed: a page carrying the notice passes', () => {
  assert.deepEqual(rules('/guides/x/', page('<p>Hello</p>')), []);
  const spread = '<div class="prerelease-notice" data-prerelease-notice><p><strong>PRE-1.0:</strong> polyjose is <em>not</em>\n published yet</p></div>';
  assert.deepEqual(rules('/guides/x/', page('<p>Hello</p>', spread)), []);
});

test('(a) allowed: the banner as built, with Starlight\'s own page banner before the notice', () => {
  const built =
    '<div class="prerelease-notice astro-cytafyf4" role="note" data-prerelease-notice data-pagefind-ignore>' +
    '<p class="astro-cytafyf4"><strong class="astro-cytafyf4">Pre-1.0:</strong> polyjose is not published yet, and its APIs may change before 1.0. ' +
    'Read the <a href="/security/reporting/" class="astro-cytafyf4">security policy</a> before you rely on it.</p></div>';
  assert.deepEqual(rules('/guides/x/', page('<p>Hello</p>', built)), []);
  assert.deepEqual(rules('/guides/x/', page('<p>Hello</p>', `<div class="sl-banner" data-pagefind-ignore>Page banner</div>${built}`)), []);
  const spaced = page('<p>Hello</p>').replace('<main>', '<main data-pagefind-body lang="en">\n  ').replace(banner(NOTICE), `${banner(`\n${NOTICE}\n`)}\n`);
  assert.deepEqual(rules('/guides/x/', spaced), []);
});

// The notice counts only in its fixed place: the Banner override's container
// (data-site-banner) is the first element in <main>, and the first element
// with class prerelease-notice in it is a direct child that carries
// data-prerelease-notice.
const shell = (header, main) =>
  `<!DOCTYPE html><html><head><title>t</title></head><body><header>${header}</header>${main}</body></html>`;

test('(a) a notice anywhere but its fixed place does not count', () => {
  for (const [why, html] of [
    ['in the header', shell(NOTICE, `<main>${banner('')}<p>Hello</p></main>`)],
    ['in the body, before <main>', shell('', `${NOTICE}<main>${banner('')}<p>Hello</p></main>`)],
    ['in the body, after <main>', shell('', `<main>${banner('')}<p>Hello</p></main>${NOTICE}`)],
    ['in the content', page(`<p>Hello</p>${NOTICE}`, '')],
    ['in a second banner container in the content', page(`<p>Hello</p>${banner(NOTICE)}`, '')],
    ['first in <main>, without the banner container', shell('', `<main>${NOTICE}<p>Hello</p></main>`)],
    ['the banner container is not the first element in <main>', shell('', `<main><p>Hello</p>${banner(NOTICE)}</main>`)],
    ['the banner container is nested in <main>', shell('', `<main><div>${banner(NOTICE)}</div></main>`)],
    ['the banner container is outside <main>', shell(banner(NOTICE), '<main><p>Hello</p></main>')],
    ['no <main>', shell('', `<div>${banner(NOTICE)}</div>`)],
    ['not a direct child of the banner container', page('<p>Hello</p>', `<div>${NOTICE}</div>`)],
    ['the marker without the class', page('<p>Hello</p>', NOTICE.replace('class="prerelease-notice" ', ''))],
    ['the class without the marker', page('<p>Hello</p>', NOTICE.replace(' data-prerelease-notice', ''))],
    ['a decoy with the class comes first', page('<p>Hello</p>', `<p class="prerelease-notice">Beta</p>${NOTICE}`)],
    ['a hidden copy comes first', page('<p>Hello</p>', NOTICE.replace('data-prerelease-notice', 'data-prerelease-notice hidden') + NOTICE)],
  ]) {
    assert.deepEqual(rules('/guides/x/', html), ['prerelease-notice'], why);
  }
});

// Each way of hiding the notice, on the notice itself and on each element around it.
const HIDING = [
  'hidden',
  'hidden="until-found"',
  'aria-hidden="true"',
  'style="display:none"',
  'style="visibility: hidden"',
  'style="opacity:0"',
  'style="opacity: 0.0"',
  'style="width:0"',
  'style="height:0px"',
  'style="max-height:0;overflow:hidden"',
  'class="sr-only"',
  'class="visually-hidden"',
  'class="sl-sr-only"',
];

for (const how of HIDING) {
  const cls = /^class="(.*)"$/.exec(how)?.[1];
  const add = (tag) => (cls ? tag.replace(/class="/, `class="${cls} `) : tag.replace(/^<(\w+)/, `<$1 ${how}`));
  test(`(a) a notice hidden by ${how} does not count`, () => {
    const onNotice = page('<p>Hello</p>', NOTICE.replace(/^<div class="prerelease-notice"/, add('<div class="prerelease-notice"')));
    const onBanner = page('<p>Hello</p>').replace('<div class="site-banner" data-site-banner>', add('<div class="site-banner" data-site-banner>'));
    const onMain = page('<p>Hello</p>').replace('<main>', add('<main class="m">'));
    const onBody = page('<p>Hello</p>').replace('<body>', add('<body class="b">'));
    for (const [where, html] of [['notice', onNotice], ['banner', onBanner], ['main', onMain], ['body', onBody]]) {
      assert.notEqual(html, page('<p>Hello</p>'), `${where}: the probe changed the page`);
      assert.deepEqual(rules('/guides/x/', html), ['prerelease-notice'], `${where}: ${html}`);
    }
  });
}

test('(a) a notice inside <details>, <noscript> or <template> does not count', () => {
  for (const wrap of ['details', 'details open', 'noscript', 'template']) {
    const name = wrap.split(' ')[0];
    const html = page('<p>Hello</p>').replace('<main>', `<${wrap}><main>`).replace('</main>', `</main></${name}>`);
    assert.deepEqual(rules('/guides/x/', html), ['prerelease-notice'], wrap);
  }
});

test('(a) the finding says why the notice does not count', () => {
  const why = (html) => checkPage('/guides/x/', html).find((f) => f.rule === 'prerelease-notice').message;
  assert.match(why(shell('', '<div></div>')), /no <main> element/);
  assert.match(why(shell('', `<main><p>x</p>${banner(NOTICE)}</main>`)), /first element in <main> is not the site banner/);
  assert.match(why(page('<p>x</p>', '')), /no element with class prerelease-notice/);
  assert.match(why(page('<p>x</p>', `<div>${NOTICE}</div>`)), /not a direct child of the site banner/);
  assert.match(why(page('<p>x</p>', NOTICE.replace(' data-prerelease-notice', ''))), /no data-prerelease-notice attribute/);
  assert.match(why(page('<p>x</p>', NOTICE.replace('role="note"', 'hidden'))), /hidden/);
  assert.match(why(page('<p>x</p>', NOTICE.replace('not published', 'published'))), /"Pre-1\.0" and "not published"/);
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
  // The bypasses found in the re-review: spelling and look-alike letters.
  'polyjose is audit-ed.',
  'polyjose is audit\u2013ed.',
  'polyjose is audit ed.',
  'polyjose is aud\u0456ted.',
  'polyjose is audit\u0435d.',
  'polyjose is \u0251udited.',
  'polyjose is \uFF41\uFF55\uFF44\uFF49\uFF54\uFF45\uFF44.',
  'P\u043Elyjose is audited.',
  '\uFF50\uFF4F\uFF4C\uFF59\uFF4A\uFF4F\uFF53\uFF45 has passed an audit.',
  // ... and claims that an audit had a result.
  'An audit of polyjose found no issues.',
  'An audit of polyjose came back clean.',
  'The 2026 audit of polyjose passed.',
  'Security audit: passed.',
  'Audit complete.',
  'The audit report: completed.',
  'polyjose security audit report (2025): no findings.',
  'polyjose\u2019s independent audit found nothing.',
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
    // The audit wording on the site today, outside the register's bare word.
    'Security code earns trust only in public: open review, public test vectors, a public issue tracker and, in time, a published independent audit.',
    'Its audit status is disclosed, on this page.',
    'Where more than one library qualifies, polyjose prefers the one with the strongest independent audit record, then the widest deployment, then active maintenance.',
    'An independent audit counts in a library\u2019s favour, but it is not required: several of the libraries below have none, and the table says so.',
    'An upgrade will go only through a change that reruns the full test suite and rechecks the library\u2019s audit status.',
    'Audit status is given as the reviewers and the libraries\u2019 maintainers published it.',
    'No public independent audit found: no public independent audit of the library itself was found.',
    'The cryptographic libraries polyjose builds on, with their upstream project, license, what polyjose uses each one for, and its public audit status',
    'That review predates RUSTSEC-2023-0071 (the Marvin timing attack), and the crate\u2019s current rewrite has no published audit.',
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
  ['a hyphen', 'audit-ed'],
  ['an en dash', 'audit\u2013ed'],
  ['a space', 'audit ed'],
  ['an underscore', 'audit_ed'],
  ['a Cyrillic i', 'aud\u0456ted'],
  ['a Cyrillic e', 'audit\u0435d'],
  ['a Latin alpha', '\u0251udited'],
  ['a dotless i', 'aud\u0131ted'],
  ['a Greek iota', 'aud\u03B9ted'],
  ['fullwidth letters', '\uFF41\uFF55\uFF44\uFF49\uFF54\uFF45\uFF44'],
  ['styled letters', '\u{1D41A}\u{1D42E}\u{1D41D}\u{1D422}\u{1D42D}\u{1D41E}\u{1D41D}'],
  ['a combining accent', 'audite\u0301d'],
]) {
  test(`(c) fails on "audited" split by ${name}`, () => {
    assert.deepEqual(rules('/guides/x/', page(`<p>An ${word} JOSE library.</p>`)), ['audited-word']);
    assert.deepEqual(rules(FOUNDATIONS, page(`<p>An ${word} JOSE library.</p>`)), ['audited-word']);
  });
}

test('(c) the line of a finding after a register is still right', () => {
  const html = `<main>${banner(NOTICE)}\n${register('<li>\nAudited\n</li>')}\n<p>\naudited\n</p></main>`;
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
for (const phrase of ['constant-time', 'Constant time', 'constant&nbsp;time', 'constant‑time', 'constant-<em>time</em>', 'constant\ntime', 'c\u03BFnstant-time', '\uFF43\uFF4F\uFF4E\uFF53\uFF54\uFF41\uFF4E\uFF54 time']) {
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
  const [f] = checkPage('/guides/x/', `<main>${banner(NOTICE)}\n<p>\nsee constant-time\n</p></main>`);
  assert.equal(f.line, 3);
  assert.equal(f.match, 'constant-time');
});

test('findings report the text as written, not as folded for matching', () => {
  const html = `<main>${banner(NOTICE)}\n<p>An aud\u0456ted library.</p>\n<p>\uFF43onstant-time</p>\n<p>p\u043Elyjose is ａｕｄｉｔｅｄ.</p></main>`;
  const found = checkPage('/guides/x/', html).map((f) => [f.rule, f.line, f.match]);
  assert.deepEqual(found, [
    ['audit-claim', 4, 'p\u043Elyjose is ａｕｄｉｔｅｄ.'],
    ['audited-word', 2, 'aud\u0456ted'],
    ['audited-word', 4, 'ａｕｄｉｔｅｄ'],
    ['constant-time', 3, '\uFF43onstant-time'],
  ]);
});

test('(c) allowed: the bare word, in look-alike letters too, inside the register', () => {
  assert.deepEqual(rules(FOUNDATIONS, page(register('<li><strong>Aud\u0456ted</strong>: a public independent report covers the library.</li>'))), []);
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
