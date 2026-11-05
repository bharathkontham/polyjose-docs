import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractRegions, dedent, SampleRegionError, REGION_ID } from '../../../src/lib/samples/extract.mjs';

const FILE = 'samples/rust/tests/sign.rs';

function only(text) {
  const regions = extractRegions(text, FILE);
  assert.equal(regions.length, 1);
  return regions[0];
}

function rejects(text, pattern) {
  assert.throws(
    () => extractRegions(text, FILE),
    (err) => {
      assert.ok(err instanceof SampleRegionError, `expected SampleRegionError, got ${err}`);
      assert.match(err.message, pattern);
      return true;
    },
  );
}

test('returns the region with marker lines removed and indentation stripped', () => {
  const text = [
    '#[test]',
    'fn sign() -> Result<(), polyjose::Error> {',
    '    // docs:start sign-and-verify/hs256',
    '    let key = fixtures().hs256();',
    '    if true {',
    '        println!("signed");',
    '    }',
    '    // docs:end sign-and-verify/hs256',
    '    Ok(())',
    '}',
  ].join('\n');
  const region = only(text);
  assert.equal(region.id, 'sign-and-verify/hs256');
  assert.equal(region.code, 'let key = fixtures().hs256();\nif true {\n    println!("signed");\n}');
  assert.equal(region.file, FILE);
  assert.equal(region.startLine, 3);
  assert.equal(region.endLine, 8);
});

test('finds several regions in one file, in order', () => {
  const text = [
    '// docs:start a/one',
    'one();',
    '// docs:end a/one',
    'between();',
    '// docs:start a/two',
    'two();',
    '// docs:end a/two',
  ].join('\n');
  const regions = extractRegions(text, FILE);
  assert.deepEqual(
    regions.map((r) => [r.id, r.code]),
    [
      ['a/one', 'one();'],
      ['a/two', 'two();'],
    ],
  );
});

test('a file without markers has no regions', () => {
  assert.deepEqual(extractRegions('fn main() {}\n', FILE), []);
  assert.deepEqual(extractRegions('', FILE), []);
});

test('keeps blank lines inside a region but trims blank lines at its edges', () => {
  const text = ['  // docs:start a/b', '', '  first();', '', '  second();', '   ', '  // docs:end a/b'].join('\n');
  assert.equal(only(text).code, 'first();\n\nsecond();');
});

test('handles CRLF line endings', () => {
  const text = '// docs:start a/b\r\n  x();\r\n  y();\r\n// docs:end a/b\r\n';
  assert.equal(only(text).code, 'x();\ny();');
});

test('accepts markers with extra spaces after the comment slashes', () => {
  assert.equal(only('//docs:start a/b\nx();\n//   docs:end   a/b  \n').code, 'x();');
});

test('ignores the marker words when they are not a whole comment line', () => {
  const text = ['let s = "// docs:start a/b";', '// docs:start a/c', 'x();', '// docs:end a/c'].join('\n');
  assert.deepEqual(
    extractRegions(text, FILE).map((r) => r.id),
    ['a/c'],
  );
});

test('the same marker syntax works in every sample language', () => {
  for (const [file, body] of [
    ['samples/rust/tests/a.rs', 'let x = 1;'],
    ['samples/js/a.test.mjs', 'const x = 1;'],
    ['samples/web/browser.ts', 'const x: number = 1;'],
    ['samples/kotlin/src/test/kotlin/ATest.kt', 'val x = 1'],
    ['samples/swift/Tests/SamplesTests/ATests.swift', 'let x = 1'],
  ]) {
    const [region] = extractRegions(`// docs:start lang/check\n    ${body}\n// docs:end lang/check\n`, file);
    assert.equal(region.code, body, file);
  }
});

test('error: a start marker that is never closed names the file, line and id', () => {
  rejects('a();\n// docs:start a/b\nx();\n', /^samples\/rust\/tests\/sign\.rs:2: .*"a\/b".*never closed/);
});

test('error: an end marker without a start', () => {
  rejects('x();\n// docs:end a/b\n', /sign\.rs:2: .*"a\/b".*no matching docs:start/);
});

test('error: a nested region', () => {
  rejects(
    '// docs:start a/outer\n// docs:start a/inner\nx();\n// docs:end a/inner\n// docs:end a/outer\n',
    /sign\.rs:2: .*"a\/inner".*"a\/outer".*line 1.*still open/,
  );
});

test('error: overlapping regions', () => {
  rejects(
    '// docs:start a/one\nx();\n// docs:end a/two\n// docs:end a/one\n',
    /sign\.rs:3: .*"a\/two".*open region is "a\/one"/,
  );
});

test('error: the same id twice in one file', () => {
  rejects(
    '// docs:start a/b\nx();\n// docs:end a/b\n// docs:start a/b\ny();\n// docs:end a/b\n',
    /sign\.rs:4: .*"a\/b".*already defined at line 1/,
  );
});

test('error: an empty region', () => {
  rejects('// docs:start a/b\n\n   \n// docs:end a/b\n', /sign\.rs:1: .*"a\/b".*empty/);
  rejects('// docs:start a/b\n// docs:end a/b\n', /sign\.rs:1: .*"a\/b".*empty/);
});

test('error: ids that do not match the id pattern', () => {
  for (const bad of ['single', 'Upper/case', 'a/', '/a', 'a//b', 'a/b_c', 'a/b.c']) {
    rejects(`// docs:start ${bad}\nx();\n// docs:end ${bad}\n`, /sign\.rs:1: .*not a valid region id/);
  }
});

test('error: a marker without an id', () => {
  rejects('// docs:start\nx();\n', /sign\.rs:1: .*docs:start marker needs an id/);
  rejects('// docs:start a/b\nx();\n// docs:end\n', /sign\.rs:3: .*docs:end marker needs an id/);
});

test('error: a marker with text after the id', () => {
  rejects('// docs:start a/b extra\nx();\n// docs:end a/b\n', /sign\.rs:1: .*one id/);
});

test('errors carry the file, line and id as fields', () => {
  try {
    extractRegions('// docs:start a/b\n', FILE);
    assert.fail('expected an error');
  } catch (err) {
    assert.equal(err.file, FILE);
    assert.equal(err.line, 1);
    assert.equal(err.id, 'a/b');
  }
});

test('the id pattern requires at least two lowercase segments', () => {
  assert.equal(REGION_ID.source, '^[a-z0-9-]+(\\/[a-z0-9-]+)+$');
  for (const good of ['a/b', 'sign-and-verify/hs256', 'start/rust-first-sign', 'a/b/c', '0/1']) {
    assert.ok(REGION_ID.test(good), good);
  }
});

test('dedent strips the common leading whitespace and keeps relative indentation', () => {
  assert.equal(dedent(['    a', '      b', '', '    c']), 'a\n  b\n\nc');
  assert.equal(dedent(['\t\ta', '\t\t\tb']), 'a\n\tb');
  assert.equal(dedent(['a', '  b']), 'a\n  b');
  // Mixed tabs and spaces share no prefix, so nothing is stripped.
  assert.equal(dedent(['\ta', '  b']), '\ta\n  b');
});

test('error: a malformed marker line', () => {
  rejects('// docs:startx a/b\nx();\n', /sign\.rs:1: malformed docs marker/);
  rejects('// docs:ending a/b\n', /sign\.rs:1: malformed docs marker/);
});
