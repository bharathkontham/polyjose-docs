// Integration test: renders the sample components through the Astro
// container API, with the site's own Starlight and Expressive Code setup.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { startAstro, text, ROOT } from './support/astro.mjs';
import { collectRegions, PLATFORMS } from '../../../src/lib/samples/resolve.mjs';
import { parsePin, pinRelease } from '../../../src/lib/samples/pins.mjs';

const VIEW = '/src/components/samples/SamplesView.astro';
const SAMPLE_VIEW = '/src/components/samples/SampleView.astro';
const INSTALL_VIEW = '/src/components/samples/InstallView.astro';
const SAMPLES = '/src/components/samples/Samples.astro';
const SAMPLE = '/src/components/samples/Sample.astro';
const INSTALL = '/src/components/samples/Install.astro';

const REV = '0123456789abcdef0123456789abcdef01234567';
const region = (id, body) => `// docs:start ${id}\n${body}\n// docs:end ${id}\n`;

const files = {
  '/samples/rust/tests/guide.rs': region('guide/sign', 'let token = sign_compact(&key)?;'),
  '/samples/js/guide.test.mjs': region('guide/sign', 'import { jwsSignCompact } from "@polyjose/node";\nconst token = await jwsSignCompact(key);'),
  '/samples/kotlin/src/test/kotlin/GuideTest.kt': region('guide/sign', 'val token = jwsSignCompact(key)'),
  '/samples/swift/Tests/SamplesTests/GuideTests.swift': region('guide/sign', 'let token = try jwsSignCompact(key: key)'),
};
const regions = collectRegions(files);

/** @type {Awaited<ReturnType<typeof startAstro>>} */
let astro;
before(async () => {
  astro = await startAstro();
});
after(async () => {
  await astro?.close();
});

/** Labels of the tabs, in order. */
function tabLabels(html) {
  return [...html.matchAll(/<a[^>]*role="tab"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => text(m[1]).trim());
}

/** HTML of each tab panel, in order. */
function panels(html) {
  return html.split(/<div[^>]*role="tabpanel"/).slice(1);
}

/** The copyable code of each Expressive Code block (newlines are stored as U+007F). */
function copiedCode(html) {
  return [...html.matchAll(/data-code="([^"]*)"/g)].map((m) => text(m[1]).replace(/\u007f/g, '\n'));
}

async function rejectsWith(path, props, pattern) {
  await assert.rejects(astro.render(path, props), (err) => {
    assert.match(String(err?.message ?? err), pattern);
    return true;
  });
}

test('renders five synced tabs labelled Rust, Node.js, Web, Kotlin, Swift', async () => {
  const html = await astro.render(VIEW, { id: 'guide/sign', regions });
  assert.deepEqual(tabLabels(html), ['Rust', 'Node.js', 'Web', 'Kotlin', 'Swift']);
  assert.match(html, /<starlight-tabs[^>]*data-sync-key="platform"/);
  assert.equal(panels(html).length, 5);
});

test('each tab holds a code block in the right language', async () => {
  const html = await astro.render(VIEW, { id: 'guide/sign', regions });
  const langs = panels(html).map((p) => /data-language="([^"]+)"/.exec(p)?.[1]);
  assert.deepEqual(langs, ['rust', 'js', 'js', 'kotlin', 'swift']);
  assert.deepEqual(copiedCode(html), [
    'let token = sign_compact(&key)?;',
    'import { jwsSignCompact } from "@polyjose/node";\nconst token = await jwsSignCompact(key);',
    'import { jwsSignCompact } from "@polyjose/wasm";\nconst token = await jwsSignCompact(key);',
    'val token = jwsSignCompact(key)',
    'let token = try jwsSignCompact(key: key)',
  ]);
});

test('the title, when given, captions every tab', async () => {
  const html = await astro.render(VIEW, { id: 'guide/sign', regions, title: 'Sign a token' });
  assert.equal(html.match(/Sign a token/g)?.length, 5);
});

test('a samples/web region replaces the rewritten Node.js code in the Web tab', async () => {
  const own = collectRegions({ ...files, '/samples/web/browser.ts': region('guide/sign', 'await init();') });
  const html = await astro.render(VIEW, { id: 'guide/sign', regions: own });
  assert.equal(copiedCode(panels(html)[2])[0], 'await init();');
  assert.match(panels(html)[2], /data-language="ts"/);
});

test('an unavailable platform shows the reason from the table in an aside', async () => {
  const rustOnly = collectRegions({ '/samples/rust/tests/guide.rs': files['/samples/rust/tests/guide.rs'] });
  const unavailable = { node: 'zip-bindings', web: 'zip-bindings', kotlin: 'zip-bindings', swift: 'zip-bindings' };
  const html = await astro.render(VIEW, { id: 'guide/sign', regions: rustOnly, unavailable });
  const [rust, ...rest] = panels(html);
  assert.match(rust, /data-language="rust"/);
  for (const [i, panel] of rest.entries()) {
    const label = PLATFORMS[i + 1].label;
    assert.doesNotMatch(panel, /data-language=/, label);
    assert.match(panel, /<aside[^>]*class="starlight-aside starlight-aside--note"/, label);
    assert.match(panel, new RegExp(`Not available in ${label.replace('.', '\\.')}`), label);
    assert.match(
      text(panel).replace(/\s+/g, ' '),
      /Compression \(zip\) is available only in the Rust crate, with the deflate feature\./,
      label,
    );
    // Backticks in the reason become inline code.
    assert.match(panel, /<code>zip<\/code>/, label);
    assert.match(panel, /<code>deflate<\/code>/, label);
  }
});

