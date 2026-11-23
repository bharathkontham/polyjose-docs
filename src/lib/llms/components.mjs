// @ts-check
/**
 * The Markdown each docs component renders to (src/lib/llms/mdx.mjs), for
 * `/<slug>.md` and `/llms-full.txt`.
 *
 * - `<Sample>`, `<Samples>` and `<Install>` use the same pure functions as
 *   the components (src/lib/samples), so the Markdown shows exactly the code
 *   of the HTML page: one fenced block per platform, labelled like the tabs.
 * - `Tabs`/`TabItem` become labelled sections, `Aside` a blockquote,
 *   `LinkCard`/`CardGrid` a link list and `Badge` text.
 * - `AlgorithmMatrix`, `ErrorCodes` and `PrimitivesTable` become Markdown
 *   tables from src/data/*.json, with the columns of the HTML tables.
 * - The `{…}` expressions of concepts/standards.mdx are matched by their
 *   exact source, so a change to the page fails the build until this file
 *   follows it.
 *
 * Pure: the caller passes the regions, reasons, pins and data in.
 */

import { PLATFORMS, resolveSample, resolveSamples } from '../samples/resolve.mjs';
import { installSnippets, registryLinks } from '../samples/install.mjs';
import { pinPlatformFor } from '../samples/pins.mjs';
import { absoluteUrl, escapeHtml, normalizeExpression, MarkdownError } from './mdx.mjs';

/**
 * @typedef {import('./mdx.mjs').ComponentRenderer} ComponentRenderer
 * @typedef {import('./mdx.mjs').ExpressionRenderer} ExpressionRenderer
 * @typedef {import('./mdx.mjs').RenderContext} RenderContext
 * @typedef {import('../samples/resolve.mjs').Regions} Regions
 *
 * @typedef {object} Sources
 * @property {Regions} regions                     From src/components/samples/sources.ts.
 * @property {Record<string, string>} reasons       src/data/unavailable.json.
 * @property {(platform: string) => unknown} pinFor The pin for rust, js, kotlin or swift.
 * @property {any} algorithms                      src/data/algorithms.json.
 * @property {any} errorCodes                      src/data/error-codes.json.
 * @property {any} primitives                      src/data/primitives.json.
 * @property {any} standards                       src/data/standards.json.
 */

/**
 * A fenced code block, with a fence longer than any backtick run in the code.
 *
 * @param {string} code
 * @param {string} [lang]
 */
