// The site's own navigation: the header menu and the footer links. Every
// component in this folder reads its links from here, so a link is written
// once.
import type { StarlightIcon } from '@astrojs/starlight/types';

export const REPO = 'https://github.com/bharathkontham/polyjose';
const DOCS_REPO = 'https://github.com/bharathkontham/polyjose-docs';

/** The first get-started page, the one the landing page's "Get started" button opens. */
const START = '/start/rust/';
/**
 * Where "Docs" goes. There is no docs index page, so it is the first page
 * after the Get started group in the sidebar: the first guide, from which the
 * sidebar reaches every other guide, concept, security and reference page.
 */
const DOCS = '/guides/sign-and-verify/';

/** The section of the site a page belongs to, for aria-current. */
export type Section = 'start' | 'docs';

export interface SiteLink {
	label: string;
	href: string;
	/** The section this link stands for, if any. */
	section?: Section;
	icon?: StarlightIcon;
}

/** The header menu, in reading order. */
export const MENU: readonly SiteLink[] = [
	{ label: 'Get started', href: START, section: 'start' },
	{ label: 'Docs', href: DOCS, section: 'docs' },
	{ label: 'GitHub', href: REPO, icon: 'github' },
];

/** The links under every page's content. */
export const FOOTER: readonly SiteLink[] = [
	{ label: 'Docs', href: DOCS },
	{ label: 'Get started', href: START },
	{ label: 'GitHub', href: REPO, icon: 'github' },
	{ label: 'Docs source', href: DOCS_REPO },
	{ label: 'Releases', href: `${REPO}/releases` },
	{ label: 'Changelog', href: `${REPO}/blob/main/CHANGELOG.md` },
];

/**
 * The section of the page at `pathname`: the get-started pages, or the rest of
 * the docs. The landing page and the 404 page are in neither.
 */
export function sectionOf(pathname: string): Section | null {
	const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
	if (path === '/' || path === '/404/' || path === '/404.html/') return null;
	return path.startsWith('/start/') ? 'start' : 'docs';
}

/**
 * The aria-current value of `link` on the page at `pathname` (WAI-ARIA 1.2,
 * aria-current): "page" for the page itself, "true" for the section the page
 * is in, none otherwise.
 */
export function currentOf(link: SiteLink, pathname: string): 'page' | 'true' | undefined {
	const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
	if (link.href === path) return 'page';
	if (link.section && link.section === sectionOf(pathname)) return 'true';
	return undefined;
}
