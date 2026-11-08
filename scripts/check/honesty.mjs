#!/usr/bin/env node
// npm run lint:honesty
//
// Checks the reader-visible text of every built page against the site's
// honesty rules:
//   (a) no page carries the pre-release notice the site showed before 0.1.0
//       (an element with class prerelease-notice or data-prerelease-notice),
//       and no page's text says "pre-1.0" or "not published";
//   (b) no page claims that polyjose, or the library, is audited, has passed
//       or completed an audit, is "fully" or "third-party" audited, or that an
//       audit of it found nothing or passed: no independent audit of polyjose
//       itself has been published. Claims are matched within a sentence, so a
//       version number such as "0.1.0" can't split one, and inside the audit
//       register too;
//   (c) the word "audited" appears only inside the audit register on
//       Security > Cryptographic foundations: the elements marked
//       data-audit-register (the primitives table rows and the status legend),
//       which report the primitives' audit status in the auditors' own terms;
//   (d) "constant-time" appears only on the security pages, where a claim is
//       quoted from, and linked to, the crate that documents it.
//
// Soft hyphens and zero-width characters are removed from the page text (see
// lib/html-text.mjs), and the text is folded before matching (see
// lib/normalize.mjs): compatibility forms such as fullwidth letters, accents,
// and Cyrillic, Greek or Latin look-alikes of ASCII letters match as the
// letters they look like, so "audіted" (Cyrillic і) counts as "audited". The
// word may also be split by up to two non-letters: "audit-ed", "audit ed".
// Findings quote the text as written.

import { join, resolve, sep } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { htmlText, elementTree, elementChildren, hasClass } from './lib/html-text.mjs';
import { listFiles, lineIndex } from './lib/files.mjs';
import { normalizeForMatch, normalizeWithMap } from './lib/normalize.mjs';

/** Marked the pre-release notice; no page may carry it (rule a). */
export const NOTICE_ATTRIBUTE = 'data-prerelease-notice';

/** The class of the pre-release notice element; no page may carry it (rule a). */
export const NOTICE_CLASS = 'prerelease-notice';

