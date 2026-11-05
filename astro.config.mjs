import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://bharathkontham.github.io',
  base: '/polyjose-docs',
  integrations: [
    starlight({
      title: 'polyjose',
      description: 'Pure-Rust JOSE (JWS, JWE, JWK, JWT) for Rust, Node, Web, Android and Apple platforms.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/bharathkontham/polyjose' }],
      sidebar: [
        { label: 'Get started', items: [{ autogenerate: { directory: 'start' } }] },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'Concepts', items: [{ autogenerate: { directory: 'concepts' } }] },
        { label: 'Security', items: [{ autogenerate: { directory: 'security' } }] },
      ],
    }),
  ],
});
