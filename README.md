# polyjose-docs

This is the public documentation site for [polyjose](https://github.com/bharathkontham/polyjose). It's built with Astro + Starlight (pinned exactly) and deployed to GitHub Pages at **https://polyjose.dev**.

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
start/        rust, node, web, android, swift
guides/       sign-and-verify, encrypt-and-decrypt, validate-jwt, manage-keys, jwk-sets
guides/migrate/  index (overview), panva-jose, nimbus, joseswift
concepts/     algorithms, one-api, errors, standards
security/     model, cryptographic-foundations, not-supported, reporting
reference/    api
about/        why-polyjose
```

A page that isn't written yet says what it will cover and that it is planned. It shows no code and no install commands until they work.

## Code samples

Code samples are not typed into pages. They live as real, tested source files under `samples/`, one project per platform, and pages render marked regions of those files. `samples/README.md` explains the layout.

## Writing rules

These rules apply to every page, data file and sample. `npm run lint:refs` checks the private-reference rule, and `npm run lint:honesty` checks the audit wording, which pages may say "constant-time", and that no page carries pre-release wording, on every built page. Everything the scripts can't check, including the benchmark and adoption rule, is checked in review.

**No private references.** Pages stand on their own. Don't cite internal planning documents: no decision-record, requirement or task numbers, internal file paths, or internal tool and role names. Explain a decision in your own words. Public identifiers are fine: RFC sections, IANA names, error codes, advisory ids such as RUSTSEC numbers.

**When `lint:refs` flags ordinary text, reword it.** There is no way to suppress a match. The check matches in any case, reads look-alike characters (fullwidth, styled or Cyrillic letters) as the plain letters they resemble, and allows up to three of space, `-`, `_`, `/`, `#`, `.`, `:`, `(` or "no." between a word and its number. It quotes your original text in the error. Common cases:
- A lone t, b or f next to a two- or three-digit number (`b12`, `F10`, `t 12`, `f(10)`) reads as an internal task number. Write it out ("function key 10", "a 12-byte block"), or name the thing the number belongs to. These are fine: `b64`, RFC numbers, `P-256`, `A128CBC-HS256`, `RS256`, `ES256K`, `x86_64`, `R8`, RUSTSEC ids and `brainpoolP256r1`.
- "feature", "task", "bug" or "fix" right before a number ("feature 12", "fix #3"): say what the feature or fix does.
- Home directories: `~/` and `$HOME/` are allowed only for `~/.cargo`, `~/.gradle`, `~/.npm`, `~/.config` and a bare `cd ~/`. For anything else, use a path relative to the project (`cd my-app`).
- A lower-case `/users/` is a path too, except after a host in a URL (`https://github.com/users/…`).
- Hyphenated workflow words ("ready-for-test", "deliver-feature") are flagged; the spaced English phrase ("ready for testing") is not.
- Built scripts, style sheets and SVG images are checked too, for record and feature numbers, paths, repository, role and process names, but not for short task numbers, which minified code is full of.

**Honesty.**
- No pre-release wording: no page says polyjose is pre-1.0 or not published.
- Never describe polyjose as audited. Credit the libraries it builds on. What review they have had is quoted in their maintainers' own words only in the audit register on Security › Cryptographic foundations: the primitives table and its status legend. The word "audited" appears nowhere else on the site, About included.
- Never claim constant-time behaviour beyond what the underlying library documents, and only on the Security pages.
- No benchmark or adoption numbers until they have been measured and can be reproduced.
