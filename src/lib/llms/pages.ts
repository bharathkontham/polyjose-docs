// The docs pages as Markdown, for the endpoints in src/pages/: /<slug>.md,
// /llms.txt and /llms-full.txt. Reads the docs collection, the sample regions
// and pins (src/components/samples/sources.ts) and src/data/*.json at build
// time, and renders each page once per build.
import { getCollection } from 'astro:content';
import { regions, reasons, pinFor } from '../../components/samples/sources';
import { REPO } from '../../components/site-nav/links';
import algorithms from '../../data/algorithms.json';
import errorCodes from '../../data/error-codes.json';
import primitives from '../../data/primitives.json';
import standards from '../../data/standards.json';
import { registryLinks } from '../samples/install.mjs';
import { markdownComponents, markdownExpressions } from './components.mjs';
import { pageMarkdown, SITE } from './mdx.mjs';

export interface MarkdownPage {
	slug: string;
	title: string;
	description: string | undefined;
	markdown: string;
}

const sources = { regions, reasons, pinFor, algorithms, errorCodes, primitives, standards };
const components = markdownComponents(sources);
const expressions = markdownExpressions(sources);

let cache: Promise<MarkdownPage[]> | undefined;

/** Every docs page with its Markdown. A page the renderer can't map fails the build. */
export function markdownPages(): Promise<MarkdownPage[]> {
	cache ??= getCollection('docs').then((entries) =>
		entries.map((entry) => {
			const page = { slug: entry.id, title: entry.data.title, description: entry.data.description, body: entry.body ?? '' };
			return { slug: page.slug, title: page.title, description: page.description, markdown: pageMarkdown(page, components, expressions) };
		}),
	);
	return cache;
}

const docsRs = registryLinks('rust').find((link) => link.label === 'docs.rs');
if (!docsRs) throw new Error('src/lib/samples/install.mjs: no docs.rs registry link for rust');

/** The `## Optional` links of /llms.txt: the API references, the repository and the full text. */
export const OPTIONAL_LINKS = [
	{ label: 'polyjose on docs.rs', href: docsRs.href },
	{ label: 'the JavaScript API reference', href: `${SITE}/api/js/` },
	{ label: 'polyjose-jvm on javadoc.io', href: 'https://javadoc.io/doc/dev.polyjose/polyjose-jvm' },
	{ label: 'GitHub', href: REPO },
	{ label: 'llms-full.txt', href: `${SITE}/llms-full.txt` },
];
