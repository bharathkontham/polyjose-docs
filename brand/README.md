# polyjose brand

The polyjose mark is the lowercase **p** of the wordmark on a navy tile, with its counter cut as a gold **keyhole**. The lockup puts the mark next to the "polyjose" wordmark.

The SVG files in [`src/`](src/) are the master artwork. They are hand-written, scale to any size, and need no font: the lettering is converted to outlines (see [CREDITS.md](CREDITS.md)). The PNG and ICO files the site and the publishing sites need are rendered from these sources by `npm run brand:export` and committed.

## Files

| File | What it is | Where it is used |
|---|---|---|
| `src/mark-light.svg` | The square mark, light colours | Small square uses on light backgrounds |
| `src/mark-dark.svg` | The square mark, dark colours | Small square uses on dark backgrounds |
| `src/lockup-light.svg` | Mark and wordmark side by side, light colours | Site header in the light theme; README headers on light backgrounds |
| `src/lockup-dark.svg` | Mark and wordmark side by side, dark colours | Site header in the dark theme; README headers on dark backgrounds |
| `src/favicon.svg` | The light mark, switching to the dark colours in a dark colour scheme | The site's SVG favicon, and the source of the `favicon.ico` frames (16, 32 and 48 px) |
| `src/app-icon.svg` | Opaque square icon with padding | `apple-touch-icon.png` (180 px) and the web app manifest `any` icons (192 and 512 px) |
| `src/app-icon-maskable.svg` | Opaque full-bleed icon, the p inside the central safe circle | The web app manifest `maskable` icon (512 px) |
| `src/avatar.svg` | Opaque square icon, the p inside the inscribed circle | Profile pictures: GitHub (500 px), Gravatar for npm (512 px) |
| `src/og.svg` | 1200 x 630 card: lockup, tagline and platforms | `og.png`, the site's Open Graph and X card image |
| `src/social-preview.svg` | 1280 x 640 card, content inside the central 1200 x 600 | The GitHub repository social preview |
| `tools/outline.mjs` | Turns text into SVG paths with Inter | How the wordmark, tagline and platform names were made |
| [`PUBLISHING.md`](PUBLISHING.md) | Checklist of the images the account owner uploads by hand | GitHub social preview and avatars, Gravatar for npm |

Use the light files on light backgrounds and the dark files on dark backgrounds. Where only one image can be given and the background is unknown, use the mark (`mark-light.svg`): its tile carries its own background.

## Minimum sizes

- **Mark:** 16 px. It is drawn on a 32 x 32 grid so that it stays sharp at 16 and 32 px. Don't use it smaller than 16 px.
- **Lockup:** 20 px tall. Below 20 px, use the mark on its own.

## Clear space

Keep a free margin of at least **the mark's width x 0.25** on every side of the mark and of the lockup (for the lockup, measure the width of the mark inside it). No other text, logos or edges go inside that margin. The SVG files have no padding of their own, so leave the margin around them in the layout.

## Colours

| Role | Class in the SVG | Light | Dark |
|---|---|---|---|
| Tile | `tile` | `#16255A` | `#2F4BA6` |
| Letter p | `letter` | `#FFFFFF` | `#FFFFFF` |
| Keyhole | `key` | `#F2B22E` | `#F7C04A` |
| Wordmark | `ink` | `#16255A` | `#EEF2FF` |

Background: `#16255A` (navy), for the opaque icons and the social images.

- The wordmark is a single colour, the ink of its scheme.
- The social images use the dark colours on the navy background.
- The favicon uses the light colours, switched to the dark ones by a `prefers-color-scheme: dark` media query. Some browsers ignore that query in favicons, so the light favicon must also work on dark tab bars: the white p and the gold keyhole carry the shape there.

## Do and don't

Do:

- Use the files as they are, at or above the minimum sizes, with the clear space around them.
- Use the light versions on light backgrounds and the dark versions on dark backgrounds.

Don't:

- Don't recolour the mark or the wordmark outside the palette above.
- Don't stretch, squash or skew any file: scale it proportionally.
- Don't re-typeset the wordmark in another font, or retype it at all: use the outlined artwork.
- Don't put the light lockup on dark backgrounds, or the dark lockup on light ones.
- Don't add effects: no shadows, glows, outlines, gradients or transparency.
- Don't rotate the mark or the lockup.
- Don't change the arrangement or spacing of the mark and the wordmark in the lockup.

Derived works of other marks are not allowed: don't combine the polyjose mark with another project's logo or adapt it into one (for example the Rust, Node.js, WebAssembly or JWT marks), and don't base new polyjose artwork on another mark.

## Changing the artwork

- Keep the sources hand-written SVG with a `viewBox` and a `<title>`, and with no `<text>`, raster images, scripts, font references or external links. `tests/data/brand-sources.test.mjs` checks this, the colours against the table above, the icon safe zones and the social image sizes.
- The mark is drawn on a 32 x 32 grid. Keep the stem's straight edges on even grid units, so they land on whole pixels at 16 px. The other files reuse the mark's coordinates.
- To change any lettering, re-run [`tools/outline.mjs`](tools/outline.mjs) with the recorded font (it explains how to get and check it) and replace the path data. Never commit a font file.
- After any change, re-run `npm run brand:export` and commit the new exports with the sources.
