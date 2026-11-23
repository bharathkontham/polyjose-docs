// @ts-check
/**
 * Turns the MDX source of a docs page into plain Markdown for LLM readers
 * (llmstxt.org): `/<slug>.md`, `/llms-full.txt`.
 *
 * Not a full MDX parser. It knows the subset the docs pages use:
 *
 * - top-level `import` and `export` blocks, which are dropped;
 * - fenced code blocks and inline code, which are copied as they are, so a
 *   `<String>` or `{` inside code is never read as JSX;
 * - components (`<Name …/>` or `<Name …>children</Name>`, the name starting
 *   with a capital letter), each rendered by a function from `components`;
 * - `{…}` expressions: JSX comments are dropped, string literals become
 *   their text, and any other expression must be listed in `expressions`;
 * - everything else (Markdown and lowercase HTML such as `<table>`) is kept,
 *   with links to this site made absolute.
 *
 * An unknown component or expression throws, naming the page, so a new
 * component can never be dropped from the Markdown without the build
 * noticing.
 *
 * Pure functions only: callers pass the source and the renderers in.
 */

/** The site's origin; internal links in the Markdown point here. */
export const SITE = 'https://polyjose.dev';

/** An MDX construct the Markdown renderer can't map. The build fails with it. */
export class MarkdownError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'MarkdownError';
  }
}

/**
 * @typedef {string | { expr: string } | true} AttrValue
 * @typedef {{ type: 'text', value: string }} TextNode
 * @typedef {{ type: 'code', value: string }} CodeNode
 * @typedef {{ type: 'expr', source: string }} ExprNode
 * @typedef {{ type: 'element', name: string, attrs: Record<string, AttrValue>, children: Node[] }} ElementNode
 * @typedef {TextNode | CodeNode | ExprNode | ElementNode} Node
 *
 * @typedef {object} RenderContext
 * @property {string} page                 The page slug, for error messages and `#hash` links.
 * @property {ElementNode} node            The component being rendered.
 * @property {() => string} children       Its children, rendered.
 * @property {(name: string) => string | undefined} attr  A string attribute; throws for an expression.
 * @property {(message: string) => MarkdownError} error  An error that names the page and the component.
 *
 * @typedef {(ctx: RenderContext) => string} ComponentRenderer
 * @typedef {() => string} ExpressionRenderer
 */

/**
 * `/path` and `#hash` URLs made absolute; other URLs are kept.
 *
 * @param {string} url
 * @param {string} page  The slug of the page the URL is on.
 */
export function absoluteUrl(url, page) {
  if (url.startsWith('/') && !url.startsWith('//')) return `${SITE}${url}`;
  if (url.startsWith('#')) return `${pageUrl(page)}${url}`;
  return url;
}

/** The HTML URL of a page: `/` for the home page, `/<slug>/` for the others. @param {string} slug */
export function pageUrl(slug) {
  return slug === 'index' ? `${SITE}/` : `${SITE}/${slug}/`;
}

/** The Markdown URL of a page (the URL contract with the `alternate` link): `/index.md` or `/<slug>.md`. @param {string} slug */
export function markdownUrl(slug) {
  return `${SITE}/${slug}.md`;
}

/**
 * Drops MDX's top-level ESM: a block of lines that starts at column 0 with
 * `import ` or `export ` and runs to the next blank line. Lines inside fenced
 * code are never touched.
 *
 * @param {string} source
 */
export function stripEsm(source) {
  const out = [];
  /** @type {{ char: string, length: number } | null} */
  let fence = null;
  let inEsm = false;
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence) {
      out.push(line);
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    if (inEsm) {
      if (line.trim() === '') inEsm = false;
      else continue;
    }
    if (/^(?:import|export)\s/.test(line)) {
      inEsm = true;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) fence = { char: open[2][0], length: open[2].length };
    out.push(line);
  }
  return out.join('\n');
}

const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})/;

/** @param {string} line @param {{ char: string, length: number }} fence */
function closesFence(line, fence) {
  const m = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(line);
  return m !== null && m[1][0] === fence.char && m[1].length >= fence.length;
}

/**
 * Parses MDX body text (without front matter and ESM) into nodes.
 *
 * @param {string} source
 * @param {string} page  The page slug, for error messages.
 * @returns {Node[]}
 */
