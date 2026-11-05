// What lint:refs reads from the built site, beyond the reader-visible page text
// (lib/html-text.mjs): the URLs that pages link to or load, and the built files
// that are not HTML (the sitemap, robots.txt, JSON and web manifests).

import { listFiles } from './files.mjs';
import { decodeEntities, tokens } from './html-text.mjs';

/** Built files that are text but not HTML, by extension (any case). */
export const DIST_TEXT_EXTENSIONS = ['.xml', '.txt', '.json', '.webmanifest'];

const URL_ATTRS = new Set(['href', 'src', 'srcset']);

// Same attribute grammar as lib/html-text.mjs, read in order, so a quoted value
// that contains `href=` is consumed as a value and never read as an attribute.
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const extension = (file) => {
  const dot = file.lastIndexOf('.');
  return dot > file.lastIndexOf('/') ? file.slice(dot).toLowerCase() : '';
};

/**
 * The built pages (`html`) and the other built text files (`text`) under
 * `root`/dist, as root-relative paths with `/` separators, sorted.
 */
export function listDistFiles(root) {
  const html = [];
  const text = [];
  for (const file of listFiles(root, 'dist')) {
    const ext = extension(file);
    if (ext === '.html') html.push(file);
    else if (DIST_TEXT_EXTENSIONS.includes(ext)) text.push(file);
  }
  return { html, text };
}

/**
 * True for the URL of a built asset under the site's `_astro/` directory. Their
 * file names carry content hashes (`page.x-T12_ab.js`) that can look like an
 * identifier, and they name no page. Only the site's own asset path counts: an
 * `_astro` segment deeper in a path, or on another host, is still checked.
 */
export function isAssetUrl(url) {
  const m = /^(?:\.{1,2}\/)*\/?_astro\/(.+)$/.exec(url.trim());
  if (!m) return false;
  // A plain file path only: no `.` or `..` segment (which could climb out to a
  // page), no query, fragment or percent-encoding.
  const segments = m[1].split('/');
  return segments.every((s) => /^[\w.@~+-]+$/.test(s) && s !== '.' && s !== '..');
}

/** Percent-decodes a URL so `ADR%200019` reads as `ADR 0019`; keeps it as is when malformed. */
function percentDecoded(url) {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

/** The URLs in a `srcset` value: each candidate is a URL and an optional descriptor. */
const srcsetUrls = (value) =>
  value
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);

/** `{ offset, url }` for each link or asset URL in one tag's source text. */
function tagUrls(raw) {
  const name = /^<[a-zA-Z][^\s/>]*/.exec(raw);
  if (!name) return [];
  const body = raw.slice(name[0].length);
  const out = [];
  for (const m of body.matchAll(ATTR)) {
    const attr = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4];
    if (!URL_ATTRS.has(attr) || value === undefined) continue;
    const offset = name[0].length + m.index + m[0].length - value.length;
    const decoded = decodeEntities(value);
    for (const url of attr === 'srcset' ? srcsetUrls(decoded) : [decoded]) {
      if (!isAssetUrl(url)) out.push({ offset, url: percentDecoded(url).replace(/\s+/g, ' ') });
    }
  }
  return out;
}

/**
 * The `href`, `src` and `srcset` URLs of an HTML document, except built
 * `_astro/` assets, decoded (character references and percent-encoding). Each
 * URL sits on the line of the built file it came from, and nothing else is
 * kept, so a finding in this text reports the right line. Script, style and
 * comment bodies are not read.
 */
export function htmlUrlText(html) {
  let out = '';
  for (const t of tokens(html)) {
    const lines = t.raw.split('\n');
    if (t.type !== 'tag' || t.closing) {
      out += '\n'.repeat(lines.length - 1);
      continue;
    }
    const buckets = lines.map(() => []);
    for (const { offset, url } of tagUrls(t.raw)) {
      const line = (t.raw.slice(0, offset).match(/\n/g) || []).length;
      buckets[line].push(url);
    }
    out += buckets.map((urls) => (urls.length ? ` ${urls.join(' ')} ` : '')).join('\n');
  }
  return out;
}