// Pre-release wording (rule a): "pre-1.0", "not published", "not yet
// published", "isn't published".
const PRERELEASE_WORDING = /\bpre[\s\u2010\u2011-]*1\.0\b|\b(?:not|isn['\u2019]t)\s+(?:yet\s+)?published\b/gi;

/** The only page that may use the word "audited", inside its register (rule c). */
export const AUDITED_PAGES = new Set(['/security/cryptographic-foundations/']);

/** Marks the audit register elements on the pages in AUDITED_PAGES (rule c). */
export const REGISTER_ATTRIBUTE = 'data-audit-register';

/** "constant-time" may appear only on pages under this path (rule d). */
export const CONSTANT_TIME_PREFIX = '/security/';

// "audited", also split by up to two non-letters: "audit-ed", "audit ed".
const AUDITED = String.raw`audit[\W_]{0,2}ed\b`;

// The decision record's own pattern, over the whole page text.
const AUDIT_CLAIM = new RegExp(
  String.raw`polyjose[^.]{0,60}\b(is|has\s+been|was|are)\s+(independently\s+|professionally\s+)?${AUDITED}`,
  'gi',
);

// Claims checked one sentence at a time, with no length window. A word such as
// "not" or "never" right after the verb makes it a denial, not a claim. A
// qualifier may use any hyphen, the non-breaking one included.
const DENIAL = String.raw`(?!(?:not|never)\b)`;
const WORD = String.raw`[\w\u2010\u2011-]+`;
// An audit of polyjose named as the subject: "audit of polyjose",
// "polyjose's independent audit", "polyjose security audit".
const QUALIFIER = String.raw`(?:independent|external|third[\W_]?party|security|code|formal|public|full|\d{4})`;
const POLYJOSE_AUDIT = String.raw`(?:audits?\s+of\s+polyjose|polyjose(?:['\u2019]s)?\s+(?:${QUALIFIER}\s+){0,3}audits?)\b`;
const SENTENCE_CLAIMS = [
  // "polyjose 0.1.0 is audited", "The library has been independently audited"
  new RegExp(String.raw`\b(?:polyjose|(?:the|this)\s+library)\b[\s\S]*\b(?:is|are|was|were|been)\s+(?:${DENIAL}${WORD}\s+){0,2}${AUDITED}`, 'i'),
  // "... is fully audited", "... are third-party audited", whatever the subject
  new RegExp(String.raw`\b(?:is|are|was|were|been)\s+${DENIAL}${WORD}\s+${AUDITED}`, 'i'),
  // "polyjose has passed an independent security audit"
  /\bpolyjose\b[\s\S]*\b(?:pass(?:ed|es)?|complet(?:ed|es)|undergo(?:ne|es)|underwent|receive[ds]?)\b[\s\S]*\baudit/i,
  // "An independent audit of polyjose was completed"
  /\baudits?\s+of\s+polyjose\b[\s\S]*\b(?:was|were|been)\s+(?:completed|concluded|finished|passed)\b/i,
  // "An audit of polyjose found no issues", "polyjose security audit report
  // (2025): no findings"
  new RegExp(String.raw`\b${POLYJOSE_AUDIT}[\s\S]*\b(?:found|no\s+findings|pass(?:ed|es)?|clean)\b`, 'i'),
  // "Security audit: passed", "Audit complete", whatever the subject
  /\b(?:security\s+)?audit[^.]{0,20}\b(?:passed|complete[ds]?)\b/i,
];

const AUDITED_WORD = new RegExp(String.raw`\b${AUDITED}`, 'gi');
// Spaces, line breaks and hyphens, including the non-breaking hyphen.
const CONSTANT_TIME = /constant[\s‐‑-]+time/gi;

/** The URL path a file in dist/ is served at. */
export function routeOf(distRelative) {
  const p = distRelative.split(sep).join('/');
  if (p === 'index.html') return '/';
  if (p.endsWith('/index.html')) return `/${p.slice(0, -'index.html'.length)}`;
  return `/${p}`;
}

// Marks block boundaries in the page text. It is white space to \s, so the
// patterns that span blocks still see a space there.
const BLOCK = '\u2029';

/**
 * Splits page text into sentences: at a block boundary, and after ".", "!" or
 * "?" followed by white space. A dot inside a number ("0.1.0") ends nothing.
 * Each sentence keeps its start index in the text.
 */
export function sentenceSpans(text) {
  const spans = [];
  const re = /[^\u2029.!?]*(?:[.!?]+(?!\s|$)[^\u2029.!?]*)*(?:[.!?]+|(?=\u2029)|$)/g;
  for (const m of text.matchAll(re)) {
    const lead = m[0].length - m[0].trimStart().length;
    const body = m[0].trim();
    if (body) spans.push({ index: m.index + lead, text: body });
  }
  return spans;
}

/** The sentences of `text`, white space collapsed. */
export function sentences(text) {
  return sentenceSpans(text).map((s) => s.text.replace(/\s+/g, ' '));
}

const CLAIM_MESSAGE =
  'reads as a claim that polyjose, or something it is built from, is audited, but no independent audit of polyjose itself has been published. Say what was reviewed, by whom and when, instead.';

/** The first element under `node`, in document order, for which `pred` holds. */
function findElement(node, pred) {
  for (const child of elementChildren(node)) {
    if (pred(child)) return child;
    const hit = findElement(child, pred);
    if (hit) return hit;
  }
  return null;
}

/** Whether any element on the page is the pre-release notice (rule a). */
function hasNotice(html) {
  return findElement(elementTree(html), (e) => e.attrs.has(NOTICE_ATTRIBUTE) || hasClass(e, NOTICE_CLASS)) !== null;
}

/** Findings for one built page: `{ rule, line?, match?, message }`. */
export function checkPage(route, html) {
  const findings = [];
  if (hasNotice(html)) {
    findings.push({
      rule: 'prerelease-notice',
      message: `the page carries the pre-release notice (class ${NOTICE_CLASS} or ${NOTICE_ATTRIBUTE}). The site no longer shows it.`,
    });
  }
  const text = htmlText(html, { blockSeparator: BLOCK });
  const lineOf = lineIndex(text);
  const show = (s) => s.replace(/\s+/g, ' ').trim();
  // Matches `re` on the folded `source`; yields each match's range in `source`.
  const matches = function* (source, re) {
    const folded = normalizeWithMap(source);
    for (const m of folded.text.matchAll(re)) yield folded.toOriginal(m.index, m.index + m[0].length);
  };
  const each = (source, re, rule, message) => {
    const at = lineIndex(source);
    for (const [a, b] of matches(source, re)) {
      findings.push({ rule, line: at(a), match: show(source.slice(a, b)), message });
    }
  };

  // (a) Pre-release wording, anywhere in the page text.
  each(text, PRERELEASE_WORDING, 'prerelease-wording', 'is pre-release wording, which the site no longer uses.');

  // (b) Each sentence is reported once, whichever patterns it matches.
  const claimed = [];
  for (const s of sentenceSpans(text)) {
    const folded = normalizeForMatch(s.text);
    if (SENTENCE_CLAIMS.some((re) => re.test(folded))) {
      claimed.push([s.index, s.index + s.text.length]);
      findings.push({ rule: 'audit-claim', line: lineOf(s.index), match: show(s.text), message: CLAIM_MESSAGE });
    }
  }
  for (const [start, end] of matches(text, AUDIT_CLAIM)) {
    if (claimed.some(([a, b]) => start < b && end > a)) continue;
    findings.push({ rule: 'audit-claim', line: lineOf(start), match: show(text.slice(start, end)), message: CLAIM_MESSAGE });
  }

  // (c) On the register page, the register's own text is taken out first.
  const outside = AUDITED_PAGES.has(route)
    ? htmlText(html, { blockSeparator: BLOCK, skip: (tag) => tag.attrs.has(REGISTER_ATTRIBUTE) })
    : text;
  each(
    outside,
    AUDITED_WORD,
    'audited-word',
    `the word may appear only inside the audit register (elements marked ${REGISTER_ATTRIBUTE}) on ${[...AUDITED_PAGES].join(', ')}, which reports audit status in the auditors' own terms.`,
  );
  if (!route.startsWith(CONSTANT_TIME_PREFIX)) {
    each(
      text,
      CONSTANT_TIME,
      'constant-time',
      `may appear only on pages under ${CONSTANT_TIME_PREFIX}, quoting the crate that documents it.`,
    );
  }
  return findings;
}

/** Checks every built page under `distDir`. Throws when there is none. */
export function checkDist(distDir) {
  const pages = existsSync(distDir) ? listFiles(distDir, '.').filter((f) => f.endsWith('.html')) : [];
  if (pages.length === 0) {
    throw new Error(`no built pages in ${distDir}: run \`npm run build\` first.`);
  }
  return pages.map((file) => {
    const route = routeOf(file);
    return { file, route, findings: checkPage(route, readFileSync(join(distDir, file), 'utf8')) };
  });
}

function main(argv) {
  const at = argv.indexOf('--dist');
  const distDir = at === -1 ? resolve(import.meta.dirname, '../../dist') : resolve(argv[at + 1]);
  let results;
  try {
    results = checkDist(distDir);
  } catch (err) {
    console.error(`lint:honesty: ${err.message}`);
    return 2;
  }
  let count = 0;
  for (const { file, route, findings } of results) {
    const shown = `dist/${file}`;
    for (const f of findings) {
      count++;
      const where = f.line ? `${shown}:${f.line}` : shown;
      const what = f.match ? `"${f.match}": ${f.message}` : f.message;
      console.error(`${where} (${route}): ${what}`);
    }
  }
  if (count > 0) {
    console.error(`\nlint:honesty: ${count} problem(s) in ${results.length} pages.`);
    return 1;
  }
  console.log(`lint:honesty: ${results.length} pages carry no pre-release wording and make no unsupported claims.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
