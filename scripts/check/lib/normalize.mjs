// Text folding for the build checks' pattern matching.
//
// A check that looks for an English word (or an identifier such as "ADR 0040")
// should not be fooled by text that reads the same on screen but uses other
// code points: fullwidth or styled letters, a Cyrillic "е" in place of a Latin
// "e", an accent, or a character that renders as nothing. The checks match on
// the folded text and report the original text, so a finding shows what the
// author wrote.
//
// API (pure; neither function changes or keeps its input):
// - normalizeForMatch(text) -> string
//     The folded text. Use it to test whether a pattern occurs.
// - normalizeWithMap(text) -> { text, toOriginal(start, end) -> [start, end] }
//     The same folded text, plus a map from a range in it (such as a regex
//     match) back to the range of the original text that produced it.
//
// Folding, one code point at a time:
// 1. Unicode compatibility decomposition (NFKD, the decomposition half of
//    NFKC): fullwidth "ａ", mathematical "𝐚", circled "ⓐ", the "ﬁ" ligature and
//    the long s become their plain letters, and a no-break space a space.
// 2. Combining marks (\p{M}) and default-ignorable code points (soft hyphen,
//    zero-width characters, word joiner, bidi controls, variation selectors
//    and the like) are removed, so "àudited" and "audit&shy;ed" fold to
//    "audited".
// 3. The letters in CONFUSABLES, which look like an ASCII letter but are not
//    one, become that letter.
// 4. The result is recomposed (NFC), so text with no ASCII look-alike, such as
//    Korean, stays readable.
// Case is kept: match with the `i` flag where case does not matter. Line breaks
// and sentence punctuation are kept, so line numbers and sentence boundaries
// survive. Hyphen-like characters are not folded to "-" (NFKC turns U+2011
// into U+2010); patterns that care accept them explicitly.

/**
 * Letters that look like an ASCII letter in common fonts, mapped to it. The
 * list is small and explicit; it is not the full Unicode confusables table.
 */
export const CONFUSABLES = Object.freeze({
  // Cyrillic, lower case
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
  'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ӏ': 'l', 'ԛ': 'q', 'ԝ': 'w', 'һ': 'h',
  // Cyrillic, upper case
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P',
  'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X', 'І': 'I', 'Ј': 'J', 'Ѕ': 'S', 'Ԁ': 'D',
  'Ӏ': 'I', 'Ԛ': 'Q', 'Ԝ': 'W', 'Һ': 'H',
  // Greek, lower case
  'α': 'a', 'ο': 'o', 'ρ': 'p', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'τ': 't',
  'υ': 'u', 'χ': 'x', 'ϲ': 'c', 'ϳ': 'j',
  // Greek, upper case
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M',
  'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'Ϲ': 'C',
  // Latin letters outside ASCII that NFKD leaves alone
  'ɑ': 'a', 'ı': 'i', 'ȷ': 'j', 'ɡ': 'g', 'ɩ': 'i', 'ʟ': 'L',
  // Armenian
  'օ': 'o', 'ս': 'u', 'հ': 'h', 'ո': 'n',
});

const DROPPED = /[\p{M}\p{Default_Ignorable_Code_Point}]/gu;

// Folding is per code point, so its result can be memoised.
const cache = new Map();

function fold(ch) {
  let out = cache.get(ch);
  if (out === undefined) {
    out = '';
    for (const c of ch.normalize('NFKD').replace(DROPPED, '')) out += CONFUSABLES[c] ?? c;
    out = out.normalize('NFC');
    cache.set(ch, out);
  }
  return out;
}

/** The text folded for matching (see the module comment). */
export function normalizeForMatch(text) {
  let out = '';
  for (const ch of text) out += fold(ch);
  return out;
}

/**
 * The text folded for matching, with `toOriginal(start, end)`, which maps the
 * range [start, end) of the folded text to the range of the original text
 * that produced it. A range that covers part of an expanded character ("f" of
 * the "ﬁ" ligature) maps to the whole character; removed characters inside the
 * range are part of the original range.
 */
export function normalizeWithMap(original) {
  let text = '';
  const from = [];
  const to = [];
  let at = 0;
  for (const ch of original) {
    const f = fold(ch);
    for (let k = 0; k < f.length; k++) {
      from.push(at);
      to.push(at + ch.length);
    }
    text += f;
    at += ch.length;
  }
  const toOriginal = (start, end) => {
    if (end <= start) {
      const p = start < from.length ? from[start] : original.length;
      return [p, p];
    }
    return [from[start], to[end - 1]];
  };
  return { text, toOriginal };
}
