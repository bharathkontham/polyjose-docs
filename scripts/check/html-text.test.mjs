import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlText, hasAttribute } from './lib/html-text.mjs';

test('keeps visible text and drops tags', () => {
  assert.equal(htmlText('<p>Sign <strong>and</strong> verify</p>').trim(), 'Sign and verify');
});

test('drops script, style and comment bodies', () => {
  const html = '<style>.a{content:"ADR 1"}</style><script>let t = "T12";</script><!-- T34 -->ok';
  assert.equal(htmlText(html).trim(), 'ok');
});

test('drops attribute values, including hashed asset names', () => {
  const html = '<link href="/_astro/ec.T45.css"><script src="/_astro/page.T12-x9.js"></script><a href="/x" class="T99">go</a>';
  assert.equal(htmlText(html).trim(), 'go');
});

test('ignores ">" inside quoted attribute values', () => {
  assert.equal(htmlText('<a title-x="a > b" href=\'c>d\'>link</a>').trim(), 'link');
});

test('keeps human-readable attributes: alt, title, aria-label and meta descriptions', () => {
  const text = htmlText(
    '<img src="/a.png" alt="Diagram one"><a title="Tip two" aria-label="Label three">x</a>' +
      '<meta name="description" content="Desc four"><meta property="og:title" content="Og five">' +
      '<meta name="viewport" content="width=device-width">',
  );
  for (const want of ['Diagram one', 'Tip two', 'Label three', 'Desc four', 'Og five']) {
    assert.ok(text.includes(want), `${want} in ${JSON.stringify(text)}`);
  }
  assert.ok(!text.includes('width=device-width'));
});

test('inline tags join words, block tags separate them', () => {
  assert.match(htmlText('<p>constant-<em>time</em></p>'), /constant-time/);
  assert.match(htmlText('<p>audited</p><p>next</p>'), /audited\s+next/);
});

test('decodes character references', () => {
  assert.equal(htmlText('<p>a&amp;b &lt;c&gt; &#39;d&#x27; e&nbsp;f</p>').trim(), "a&b <c> 'd' e f");
});

test('preserves line numbers', () => {
  const html = '<head>\n<script>\nx\n</script>\n</head>\n<p\n class="a">\nline seven</p>';
  const lines = htmlText(html).split('\n');
  assert.equal(lines.length, html.split('\n').length);
  assert.equal(lines[7].trim(), 'line seven');
});

test('hasAttribute finds a bare attribute on any element', () => {
  assert.ok(hasAttribute('<div class="n" role="note" data-prerelease-notice data-x>t</div>', 'data-prerelease-notice'));
  assert.ok(hasAttribute('<div data-prerelease-notice="">t</div>', 'data-prerelease-notice'));
});

test('hasAttribute ignores the name in text, scripts, comments and other attribute values', () => {
  const html =
    '<p>data-prerelease-notice</p><script>"<div data-prerelease-notice>"</script>' +
    '<!-- <div data-prerelease-notice> --><div class="data-prerelease-notice" data-prerelease-notice-x>t</div>';
  assert.ok(!hasAttribute(html, 'data-prerelease-notice'));
});
