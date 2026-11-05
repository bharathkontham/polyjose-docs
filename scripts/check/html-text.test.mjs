import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlText, hasAttribute, stripInvisible, visibleTexts } from './lib/html-text.mjs';

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

// Invisible characters: a soft hyphen or a zero-width character inside a word
// renders as nothing, so it must not split the word for the checks.
const INVISIBLE = { 'U+00AD': '­', 'U+200B': '​', 'U+200C': '‌', 'U+200D': '‍', 'U+2060': '⁠', 'U+FEFF': '﻿' };

for (const [name, ch] of Object.entries(INVISIBLE)) {
  test(`strips ${name} from text and readable attributes`, () => {
    assert.equal(stripInvisible(`aud${ch}it${ch}ed`), 'audited');
    assert.equal(htmlText(`<p>aud${ch}ited</p>`).trim(), 'audited');
    assert.equal(htmlText(`<img alt="aud${ch}ited">`).trim(), 'audited');
  });
}

test('strips soft hyphens and zero-width characters written as character references', () => {
  for (const ref of ['&shy;', '&SHY;', '&#173;', '&#xAD;', '&#x200B;', '&#8204;', '&#x200d;', '&#x2060;', '&#xFEFF;']) {
    assert.equal(htmlText(`<p>audit${ref}ed</p>`).trim(), 'audited', ref);
  }
});

test('keeps ordinary hyphens, spaces and other characters', () => {
  assert.equal(stripInvisible('third-party, non‑breaking and café'), 'third-party, non‑breaking and café');
});

test('stripping keeps line numbers', () => {
  const html = '<p>a­\nb</p>\n<p>c</p>';
  assert.equal(htmlText(html).split('\n').length, 3);
});

test('blockSeparator marks block boundaries, but not inline tags or line breaks', () => {
  const text = htmlText('<h2>One</h2><p>two <em>three</em><br>four</p><ul><li>five</li></ul>', { blockSeparator: '|' });
  assert.equal(text.replace(/\|+/g, '|').replace(/ +/g, ' '), '|One|two three four|five|');
  const alt = htmlText('<p>polyjose<img alt="logo">is here</p>', { blockSeparator: '|' });
  assert.equal(alt.replace(/\|+/g, '|').replace(/ +/g, ' '), '|polyjose|logo|is here|', 'a readable attribute is a block of its own');
  assert.equal(htmlText('<p>a</p><p>b</p>').includes('|'), false);
  assert.match(htmlText('<p>a</p><p>b</p>'), /^ a +b $/, 'the default separator is a space');
});

test('skip drops the text of matching elements and everything inside them, keeping line numbers', () => {
  const html = '<p>keep</p>\n<table data-x><tr><td>drop\n<table><tr><td>inner</td></tr></table>\nstill</td></tr></table>\n<p>after</p>';
  const text = htmlText(html, { skip: (tag) => tag.attrs.has('data-x') });
  assert.deepEqual(text.split(/\s+/).filter(Boolean), ['keep', 'after']);
  assert.equal(text.split('\n').length, html.split('\n').length);
});

test('skip handles void and self-closing elements inside the skipped element', () => {
  const html = '<div data-x><img alt="a"><br><svg><path d="x"/></svg>gone</div><p>kept</p>';
  assert.equal(htmlText(html, { skip: (tag) => tag.attrs.has('data-x') }).trim(), 'kept');
});

test('skip ends at the matching close tag of the same name', () => {
  const html = '<div data-x><div>inner</div>gone</div><div>kept</div>';
  assert.equal(htmlText(html, { skip: (tag) => tag.attrs.has('data-x') }).trim(), 'kept');
});

test('visibleTexts returns the text of each element carrying the attribute', () => {
  const html = '<div data-n><p><strong>Pre-1.0:</strong> polyjose is not&nbsp;published</p></div><p>other</p><span data-n="">two</span>';
  assert.deepEqual(visibleTexts(html, 'data-n').map((t) => t.replace(/\s+/g, ' ').trim()), ['Pre-1.0: polyjose is not published', 'two']);
});

test('visibleTexts leaves out readable attributes: they are not visible text', () => {
  assert.deepEqual(visibleTexts('<div data-n aria-label="Pre-1.0" title="t"><img alt="a">x</div>', 'data-n').map((t) => t.trim()), ['x']);
});

test('visibleTexts skips elements in a template, hidden or aria-hidden subtree, and hidden descendants', () => {
  const cases = [
    '<template><div data-n>t</div></template>',
    '<div hidden><div data-n>t</div></div>',
    '<div data-n hidden>t</div>',
    '<div data-n hidden="until-found">t</div>',
    '<div aria-hidden="true"><div data-n>t</div></div>',
    '<div data-n aria-hidden="TRUE">t</div>',
    '<div data-n style="display: none">t</div>',
    '<div style="color:red; visibility:hidden"><div data-n>t</div></div>',
  ];
  for (const html of cases) assert.deepEqual(visibleTexts(html, 'data-n'), [], html);
  const inner = '<div data-n>shown<span hidden>a</span><span aria-hidden="true">b</span><template>c</template></div>';
  assert.deepEqual(visibleTexts(inner, 'data-n').map((t) => t.trim()), ['shown']);
  assert.deepEqual(visibleTexts('<div aria-hidden="false"><p data-n>t</p></div>', 'data-n'), ['t']);
});

test('visibleTexts does not see elements written in text, comments or scripts', () => {
  const html = '<p>&lt;div data-n&gt;</p><!-- <div data-n>x</div> --><script>"<div data-n>y</div>"</script>';
  assert.deepEqual(visibleTexts(html, 'data-n'), []);
});
