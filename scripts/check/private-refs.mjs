#!/usr/bin/env node
// npm run lint:refs
//
// Fails when published text contains an internal identifier: a decision record,
// requirements document, feature, batch or task number, an approval step name,
// an internal repository name, a local path, or an internal role or process
// term. Public pages explain decisions in their own words, so the fix is always
// to reword. There is deliberately no way to suppress a match.
//
// Scanned as source text: src/content, src/data, src/components, src/lib,
// samples, public and astro.config.mjs. Scanned from the built site: the
// reader-visible text of every dist/**/*.html page, the link and asset URLs of
// those pages (except built /_astro/ asset names), the other built text files
// (the sitemap, robots.txt, JSON and web manifests), and the content of every
// built script, style sheet, SVG image and source map, /_astro/ included.
//
// Two pattern sets (see PATTERNS). Text and source files get all of them.
// Minified assets (built ones and those in public/) and, as a backstop, the
// whole source of each built page (comments, inline scripts and styles, other
// attributes; hashed /_astro/ names left out) get only the unmistakable ones:
// decision record, requirements document and feature numbers, the repository
// name, local paths, and role and process terms. Short task, batch and fix
// numbers are everywhere in minified code (`t(19,…)`, `#f00`, `t12` in SVG
// paths), so they are matched only in text.

import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { htmlText } from './lib/html-text.mjs';
import { listFiles, readText, lineIndex } from './lib/files.mjs';
import { htmlUrlText, isAssetFile, listDistFiles, withoutAssetNames } from './lib/dist-files.mjs';
import { normalizeForMatch, normalizeWithMap } from './lib/normalize.mjs';

// Identifiers are matched in any case, on text folded by lib/normalize.mjs
// (NFKC and look-alike letters), so "ＡＤＲ 0019" or a Cyrillic "Т07" counts;
// a finding quotes the original text. "Word boundary" here means a character
// that is not a letter or digit, so `_t03`, `polyjose_brain` and `ADR_0019`
// count too (`\b` treats `_` as part of a word).
const L = '(?<![a-z0-9])';
const R = '(?![a-z0-9])';
// What may join a word to its number: whitespace, `_`, `/`, `#`, `.`, `:`,
// `(`, and the hyphen, dash and minus characters (U+2010 hyphen, U+2011
// non-breaking hyphen, U+2012..U+2015 figure, en and em dashes and the
// horizontal bar, U+2212 minus sign).
const SEP = '[\\s_\\-\\u2010-\\u2015\\u2212/#.:(]';
// "no.", "nr.", "num." or "number" between a word and its number.
const NUMWORD = `(?:n(?:o|r|um(?:ber)?)\\.?${SEP}{0,3})?`;
// What may join the words of a multi-word term.
const JOIN = '[\\s_\\-\\u2010-\\u2015]+';
const JOIN_OPT = '[\\s_\\-\\u2010-\\u2015]*';
// A hyphen or underscore join only, for terms whose spaced form is ordinary
// English ("ready for test", "deliver features").
const HYPHEN = '[_\\-\\u2010-\\u2015]';
// Home-directory folders of public tools, which install steps name.
const TOOL_DIR = '(?!\\.(?:cargo|gradle|npm|config)(?![\\w.-]))';

// `asset: true` marks the patterns that are also run on built script, style,
// image and source map files and on the whole source of each built page. Those
// are full of short names next to numbers (`t(19,…)`, `#f00`, `t12` in SVG
// path data), so the task, batch and fix numbers, the task/bug/fix words and
// the approval step names are matched only in text and source files.
const p = (source, label, { flags = 'gi', asset = true } = {}) => ({ re: new RegExp(source, flags), label, asset });
const textOnly = { asset: false };

