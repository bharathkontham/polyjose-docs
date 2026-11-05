#!/usr/bin/env node
// npm run lint:refs
//
// Fails when published text contains an internal identifier: a decision record,
// requirements document, feature or task number, an approval step name, an
// internal repository name, a local path, or an internal role name. Public
// pages explain decisions in their own words, so the fix is always to reword.
// There is deliberately no way to suppress a match.
//
// Scanned: src/content, src/data and samples (as source text), and the
// reader-visible text of every built dist/**/*.html page.

import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { htmlText } from './lib/html-text.mjs';
import { listFiles, readText, lineIndex } from './lib/files.mjs';

// Identifiers are matched in any case. "Word boundary" here means a character
// that is not a letter or digit, so `_t03`, `polyjose_brain` and `ADR_0019`
// count too (`\b` treats `_` as part of a word).
const L = '(?<![a-z0-9])';
const R = '(?![a-z0-9])';
// What may join a word to its number: whitespace, `_`, `/`, `#`, and the
// hyphen and dash characters (U+2010 hyphen, U+2011 non-breaking hyphen,
// U+2012..U+2015 figure, en and em dashes and the horizontal bar).
const SEP = '[\\s_\\-\\u2010-\\u2015/#]';
// What may join the words of a multi-word term.
const JOIN = '[\\s_\\-\\u2010-\\u2015]+';

const p = (source, label, flags = 'gi') => ({ re: new RegExp(source, flags), label });

export const PATTERNS = [
  // `adr/1…` also covers a path into the records directory with a long number.
  p(`${L}adr(?:${SEP}?\\d{1,4}${R}|/\\d)`, 'decision record number'),
  p(`${L}prds?(?:${SEP}?\\d+${R}|/\\d)`, 'requirements document number'),
  p(`${L}features?${SEP}?\\d{4}${R}`, 'feature number'),
  // Task and batch numbers, alone or inside a branch name. `b64` (the RFC 7797
  // header parameter) is not one.
  p(`${L}t\\d{2}${R}`, 'task number'),
  p(`${L}b(?!64${R})\\d{2}${R}`, 'batch number'),
  p(`${L}gate${SEP}?[1-3]${R}`, 'approval step name'),
  p(`${L}brain${R}`, 'internal repository name'),
  p('/Users/', 'local file path', 'g'),
  // A local home directory, but not the same text inside a URL path, where it
  // follows a host name or a path segment.
  p('(?<![\\w.%~+@-])/home/', 'local file path'),
  p('(?<![\\w.%~+@/-])~/', 'local file path'),
  p(`${L}[a-z]:\\\\{1,2}users${R}`, 'local file path'),
  p('\\.worktrees\\b', 'local worktree path'),
  p(`${L}orchestrators?${R}`, 'internal role name'),
  p(`${L}code${SEP}?agents?${R}`, 'internal role name'),
  p(`${L}(?:planner|tester)${JOIN}agents?${R}`, 'internal role name'),
  p(`${L}owner${JOIN}directives?${R}`, 'internal process term'),
  p(`${L}overnight${JOIN}delegations?${R}`, 'internal process term'),
];

// Characters that render as nothing (soft hyphen, zero-width space, joiners,
// direction marks, word joiner and invisible operators, byte-order mark). They
// are removed before matching, so they can't split an identifier.
const INVISIBLE = /[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]/;

/** `text` without invisible characters, and a map from its indexes back to `text`'s. */
function visible(text) {
  if (!INVISIBLE.test(text)) return { clean: text, origin: (i) => i };
  let clean = '';
  const at = [];
  for (let i = 0; i < text.length; i++) {
    if (INVISIBLE.test(text[i])) continue;
    clean += text[i];
    at.push(i);
  }
  return { clean, origin: (i) => at[i] ?? text.length };
}

const SOURCE_DIRS = ['src/content', 'src/data', 'samples'];
const SKIP_NAMES = new Set(['node_modules', 'target', 'build', '.build', '.generated', '.git']);
// The polyjose checkout the sample runner clones in CI is not our text.
const SKIP_PATHS = new Set(['samples/.polyjose']);

/** Every internal identifier in `text`, in order of position. */
export function findPrivateRefs(text) {
  const lineOf = lineIndex(text);
  const { clean, origin } = visible(text);
  const found = [];
  for (const { re, label } of PATTERNS) {
    for (const m of clean.matchAll(re)) {
      const index = origin(m.index);
      found.push({ index, line: lineOf(index), match: m[0], label });
    }
  }
  return found.sort((a, b) => a.index - b.index).map(({ index, ...f }) => f);
}

/**
 * Scans the site under `root`. Returns the findings (sorted by file, then line)
 * and the number of text files scanned. Throws when there is no built site.
 */
export function scanSite(root) {
  if (!existsSync(join(root, 'dist'))) {
    throw new Error('dist/ not found: run `npm run build` first, so the built pages are checked too.');
  }
  const files = [
    ...SOURCE_DIRS.flatMap((d) => listFiles(root, d, { skipNames: SKIP_NAMES, skipPaths: SKIP_PATHS })),
    ...listFiles(root, 'dist').filter((f) => f.endsWith('.html')),
  ];
  const findings = [];
  let scanned = 0;
  for (const file of files) {
    const raw = readText(join(root, file));
    if (raw === null) continue;
    scanned++;
    const text = file.startsWith('dist/') ? htmlText(raw) : raw;
    for (const f of findPrivateRefs(text)) findings.push({ file, ...f });
  }
  findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return { findings, scanned };
}

function main(argv) {
  const at = argv.indexOf('--root');
  const root = at === -1 ? resolve(import.meta.dirname, '../..') : resolve(argv[at + 1]);
  let result;
  try {
    result = scanSite(root);
  } catch (err) {
    console.error(`lint:refs: ${err.message}`);
    return 2;
  }
  const { findings, scanned } = result;
  for (const f of findings) {
    console.error(`${f.file}:${f.line}: internal identifier "${f.match}" (${f.label})`);
  }
  if (findings.length > 0) {
    console.error(
      `\nlint:refs: ${findings.length} internal identifier(s) in ${scanned} files. ` +
        'Public text must not refer to internal identifiers or local paths; reword it in your own words.',
    );
    return 1;
  }
  console.log(`lint:refs: no internal identifiers in ${scanned} files.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