export function parse(source, page) {
  let pos = 0;
  const fail = (/** @type {string} */ message) => {
    const line = source.slice(0, pos).split('\n').length;
    return new MarkdownError(`${page}.mdx:${line}: ${message}`);
  };

  /** Index just past the `}` matching the `{` at `start`, skipping strings and comments. */
  const balanced = (/** @type {number} */ start) => {
    let depth = 0;
    for (let i = start; i < source.length; i++) {
      const c = source[i];
      if (c === '"' || c === "'" || c === '`') {
        let j = i + 1;
        while (j < source.length && source[j] !== c) j += source[j] === '\\' ? 2 : 1;
        i = j;
      } else if (c === '/' && source[i + 1] === '*') {
        const end = source.indexOf('*/', i + 2);
        if (end < 0) break;
        i = end + 1;
      } else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return i + 1;
    }
    pos = start;
    throw fail('unclosed `{` expression');
  };

  /** @returns {ElementNode} */
  const element = () => {
    const name = /** @type {RegExpExecArray} */ (/^<([A-Z][\w.]*)/.exec(source.slice(pos)))[1];
    pos += name.length + 1;
    /** @type {Record<string, AttrValue>} */
    const attrs = {};
    for (;;) {
      const ws = /^\s*/.exec(source.slice(pos));
      pos += ws ? ws[0].length : 0;
      if (source.startsWith('/>', pos)) {
        pos += 2;
        return { type: 'element', name, attrs, children: [] };
      }
      if (source[pos] === '>') {
        pos += 1;
        return { type: 'element', name, attrs, children: nodes(name) };
      }
      const attr = /^([A-Za-z_][\w:.-]*)/.exec(source.slice(pos));
      if (!attr) throw fail(`<${name}>: can't read an attribute at ${JSON.stringify(source.slice(pos, pos + 20))}`);
      pos += attr[1].length;
      if (source[pos] !== '=') {
        attrs[attr[1]] = true;
        continue;
      }
      pos += 1;
      const quote = source[pos];
      if (quote === '"' || quote === "'") {
        const end = source.indexOf(quote, pos + 1);
        if (end < 0) throw fail(`<${name}>: unclosed ${attr[1]} value`);
        attrs[attr[1]] = source.slice(pos + 1, end);
        pos = end + 1;
      } else if (quote === '{') {
        const end = balanced(pos);
        attrs[attr[1]] = { expr: source.slice(pos + 1, end - 1).trim() };
        pos = end;
      } else {
        throw fail(`<${name}>: ${attr[1]} needs a quoted or {…} value`);
      }
    }
  };

  /** @param {string | null} close  The component whose children these are. @returns {Node[]} */
  const nodes = (close) => {
    /** @type {Node[]} */
    const out = [];
    let text = '';
    const flush = () => {
      if (text) out.push({ type: 'text', value: text });
      text = '';
    };
    while (pos < source.length) {
      const atLineStart = pos === 0 || source[pos - 1] === '\n';
      if (atLineStart) {
        const lineEnd = source.indexOf('\n', pos) < 0 ? source.length : source.indexOf('\n', pos);
        const open = FENCE_OPEN.exec(source.slice(pos, lineEnd));
        if (open) {
          const fence = { char: open[2][0], length: open[2].length };
          let end = lineEnd;
          for (;;) {
            if (end >= source.length) throw fail('unclosed fenced code block');
            const next = source.indexOf('\n', end + 1) < 0 ? source.length : source.indexOf('\n', end + 1);
            const line = source.slice(end + 1, next);
            end = next;
            if (closesFence(line, fence)) break;
          }
          flush();
          out.push({ type: 'code', value: source.slice(pos, end) });
          pos = end;
          continue;
        }
      }
      const c = source[pos];
      if (c === '`') {
        const run = /^`+/.exec(source.slice(pos))?.[0] ?? '`';
        const close = new RegExp(`(?<!\`)${run}(?!\`)`, 'g');
        close.lastIndex = pos + run.length;
        const m = close.exec(source);
        if (m) {
          flush();
          out.push({ type: 'code', value: source.slice(pos, m.index + run.length) });
          pos = m.index + run.length;
        } else {
          text += run;
          pos += run.length;
        }
        continue;
      }
      if (c === '\\' && pos + 1 < source.length) {
        text += source.slice(pos, pos + 2);
        pos += 2;
        continue;
      }
      if (c === '<' && source[pos + 1] === '/' && /[A-Z]/.test(source[pos + 2] ?? '')) {
        const m = /^<\/([A-Z][\w.]*)\s*>/.exec(source.slice(pos));
        if (!m) throw fail(`malformed closing tag ${JSON.stringify(source.slice(pos, pos + 20))}`);
        if (m[1] !== close) throw fail(`</${m[1]}> closes nothing${close ? ` (inside <${close}>)` : ''}`);
        flush();
        pos += m[0].length;
        return out;
      }
      if (c === '<' && /[A-Z]/.test(source[pos + 1] ?? '')) {
        flush();
        out.push(element());
        continue;
      }
      if (c === '{') {
        const end = balanced(pos);
        flush();
        out.push({ type: 'expr', source: source.slice(pos + 1, end - 1).trim() });
        pos = end;
        continue;
      }
      text += c;
      pos += 1;
    }
    if (close) throw fail(`<${close}> is never closed`);
    flush();
    return out;
  };

  return nodes(null);
}

