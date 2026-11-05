// @ts-check
/**
 * Turns the sample files into what a page shows: one tab per platform.
 *
 * Every five-platform sample renders exactly these tabs, with these labels, in
 * this order. Starlight syncs tab groups by label, so a reader who picks
 * Swift once sees Swift in every group, on every page. The labels must never
 * vary between pages.
 *
 * - Rust, Kotlin and Swift come from `samples/rust`, `samples/kotlin` and
 *   `samples/swift`.
 * - Node.js comes from `samples/js`, written against `@polyjose/node`.
 * - Web is the same `samples/js` region with the import specifier rewritten
 *   to `@polyjose/wasm` (the two packages share one API), unless
 *   `samples/web` defines the same id, which then wins.
 * - A platform that deliberately lacks a capability is listed in
 *   `unavailable` with a key into `src/data/unavailable.json`, so the reason
 *   is worded the same everywhere.
 *
 * Pure functions only: callers pass file contents in.
 */

import { extractRegions, REGION_ID } from './extract.mjs';

/**
 * @typedef {'rust' | 'node' | 'web' | 'kotlin' | 'swift'} PlatformKey
 * @typedef {{ key: PlatformKey, label: string, dir: string, extensions: string[] }} Platform
 */

/** @type {readonly Platform[]} */
export const PLATFORMS = Object.freeze([
  { key: 'rust', label: 'Rust', dir: 'rust', extensions: ['.rs'] },
  { key: 'node', label: 'Node.js', dir: 'js', extensions: ['.mjs', '.ts'] },
  { key: 'web', label: 'Web', dir: 'web', extensions: ['.mjs', '.ts'] },
  { key: 'kotlin', label: 'Kotlin', dir: 'kotlin', extensions: ['.kt'] },
  { key: 'swift', label: 'Swift', dir: 'swift', extensions: ['.swift'] },
]);

const PLATFORM_KEYS = PLATFORMS.map((p) => p.key);

/** Code languages for `<Code lang>`, by file extension. */
const LANG_BY_EXTENSION = /** @type {Record<string, string>} */ ({
  '.rs': 'rust',
  '.mjs': 'js',
  '.ts': 'ts',
  '.kt': 'kotlin',
  '.swift': 'swift',
});

/** Directories that hold build output, dependencies or generated copies, never sample sources. */
const SKIPPED_DIRS = new Set(['node_modules', 'target', 'build', '.build', '.generated', '.polyjose']);

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A problem with samples that must stop the build. */
export class SamplesError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SamplesError';
  }
}

/**
 * @typedef {object} PlatformRegion
 * @property {string} id
 * @property {string} code
 * @property {string} lang
 * @property {string} file       Path relative to the docs repository, such as `samples/rust/tests/guide.rs`.
 * @property {number} startLine
 *
 * @typedef {Record<PlatformKey, Map<string, PlatformRegion>>} Regions
 */

/** @param {string} path */
function locate(path) {
  const normalized = path.replace(/\\/g, '/');
  const match = /(?:^|\/)(samples\/([^/]+)\/(.+))$/.exec(normalized);
  if (!match) return null;
  const [, relative, dir, rest] = match;
  const platform = PLATFORMS.find((p) => p.dir === dir);
  if (!platform) return null;
  const segments = rest.split('/');
  if (segments.slice(0, -1).some((s) => SKIPPED_DIRS.has(s))) return null;
  const name = segments[segments.length - 1];
  const extension = platform.extensions.find((ext) => name.endsWith(ext));
  if (!extension) return null;
  return { platform, relative, lang: LANG_BY_EXTENSION[extension] };
}

/**
 * Whether a path is a sample source file: under `samples/<rust|js|web|kotlin|swift>/`,
 * with that platform's extension, and not inside fixtures, generated copies,
 * dependencies or build output.
 *
 * @param {string} path
 */
export function isSampleSource(path) {
  return locate(path) !== null;
}

/**
 * Extracts every region of every sample file, grouped by platform.
 *
 * Throws when a file has a marker error, or when one platform defines the
 * same id twice (in one file or in two).
 *
 * @param {Record<string, string>} files  Path to file contents. Paths may be
 *   absolute or relative; they're reported relative to the docs repository.
 * @returns {Regions}
 */
export function collectRegions(files) {
  /** @type {Regions} */
  const regions = /** @type {Regions} */ (Object.fromEntries(PLATFORM_KEYS.map((k) => [k, new Map()])));
  const located = Object.entries(files)
    .flatMap(([path, text]) => {
      const where = locate(path);
      return where ? [{ ...where, text }] : [];
    })
    .sort((a, b) => (a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0));

  for (const { platform, relative, lang, text } of located) {
    const map = regions[platform.key];
    for (const region of extractRegions(text, relative)) {
      const previous = map.get(region.id);
      if (previous) {
        throw new SamplesError(
          `${relative}:${region.startLine}: region ${JSON.stringify(region.id)} is already defined for ${platform.label} in ${previous.file}:${previous.startLine}`,
        );
      }
      map.set(region.id, { id: region.id, code: region.code, lang, file: relative, startLine: region.startLine });
    }
  }
  return regions;
}

/**
 * Rewrites `@polyjose/node` import specifiers to `@polyjose/wasm`: static
 * `import … from`, `export … from`, bare `import "…"` and dynamic
 * `import("…")`. Nothing else changes, not even the same text in comments or
 * other strings, and not other packages that share the prefix.
 *
 * @param {string} code
 */
export function toWebImports(code) {
  return code.replace(
    /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])@polyjose\/node\2/g,
    (_, lead, quote) => `${lead}${quote}@polyjose/wasm${quote}`,
  );
}

