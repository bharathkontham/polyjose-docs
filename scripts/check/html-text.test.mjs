import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  htmlText, hasAttribute, stripInvisible, visibleTexts, elementTree, elementChildren, hasClass, isHidden, isRendered, visibleText,
} from './lib/html-text.mjs';

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

// The element tree, for checks that depend on where an element sits.
const first = (node, pred) => {
  for (const c of elementChildren(node)) {
    if (pred(c)) return c;
    const hit = first(c, pred);
    if (hit) return hit;
  }
  return null;
};
const byAttr = (root, name) => first(root, (e) => e.attrs.has(name));

test('elementTree nests elements, with void and self-closed elements as leaves', () => {
  const root = elementTree('<!DOCTYPE html><html><body><main><div data-x><p>a <em>b</em></p></div><img alt="x"><br/><svg><path d="z"/></svg></main></body></html>');
  const main = first(root, (e) => e.name === 'main');
  assert.deepEqual(elementChildren(main).map((e) => e.name), ['div', 'img', 'br', 'svg']);
  const div = byAttr(root, 'data-x');
  assert.equal(div.parent, main);
  assert.deepEqual(elementChildren(div).map((e) => e.name), ['p']);
  assert.equal(elementChildren(first(main, (e) => e.name === 'svg'))[0].name, 'path');
  assert.equal(root.parent, null);
});

test('elementTree leaves out comments, scripts and elements written as text', () => {
  const root = elementTree('<main><!-- <div data-x></div> --><script>"<div data-x>"</script><p>&lt;div data-x&gt;</p></main>');
  assert.equal(byAttr(root, 'data-x'), null);
  assert.deepEqual(elementChildren(first(root, (e) => e.name === 'main')).map((e) => e.name), ['script', 'p']);
});

test('elementTree ignores a stray closing tag, and a closing tag closes the elements left open inside it', () => {
  const root = elementTree('<main></span><div><p>a</div><section data-x></section></main>');
  const main = first(root, (e) => e.name === 'main');
  assert.deepEqual(elementChildren(main).map((e) => e.name), ['div', 'section']);
});

test('hasClass matches whole class names only', () => {
  const [el] = elementChildren(elementTree('<div class="a  prerelease-notice\tastro-x"></div>'));
  assert.ok(hasClass(el, 'prerelease-notice'));
  assert.ok(hasClass(el, 'a'));
  assert.ok(!hasClass(el, 'prerelease'));
  const [other] = elementChildren(elementTree('<div class="prerelease-notice-x" data-class="prerelease-notice"></div>'));
  assert.ok(!hasClass(other, 'prerelease-notice'));
});

const HIDDEN_ELEMENTS = [
  '<div hidden>t</div>',
  '<div hidden="until-found">t</div>',
  '<div aria-hidden="true">t</div>',
  '<div aria-hidden=" TRUE ">t</div>',
  '<div style="display:none">t</div>',
  '<div style="color: red; DISPLAY: none !important">t</div>',
  '<div style="visibility:hidden">t</div>',
  '<div style="visibility: collapse">t</div>',
  '<div style="opacity:0">t</div>',
  '<div style="opacity: 0.0">t</div>',
  '<div style="opacity:.0">t</div>',
  '<div style="opacity:0%">t</div>',
  '<div style="width:0">t</div>',
  '<div style="height: 0px">t</div>',
  '<div style="max-height:0;overflow:hidden">t</div>',
  '<div style="max-width:0.0em">t</div>',
  '<div style="font-size:0">t</div>',
  '<div style="content-visibility:hidden">t</div>',
  '<div class="sr-only">t</div>',
  '<div class="x visually-hidden">t</div>',
  '<div class="sl-sr-only">t</div>',
  '<div class="visuallyhidden">t</div>',
  '<div class="sl-hidden">t</div>',
  '<div class="md:sl-hidden">t</div>',
  '<div class="hidden">t</div>',
  '<div class="invisible">t</div>',
  '<details>t</details>',
  '<details open>t</details>',
  '<noscript>t</noscript>',
  '<template>t</template>',
  '<dialog>t</dialog>',
];

for (const html of HIDDEN_ELEMENTS) {
  test(`isHidden: ${html}`, () => {
    const [el] = elementChildren(elementTree(html));
    assert.ok(isHidden(el), html);
    assert.deepEqual(visibleTexts(html.replace(/^<(\w+)/, '<$1 data-n'), 'data-n'), [], 'visibleTexts agrees');
  });
}

test('isHidden: elements that are shown', () => {
  for (const html of [
    '<div>t</div>',
    '<div aria-hidden="false">t</div>',
    '<div style="opacity:0.5; width:100%; min-height:0; min-width: 0; line-height:0">t</div>',
    '<div style="height:10px">t</div>',
    '<div class="sr-only-focusable not-hidden sl-flex md:sl-flex">t</div>',
    '<dialog open>t</dialog>',
    '<summary>t</summary>',
  ]) {
    const [el] = elementChildren(elementTree(html));
    assert.ok(!isHidden(el), html);
  }
});

test('isRendered is false when the element or any element around it is hidden', () => {
  const html = (outer) => `<html><body>${outer.replace('X', '<p data-x>t</p>')}</body></html>`;
  assert.ok(isRendered(byAttr(elementTree(html('<main><div>X</div></main>')), 'data-x')));
  for (const outer of ['<main hidden><div>X</div></main>', '<details><main>X</main></details>', '<div style="opacity:0"><main>X</main></div>', '<noscript>X</noscript>']) {
    assert.ok(!isRendered(byAttr(elementTree(html(outer)), 'data-x')), outer);
  }
  assert.ok(!isRendered(byAttr(elementTree('<p data-x hidden>t</p>'), 'data-x')));
});

test('visibleText is the shown text of an element, white space collapsed, hidden parts left out', () => {
  const root = elementTree(
    '<div data-x aria-label="label"><p><strong>Pre-1.0:</strong> polyjose is not&nbsp;pub&shy;lished <span hidden>x</span><span class="sr-only">y</span>yet</p><p>Next</p><img alt="z"></div>',
  );
  assert.equal(visibleText(byAttr(root, 'data-x')), 'Pre-1.0: polyjose is not published yet Next');
});