/** `<`, `>` and `&` as character references, so literal text stays text inside HTML and Markdown. @param {string} text */
export function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** An expression's source with white space collapsed, the form `expressions` is keyed by. @param {string} source */
export function normalizeExpression(source) {
  return source.replace(/\s+/g, ' ').trim();
}

/**
 * Markdown and HTML text with every link to this site made absolute:
 * `[text](/path)`, `[text](#hash)` and `href="/path"`.
 *
 * @param {string} text
 * @param {string} page
 */
export function absoluteLinks(text, page) {
  return text
    .replace(/\]\(([/#][^)\s]*)/g, (_, url) => `](${absoluteUrl(url, page)}`)
    .replace(/\bhref=(["'])([/#][^"']*)\1/g, (_, q, url) => `href=${q}${absoluteUrl(url, page)}${q}`);
}

/**
 * Renders parsed nodes to Markdown.
 *
 * @param {Node[]} nodes
 * @param {object} options
 * @param {string} options.page
 * @param {Record<string, ComponentRenderer>} options.components
 * @param {Record<string, ExpressionRenderer>} [options.expressions]  Keyed by {@link normalizeExpression}.
 * @returns {string}
 */
export function render(nodes, { page, components, expressions = {} }) {
  const each = (/** @type {Node[]} */ list) => list.map(one).join('');
  /** @param {Node} node @returns {string} */
  function one(node) {
    switch (node.type) {
      case 'text':
        return absoluteLinks(node.value, page);
      case 'code':
        return node.value;
      case 'expr': {
        if (/^\/\*[\s\S]*\*\/$/.test(node.source)) return '';
        const literal = /^(["'])((?:(?!\1)[^\\]|\\.)*)\1$/.exec(node.source);
        if (literal) return escapeHtml(literal[2].replace(/\\(.)/g, '$1'));
        const known = expressions[normalizeExpression(node.source)];
        if (known) return known();
        const short = normalizeExpression(node.source).slice(0, 60);
        throw new MarkdownError(`${page}: no Markdown for the expression {${short}}; add it to src/lib/llms/components.mjs`);
      }
      case 'element': {
        const renderer = Object.hasOwn(components, node.name) ? components[node.name] : undefined;
        if (!renderer) {
          throw new MarkdownError(`${page}: no Markdown for the component <${node.name}>; add it to src/lib/llms/components.mjs`);
        }
        const error = (/** @type {string} */ message) => new MarkdownError(`${page}: <${node.name}>: ${message}`);
        return renderer({
          page,
          node,
          children: () => each(node.children),
          attr: (name) => {
            const value = node.attrs[name];
            if (value === undefined) return undefined;
            if (typeof value !== 'string') throw error(`${name} must be a quoted string`);
            return value;
          },
          error,
        });
      }
    }
  }
  return each(nodes);
}

/**
 * The Markdown for one page: `# title`, `> description`, then the body.
 *
 * @param {object} page
 * @param {string} page.slug
 * @param {string} page.title
 * @param {string | undefined} page.description
 * @param {string} page.body  MDX source without front matter.
 * @param {Record<string, ComponentRenderer>} components
 * @param {Record<string, ExpressionRenderer>} [expressions]
 */
export function pageMarkdown({ slug, title, description, body }, components, expressions) {
  const content = render(parse(stripEsm(body), slug), { page: slug, components, expressions });
  const head = [`# ${title}`, description ? `> ${description}` : ''].filter(Boolean).join('\n\n');
  return tidy(`${head}\n\n${content}`);
}

/**
 * Outside fenced code: trailing white space removed and at most one blank
 * line in a row. Code inside a fence is kept byte for byte. Ends with one
 * newline.
 *
 * @param {string} markdown
 */
export function tidy(markdown) {
  /** @type {string[]} */
  const out = [];
  /** @type {{ char: string, length: number } | null} */
  let fence = null;
  for (const line of markdown.split('\n')) {
    if (fence) {
      out.push(line);
      if (closesFence(line.replace(/^>\s?/, ''), fence)) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line.replace(/^>\s?/, ''));
    if (open) fence = { char: open[2][0], length: open[2].length };
    const trimmed = line.replace(/[ \t]+$/, '');
    if (trimmed === '' && out.length > 0 && out[out.length - 1] === '') continue;
    out.push(trimmed);
  }
  return `${out.join('\n').trim()}\n`;
}
