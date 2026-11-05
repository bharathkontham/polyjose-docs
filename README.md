# polyjose-docs

This is the public documentation site for [polyjose](https://github.com/bharathkontham/polyjose). It's built with Astro + Starlight (pinned exactly) and deployed to GitHub Pages at **https://polyjose.dev**.

polyjose is pre-1.0 and not published yet. Every page says so in a site-wide notice.

## Working on the site

Use Node 24.

```sh
npm ci
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
npm run verify   # everything CI checks, in order
```

`npm run verify` runs these steps and stops at the first failure. CI runs the same command on every pull request.

| Step | What it checks |
|---|---|
| `npm run check` | `astro check`: types and Astro diagnostics |
| `npm run build` | builds the site; a broken internal link, a bad `#hash`, an absolute `https://polyjose.dev/...` link or a sidebar entry without a page fails the build |
| `npm run lint:refs` | no private references (see below) |
| `npm run lint:honesty` | the honesty rules (see below) |
| `npm run test:scripts` | unit tests for the site's scripts and data files |
| `npm run samples:coverage` | every code sample region is defined and used |
| `npm run a11y` | accessibility (axe, in Chromium) on every page, in light and dark themes |

The accessibility step needs Chromium once: `npx playwright install chromium`.

## Page tree

Pages live in `src/content/docs/`, one `.mdx` file each. Slugs are final: change what a page says, never where it lives. The sidebar in `astro.config.mjs` lists every page by slug.

```
index.mdx                          home
start/        rust, node, web, android, apple
guides/       sign-and-verify, encrypt-and-decrypt, validate-jwt, manage-keys, jwk-sets
guides/migrate/  index (overview), panva-jose, nimbus, joseswift
concepts/     algorithms, one-api, errors, standards
security/     model, cryptographic-foundations, not-supported, reporting
reference/    api
about/        why-polyjose
```

A page that isn't written yet says what it will cover and that it arrives with the 0.1.0 release. It shows no code and no install commands until they work.

## Code samples

Code samples are not typed into pages. They live as real, tested source files under `samples/`, one project per platform, and pages render marked regions of those files. `samples/README.md` explains the layout.

## Writing rules

These rules apply to every page, data file and sample. `npm run lint:refs` checks the private-reference rule, and `npm run lint:honesty` checks the pre-1.0 notice, the audit wording and which pages may say "constant-time", on every built page. Everything the scripts can't check, including the benchmark and adoption rule, is checked in review.

**No private references.** Pages stand on their own. Don't cite internal planning documents: no decision-record, requirement or task numbers, internal file paths, or internal tool and role names. Explain a decision in your own words. Public identifiers are fine: RFC sections, IANA names, error codes, advisory ids such as RUSTSEC numbers.

**Honesty.**
- polyjose is pre-1.0. Every page carries the site-wide notice.
- Never describe polyjose as audited. Credit the libraries it builds on and quote what review they have had in their maintainers' own words, only on the Security › Cryptographic foundations and About pages.
- Never claim constant-time behaviour beyond what the underlying library documents, and only on the Security pages.
- No benchmark or adoption numbers until they have been measured and can be reproduced.
