// The single list of brand exports (ADR 0053). `npm run brand:export` writes
// every entry from the SVG sources in brand/src/; the tests check the list and,
// once the exports are committed, the files themselves.
//
// Each entry:
//   kind   'copy' (the SVG is served as is), 'png' or 'ico'
//   src    the source file name in the source directory (brand/src/)
//   out    the output path, relative to the output root (the repo root)
//   width, height   ('png') the exact pixel size of the output
//   sizes  ('ico') the square frame sizes, in file order
//   opaque ('png', 'ico') true renders on the page's white background, so the
//          output has no transparent pixel; false keeps the SVG's transparency
//
// Opaque targets: iOS is widely reported to show a transparent home-screen icon
// on black, and social cards and avatars are shown on backgrounds we don't
// control, so those sources are opaque by design and rendered opaque. The ICO
// is rendered from the light mark, whose tile has rounded corners: those stay
// transparent, like the SVG favicon's.

const freeze = (o) => Object.freeze(o);
const copy = (src, out) => freeze({ kind: 'copy', src, out });
const png = (src, out, width, height, opaque) => freeze({ kind: 'png', src, out, width, height, opaque });

/** The favicon.ico frames: 16 and 32 for tabs, 48 for Google Search. */
export const ICO_SIZES = freeze([16, 32, 48]);

export const TARGETS = freeze([
  copy('favicon.svg', 'public/favicon.svg'),
  freeze({ kind: 'ico', src: 'mark-light.svg', out: 'public/favicon.ico', sizes: ICO_SIZES, opaque: false }),
  png('app-icon.svg', 'public/apple-touch-icon.png', 180, 180, true),
  png('app-icon.svg', 'public/icon-192.png', 192, 192, true),
  png('app-icon.svg', 'public/icon-512.png', 512, 512, true),
  png('app-icon-maskable.svg', 'public/icon-mask.png', 512, 512, true),
  png('og.svg', 'public/og.png', 1200, 630, true),
  png('social-preview.svg', 'brand/exports/social-preview-1280x640.png', 1280, 640, true),
  png('avatar.svg', 'brand/exports/avatar-500.png', 500, 500, true),
  png('avatar.svg', 'brand/exports/gravatar-512.png', 512, 512, true),
  // Served from polyjose.dev for README images (absolute URLs).
  copy('lockup-light.svg', 'public/brand/lockup-light.svg'),
  copy('lockup-dark.svg', 'public/brand/lockup-dark.svg'),
  copy('mark-light.svg', 'public/brand/mark-light.svg'),
  copy('mark-dark.svg', 'public/brand/mark-dark.svg'),
  // The Starlight header logo (light and dark).
  copy('lockup-light.svg', 'src/assets/brand/logo-light.svg'),
  copy('lockup-dark.svg', 'src/assets/brand/logo-dark.svg'),
]);

/** Every source file name the targets need, each once, in first-use order. */
export const SOURCES = freeze([...new Set(TARGETS.map((t) => t.src))]);
