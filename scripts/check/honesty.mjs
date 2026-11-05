#!/usr/bin/env node
// npm run lint:honesty
//
// Checks the reader-visible text of every built page against the site's
// honesty rules:
//   (a) every page shows the pre-1.0 notice in its fixed place, the site
//       banner (see noticeProblem below), visibly, saying "Pre-1.0" and
//       "not published";
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
import { htmlText, elementTree, elementChildren, hasClass, isRendered, visibleText } from './lib/html-text.mjs';
import { listFiles, lineIndex } from './lib/files.mjs';
import { normalizeForMatch, normalizeWithMap } from './lib/normalize.mjs';

/** Marks the pre-1.0 notice (rule a). */
export const NOTICE_ATTRIBUTE = 'data-prerelease-notice';

/** The class of the pre-1.0 notice element (rule a). */
export const NOTICE_CLASS = 'prerelease-notice';

/** Marks the Banner override's container, the first element in <main> (rule a). */
export const BANNER_ATTRIBUTE = 'data-site-banner';

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

/**
 * Why the page does not show the pre-1.0 notice in its fixed place, or null
 * when it does (rule a).
 *
 * The fixed place follows Starlight 0.42.9's page layout (Page.astro): the
 * Banner override renders first inside <main>, before the page title and
 * content. The override wraps its output in a container marked
 * data-site-banner. The notice counts only when:
 * - that container is the first element child of the page's first <main>;
 * - the first element with class prerelease-notice inside the container is a
 *   direct child of it and carries data-prerelease-notice. A notice anywhere
 *   else on the page is not looked at;
 * - neither the notice nor any element around it is hidden (`isRendered` in
 *   lib/html-text.mjs: hidden, aria-hidden, display:none, visibility:hidden,
 *   opacity:0, zero size, sr-only or visually-hidden classes, <details>,
 *   <noscript>, <template>, ...);
 * - its shown text, without hidden parts and attributes, says "Pre-1.0" and
 *   "not published".
 * A change to Starlight's layout that moves the banner fails this check, so
 * the notice's place is looked at again.
 */
export function noticeProblem(html) {
  const main = findElement(elementTree(html), (e) => e.name === 'main');
  if (!main) return 'the page has no <main> element';
  const [first] = elementChildren(main);
  if (!first || !first.attrs.has(BANNER_ATTRIBUTE)) {
    return `the first element in <main> is not the site banner (${BANNER_ATTRIBUTE})`;
  }
  const notice = findElement(first, (e) => hasClass(e, NOTICE_CLASS));
  if (!notice) return `the site banner has no element with class ${NOTICE_CLASS}`;
  if (notice.parent !== first) {
    return `the first element with class ${NOTICE_CLASS} is not a direct child of the site banner`;
  }
  if (!notice.attrs.has(NOTICE_ATTRIBUTE)) return `the notice has no ${NOTICE_ATTRIBUTE} attribute`;
  if (!isRendered(notice)) return 'the notice, or an element around it, is hidden';
  const text = visibleText(notice);
  if (!/\bpre-1\.0\b/i.test(text) || !/\bnot\s+published\b/i.test(text)) {
    return 'the notice text does not say "Pre-1.0" and "not published"';
  }
  return null;
}

/** Findings for one built page: `{ rule, line?, match?, message }`. */
export function checkPage(route, html) {
  const findings = [];
  const problem = noticeProblem(html);
  if (problem) {
    findings.push({
      rule: 'prerelease-notice',
      message: `no pre-1.0 notice in the site banner: ${problem}. Every page must render the site banner (${BANNER_ATTRIBUTE}) as the first element in <main>, with the notice (class ${NOTICE_CLASS}, ${NOTICE_ATTRIBUTE}) as its first such child, not hidden, saying "Pre-1.0" and "not published".`,
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
  console.log(`lint:honesty: ${results.length} pages carry the pre-1.0 notice and make no unsupported claims.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
