#!/usr/bin/env node
// npm run lint:honesty
//
// Checks the reader-visible text of every built page against the site's
// honesty rules:
//   (a) every page carries the pre-1.0 notice (an element with the
//       data-prerelease-notice attribute, rendered by the site banner);
//   (b) no page says that polyjose is, was or has been audited: no independent
//       audit of polyjose itself has been published;
//   (c) the word "audited" appears only on the two pages that report the audit
//       status of the cryptographic primitives in the auditors' own terms;
//   (d) "constant-time" appears only on the security pages, where a claim is
//       quoted from, and linked to, the crate that documents it.

import { join, resolve, sep } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { htmlText, hasAttribute } from './lib/html-text.mjs';
import { listFiles, lineIndex } from './lib/files.mjs';

export const NOTICE_ATTRIBUTE = 'data-prerelease-notice';

/** The only pages that may use the word "audited" (rule c). */
export const AUDITED_PAGES = new Set(['/security/cryptographic-foundations/', '/about/why-polyjose/']);

/** "constant-time" may appear only on pages under this path (rule d). */
export const CONSTANT_TIME_PREFIX = '/security/';

const AUDIT_CLAIM =
  /polyjose[^.]{0,60}\b(is|has\s+been|was|are)\s+(independently\s+|professionally\s+)?audited\b/gi;
const AUDITED_WORD = /\baudited\b/gi;
// Spaces, line breaks and hyphens, including the non-breaking hyphen.
const CONSTANT_TIME = /constant[\s‐‑-]+time/gi;

/** The URL path a file in dist/ is served at. */
export function routeOf(distRelative) {
  const p = distRelative.split(sep).join('/');
  if (p === 'index.html') return '/';
  if (p.endsWith('/index.html')) return `/${p.slice(0, -'index.html'.length)}`;
  return `/${p}`;
}

/** Findings for one built page: `{ rule, line?, match?, message }`. */
export function checkPage(route, html) {
  const findings = [];
  if (!hasAttribute(html, NOTICE_ATTRIBUTE)) {
    findings.push({
      rule: 'prerelease-notice',
      message: 'no pre-1.0 notice. Every page must render the site banner, which carries it.',
    });
  }
  const text = htmlText(html);
  const lineOf = lineIndex(text);
  const each = (re, rule, message) => {
    for (const m of text.matchAll(re)) {
      findings.push({ rule, line: lineOf(m.index), match: m[0].replace(/\s+/g, ' '), message });
    }
  };
  each(
    AUDIT_CLAIM,
    'audit-claim',
    'says polyjose is audited. No independent audit of polyjose itself has been published; describe what is audited, and by whom, instead.',
  );
  if (!AUDITED_PAGES.has(route)) {
    each(
      AUDITED_WORD,
      'audited-word',
      `"audited" may appear only on ${[...AUDITED_PAGES].join(' and ')}, where audit status is reported in the auditors' terms.`,
    );
  }
  if (!route.startsWith(CONSTANT_TIME_PREFIX)) {
    each(
      CONSTANT_TIME,
      'constant-time',
      `constant-time behaviour may be described only on pages under ${CONSTANT_TIME_PREFIX}, quoting the crate that documents it.`,
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
      const what = f.match ? `"${f.match}" ${f.message}` : f.message;
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
