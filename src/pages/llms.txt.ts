// /llms.txt (llmstxt.org): the site's pages by sidebar group, each linking to
// its Markdown.
import type { APIRoute } from 'astro';
import { markdownPages, OPTIONAL_LINKS } from '../lib/llms/pages';
import { llmsTxt } from '../lib/llms/site.mjs';

export const GET: APIRoute = async () =>
	new Response(llmsTxt(await markdownPages(), OPTIONAL_LINKS), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
