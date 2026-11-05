// @ts-check
/**
 * Region extractor for docs code samples.
 *
 * Code samples on the site are ordinary test files under `samples/<platform>/`.
 * The part a reader sees is marked with a pair of comment lines:
 *
 *     // docs:start sign-and-verify/hs256
 *     ...code shown on the page...
 *     // docs:end sign-and-verify/hs256
 *
 * Rust, JavaScript, TypeScript, Kotlin and Swift all use `//` line comments,
 * so one syntax serves every platform. A marker must be the whole line
 * (leading whitespace allowed). The marker lines are dropped and the common
 * indentation of the region is stripped.
 *
 * Pure functions only: no file system access, so the same code runs in the
 * Astro build and in the Node scripts.
 */

/** Region ids are lowercase path-like names with at least two segments, such as `jws/sign-compact`. */
export const REGION_ID = /^[a-z0-9-]+(\/[a-z0-9-]+)+$/;

const MARKER = /^\s*\/\/\s*docs:(start|end)(?:\s+(.*?))?\s*$/;
// A line that starts like a marker but is malformed, for example `// docs:startx`.
const MARKER_LIKE = /^\s*\/\/\s*docs:(?:start|end)/;

/**
 * @typedef {object} Region
 * @property {string} id      The region id.
 * @property {string} code    Region text, marker lines removed, dedented, no leading or trailing blank lines.
 * @property {string} file    The file the region came from, as given by the caller.
 * @property {number} startLine 1-based line of the `docs:start` marker.
 * @property {number} endLine   1-based line of the `docs:end` marker.
 */

/** An error in a sample file. The message starts with `file:line:` and names the region id. */
export class SampleRegionError extends Error {
  /**
   * @param {string} file
   * @param {number} line
   * @param {string | undefined} id
   * @param {string} message
   */
  constructor(file, line, id, message) {
    super(`${file}:${line}: ${message}`);
    this.name = 'SampleRegionError';
    this.file = file;
    this.line = line;
    this.id = id;
  }
}

/**
 * Removes the longest run of leading whitespace that every non-blank line
 * shares. Blank lines become empty and don't count.
 *
 * @param {string[]} lines
 * @returns {string}
 */
export function dedent(lines) {
  /** @type {string | null} */
  let prefix = null;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
    if (prefix === null) {
      prefix = indent;
      continue;
    }
    let i = 0;
    while (i < prefix.length && i < indent.length && prefix[i] === indent[i]) i++;
    prefix = prefix.slice(0, i);
  }
  const cut = prefix?.length ?? 0;
  return lines.map((line) => (line.trim() === '' ? '' : line.slice(cut))).join('\n');
}

/**
 * Extracts every marked region from one sample file.
 *
 * Throws a {@link SampleRegionError} naming the file, line and id for an
 * unbalanced marker, a nested or overlapping region, an id defined twice in
 * the file, an empty region, or an id that doesn't match {@link REGION_ID}.
 *
 * @param {string} text  File contents.
 * @param {string} file  Path used in error messages and in the result.
 * @returns {Region[]}   Regions in file order.
 */
export function extractRegions(text, file) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  /** @type {Region[]} */
  const regions = [];
  /** @type {Map<string, number>} */
  const seen = new Map();
  /** @type {{ id: string, line: number, body: string[] } | null} */
  let open = null;

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const match = MARKER.exec(line);
    if (!match) {
      if (MARKER_LIKE.test(line)) {
        throw new SampleRegionError(file, lineNo, undefined, `malformed docs marker: ${JSON.stringify(line.trim())}`);
      }
      if (open) open.body.push(line);
      return;
    }

    const kind = match[1];
    const rest = match[2] ?? '';
    if (rest === '') {
      throw new SampleRegionError(file, lineNo, undefined, `docs:${kind} marker needs an id`);
    }
    if (/\s/.test(rest)) {
      throw new SampleRegionError(file, lineNo, rest, `docs:${kind} marker takes exactly one id, got ${JSON.stringify(rest)}`);
    }
    const id = rest;
    if (!REGION_ID.test(id)) {
      throw new SampleRegionError(
        file,
        lineNo,
        id,
        `${JSON.stringify(id)} is not a valid region id (lowercase letters, digits and dashes, in two or more "/"-separated parts, such as "jws/sign-compact")`,
      );
    }

    if (kind === 'start') {
      if (open) {
        throw new SampleRegionError(
          file,
          lineNo,
          id,
          `region ${JSON.stringify(id)} starts while region ${JSON.stringify(open.id)} (from line ${open.line}) is still open; regions can't be nested or overlap`,
        );
      }
      const previous = seen.get(id);
      if (previous !== undefined) {
        throw new SampleRegionError(file, lineNo, id, `region ${JSON.stringify(id)} is already defined at line ${previous} of this file`);
      }
      seen.set(id, lineNo);
      open = { id, line: lineNo, body: [] };
      return;
    }

    // kind === 'end'
    if (!open) {
      throw new SampleRegionError(file, lineNo, id, `docs:end for region ${JSON.stringify(id)} has no matching docs:start`);
    }
    if (open.id !== id) {
      throw new SampleRegionError(
        file,
        lineNo,
        id,
        `docs:end for region ${JSON.stringify(id)} doesn't match: the open region is ${JSON.stringify(open.id)} (from line ${open.line}); regions can't overlap`,
      );
    }
    const body = trimBlankEdges(open.body);
    if (body.length === 0) {
      throw new SampleRegionError(file, open.line, id, `region ${JSON.stringify(id)} is empty`);
    }
    regions.push({ id, code: dedent(body), file, startLine: open.line, endLine: lineNo });
    open = null;
  });

  if (open) {
    const { id, line } = /** @type {{ id: string, line: number }} */ (open);
    throw new SampleRegionError(file, line, id, `region ${JSON.stringify(id)} is never closed (no docs:end ${id})`);
  }
  return regions;
}

/** @param {string[]} lines */
function trimBlankEdges(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end);
}