export const PATTERNS = [
  // `adr/1…` also covers a path into the records directory with a long number.
  p(`${L}adrs?(?:${SEP}{0,3}${NUMWORD}\\d{1,4}${R}|/\\d)`, 'decision record number'),
  p(`${L}prds?(?:${SEP}{0,3}${NUMWORD}\\d+${R}|/\\d)`, 'requirements document number'),
  p(`${L}feat(?:ure)?s?(?:${SEP}{1,3}${NUMWORD}#?\\d{1,4}|\\d{4})${R}`, 'feature number'),
  // Task, batch and fix numbers, alone or inside a branch name. `b64` (the RFC
  // 7797 header parameter) is not one.
  p(`${L}t${SEP}?\\d{2,3}${R}`, 'task number', textOnly),
  p(`${L}b(?!64${R})${SEP}?\\d{2,3}${R}`, 'batch number', textOnly),
  p(`${L}f${SEP}?\\d{2,3}${R}`, 'fix number', textOnly),
  p(`${L}(?:tasks?|bugs?|fix)${SEP}{1,3}#?[tbf]?\\d{1,4}${R}`, 'task number', textOnly),
  p(`${L}gate${SEP}{0,3}[1-3]${R}`, 'approval step name', textOnly),
  p(`${L}brain${R}`, 'internal repository name'),
  // A macOS home directory in any case, but a lower-case `/users/` inside a URL
  // path (github.com/users/…) is not one.
  p('/Users/|(?<![\\w.%~+@-])/[Uu][Ss][Ee][Rr][Ss]/', 'local file path', { flags: 'g' }),
  // A local home directory, but not the same text inside a URL path, where it
  // follows a host name or a path segment.
  p('(?<![\\w.%~+@-])/home/', 'local file path'),
  // `~/` and `$HOME/`, except a public tool's folder (`~/.cargo`) and `cd ~/` itself.
  p(`(?<![\\w.%~+@/-])~/${TOOL_DIR}(?!(?<=${L}cd[ \\t]{1,4}~/)(?![^\\s"'\`;&|)]))`, 'local file path'),
  p(`\\$(?:home|\\{home\\})/${TOOL_DIR}`, 'local file path'),
  p(`${L}[a-z]:\\\\{1,2}users${R}`, 'local file path'),
  p('\\.worktrees\\b', 'local worktree path'),
  p(`${L}orchestrators?${R}`, 'internal role name'),
  p(`${L}code${SEP}?agents?${R}`, 'internal role name'),
  p(`${L}(?:planner|tester|release|lead|git${JOIN_OPT}ops)${JOIN}agents?${R}`, 'internal role name'),
  p(`${L}owner${JOIN}directives?${R}`, 'internal process term'),
  p(`${L}overnight${JOIN}delegations?${R}`, 'internal process term'),
  p(`${L}deliver${HYPHEN}features?${R}`, 'internal process term'),
  p(`${L}intake${JOIN}skills?${R}`, 'internal process term'),
  p(`${L}test(?:${HYPHEN}reports?${R}|\\s?reports?(?=/))`, 'internal process term'),
  p(`${L}ready${HYPHEN}for${HYPHEN}test${R}`, 'internal process term'),
  p(`${L}phase${JOIN}[ab](?:\\s*/\\s*[ab])?${JOIN}(?:security|code)${JOIN}reviews?${R}`, 'internal process term'),
];

const SOURCE_ROOTS = ['src/content', 'src/data', 'src/components', 'src/lib', 'samples', 'public', 'astro.config.mjs'];
const SKIP_NAMES = new Set(['node_modules', 'target', 'build', '.build', '.generated', '.git']);
// The polyjose checkout the sample runner clones in CI is not our text.
const SKIP_PATHS = new Set(['samples/.polyjose']);

/**
 * Every internal identifier in `text`, in order of position. Each finding
 * quotes the original text and its line. With `asset: true`, only the patterns
 * that are safe on minified code run (see PATTERNS). A match that lies inside
 * another one ("T03" in "task T03") is not reported again.
 */
export function findPrivateRefs(text, { asset = false } = {}) {
  const lineOf = lineIndex(text);
  const folded = normalizeWithMap(text);
  const found = [];
  for (const { re, label, asset: onAssets } of PATTERNS) {
    if (asset && !onAssets) continue;
    for (const m of folded.text.matchAll(re)) {
      const [start, end] = folded.toOriginal(m.index, m.index + m[0].length);
      found.push({ start, end, match: text.slice(start, end), label });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let reach = -1;
  for (const f of found) {
    if (f.end <= reach) continue;
    reach = Math.max(reach, f.end);
    out.push({ line: lineOf(f.start), match: f.match, label: f.label });
  }
  return out;
}

/**
 * Scans the site under `root`. Returns the findings (sorted by file, then line)
 * and the number of text files scanned. Throws when there is no built site.
 */
export function scanSite(root) {
  if (!existsSync(join(root, 'dist'))) {
    throw new Error('dist/ not found: run `npm run build` first, so the built pages are checked too.');
  }
  const sources = SOURCE_ROOTS.flatMap((d) => listFiles(root, d, { skipNames: SKIP_NAMES, skipPaths: SKIP_PATHS }));
  const dist = listDistFiles(root);
  const pages = new Set(dist.html);
  // Each file is read as one or more views, and every view is checked.
  const views = (file, raw) => {
    if (pages.has(file)) {
      return [
        { text: htmlText(raw), where: '' },
        { text: htmlUrlText(raw), where: ', in a link or asset URL' },
        { text: withoutAssetNames(raw), where: ', in the page source', asset: true, backstop: true },
      ];
    }
    return [{ text: raw, where: '', asset: isAssetFile(file) }];
  };
  const findings = [];
  let scanned = 0;
  for (const file of [...sources, ...dist.html, ...dist.text, ...dist.assets]) {
    const raw = readText(join(root, file));
    if (raw === null) continue;
    scanned++;
    // The page source repeats the page text and URLs: report only what they
    // did not already report on the same line.
    const seen = new Set();
    for (const { text, where, asset = false, backstop = false } of views(file, raw)) {
      for (const f of findPrivateRefs(text, { asset })) {
        const key = `${f.line}:${normalizeForMatch(f.match).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        if (backstop && seen.has(key)) continue;
        seen.add(key);
        findings.push({ file, ...f, label: f.label + where });
      }
    }
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