export function fence(code, lang) {
  const longest = Math.max(0, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = '`'.repeat(Math.max(3, longest + 1));
  return `${ticks}${lang ?? ''}\n${code}\n${ticks}`;
}

/** A block: a blank line before and after. */
const block = (/** @type {string[]} */ ...parts) => `\n\n${parts.filter(Boolean).join('\n\n')}\n\n`;

/** A bold label line, as the tab labels and code titles read on the HTML page. */
const label = (/** @type {string} */ text) => `**${text}**`;

/** Text for a Markdown table cell: one line, `|` escaped. */
const cell = (/** @type {string} */ text) => text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');

/** A Markdown table. */
function table(/** @type {string[]} */ head, /** @type {string[][]} */ rows) {
  const line = (/** @type {string[]} */ cells) => `| ${cells.map(cell).join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}

/** A data string in which `backticks` mark code, as HTML (`<code>`), escaped. */
const codeHtml = (/** @type {string} */ s) =>
  s
    .split('`')
    .map((text, i) => (i % 2 === 1 ? `<code>${escapeHtml(text)}</code>` : escapeHtml(text)))
    .join('');

/** Only these attributes, all quoted strings; `required` must be present. */
function attrs(/** @type {RenderContext} */ ctx, /** @type {string[]} */ allowed, /** @type {string[]} */ required = []) {
  for (const name of Object.keys(ctx.node.attrs)) {
    if (!allowed.includes(name)) throw ctx.error(`unknown attribute ${name}`);
  }
  /** @type {Record<string, string | undefined>} */
  const out = {};
  for (const name of allowed) {
    out[name] = ctx.attr(name);
    if (required.includes(name) && out[name] === undefined) throw ctx.error(`${name} is required`);
  }
  return out;
}

/** No children other than white space. */
function noChildren(/** @type {RenderContext} */ ctx) {
  if (ctx.node.children.some((c) => c.type !== 'text' || c.value.trim() !== '')) throw ctx.error('takes no children');
}

/**
 * The `unavailable` object literal of a `<Samples>`, such as
 * `{ node: "zip-bindings", web: "zip-bindings" }`. Only identifier keys and
 * string values.
 *
 * @param {RenderContext} ctx
 * @returns {Record<string, string> | undefined}
 */
function unavailableAttr(ctx) {
  const value = ctx.node.attrs.unavailable;
  if (value === undefined) return undefined;
  if (typeof value !== 'object') throw ctx.error('unavailable must be an {…} object');
  const body = /^\{([\s\S]*)\}$/.exec(value.expr.trim());
  if (!body) throw ctx.error('unavailable must be an object literal');
  /** @type {Record<string, string>} */
  const out = {};
  for (const entry of body[1].split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^([A-Za-z_]\w*)\s*:\s*(["'])([^"']*)\2$/.exec(entry);
    if (!m) throw ctx.error(`unavailable: can't read ${JSON.stringify(entry)}`);
    out[m[1]] = m[3];
  }
  return out;
}

/** The install snippets of one platform, as on <Install>. */
function installMarkdown(/** @type {string} */ platform, /** @type {Sources} */ sources) {
  const { snippets } = installSnippets(platform, sources.pinFor(pinPlatformFor(platform)));
  const links = registryLinks(platform)
    .map((link) => `[${link.label}](${link.href})`)
    .join(' · ');
  return block(...snippets.flatMap((s) => [s.title ? label(s.title) : '', fence(s.code, s.lang)]), `Registry: ${links}`);
}

/** The home page's link text to each get-started page, as on <PlatformSetup>. */
const PLATFORM_GUIDES = /** @type {Record<string, [string, string]>} */ ({
  rust: ['/start/rust/', 'Full guide for Rust →'],
  node: ['/start/node/', 'Full guide for Node.js →'],
  web: ['/start/web/', 'Full guide for the web →'],
  kotlin: ['/start/android/', 'Full guide for Android and the JVM →'],
  swift: ['/start/swift/', 'Full guide for Swift →'],
});

/** The import region each platform's <PlatformSetup> tab shows. */
const PLATFORM_IMPORTS = /** @type {Record<string, string>} */ ({
  rust: 'start/rust-imports',
  node: 'start/js-imports',
  web: 'start/js-imports',
  kotlin: 'start/kotlin-imports',
  swift: 'start/swift-imports',
});

/**
 * The renderers for every component the docs pages use.
 *
 * @param {Sources} sources
 * @returns {Record<string, ComponentRenderer>}
 */
export function markdownComponents(sources) {
  const { regions, reasons } = sources;
  return {
    Sample(ctx) {
      const a = attrs(ctx, ['platform', 'id', 'title'], ['platform', 'id']);
      noChildren(ctx);
      const s = resolveSample({ platform: /** @type {string} */ (a.platform), id: /** @type {string} */ (a.id), regions });
      return block(label(a.title ? `${s.label}: ${a.title}` : s.label), fence(s.code, s.lang));
    },
    Samples(ctx) {
      for (const name of Object.keys(ctx.node.attrs)) {
        if (!['id', 'title', 'unavailable'].includes(name)) throw ctx.error(`unknown attribute ${name}`);
      }
      noChildren(ctx);
      const id = ctx.attr('id');
      if (id === undefined) throw ctx.error('id is required');
      const title = ctx.attr('title');
      const tabs = resolveSamples({ id, regions, unavailable: unavailableAttr(ctx), reasons });
      return block(
        ...tabs.flatMap((tab) => [
          label(title ? `${tab.label}: ${title}` : tab.label),
          tab.kind === 'code' ? fence(tab.code, tab.lang) : `> **Not available in ${tab.label}**\n>\n> ${tab.reason}`,
        ]),
      );
    },
    Install(ctx) {
      const a = attrs(ctx, ['platform'], ['platform']);
      noChildren(ctx);
      return installMarkdown(/** @type {string} */ (a.platform), sources);
    },
    Tabs(ctx) {
      attrs(ctx, ['syncKey']);
      for (const child of ctx.node.children) {
        const ok = child.type === 'element' ? child.name === 'TabItem' : child.type === 'text' && child.value.trim() === '';
        if (!ok) throw ctx.error('children must be <TabItem> elements');
      }
      return block(ctx.children());
    },
    TabItem(ctx) {
      const a = attrs(ctx, ['label'], ['label']);
      const heading = label(/** @type {string} */ (a.label));
      const body = ctx.children().trim();
      // A <Sample> of the tab's own platform already starts with this label.
      return block(body.startsWith(`${heading}\n`) ? '' : heading, body);
    },
    Aside(ctx) {
      const a = attrs(ctx, ['type', 'title']);
      const type = a.type ?? 'note';
      const heading = a.title ?? type.charAt(0).toUpperCase() + type.slice(1);
      const body = ctx
        .children()
        .trim()
        .split('\n')
        .map((line) => (line === '' ? '>' : `> ${line}`))
        .join('\n');
      return block(`> ${label(heading)}\n>\n${body}`);
    },
    CardGrid(ctx) {
      attrs(ctx, []);
      for (const child of ctx.node.children) {
        const ok = child.type === 'element' ? child.name === 'LinkCard' : child.type === 'text' && child.value.trim() === '';
        if (!ok) throw ctx.error('children must be <LinkCard> elements');
      }
      return block(
        ctx
          .children()
          .split('\n')
          .filter((line) => line.trim() !== '')
          .join('\n'),
      );
    },
    LinkCard(ctx) {
      const a = attrs(ctx, ['title', 'href', 'description'], ['title', 'href']);
      noChildren(ctx);
      const href = absoluteUrl(/** @type {string} */ (a.href), ctx.page);
      return `\n- [${a.title}](${href})${a.description ? `: ${a.description}` : ''}\n`;
    },
    Badge(ctx) {
      const a = attrs(ctx, ['text', 'variant', 'size'], ['text']);
      noChildren(ctx);
      return `(${a.text})`;
    },
    AlgorithmMatrix(ctx) {
      const a = attrs(ctx, ['group'], ['group']);
      noChildren(ctx);
      return algorithmMatrix(sources.algorithms, /** @type {string} */ (a.group), ctx);
    },
    ErrorCodes(ctx) {
      attrs(ctx, []);
      noChildren(ctx);
      /** @type {{ code: string, meaning: string, causes: string[] }[]} */
      const codes = sources.errorCodes.codes;
      return block(
        label('Stable error codes, identical on every platform'),
        table(
          ['Code', 'Meaning', 'Typical causes'],
          codes.map((c) => [`\`${c.code}\``, c.meaning, c.causes.join('; ')]),
        ),
      );
    },
    PrimitivesTable(ctx) {
      attrs(ctx, []);
      noChildren(ctx);
      return primitivesTable(sources.primitives);
    },
    PlatformSetup(ctx) {
      attrs(ctx, []);
      noChildren(ctx);
      return block(
        ...PLATFORMS.map((p) => {
          const imports = resolveSample({ platform: p.key, id: PLATFORM_IMPORTS[p.key], regions });
          const [href, text] = PLATFORM_GUIDES[p.key];
          return block(
            label(p.label),
            installMarkdown(p.key, sources).trim(),
            fence(imports.code, imports.lang),
            `[${text}](${absoluteUrl(href, ctx.page)})`,
          ).trim();
        }),
      );
    },
  };
}

/** @typedef {{ rfc: number, section?: string }} Spec */

const rfcLink = (/** @type {Spec} */ spec) =>
  `[RFC ${spec.rfc}${spec.section ? ` §${spec.section}` : ''}](https://www.rfc-editor.org/rfc/rfc${spec.rfc}${spec.section ? `#section-${spec.section}` : ''})`;

/** Whether the first or second operation of a group works, per status (as in AlgorithmMatrix.astro). */
function supports(/** @type {string} */ status, /** @type {0 | 1} */ index) {
  if (status === 'yes') return true;
  if (status === 'verify-only') return index === 1;
  if (status === 'encrypt-only') return index === 0;
  return false;
}

/** One group of algorithms.json, with the columns of <AlgorithmMatrix>. */
function algorithmMatrix(/** @type {any} */ data, /** @type {string} */ id, /** @type {RenderContext} */ ctx) {
  const group = data.groups.find((/** @type {any} */ g) => g.id === id);
  if (!group) throw ctx.error(`no group ${JSON.stringify(id)} in algorithms.json`);
  const ops = /** @type {[string, string]} */ (group.operations).map((op) => op.charAt(0).toUpperCase() + op.slice(1));
  const notSupported = absoluteUrl('/security/not-supported/', ctx.page);
  const rows = group.rows.map((/** @type {any} */ row) => [
    `\`${row.name}\``,
    ...[0, 1].map((i) => (supports(row.status, /** @type {0 | 1} */ (i)) ? (row.availability ? `Yes, ${row.availability}` : 'Yes') : 'No')),
    row.key,
    [rfcLink(row.spec), row.level ? `${row.level}${row.levelSpec ? ` (${rfcLink(row.levelSpec)})` : ''}` : '']
      .filter(Boolean)
      .join(', '),
    [
      `${row.description}.`,
      row.recommended ? '**Recommended for new tokens.**' : '',
      row.deprecated ? '**Deprecated.**' : '',
      row.note ?? '',
      row.notSupported ? `[${row.status === 'no' ? 'Why it is not supported' : 'Why it is limited'}](${notSupported})` : '',
    ]
      .filter(Boolean)
      .join(' '),
  ]);
  return block(label(group.caption), table(['Identifier', ...ops, 'Key', 'Specification', 'Details'], rows));
}

/** The legend and the table of <PrimitivesTable>, from primitives.json. */
function primitivesTable(/** @type {any[]} */ primitives) {
  const labels = { audited: 'Audited', partial: 'Audited, earlier release' };
  const legend = [
    `- **${labels.audited}**: a public independent report covers the library.`,
    `- **${labels.partial}**: a public independent review exists, but it covered an earlier release line than the one polyjose uses, or it came before later fixes or a rewrite.`,
    '- **No public independent audit found**: no public independent audit of the library itself was found. These libraries are widely deployed.',
  ].join('\n');
  const rows = primitives.map((p) => {
    const audit = p.audit;
    let status;
    if (audit.status === 'none-found') {
      const m = /^(.*?[.:])\s+(.*)$/s.exec(audit.note);
      status = m ? `**${m[1]}** ${m[2]}` : `**${audit.note}**`;
    } else {
      const text = /** @type {Record<string, string>} */ (labels)[audit.status];
      if (!text) throw new MarkdownError(`primitives.json: ${p.crate}: unknown audit status ${JSON.stringify(audit.status)}`);
      status = `**${text}.** [${audit.by} report (${audit.year})](${audit.report}) ${audit.note}`;
    }
    return [`[\`${p.crate}\`](${p.repo})`, `\`${p.version}\``, p.upstream, p.license, p.purpose, status];
  });
  return block(
    legend,
    label(
      'The cryptographic libraries polyjose builds on, with the version polyjose locks, their upstream project, license, what polyjose uses each one for, and its public audit status',
    ),
    table(['Crate', 'Version', 'Upstream', 'License', 'What polyjose uses it for', 'Public audit status'], rows),
  );
}

/** The two `{…}` expressions of concepts/standards.mdx, by their exact source. */
const STANDARDS_RFCS = normalizeExpression(
  [
    'data.rfcs.map((s) => (',
    '<tr>',
    '<th scope="row">',
    '<a href={s.url}>RFC {s.rfc}</a>',
    '</th>',
    '<td>{s.title}</td>',
    '<td>',
    '{parts(s.implements)}',
    "{s.updatedBy.length > 0 && <> Updated by {s.updatedBy.map((n) => `RFC ${n}`).join(', ')}.</>}",
    '</td>',
    '</tr>',
    '))',
  ].join(' '),
);
const STANDARDS_ERRATA = normalizeExpression(
  [
    'data.errata.map((e) => (',
    '<p>',
    '<a href={e.url}>Erratum {e.eid}</a> on RFC {e.rfc} §{e.section} has the status <strong>{e.status}</strong>. {parts(e.summary)} polyjose follows the corrected text.',
    '</p>',
    '))',
  ].join(' '),
);

/**
 * The renderers for the page expressions, keyed by their normalized source.
 *
 * @param {Sources} sources
 * @returns {Record<string, ExpressionRenderer>}
 */
export function markdownExpressions(sources) {
  /** @type {{ rfc: number, title: string, url: string, updatedBy: number[], implements: string }[]} */
  const rfcs = sources.standards.rfcs;
  /** @type {{ eid: number, rfc: number, section: string, status: string, url: string, summary: string }[]} */
  const errata = sources.standards.errata;
  return {
    // Rows of the HTML table around the expression, which stays HTML.
    [STANDARDS_RFCS]: () =>
      rfcs
        .map((s) => {
          const updated = s.updatedBy.length > 0 ? ` Updated by ${s.updatedBy.map((n) => `RFC ${n}`).join(', ')}.` : '';
          return `<tr><th scope="row"><a href="${s.url}">RFC ${s.rfc}</a></th><td>${escapeHtml(s.title)}</td><td>${codeHtml(s.implements)}${updated}</td></tr>`;
        })
        .join('\n'),
    [STANDARDS_ERRATA]: () =>
      block(
        ...errata.map(
          (e) =>
            `[Erratum ${e.eid}](${e.url}) on RFC ${e.rfc} §${e.section} has the status **${e.status}**. ${e.summary} polyjose follows the corrected text.`,
        ),
      ),
  };
}
