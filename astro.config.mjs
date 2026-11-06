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
  { label: 'Reference', items: [{ slug: 'reference/api' }] },
  { label: 'About', items: [{ slug: 'about/why-polyjose' }] },
];

export default defineConfig({
  site: 'https://polyjose.dev',
  integrations: [
    starlight({
      title: 'polyjose',
      description: 'Pure-Rust JOSE (JWS, JWE, JWK, JWT) for Rust, Node.js, the web, Android (Kotlin) and Swift (iOS).',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/bharathkontham/polyjose' }],
      components: { Banner: './src/components/overrides/Banner.astro' },
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
