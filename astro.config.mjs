import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

// Every sidebar entry names its page by slug. Starlight fails the build when a
// slug has no page, so a page can't go missing without the build noticing.
// Slugs are final: content changes fill pages in, they never rename them.
const sidebar = [
  {
    label: 'Get started',
    items: [
      { slug: 'start/rust', label: 'Rust' },
      { slug: 'start/node', label: 'Node.js' },
      { slug: 'start/web', label: 'Web (WASM)' },
      { slug: 'start/android', label: 'Android (Kotlin)' },
      { slug: 'start/swift', label: 'Swift (iOS)' },
    ],
  },
  {
    label: 'Guides',
    items: [
      { slug: 'guides/sign-and-verify' },
      { slug: 'guides/encrypt-and-decrypt' },
      { slug: 'guides/validate-jwt' },
      { slug: 'guides/manage-keys' },
      { slug: 'guides/secure-key-storage' },
      { slug: 'guides/jwk-sets' },
      {
        label: 'Migrate',
        collapsed: true,
        items: [
          { slug: 'guides/migrate', label: 'Overview' },
          { slug: 'guides/migrate/panva-jose', label: 'From panva/jose' },
          { slug: 'guides/migrate/nimbus', label: 'From Nimbus JOSE + JWT' },
          { slug: 'guides/migrate/joseswift', label: 'From JOSESwift' },
        ],
      },
    ],
  },
  {
    label: 'Concepts',
    items: [
      { slug: 'concepts/algorithms' },
      { slug: 'concepts/one-api' },
      { slug: 'concepts/errors' },
      { slug: 'concepts/standards' },
    ],
  },
  {
    label: 'Security',
    items: [
      { slug: 'security/model' },
      { slug: 'security/cryptographic-foundations' },
      { slug: 'security/not-supported' },
      { slug: 'security/reporting' },
    ],
  },
  {
    label: 'Reference',
    items: [
      { slug: 'reference/api' },
      { slug: 'reference/node', label: 'Node.js package' },
      { slug: 'reference/web', label: 'Web (WASM) package' },
      { slug: 'reference/android', label: 'Kotlin library' },
      { slug: 'reference/swift', label: 'Swift package' },
    ],
  },
  { label: 'About', items: [{ slug: 'about/why-polyjose' }] },
];

// The text of the Open Graph image (public/og.png): the title of its source,
// brand/src/og.svg.
const OG_IMAGE_ALT = 'polyjose: one JOSE implementation, every platform';

// Icons, theme colours and the social image (brand/README.md). Starlight
// appends these to its own head tags and sorts every <link> here before its
// `favicon` link, so the SVG favicon comes last and wins. A <meta> here would
// replace a Starlight one with the same name or property, so og:title and
// twitter:card are left to Starlight.
const head = [
  // favicon.ico (16, 32 and 48) for browsers, crawlers and feed readers without
  // SVG favicons; sizes="32x32", not "any", so Chrome keeps the SVG
  // (Evil Martians, "How to Favicon in 2026").
  { tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '32x32' } },
  // The iOS and iPadOS home-screen icon, 180 px and opaque; it takes precedence
  // over the manifest icons (WebKit, "New WebKit Features in Safari 15.4").
  { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
  // Add to Home Screen icons, 192 and 512 any plus 512 maskable
  // (W3C Web Application Manifest).
  { tag: 'link', attrs: { rel: 'manifest', href: '/site.webmanifest' } },
  // Browser UI colour, one per colour scheme: the light and the dark tile
  // (MDN, <meta name="theme-color">; used by Chrome on Android and installed
  // web apps).
  { tag: 'meta', attrs: { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#16255A' } },
  { tag: 'meta', attrs: { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#2F4BA6' } },
  // Link-preview image, 1200 x 630, as an absolute URL because crawlers don't
  // resolve relative ones; width, height and alt describe it (ogp.me,
  // "Structured Properties"; Meta, "Images in Link Shares"). Starlight already
  // sets twitter:card to summary_large_image, which uses og:image.
  { tag: 'meta', attrs: { property: 'og:image', content: 'https://polyjose.dev/og.png' } },
  { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
  { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
  { tag: 'meta', attrs: { property: 'og:image:alt', content: OG_IMAGE_ALT } },
  { tag: 'meta', attrs: { name: 'twitter:image:alt', content: OG_IMAGE_ALT } },
];

export default defineConfig({
  site: 'https://polyjose.dev',
  integrations: [
    starlight({
      title: 'polyjose',
      description: 'Pure-Rust JOSE (JWS, JWE, JWK, JWT) for Rust, Node.js, the web, Android (Kotlin) and Swift (iOS).',
      // The lockup, light and dark, in place of the text title. It is outlined
      // artwork, so it looks the same on every system. Starlight keeps the title
      // as screen-reader-only text, so the images are decorative (alt '') and
      // "polyjose" is read once.
      logo: {
        light: './src/assets/brand/logo-light.svg',
        dark: './src/assets/brand/logo-dark.svg',
        alt: '',
        replacesTitle: true,
      },
      // The SVG favicon, with its own dark-scheme colours. Starlight emits it as
      // <link rel="shortcut icon" type="image/svg+xml">, after the ICO.
      favicon: '/favicon.svg',
      head,
      // The site menu (Get started, Docs, GitHub) and the footer links. Their
      // links are in src/components/site-nav/links.ts; the GitHub link that the
      // `social` option would add is part of the menu, so `social` is not set.
      components: {
        Header: './src/components/site-nav/Header.astro',
        SocialIcons: './src/components/site-nav/SiteMenu.astro',
        Footer: './src/components/site-nav/Footer.astro',
      },
      sidebar,
      plugins: [
        // Fails `astro build` on a broken internal link or #hash. Links to this
        // site must be written as internal paths (an absolute polyjose.dev URL is
        // an error), so every one of them is checked. The generated API
        // reference under /api/ is not part of the content collection.
        starlightLinksValidator({
          sameSitePolicy: 'error',
          exclude: ['/api/{js,kotlin,swift}{,/**/*}'],
        }),
      ],
    }),
  ],
});
