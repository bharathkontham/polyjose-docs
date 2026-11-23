// @ts-check
/**
 * `/llms.txt` and `/llms-full.txt` (llmstxt.org), from the docs collection
 * and the sidebar order.
 *
 * Every sentence comes from a page's front matter: the index is titles,
 * descriptions and links, and nothing else.
 */

import { markdownUrl, MarkdownError } from './mdx.mjs';

/**
 * The sidebar groups and their pages, in the order of the `sidebar` in
 * astro.config.mjs (tests/data/llms.test.mjs checks that the two agree). The
 * Migrate subgroup is listed inside Guides, where the sidebar nests it. The
 * home page (`index`) is not in the sidebar.
 *
 * @type {readonly { label: string, slugs: readonly string[] }[]}
 */
export const SIDEBAR = Object.freeze([
  { label: 'Get started', slugs: ['start/rust', 'start/node', 'start/web', 'start/android', 'start/swift'] },
  {
    label: 'Guides',
    slugs: [
      'guides/sign-and-verify',
      'guides/encrypt-and-decrypt',
      'guides/validate-jwt',
      'guides/manage-keys',
      'guides/secure-key-storage',
      'guides/hardware-backed-keys',
      'guides/jwk-sets',
      'guides/migrate',
      'guides/migrate/panva-jose',
      'guides/migrate/jsonwebtoken',
      'guides/migrate/nimbus',
      'guides/migrate/joseswift',
    ],
  },
  { label: 'Concepts', slugs: ['concepts/algorithms', 'concepts/one-api', 'concepts/errors', 'concepts/standards'] },
  {
    label: 'Security',
    slugs: ['security/model', 'security/cryptographic-foundations', 'security/not-supported', 'security/reporting'],
  },
  { label: 'Reference', slugs: ['reference/api', 'reference/node', 'reference/web', 'reference/android', 'reference/swift'] },
  { label: 'About', slugs: ['about/why-polyjose'] },
]);

/** The home page's slug. */
export const HOME = 'index';

/**
 * @template {{ slug: string }} P
 * @typedef {{ home: P, groups: { label: string, pages: P[] }[] }} Ordered
 */

/**
 * The pages in sidebar order. Throws when a page is missing from SIDEBAR or
 * SIDEBAR names a page that doesn't exist, so a new page can't be left out
 * of the Markdown.
 *
 * @template {{ slug: string }} P
 * @param {P[]} pages
 * @returns {Ordered<P>}
 */
export function orderPages(pages) {
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const listed = [HOME, ...SIDEBAR.flatMap((g) => g.slugs)];
  const missing = listed.filter((slug) => !bySlug.has(slug));
  const unlisted = pages.map((p) => p.slug).filter((slug) => !listed.includes(slug));
  if (missing.length || unlisted.length) {
    throw new MarkdownError(
      `src/lib/llms/site.mjs SIDEBAR doesn't match the docs collection:${missing.length ? ` no page for ${missing.join(', ')};` : ''}${unlisted.length ? ` not listed: ${unlisted.join(', ')}` : ''}`,
    );
  }
  const get = (/** @type {string} */ slug) => /** @type {P} */ (bySlug.get(slug));
  return { home: get(HOME), groups: SIDEBAR.map((g) => ({ label: g.label, pages: g.slugs.map(get) })) };
}

/**
 * @typedef {{ slug: string, title: string, description?: string }} IndexPage
 * @typedef {{ label: string, href: string }} Link
 */

/** `- [title](url): description` */
const item = (/** @type {IndexPage} */ p) => `- [${p.title}](${markdownUrl(p.slug)})${p.description ? `: ${p.description}` : ''}`;

/**
 * `/llms.txt`: H1, the home description as the summary, the home page, one
 * H2 per sidebar group, then `## Optional`.
 *
 * @param {IndexPage[]} pages
 * @param {Link[]} optional
 */
export function llmsTxt(pages, optional) {
  const { home, groups } = orderPages(pages);
  const lines = ['# polyjose', '', `> ${home.description ?? ''}`, '', item(home)];
  for (const group of groups) lines.push('', `## ${group.label}`, '', ...group.pages.map(item));
  lines.push('', '## Optional', '', ...optional.map((l) => `- [${l.label}](${l.href})`));
  return `${lines.join('\n')}\n`;
}

/**
 * `/llms-full.txt`: every page's Markdown, home first, then sidebar order,
 * separated by a rule.
 *
 * @param {{ slug: string, markdown: string }[]} pages
 */
export function llmsFullTxt(pages) {
  const { home, groups } = orderPages(pages);
  return `${[home, ...groups.flatMap((g) => g.pages)].map((p) => p.markdown.trim()).join('\n\n---\n\n')}\n`;
}
