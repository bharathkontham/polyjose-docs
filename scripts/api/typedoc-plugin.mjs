// TypeDoc plugin for the JavaScript API reference at /api/js/ (see typedoc.json).
//
// It does three things, so the generated pages meet the same rules as the rest
// of the site:
//   1. Every page shows the site's pre-1.0 notice in the place the honesty
//      check (scripts/check/honesty.mjs, rule a) looks for it: a container
//      marked data-site-banner as the first element of <main>, holding the
//      notice (class prerelease-notice, data-prerelease-notice). TypeDoc's
//      default layout has no <main>, so its content column becomes one.
//   2. The packages' internal wiring is left out of the reference. `createApi`
//      and `Backend` connect the shared TypeScript layer to the native addon or
//      the WebAssembly module inside each package. The packages' entry points
//      export them as types only, so an application can't call them.
//   3. Nothing else: the declarations under api/js/ are rendered as they are.

import { Converter, DefaultTheme, DefaultThemeRenderContext, JSX } from 'typedoc';

/** Top-level names that are package internals, not part of the public API. */
const INTERNAL = new Set(['createApi', 'Backend']);

/** The pre-1.0 notice, with the same text as the site banner (src/components/overrides/Banner.astro). */
const banner = () =>
  JSX.createElement(
    'div',
    { class: 'site-banner', 'data-site-banner': '' },
    JSX.createElement(
      'div',
      { class: 'prerelease-notice', role: 'note', 'data-prerelease-notice': '' },
      JSX.createElement(
        'p',
        null,
        JSX.createElement('strong', null, 'Pre-1.0:'),
        ' polyjose is not published yet, and its APIs may change before 1.0. Read the ',
        JSX.createElement('a', { href: '/security/reporting/' }, 'security policy'),
        ' before you rely on it.',
      ),
    ),
  );

/** Turns the content column into <main>, with the banner as its first element. */
function withMain(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node) || !('tag' in node)) return false;
  if (node.tag === 'div' && node.props?.class === 'col-content') {
    node.tag = 'main';
    node.children.unshift(banner());
    return true;
  }
  return node.children.flat(Infinity).some(withMain);
}

class SiteContext extends DefaultThemeRenderContext {
  constructor(...args) {
    super(...args);
    const layout = this.defaultLayout;
    this.defaultLayout = (template, props) => {
      const page = layout(template, props);
      if (!withMain(page)) throw new Error('typedoc-plugin: no .col-content in the TypeDoc layout');
      return page;
    };
  }
}

class SiteTheme extends DefaultTheme {
  ContextClass = SiteContext;
}

/** @param {import('typedoc').Application} app */
export function load(app) {
  app.renderer.defineTheme('polyjose', SiteTheme);
  app.converter.on(Converter.EVENT_RESOLVE_BEGIN, (context) => {
    for (const name of INTERNAL) {
      const reflection = context.project.getChildByName(name);
      if (!reflection) throw new Error(`typedoc-plugin: expected a top-level ${name} to leave out`);
      context.project.removeReflection(reflection);
    }
  });
}
