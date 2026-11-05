import { readdirSync, readFileSync, existsSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Lists the regular files under `dir`, relative to `root` with `/` separators,
 * sorted. Directories whose name is in `skipNames`, or whose root-relative path
 * is in `skipPaths`, are not entered. Symbolic links are not followed. When
 * `dir` is itself a regular file, the list is just that file.
 */
export function listFiles(root, dir, { skipNames = new Set(), skipPaths = new Set() } = {}) {
  const start = join(root, dir);
  if (!existsSync(start)) return [];
  const self = lstatSync(start);
  if (self.isFile()) return [relative(root, start).split(sep).join('/')];
  if (!self.isDirectory()) return [];
  const out = [];
  const walk = (abs) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const child = join(abs, entry.name);
      const rel = relative(root, child).split(sep).join('/');
      if (entry.isDirectory()) {
        if (!skipNames.has(entry.name) && !skipPaths.has(rel)) walk(child);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  };
  walk(start);
  return out.sort();
}

/** Reads a file as UTF-8, or returns null when it looks binary (has a NUL byte). */
export function readText(path) {
  const buf = readFileSync(path);
  if (buf.subarray(0, 8192).includes(0)) return null;
  return buf.toString('utf8');
}

/** Maps a string index to its 1-based line number. */
export function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}
