// A small HTML tokenizer for the build checks. It is enough for the HTML that
// Astro and Starlight emit; it is not a general-purpose parser.
//
// htmlText() returns what a reader sees: element text plus the attributes that
// carry human-readable text (alt, title, aria-label, placeholder and the meta
// descriptions). Everything else is removed: tags, other attribute values
// (so hashed asset names such as /_astro/page.T12x.js never reach the checks),
// <script> and <style> bodies, and comments. Line breaks are kept, so a match
// can be reported by its line in the built file.
//
// Characters that render as nothing (the soft hyphen and the zero-width
// characters) are removed from the text, so "audit&shy;ed" reads as "audited",
// as it does on screen.

const RAW_TEXT = new Set(['script', 'style']);

// Phrasing elements that don't separate words: "constant-<em>time</em>" reads
// as one word. Every other tag counts as a word break.
const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'ins', 'kbd',
  'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
]);

// Elements that start a new block of text. The `blockSeparator` option marks
// their boundaries, so a check can tell paragraphs, list items, headings and
// table cells apart. Other non-inline tags (br, img, button, ...) only break
// words.
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'dd', 'details', 'dialog', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header',
  'hgroup', 'hr', 'html', 'legend', 'li', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'summary',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'ul',
]);

// Elements that never have content or a closing tag (HTML, "void elements").
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

// U+00AD soft hyphen, U+200B zero width space, U+200C zero width non-joiner,
// U+200D zero width joiner, U+2060 word joiner, U+FEFF zero width no-break
// space. None of them is visible inside a word.
const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;

/** Removes the characters that render as nothing inside a word. */
export function stripInvisible(s) {
  return s.replace(INVISIBLE, '');
}

const READABLE_ATTRS = new Set(['alt', 'title', 'aria-label', 'aria-description', 'placeholder']);
const READABLE_META = new Set([
  'description', 'og:title', 'og:description', 'twitter:title', 'twitter:description',
]);

const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '\u00AD' };

/** Decodes the character references Astro emits (named basics and numeric). */
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(code) || code > 0x10ffff) return whole;
      const ch = String.fromCodePoint(code);
      return ch === ' ' ? ' ' : ch;
    }
    return NAMED[ref.toLowerCase()] ?? whole;
  });
}

const newlines = (s) => '\n'.repeat((s.match(/\n/g) || []).length);

