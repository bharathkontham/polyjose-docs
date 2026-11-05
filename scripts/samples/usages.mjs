// @ts-check
/**
 * Finds `<Samples>` and `<Sample>` usages in an MDX page, for the coverage
 * check. Attribute values must be literals the check can read: `id` and
 * `platform` are strings, `unavailable` is an object literal of strings.
 * Code fences, inline code and comments are skipped, so a page can show the
 * component's syntax without using it.
 */

/**
 * @typedef {object} Usage
 * @property {'Samples' | 'Sample'} component
 * @property {string} file
 * @property {number} line
 * @property {string} id
 * @property {string | undefined} platform
 * @property {Record<string, string>} unavailable
 */

/** Replaces every character except newlines with a space, so offsets and line numbers stay the same. */
const blank = (/** @type {string} */ s) => s.replace(/[^\n]/g, ' ');

/** @param {string} text */
function maskNonContent(text) {
  let inFence = false;
  let masked = text
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return blank(line);
      }
      return inFence ? blank(line) : line;
    })
    .join('\n');
  masked = masked.replace(/\{\/\*[\s\S]*?\*\/\}/g, blank).replace(/<!--[\s\S]*?-->/g, blank);
  return masked.replace(/`[^`\n]*`/g, blank);
}

const TAG = /<(Samples|Sample)(?=[\s/>])((?:[^>"'{}]|"[^"]*"|'[^']*'|\{\{[\s\S]*?\}\}|\{[^{}]*\})*)\/?>/g;
const ATTR = /([A-Za-z_][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\{([\s\S]*?)\}\}|\{([^{}]*)\}))?/g;
const STRING_EXPR = /^\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)\s*$/;
const ENTRY = /^(?:([A-Za-z_]\w*)|"([^"]*)"|'([^']*)')\s*:\s*(?:"([^"]*)"|'([^']*)')$/;

/**
 * @param {string} body  The text between `{{` and `}}`.
 * @returns {Record<string, string> | null}  null when it isn't a plain object literal of strings.
 */
function parseObject(body) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of body.split(',')) {
    const entry = raw.trim();
    if (entry === '') continue;
    const m = ENTRY.exec(entry);
    if (!m) return null;
    out[m[1] ?? m[2] ?? m[3]] = m[4] ?? m[5];
  }
  return out;
}

/**
 * @param {string} text  MDX source.
 * @param {string} file  Path used in results and error messages.
 * @returns {{ usages: Usage[], errors: string[] }}
 */
export function findUsages(text, file) {
  const source = maskNonContent(text.replace(/\r\n?/g, '\n'));
  /** @type {Usage[]} */
  const usages = [];
  /** @type {string[]} */
  const errors = [];

  for (const tag of source.matchAll(TAG)) {
    const component = /** @type {'Samples' | 'Sample'} */ (tag[1]);
    const line = source.slice(0, tag.index).split('\n').length;
    const where = `${file}:${line}: <${component}>`;
    /** @type {Record<string, { value?: string, object?: string, expr?: string }>} */
    const attrs = {};
    for (const a of tag[2].matchAll(ATTR)) {
      const [, name, dq, sq, object, expr] = a;
      attrs[name] = { value: dq ?? sq, object, expr };
    }

    /** @param {string} name */
    const literal = (name) => {
      const attr = attrs[name];
      if (!attr) {
        errors.push(`${where} needs ${name === 'id' ? 'an' : 'a'} ${name}`);
        return undefined;
      }
      if (attr.value !== undefined) return attr.value;
      const m = attr.expr !== undefined ? STRING_EXPR.exec(attr.expr) : null;
      if (m) return m[1] ?? m[2] ?? m[3];
      errors.push(`${where} ${name} must be a string literal, so the coverage check can read it`);
      return undefined;
    };

    const id = literal('id');
    const platform = component === 'Sample' ? literal('platform') : undefined;
    /** @type {Record<string, string>} */
    let unavailable = {};
    const u = attrs.unavailable;
    if (u) {
      const parsed = u.object !== undefined ? parseObject(u.object) : null;
      if (parsed) {
        unavailable = parsed;
      } else {
        errors.push(`${where} unavailable must be an object literal of platform to reason key, such as {{ kotlin: "zip-bindings" }}`);
        continue;
      }
    }
    if (id === undefined || (component === 'Sample' && platform === undefined)) continue;
    usages.push({ component, file, line, id, platform, unavailable });
  }
  return { usages, errors };
}