/**
 * Checks the table of reasons in `src/data/unavailable.json`.
 *
 * @param {unknown} table
 * @returns {Record<string, string>}
 */
export function validateReasons(table) {
  if (table === null || typeof table !== 'object' || Array.isArray(table)) {
    throw new SamplesError('src/data/unavailable.json must be an object of reason keys to reason text');
  }
  for (const [key, value] of Object.entries(table)) {
    if (!KEY_PATTERN.test(key)) {
      throw new SamplesError(`src/data/unavailable.json: key ${JSON.stringify(key)} must be lowercase words joined by dashes`);
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw new SamplesError(`src/data/unavailable.json: ${JSON.stringify(key)} must have non-empty reason text`);
    }
  }
  return /** @type {Record<string, string>} */ (table);
}

/** @param {string} key */
function platformByKey(key) {
  const platform = PLATFORMS.find((p) => p.key === key);
  if (!platform) {
    throw new SamplesError(`${JSON.stringify(key)} is not a platform; use one of ${PLATFORM_KEYS.join(', ')}`);
  }
  return platform;
}

/** @param {string} id */
function checkId(id) {
  if (typeof id !== 'string' || !REGION_ID.test(id)) {
    throw new SamplesError(
      `${JSON.stringify(id)} is not a valid sample id (lowercase letters, digits and dashes, in two or more "/"-separated parts, such as "jws/sign-compact")`,
    );
  }
}

/**
 * The region a platform shows for an id, or null. The Web tab falls back to
 * the Node.js region with its import specifiers rewritten.
 *
 * @param {Regions} regions
 * @param {PlatformKey} key
 * @param {string} id
 * @returns {PlatformRegion | null}
 */
function lookup(regions, key, id) {
  const own = regions[key].get(id);
  if (own) return own;
  if (key === 'web') {
    const node = regions.node.get(id);
    if (node) return { ...node, code: toWebImports(node.code) };
  }
  return null;
}

/** @param {Platform} platform */
function whereToDefine(platform) {
  return platform.key === 'web' ? 'samples/web or samples/js' : `samples/${platform.dir}`;
}

/**
 * @typedef {{ platform: PlatformKey, label: string, kind: 'code', code: string, lang: string, file: string }} CodeTab
 * @typedef {{ platform: PlatformKey, label: string, kind: 'unavailable', reasonKey: string, reason: string }} UnavailableTab
 * @typedef {CodeTab | UnavailableTab} Tab
 */

/**
 * Resolves the five tabs of a `<Samples>` block.
 *
 * Throws a {@link SamplesError} that names the id and every platform at
 * fault when a platform has neither the region nor an `unavailable` entry,
 * when an `unavailable` value isn't a key of the reasons table, when it names
 * an unknown platform, or when a platform marked unavailable defines the
 * region after all.
 *
 * @param {object} options
 * @param {string} options.id
 * @param {Regions} options.regions
 * @param {Record<string, string>} [options.unavailable]  Platform key to reason key.
 * @param {Record<string, string>} options.reasons        The reasons table.
 * @returns {Tab[]}
 */
export function resolveSamples({ id, regions, unavailable = {}, reasons }) {
  checkId(id);
  if (unavailable === null || typeof unavailable !== 'object' || Array.isArray(unavailable)) {
    throw new SamplesError(`Sample ${JSON.stringify(id)}: unavailable must be an object of platform to reason key`);
  }
  for (const key of Object.keys(unavailable)) {
    try {
      platformByKey(key);
    } catch (err) {
      throw new SamplesError(`Sample ${JSON.stringify(id)}: ${/** @type {Error} */ (err).message}`);
    }
  }

  /** @type {string[]} */
  const problems = [];
  /** @type {Tab[]} */
  const tabs = [];
  for (const platform of PLATFORMS) {
    const reasonKey = unavailable[platform.key];
    if (reasonKey !== undefined) {
      const own = regions[platform.key].get(id);
      if (own) {
        problems.push(
          `${platform.label} is marked unavailable, but ${own.file}:${own.startLine} defines the region; remove one of the two`,
        );
        continue;
      }
      if (typeof reasonKey !== 'string' || !Object.hasOwn(reasons, reasonKey)) {
        problems.push(
          `${platform.label}: ${JSON.stringify(reasonKey)} is not a key in src/data/unavailable.json (known keys: ${Object.keys(reasons).join(', ') || 'none'})`,
        );
        continue;
      }
      tabs.push({ platform: platform.key, label: platform.label, kind: 'unavailable', reasonKey, reason: reasons[reasonKey] });
      continue;
    }
    const region = lookup(regions, platform.key, id);
    if (!region) {
      problems.push(`${platform.label} (${whereToDefine(platform)}) has no region and no unavailable entry`);
      continue;
    }
    tabs.push({ platform: platform.key, label: platform.label, kind: 'code', code: region.code, lang: region.lang, file: region.file });
  }

  if (problems.length > 0) {
    throw new SamplesError(`Sample ${JSON.stringify(id)}:\n  - ${problems.join('\n  - ')}`);
  }
  return tabs;
}

/**
 * Resolves the region of a single-platform `<Sample>`.
 *
 * @param {object} options
 * @param {string} options.platform
 * @param {string} options.id
 * @param {Regions} options.regions
 * @returns {CodeTab}
 */
export function resolveSample({ platform: key, id, regions }) {
  const platform = platformByKey(key);
  checkId(id);
  const region = lookup(regions, platform.key, id);
  if (!region) {
    throw new SamplesError(`Sample ${JSON.stringify(id)}: ${platform.label} (${whereToDefine(platform)}) has no region`);
  }
  return { platform: platform.key, label: platform.label, kind: 'code', code: region.code, lang: region.lang, file: region.file };
}
