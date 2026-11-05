// Renders Astro components in a Node test through the Astro container API.
//
// astro 7.4.6 exports the container as `experimental_AstroContainer` from
// `astro/container`. A container renders an already-compiled component, so
// the `.astro` files are compiled by a Vite server built from the site's own
// config (`getViteConfig` from `astro/config`), which also provides the
// Starlight and Expressive Code modules that `Tabs`, `Aside` and `Code` need.

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const requireFromRoot = createRequire(new URL('package.json', pathToFileURL(ROOT)));
const load = (/** @type {string} */ specifier, from = requireFromRoot) => import(pathToFileURL(from.resolve(specifier)).href);

/**
 * Starts a Vite SSR server for the site and an Astro container.
 *
 * @returns {Promise<{ render: (path: string, props?: Record<string, unknown>) => Promise<string>, close: () => Promise<void> }>}
 */
export async function startAstro() {
  const { getViteConfig } = await load('astro/config');
  const { experimental_AstroContainer: AstroContainer } = await load('astro/container');
  // Vite is Astro's own dependency; resolve it from Astro so the versions match.
  const vite = await load('vite', createRequire(requireFromRoot.resolve('astro')));

  const previousCwd = process.cwd();
  process.chdir(ROOT);
  const config = await getViteConfig({
    root: ROOT,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
  })({ mode: 'test', command: 'serve' });
  const server = await vite.createServer({ ...config, configFile: false });
  const container = await AstroContainer.create();

  return {
    async render(path, props = {}) {
      const mod = await server.ssrLoadModule(path);
      return container.renderToString(mod.default, { props });
    },
    async close() {
      // Astro prepares its dev app in the background; let that settle before
      // shutting the server down, or it logs a spurious error.
      await server[Symbol.for('astro.devServerAppReady')];
      await server.close();
      process.chdir(previousCwd);
    },
  };
}

/** Text content of an HTML fragment, tags removed and entities for <, >, &, " and ' decoded. */
export function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}
