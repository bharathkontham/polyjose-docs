// A small HTML tokenizer for the build checks. It is enough for the HTML that
// Astro and Starlight emit; it is not a general-purpose parser.
//
// htmlText() returns what a reader sees: element text plus the attributes that
// carry human-readable text (alt, title, aria-label, placeholder and the meta
// descriptions). Everything else is removed: tags, other attribute values
// (so hashed asset names such as /_astro/page.T12x.js never reach the checks),
// <script> and <style> bodies, and comments. Line breaks are kept, so a match
// can be reported by its line in the built file.

const RAW_TEXT = new Set(['script', 'style']);

// Phrasing elements that don't separate words: "constant-<em>time</em>" reads
// as one word. Every other tag counts as a word break.
const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'ins', 'kbd',
  'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
]);

const READABLE_ATTRS = new Set(['alt', 'title', 'aria-label', 'aria-description', 'placeholder']);
const READABLE_META = new Set([
  'description', 'og:title', 'og:description', 'twitter:title', 'twitter:description',
]);

const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

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
  let i = 0;
  let text = '';
  const flush = function* () {
    if (text) yield { type: 'text', raw: text };
    text = '';
  };
  while (i < html.length) {
    const c = html[i];
    if (c !== '<' || !/[a-zA-Z/!?]/.test(html[i + 1] ?? '')) {
      text += c;
      i++;
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
      const close = html.toLowerCase().indexOf(`</${name}`, i);
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

/** The reader-visible text of an HTML document, with its line breaks kept. */
export function htmlText(html) {
  let out = '';
  for (const t of tokens(html)) {
    if (t.type === 'text') {
      out += decodeEntities(t.raw);
    } else if (t.type === 'skip') {
      out += newlines(t.raw);
    } else {
      const readable = t.closing ? [] : readableAttrs(t);
      const sep = INLINE.has(t.name) && readable.length === 0 ? '' : ' ';
      out += sep + readable.map((v) => decodeEntities(v) + ' ').join('') + newlines(t.raw);
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