function parseAttrs(source) {
  const attrs = new Map();
  for (const m of source.matchAll(ATTR)) {
    const name = m[1].toLowerCase();
    if (!attrs.has(name)) attrs.set(name, m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Index of the `>` that closes the tag starting at `start`, honouring quotes. */
function tagEnd(html, start) {
  let quote = null;
  for (let i = start + 1; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return html.length - 1;
}

/**
 * Splits HTML into text and tag tokens. Comments, doctypes and raw-text
 * element bodies come out as `skip` tokens.
 */
export function* tokens(html) {
  const lower = html.toLowerCase();
  let i = 0;
  let text = '';
  const flush = function* () {
    if (text) yield { type: 'text', raw: text };
    text = '';
  };
  while (i < html.length) {
    if (html[i] !== '<' || !/[a-zA-Z/!?]/.test(html[i + 1] ?? '')) {
      // Plain text runs up to the next '<' (which may itself be text).
      const next = html.indexOf('<', i + 1);
      const stop = next === -1 ? html.length : next;
      text += html.slice(i, stop);
      i = stop;
      continue;
    }
    yield* flush();
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      const stop = end === -1 ? html.length : end + 3;
      yield { type: 'skip', raw: html.slice(i, stop) };
      i = stop;
      continue;
    }
    const end = tagEnd(html, i);
    const raw = html.slice(i, end + 1);
    i = end + 1;
    if (raw[1] === '!' || raw[1] === '?') {
      yield { type: 'skip', raw };
      continue;
    }
    const m = /^<(\/?)([a-zA-Z][^\s/>]*)/.exec(raw);
    if (!m) {
      yield { type: 'skip', raw };
      continue;
    }
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const attrs = closing ? new Map() : parseAttrs(raw.slice(m[0].length, -1));
    yield { type: 'tag', raw, name, closing, attrs };
    if (!closing && RAW_TEXT.has(name)) {
      const close = lower.indexOf(`</${name}`, i);
      const stop = close === -1 ? html.length : close;
      yield { type: 'skip', raw: html.slice(i, stop) };
      i = stop;
    }
  }
  yield* flush();
}

function readableAttrs(tag) {
  const out = [];
  for (const [name, value] of tag.attrs) {
    if (READABLE_ATTRS.has(name) && value) out.push(value);
  }
  if (tag.name === 'meta') {
    const key = (tag.attrs.get('name') ?? tag.attrs.get('property') ?? '').toLowerCase();
    if (READABLE_META.has(key) && tag.attrs.get('content')) out.push(tag.attrs.get('content'));
  }
  return out;
}

/** True for a start tag that opens an element (not a void or self-closed one). */
function opens(tag) {
  return !tag.closing && !VOID.has(tag.name) && !/\/\s*>$/.test(tag.raw);
}

/**
 * Tracks the open elements, so a caller can tell when the element opened by a
 * given start tag ends. Astro closes its elements explicitly; a stray closing
 * tag with no open element of that name is ignored.
 */
class OpenElements {
  constructor() {
    this.stack = [];
  }
  /** Updates the stack for `tag` and returns the entries it closed. */
  step(tag, entry) {
    if (tag.closing) {
      const at = this.stack.map((e) => e.name).lastIndexOf(tag.name);
      return at === -1 ? [] : this.stack.splice(at).reverse();
    }
    if (opens(tag)) this.stack.push({ name: tag.name, ...entry });
    return [];
  }
  some(pred) {
    return this.stack.some(pred);
  }
}

/**
 * The reader-visible text of an HTML document, with its line breaks kept.
 *
 * Options:
 * - `blockSeparator` (default `' '`): written at each block element boundary.
 * - `skip(tag)`: when it returns true for a start tag, that element and all of
 *   its content contribute only their line breaks.
 */
export function htmlText(html, { blockSeparator = ' ', skip } = {}) {
  let out = '';
  const open = new OpenElements();
  for (const t of tokens(html)) {
    const skipping = open.some((e) => e.skip);
    if (t.type === 'text') {
      out += skipping ? newlines(t.raw) : stripInvisible(decodeEntities(t.raw));
    } else if (t.type === 'skip') {
      out += newlines(t.raw);
    } else {
      const skipped = skipping || (!t.closing && Boolean(skip?.(t)));
      open.step(t, { skip: skipped });
      if (skipped) {
        out += newlines(t.raw);
        continue;
      }
      // Each readable attribute value is a block of its own: an alt text or a
      // meta description does not run into the text around it.
      const readable = t.closing ? [] : readableAttrs(t);
      const sep = BLOCK.has(t.name) || readable.length > 0 ? blockSeparator : INLINE.has(t.name) ? '' : ' ';
      out += sep + readable.map((v) => stripInvisible(decodeEntities(v)) + blockSeparator).join('') + newlines(t.raw);
    }
  }
  return out;
}

/** True when some element in the document carries the attribute `name`. */
export function hasAttribute(html, name) {
  const want = name.toLowerCase();
  for (const t of tokens(html)) {
    if (t.type === 'tag' && !t.closing && t.attrs.has(want)) return true;
  }
  return false;
}

// Elements whose content is not shown: a <details> (even when open, since a
// reader can close it, and its summary with it), <noscript> (scripts run in
// the browsers that read the site), <template>, and a <dialog> that is not
// open.
const HIDING_ELEMENTS = new Set(['details', 'noscript', 'template']);

// Utility classes that hide an element from view, with any responsive prefix
// ("md:sl-hidden"): screen-reader-only text, and display or visibility utilities.
const HIDING_CLASS =
  /^(?:[\w-]+:)*(?:sl-)?(?:sr-only|visually-hidden|visuallyhidden|screen-reader-text|hidden|invisible)$/i;

// Inline style declarations that hide an element or shrink it to nothing.
// White space is removed before matching.
const ZERO = String.raw`(?:0+(?:\.0*)?|\.0+)(?:[a-z]+|%)?`;
const HIDING_STYLE = new RegExp(
  String.raw`(?:^|;)(?:display:none|visibility:(?:hidden|collapse)|content-visibility:hidden|opacity:${ZERO}|(?:max-)?(?:width|height):${ZERO}|font-size:${ZERO})(?:;|!|$)`,
);

/** The class names of a start tag or element. */
function classes(tag) {
  return (tag.attrs.get('class') ?? '').split(/\s+/).filter(Boolean);
}

/**
 * True when an element is not shown, and its content with it: it is one of
 * HIDING_ELEMENTS or a closed <dialog>; it has the `hidden` attribute (any
 * value) or `aria-hidden="true"`; it has a hiding utility class (sr-only,
 * visually-hidden, sl-sr-only, sl-hidden, ...); or its inline style sets
 * display:none, visibility:hidden or collapse, content-visibility:hidden,
 * opacity:0, a zero width, height, max-width, max-height or font-size.
 *
 * Accepts a start tag token or an element of `elementTree()`. Only the
 * element's own markup is read: rules in style sheets are not.
 */
export function isHidden(tag) {
  if (HIDING_ELEMENTS.has(tag.name) || (tag.name === 'dialog' && !tag.attrs.has('open'))) return true;
  if (tag.attrs.has('hidden')) return true;
  if ((tag.attrs.get('aria-hidden') ?? '').trim().toLowerCase() === 'true') return true;
  if (classes(tag).some((c) => HIDING_CLASS.test(c))) return true;
  const style = (tag.attrs.get('style') ?? '').toLowerCase().replace(/\s+/g, '');
  return HIDING_STYLE.test(style);
}

/**
 * The visible text of every element that carries the attribute `name`, in
 * document order. Elements that are hidden themselves, or sit inside a hidden
 * element (see `isHidden`), are left out, and so is the text of hidden
 * descendants. Only text content counts: attributes such as aria-label or
 * title are not visible text. Each text has its white space collapsed.
 */
export function visibleTexts(html, name) {
  const want = name.toLowerCase();
  const open = new OpenElements();
  const found = [];
  for (const t of tokens(html)) {
    if (t.type === 'text') {
      if (open.some((e) => e.hidden)) continue;
      const text = stripInvisible(decodeEntities(t.raw));
      for (const e of open.stack) if (e.capture) e.capture.text += text;
    } else if (t.type === 'tag') {
      const hidden = !t.closing && isHidden(t);
      const capture =
        !t.closing && !hidden && t.attrs.has(want) && !open.some((e) => e.hidden) ? { text: '' } : null;
      if (capture && !opens(t)) {
        found.push(capture);
        continue;
      }
      if (capture) found.push(capture);
      const sep = INLINE.has(t.name) ? '' : ' ';
      if (sep && !open.some((e) => e.hidden)) for (const e of open.stack) if (e.capture) e.capture.text += sep;
      open.step(t, { hidden, capture });
    }
  }
  return found.map((c) => c.text.replace(/\s+/g, ' ').trim());
}

/**
 * A light element tree of an HTML document, for checks that depend on where an
 * element sits. The root is `{ name: '#document', attrs, children, parent: null }`;
 * each element is `{ name, attrs, children, parent }` (`attrs` as in
 * `tokens()`); text is a `{ text }` child, decoded, with invisible characters
 * removed. Comments, doctypes and the bodies of <script> and <style> are left
 * out. Void and self-closed elements have no children. A closing tag closes
 * the elements left open inside it; a stray closing tag is ignored.
 */
export function elementTree(html) {
  const root = { name: '#document', attrs: new Map(), children: [], parent: null };
  const stack = [root];
  for (const t of tokens(html)) {
    const top = stack[stack.length - 1];
    if (t.type === 'text') {
      top.children.push({ text: stripInvisible(decodeEntities(t.raw)) });
    } else if (t.type === 'tag' && t.closing) {
      const at = stack.map((e) => e.name).lastIndexOf(t.name);
      if (at > 0) stack.length = at;
    } else if (t.type === 'tag') {
      const el = { name: t.name, attrs: t.attrs, children: [], parent: top };
      top.children.push(el);
      if (opens(t)) stack.push(el);
    }
  }
  return root;
}

/** The element children of a tree node, in document order. */
export function elementChildren(node) {
  return node.children.filter((c) => c.name !== undefined);
}

/** True when the element's class attribute contains the class `name`. */
export function hasClass(el, name) {
  return classes(el).includes(name);
}

/** True when neither the element nor any element around it is hidden (see `isHidden`). */
export function isRendered(el) {
  for (let e = el; e && e.parent; e = e.parent) if (isHidden(e)) return false;
  return true;
}

/**
 * The text an element shows: its text content without the text of hidden
 * descendants, with white space collapsed. Attributes such as aria-label, title
 * and alt are not shown text, so they are left out.
 */
export function visibleText(el) {
  const walk = (node) => {
    let out = '';
    for (const c of node.children) {
      if (c.name === undefined) out += c.text;
      else if (!isHidden(c)) {
        const sep = INLINE.has(c.name) ? '' : ' ';
        out += sep + walk(c) + sep;
      }
    }
    return out;
  };
  return walk(el).replace(/\s+/g, ' ').trim();
}
