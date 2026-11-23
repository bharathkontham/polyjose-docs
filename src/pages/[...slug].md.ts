// /<slug>.md for every docs page, and /index.md for the home page: the page as
// Markdown. The HTML page links here with <link rel="alternate"
// type="text/markdown">. Endpoints are not pages, so the sitemap leaves
// these out.
import type { APIRoute, GetStaticPaths } from 'astro';
import { markdownPages } from '../lib/llms/pages';

export const getStaticPaths = (async () =>
	(await markdownPages()).map((page) => ({ params: { slug: page.slug }, props: { markdown: page.markdown } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
	new Response(props.markdown as string, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
