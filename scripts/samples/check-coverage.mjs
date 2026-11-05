#!/usr/bin/env node
// @ts-check
/**
 * Sample coverage check (`npm run samples:coverage`).
 *
 * Reads every sample region under samples/ and every <Samples>/<Sample>
 * usage under src/content/docs/, and fails when:
 *
 * - a sample file has a marker error, or one platform defines an id twice
 * - a page uses an id that no platform defines
 * - a <Samples> block lacks a platform with no `unavailable` entry, or its
 *   `unavailable` names an unknown platform or a key missing from
 *   src/data/unavailable.json
 * - a region is defined but no page uses it (an orphan)
 * - <Sample> appears outside the get-started pages (start/)
 *
 * The build enforces the per-page rules as well; this check adds orphans and
 * the start/ rule, and runs without building the site.
 *
 * Usage: node scripts/samples/check-coverage.mjs [--root <docs repository>]
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLATFORMS, collectRegions, isSampleSource, resolveSamples, resolveSample, validateReasons } from '../../src/lib/samples/resolve.mjs';
import { findUsages } from './usages.mjs';

const DOCS = 'src/content/docs';
const SKIP_DIRS = new Set(['node_modules', 'target', 'build']);

/**
 * Files under `dir` (relative to `root`, with `/` separators), skipping dot
 * directories and dependency or build output directories. A missing
 * directory has no files.
 *
 * @param {string} root
 * @param {string} dir
 * @returns {string[]}
 */
function walk(root, dir) {
  /** @type {string[]} */
  const out = [];
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...walk(root, path));
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
  return out.sort();
}

/**
 * @param {string} root  The docs repository.
 * @returns {{ errors: string[], usages: number, regions: number }}
 */
export function checkCoverage(root) {
  /** @type {string[]} */
  const errors = [];

  /** @type {Record<string, string>} */
  let reasons = {};
  try {
    reasons = validateReasons(JSON.parse(readFileSync(join(root, 'src/data/unavailable.json'), 'utf8')));
  } catch (err) {
    errors.push(`src/data/unavailable.json: ${/** @type {Error} */ (err).message}`);
  }

  /** @type {Record<string, string>} */
  const files = {};
  for (const platform of PLATFORMS) {
    for (const path of walk(root, `samples/${platform.dir}`)) {
      if (isSampleSource(path)) files[path] = readFileSync(join(root, path), 'utf8');
    }
  }
  /** @type {import('../../src/lib/samples/resolve.mjs').Regions} */
  let regions;
  try {
    regions = collectRegions(files);
  } catch (err) {
    errors.push(/** @type {Error} */ (err).message);
    return { errors, usages: 0, regions: 0 };
  }
  const regionCount = PLATFORMS.reduce((n, p) => n + regions[p.key].size, 0);

  /** @type {import('./usages.mjs').Usage[]} */
  const usages = [];
  for (const path of walk(root, DOCS).filter((p) => p.endsWith('.mdx'))) {
    const found = findUsages(readFileSync(join(root, path), 'utf8'), path);
    usages.push(...found.usages);
    errors.push(...found.errors);
  }

  /** Region keys (`file:id`) that some page shows. */
  const used = new Set();
  const markAll = (/** @type {string} */ id) => {
    for (const p of PLATFORMS) {
      const r = regions[p.key].get(id);
      if (r) used.add(`${r.file}:${id}`);
    }
  };
  const definedAnywhere = (/** @type {string} */ id) => PLATFORMS.some((p) => regions[p.key].has(id));

  for (const usage of usages) {
    const at = `${usage.file}:${usage.line}:`;
    if (usage.component === 'Samples') {
      markAll(usage.id);
      const everyPlatformUnavailable = PLATFORMS.every((p) => usage.unavailable[p.key] !== undefined);
      if (!definedAnywhere(usage.id) && !everyPlatformUnavailable) {
        errors.push(`${at} <Samples id="${usage.id}"> is not defined on any platform (no docs:start ${usage.id} under samples/)`);
        continue;
      }
      try {
        resolveSamples({ id: usage.id, regions, unavailable: usage.unavailable, reasons });
      } catch (err) {
        errors.push(`${at} ${/** @type {Error} */ (err).message}`);
      }
      continue;
    }

    // <Sample>
    if (!relative(DOCS, usage.file).split(sep).join('/').startsWith('start/')) {
      errors.push(`${at} <Sample> is only for get-started pages (start/); use <Samples> here so every platform is shown`);
    }
    try {
      const sample = resolveSample({ platform: /** @type {string} */ (usage.platform), id: usage.id, regions });
      used.add(`${sample.file}:${usage.id}`);
    } catch (err) {
      errors.push(`${at} ${/** @type {Error} */ (err).message}`);
    }
  }

  for (const platform of PLATFORMS) {
    for (const region of regions[platform.key].values()) {
      if (!used.has(`${region.file}:${region.id}`)) {
        errors.push(`${region.file}:${region.startLine}: region "${region.id}" (${platform.label}) is not used on any page; use it or remove it`);
      }
    }
  }

  return { errors, usages: usages.length, regions: regionCount };
}

function main() {
  const args = process.argv.slice(2);
  let root = fileURLToPath(new URL('../../', import.meta.url));
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) {
      root = args[++i];
    } else {
      console.error('Usage: node scripts/samples/check-coverage.mjs [--root <docs repository>]');
      process.exit(2);
    }
  }
  const { errors, usages, regions } = checkCoverage(root);
  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    console.error(`\nSample coverage failed: ${errors.length} problem${errors.length === 1 ? '' : 's'}.`);
    process.exit(1);
  }
  console.log(`Sample coverage OK: ${usages} usage${usages === 1 ? '' : 's'}, ${regions} region${regions === 1 ? '' : 's'}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
