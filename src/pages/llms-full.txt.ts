// /llms-full.txt: every page's Markdown in sidebar order.
import type { APIRoute } from 'astro';
import { markdownPages } from '../lib/llms/pages';
import { llmsFullTxt } from '../lib/llms/site.mjs';

export const GET: APIRoute = async () =>
	new Response(llmsFullTxt(await markdownPages()), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