test('the build fails when a platform has neither the region nor an unavailable entry', async () => {
  const noKotlin = { ...files };
  delete noKotlin['/samples/kotlin/src/test/kotlin/GuideTest.kt'];
  await rejectsWith(VIEW, { id: 'guide/sign', regions: collectRegions(noKotlin) }, /"guide\/sign"[\s\S]*Kotlin \(samples\/kotlin\)/);
});

test('free text in unavailable fails the build', async () => {
  await rejectsWith(
    VIEW,
    { id: 'guide/sign', regions, unavailable: { web: 'Not on the web' } },
    /"Not on the web" is not a key in src\/data\/unavailable\.json/,
  );
});

test('<Samples> reads the real samples tree: an undefined id fails, naming every platform', async () => {
  await rejectsWith(
    SAMPLES,
    { id: 'harness-test/never-defined' },
    /"harness-test\/never-defined"[\s\S]*Rust[\s\S]*Node\.js[\s\S]*Web[\s\S]*Kotlin[\s\S]*Swift/,
  );
});

test('<Samples> with every platform unavailable renders five asides', async () => {
  const unavailable = Object.fromEntries(PLATFORMS.map((p) => [p.key, 'rsa-private']));
  const html = await astro.render(SAMPLES, { id: 'harness-test/never-defined', unavailable });
  assert.deepEqual(tabLabels(html), ['Rust', 'Node.js', 'Web', 'Kotlin', 'Swift']);
  assert.equal(html.match(/starlight-aside--note/g)?.length, 5);
  assert.match(text(html), /RUSTSEC-2023-0071/);
});

test('<Sample> renders one platform without tabs', async () => {
  const html = await astro.render(SAMPLE_VIEW, { platform: 'swift', id: 'guide/sign', regions });
  assert.doesNotMatch(html, /role="tab"/);
  assert.deepEqual(copiedCode(html), ['let token = try jwsSignCompact(key: key)']);
  assert.match(html, /data-language="swift"/);
  const web = await astro.render(SAMPLE_VIEW, { platform: 'web', id: 'guide/sign', regions });
  assert.match(copiedCode(web)[0], /from "@polyjose\/wasm"/);
});

test('<Sample> fails the build for a missing region or an unknown platform', async () => {
  await rejectsWith(SAMPLE, { platform: 'rust', id: 'harness-test/never-defined' }, /"harness-test\/never-defined"[\s\S]*Rust/);
  await rejectsWith(SAMPLE_VIEW, { platform: 'android', id: 'guide/sign', regions }, /"android" is not a platform/);
});

test('<Install> before a registry pin shows the upcoming version, with no pre-release note', async () => {
  for (const pin of [
    { source: 'none', upcoming: '0.1.0' },
    { source: 'git', rev: REV, upcoming: '0.1.0' },
  ]) {
    const html = await astro.render(INSTALL_VIEW, { platform: 'node', pin });
    assert.match(html, /data-install-status="unpublished"/, pin.source);
    assert.doesNotMatch(text(html), /not (yet )?published/i, pin.source);
    assert.deepEqual(copiedCode(html), ['npm install @polyjose/node@0.1.0']);
  }
});

test('<Install> after release shows the pinned version without the badge', async () => {
  const html = await astro.render(INSTALL_VIEW, { platform: 'kotlin', pin: { source: 'registry', version: '0.1.0' } });
  assert.match(html, /data-install-status="published"/);
  assert.doesNotMatch(text(html), /Not yet published/);
  const code = copiedCode(html).join('\n');
  assert.match(code, /implementation\("dev\.polyjose:polyjose:0\.1\.0"\)/);
  assert.match(code, /implementation\("dev\.polyjose:polyjose-jvm:0\.1\.0"\)/);
});

test('<Install> reads the committed pin file for each platform', async () => {
  const pinFile = { rust: 'rust', node: 'js', web: 'js', kotlin: 'kotlin', swift: 'swift' };
  for (const [platform, file] of Object.entries(pinFile)) {
    const pin = parsePin(JSON.parse(readFileSync(`${ROOT}samples/pins/${file}.json`, 'utf8')), file);
    const { version, published } = pinRelease(pin);
    const html = await astro.render(INSTALL, { platform });
    assert.match(html, new RegExp(`data-install-status="${published ? 'published' : 'unpublished'}"`), platform);
    assert.ok(copiedCode(html).join('\n').includes(version), platform);
  }
});

test('<Install> fails the build for an unknown platform', async () => {
  await rejectsWith(INSTALL, { platform: 'android' }, /"android" is not a platform/);
});
