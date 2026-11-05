// Unit tests for the accessibility runner's pure helpers (tests/a11y/lib.mjs).
// They live here so that `npm run test:scripts` runs them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AXE_TAGS,
  sitemapLocs,
  toLocal,
  parseAllowList,
  applyAllowList,
  selectorOf,
  arrowPresses,
} from '../../tests/a11y/lib.mjs';

test('the WCAG tags are exactly the agreed set', () => {
  assert.deepEqual(AXE_TAGS, ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
});

test('sitemapLocs reads every <loc> and decodes entities', () => {
  const xml =
    '<?xml version="1.0"?><urlset><url><loc>https://polyjose.dev/</loc></url>' +
    '<url>\n  <loc> https://polyjose.dev/a/?x=1&amp;y=2 </loc>\n</url></urlset>';
  assert.deepEqual(sitemapLocs(xml), ['https://polyjose.dev/', 'https://polyjose.dev/a/?x=1&y=2']);
});

test('sitemapLocs rejects an empty sitemap', () => {
  assert.throws(() => sitemapLocs('<urlset></urlset>'), /no <loc>/);
});

test('toLocal keeps the path and query and swaps the origin', () => {
  assert.equal(toLocal('https://polyjose.dev/security/model/?a=1#h', 'http://127.0.0.1:5000'), 'http://127.0.0.1:5000/security/model/?a=1#h');
});

test('the committed allow.json is valid', () => {
  const raw = readFileSync(new URL('../../tests/a11y/allow.json', import.meta.url), 'utf8');
  assert.ok(Array.isArray(parseAllowList(raw)));
});

test('parseAllowList accepts rule, selector, reason and an optional issue', () => {
  const entries = parseAllowList(
    JSON.stringify([{ rule: 'region', selector: '.x', reason: 'upstream markup', issue: 'https://github.com/o/r/issues/1' }]),
  );
  assert.equal(entries.length, 1);
});

for (const [why, value, pattern] of [
  ['not JSON', '{', /not valid JSON/],
  ['not an array', '{}', /array/],
  ['missing reason', [{ rule: 'region', selector: '.x' }], /reason/],
  ['blank reason', [{ rule: 'region', selector: '.x', reason: '   ' }], /reason/],
  ['missing selector', [{ rule: 'region', reason: 'r' }], /selector/],
  ['missing rule', [{ selector: '.x', reason: 'r' }], /rule/],
  ['unknown key', [{ rule: 'region', selector: '.x', reason: 'r', pages: ['/'] }], /unknown key "pages"/],
  ['duplicate entry', [{ rule: 'r', selector: '.x', reason: 'a' }, { rule: 'r', selector: '.x', reason: 'b' }], /duplicate/],
]) {
  test(`parseAllowList rejects ${why}`, () => {
    assert.throws(() => parseAllowList(typeof value === 'string' ? value : JSON.stringify(value)), pattern);
  });
}

test('selectorOf joins frame and shadow DOM parts', () => {
  assert.equal(selectorOf({ target: ['.a > b'] }), '.a > b');
  assert.equal(selectorOf({ target: ['iframe', ['host', '.inner']] }), 'iframe |> host >>> .inner');
});

const violation = (id, ...targets) => ({
  id,
  impact: 'serious',
  help: `help for ${id}`,
  helpUrl: `https://example.test/${id}`,
  nodes: targets.map((t) => ({ target: [t] })),
});

test('applyAllowList fails every node that no entry matches, by rule and selector', () => {
  const allow = [{ rule: 'color-contrast', selector: '.ok', reason: 'r' }];
  const runs = [
    { page: '/', variant: 'light', violations: [violation('color-contrast', '.ok', '.bad'), violation('region', '.ok')] },
  ];
  const { failures, unused } = applyAllowList(allow, runs);
  assert.deepEqual(
    failures.map((f) => `${f.page} ${f.variant} ${f.rule} ${f.selector}`),
    ['/ light color-contrast .bad', '/ light region .ok'],
  );
  assert.deepEqual(unused, []);
});

test('applyAllowList reports an entry that matches nothing', () => {
  const allow = [
    { rule: 'region', selector: '.used', reason: 'r' },
    { rule: 'region', selector: '.stale', reason: 'r' },
  ];
  const { failures, unused } = applyAllowList(allow, [{ page: '/', variant: 'dark', violations: [violation('region', '.used')] }]);
  assert.deepEqual(failures, []);
  assert.deepEqual(unused.map((e) => e.selector), ['.stale']);
});

test('applyAllowList with an empty allow-list and no violations is clean', () => {
  assert.deepEqual(applyAllowList([], [{ page: '/', variant: 'light', violations: [] }]), { failures: [], unused: [] });
});

test('arrowPresses moves from the selected tab to the target tab', () => {
  assert.deepEqual(arrowPresses(0, 4), ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight']);
  assert.deepEqual(arrowPresses(3, 1), ['ArrowLeft', 'ArrowLeft']);
  assert.deepEqual(arrowPresses(2, 2), []);
});
