// TypeDoc plugin for the JavaScript API reference at /api/js/ (see typedoc.json).
//
// It does three things, so the generated pages meet the same rules as the rest
// of the site:
//   1. Every page has a <main> landmark, like the rest of the site. TypeDoc's
//      default layout has no <main>, so its content column becomes one.
//   2. The packages' internal wiring is left out of the reference. `createApi`
//      and `Backend` connect the shared TypeScript layer to the native addon or
//      the WebAssembly module inside each package. The packages' entry points
//      export them as types only, so an application can't call them.
//   3. Nothing else: the declarations under api/js/ are rendered as they are.

import { Converter, DefaultTheme, DefaultThemeRenderContext, JSX } from 'typedoc';

/** Top-level names that are package internals, not part of the public API. */
const INTERNAL = new Set(['createApi', 'Backend']);

/** Turns the content column into <main>. */
function withMain(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node) || !('tag' in node)) return false;
  if (node.tag === 'div' && node.props?.class === 'col-content') {
    node.tag = 'main';
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
