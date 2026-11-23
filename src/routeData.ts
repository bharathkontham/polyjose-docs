// Starlight route middleware: structured data and the Markdown alternate link
// for every page (Starlight, "Route data", https://starlight.astro.build/guides/route-data/).
//
// Each page gets one <script type="application/ld+json"> in its <head>:
// - the home page: a schema.org WebSite (Google, "Provide a site name",
//   https://developers.google.com/search/docs/appearance/site-names) and a
//   schema.org SoftwareSourceCode (https://schema.org/SoftwareSourceCode)
//   with the repository, licence, languages and registry pages. It is not a
//   SoftwareApplication: Google's rich result for that type needs ratings or
//   reviews, and polyjose has none
//   (https://developers.google.com/search/docs/appearance/structured-data/software-app);
// - every other page: a BreadcrumbList, Home → [Migrate overview →] page, the
//   last item without `item`, which Google then takes to be the page itself
//   (https://developers.google.com/search/docs/appearance/structured-data/breadcrumb),
//   and a schema.org TechArticle (https://schema.org/TechArticle) built from
//   the page's frontmatter;
// - the 404 page: nothing.
//
// Every value comes from the frontmatter, the Starlight config, the sample
// pins or the URL constants below; structured data must match what the page
// shows (https://developers.google.com/search/docs/appearance/structured-data/sd-policies).
//
// Starlight's Head.astro writes the `content` of a head entry with `set:html`,
// so the JSON is escaped: every `<` becomes `<`, which JSON.parse reads
// back as `<`, and a value can never close the script element.

import { defineRouteMiddleware, type StarlightRouteData } from '@astrojs/starlight/route-data';
import { getEntry } from 'astro:content';
import { parsePin, pinRelease } from './lib/samples/pins.mjs';

/** The source repository (also the Swift Package Manager source). */
const REPOSITORY = 'https://github.com/bharathkontham/polyjose';

/**
 * The pages that identify polyjose elsewhere (schema.org `sameAs`): the
 * registry page of every published package and the source repository.
 */
const SAME_AS = [
  'https://crates.io/crates/polyjose',
  'https://www.npmjs.com/package/@polyjose/node',
  'https://www.npmjs.com/package/@polyjose/wasm',
  'https://central.sonatype.com/artifact/dev.polyjose/polyjose-jvm',
  'https://central.sonatype.com/artifact/dev.polyjose/polyjose',
  'https://javadoc.io/doc/dev.polyjose/polyjose-jvm',
  REPOSITORY,
];

/** The licence, as its SPDX licence-list URL (schema.org `license` takes a URL). */
const LICENSE = 'https://spdx.org/licenses/MIT.html';

/** The core's language and the languages of the shipped bindings. */
const LANGUAGES = ['Rust', 'JavaScript', 'TypeScript', 'Kotlin', 'Swift'];

/** The parent of the migration guides in the breadcrumb (it has a page; the sidebar groups don't). */
const MIGRATE = 'guides/migrate';

const pinFiles = import.meta.glob<unknown>('/samples/pins/*.json', { import: 'default', eager: true });

/**
 * The released version the site documents: the version of the registry pins,
 * when every platform is pinned to the same published release. Otherwise
 * undefined, and `softwareVersion` is left out.
 */
function documentedVersion(): string | undefined {
  const releases = Object.entries(pinFiles).map(([path, value]) =>
    pinRelease(parsePin(value, path.replace(/^.*\/|\.json$/g, ''))),
  );
  const versions = new Set(releases.map((r) => r.version));
  if (releases.length === 0 || !releases.every((r) => r.published) || versions.size !== 1) return undefined;
  return [...versions][0];
}

/**
 * The absolute URL of a page from its slug (`''` is the home page): the HTML
 * page, as its canonical URL with a trailing slash, or its Markdown form,
 * `/<slug>.md` with `/index.md` for the home page.
 */
function pageUrl(site: URL, slug: string, form: 'html' | 'md' = 'html'): string {
  if (form === 'md') return new URL(`/${slug || 'index'}.md`, site).href;
  return new URL(slug ? `/${slug}/` : '/', site).href;
}

/** JSON for a `set:html` script element: `<` escaped, so it can't end the element. */
function serialise(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** The home page graph: the WebSite and the SoftwareSourceCode. */
function homeGraph(route: StarlightRouteData, site: URL) {
  const home = pageUrl(site, '');
  const { description } = route.entry.data;
  const softwareVersion = documentedVersion();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${home}#website`, name: route.siteTitle, url: home, description },
      {
        '@type': 'SoftwareSourceCode',
        name: route.siteTitle,
        description,
        url: home,
        codeRepository: REPOSITORY,
        license: LICENSE,
        programmingLanguage: LANGUAGES,
        ...(softwareVersion ? { softwareVersion } : {}),
        sameAs: SAME_AS,
      },
    ],
  };
}

/** A docs page graph: the BreadcrumbList and the TechArticle. */
async function pageGraph(route: StarlightRouteData, site: URL) {
  const home = pageUrl(site, '');
  const { title, description } = route.entry.data;
  const trail: { name: string; item?: string }[] = [{ name: route.siteTitle, item: home }];
  if (route.id.startsWith(`${MIGRATE}/`)) {
    const migrate = await getEntry('docs', MIGRATE);
    if (migrate) trail.push({ name: migrate.data.title, item: pageUrl(site, MIGRATE) });
  }
  trail.push({ name: title });
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, ...crumb })),
      },
      {
        '@type': 'TechArticle',
        headline: title,
        description,
        url: pageUrl(site, route.id),
        inLanguage: route.lang,
        isPartOf: { '@type': 'WebSite', '@id': `${home}#website`, name: route.siteTitle, url: home },
      },
    ],
  };
}

export const onRequest = defineRouteMiddleware(async (context) => {
  const route = context.locals.starlightRoute;
  // Starlight's own 404 page is not a document; it gets no structured data.
  if (route.id === '404') return;
  const site = context.site;
  if (!site) throw new Error('src/routeData.ts: `site` must be set in astro.config.mjs for absolute URLs');

  const graph = route.id === '' ? homeGraph(route, site) : await pageGraph(route, site);
  route.head.push(
    { tag: 'script', attrs: { type: 'application/ld+json' }, content: serialise(graph) },
    { tag: 'link', attrs: { rel: 'alternate', type: 'text/markdown', href: pageUrl(site, route.id, 'md') } },
  );
});
