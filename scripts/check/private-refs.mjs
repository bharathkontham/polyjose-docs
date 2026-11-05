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

export const PATTERNS = [
  { re: /\bADR[ -]?\d{1,4}\b/g, label: 'decision record number' },
  { re: /\bPRD[ -]?\d+\b/g, label: 'requirements document number' },
  { re: /\bfeatures?[ /]\d{4}\b/gi, label: 'feature number' },
  { re: /\bT\d{2}\b/g, label: 'task number' },
  { re: /\bGate [1-3]\b/g, label: 'approval step name' },
  { re: /-brain\b/gi, label: 'internal repository name' },
  { re: /\/Users\//g, label: 'local file path' },
  { re: /\.worktrees\b/g, label: 'local worktree path' },
  { re: /\borchestrator\b/gi, label: 'internal role name' },
  { re: /\bcode-agent\b/gi, label: 'internal role name' },
];

const SOURCE_DIRS = ['src/content', 'src/data', 'samples'];
const SKIP_NAMES = new Set(['node_modules', 'target', 'build', '.build', '.generated', '.git']);
// The polyjose checkout the sample runner clones in CI is not our text.
const SKIP_PATHS = new Set(['samples/.polyjose']);

/** Every internal identifier in `text`, in order of position. */
export function findPrivateRefs(text) {
  const lineOf = lineIndex(text);
  const found = [];
  for (const { re, label } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      found.push({ index: m.index, line: lineOf(m.index), match: m[0], label });
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
