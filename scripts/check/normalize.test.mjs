import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForMatch, normalizeWithMap, CONFUSABLES } from './lib/normalize.mjs';

test('leaves plain ASCII text unchanged, case included', () => {
  for (const s of ['', 'polyjose 0.1.0 is pre-1.0.', 'ADR 0040, T12 and /Users/x', 'Audited: a public report.\n\tNext']) {
    assert.equal(normalizeForMatch(s), s);
  }
});

test('applies compatibility folding: fullwidth, ligatures, styled and circled letters', () => {
  assert.equal(normalizeForMatch('ａｕｄｉｔｅｄ'), 'audited');
  assert.equal(normalizeForMatch('ＡＵＤＩＴＥＤ'), 'AUDITED');
  assert.equal(normalizeForMatch('certiﬁed'), 'certified');
  assert.equal(normalizeForMatch('𝐚𝐮𝐝𝐢𝐭𝐞𝐝 𝘢𝘶𝘥𝘪𝘵𝘦𝘥'), 'audited audited');
  assert.equal(normalizeForMatch('ⓐudited'), 'audited');
  assert.equal(normalizeForMatch('ADR 0040 ＡＤＲ０４０'), 'ADR 0040 ADR040');
  assert.equal(normalizeForMatch('ſecurity'), 'security', 'long s');
});

test('folds Cyrillic look-alikes of a-z and A-Z', () => {
  assert.equal(normalizeForMatch('аеорсухіјѕԁӏ'), 'aeopcyxijsdl');
  assert.equal(normalizeForMatch('АВЕКМНОРСТУХІЈЅԀӀ'), 'ABEKMHOPCTYXIJSDI');
  assert.equal(normalizeForMatch('audіted'), 'audited', 'Cyrillic і');
  assert.equal(normalizeForMatch('auditеd'), 'audited', 'Cyrillic е');
});

test('folds Greek look-alikes of a-z and A-Z', () => {
  assert.equal(normalizeForMatch('αορεικντυχ'), 'aopeikvtux');
  assert.equal(normalizeForMatch('ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ'), 'ABEZHIKMNOPTYX');
});

test('folds Latin look-alikes: alpha, dotless i and j, script g', () => {
  assert.equal(normalizeForMatch('ɑudited'), 'audited');
  assert.equal(normalizeForMatch('audıted'), 'audited');
  assert.equal(normalizeForMatch('ȷ ɡ ɩ'), 'j g i');
});

test('removes combining marks and default-ignorable characters', () => {
  assert.equal(normalizeForMatch('àudítëd'), 'audited', 'precomposed');
  assert.equal(normalizeForMatch('àudíted'), 'audited', 'combining');
  assert.equal(normalizeForMatch('aud­it​ed⁠'), 'audited');
  assert.equal(normalizeForMatch('au⁢dit᠎ed️͏'), 'audited', 'invisible operator, Mongolian vowel separator, variation selector, grapheme joiner');
  assert.equal(normalizeForMatch('au‮di⁦ted‏'), 'audited', 'bidi controls');
});

test('keeps line breaks, block separators and the characters that end sentences', () => {
  assert.equal(normalizeForMatch('a.\nb! c? d'), 'a.\nb! c? d');
  assert.equal(normalizeForMatch('pre‑1.0'), 'pre‐1.0', 'a non-breaking hyphen becomes a hyphen, not ASCII');
});

test('leaves letters with no ASCII look-alike alone', () => {
  assert.equal(normalizeForMatch('жлщ λπω'), 'жлщ λπω');
});

test('the confusables map only targets ASCII letters, and every entry is a single code point', () => {
  for (const [from, to] of Object.entries(CONFUSABLES)) {
    assert.equal([...from].length, 1, from);
    assert.match(to, /^[a-zA-Z]$/, `${from} -> ${to}`);
    assert.ok(from.codePointAt(0) > 0x7f, from);
  }
  assert.ok(Object.isFrozen(CONFUSABLES));
});

test('is pure: the same input gives the same output, and the input is not changed', () => {
  const s = 'Pоlyjose';
  assert.equal(normalizeForMatch(s), normalizeForMatch(s));
  assert.equal(s, 'Pоlyjose');
});

test('normalizeWithMap gives the same text and maps a match back to the original', () => {
  const original = 'x ａｕｄｉｔｅｄ, audіted and au­dited.';
  const { text, toOriginal } = normalizeWithMap(original);
  assert.equal(text, normalizeForMatch(original));
  assert.equal(text, 'x audited, audited and audited.');
  const spans = [...text.matchAll(/audited/g)].map((m) => {
    const [a, b] = toOriginal(m.index, m.index + m[0].length);
    return original.slice(a, b);
  });
  assert.deepEqual(spans, ['ａｕｄｉｔｅｄ', 'audіted', 'au­dited']);
});

test('normalizeWithMap maps inside an expanded character to the whole character', () => {
  const original = 'a ﬁ b';
  const { text, toOriginal } = normalizeWithMap(original);
  assert.equal(text, 'a fi b');
  assert.deepEqual(toOriginal(2, 3), [2, 3], '"f" of "fi" is the ligature');
  assert.deepEqual(toOriginal(3, 4), [2, 3]);
  assert.deepEqual(toOriginal(0, text.length), [0, original.length]);
});

test('normalizeWithMap handles astral characters and an empty range', () => {
  const original = '𝐚b';
  const { text, toOriginal } = normalizeWithMap(original);
  assert.equal(text, 'ab');
  assert.deepEqual(toOriginal(0, 1), [0, 2]);
  assert.deepEqual(toOriginal(1, 2), [2, 3]);
  assert.deepEqual(toOriginal(1, 1), [2, 2]);
  assert.deepEqual(toOriginal(2, 2), [3, 3]);
});

test('normalizeWithMap keeps line breaks in place, so line numbers survive', () => {
  const original = 'ａ\nｂ­\nc';
  const { text } = normalizeWithMap(original);
  assert.equal(text.split('\n').length, original.split('\n').length);
});
