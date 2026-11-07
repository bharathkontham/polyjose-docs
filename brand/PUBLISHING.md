# Publishing the brand images

Some places where polyjose is published take an image that only the account owner can upload. This checklist lists each one: the file to use, where to click, and the site's own limits. The limits quoted below were checked against each site's documentation on 2026-11-07. Statements marked *inference* are our reading and are not stated by the site.

The owner chooses which accounts get the new avatar. The table lists every candidate.

## Order

1. **First, deploy the docs site** with the brand files, so that `https://polyjose.dev/brand/lockup-light.svg` and `https://polyjose.dev/brand/lockup-dark.svg` exist.
2. **Then do the uploads** in the table below. They don't depend on each other, so any order works.
3. **Merge the polyjose README change** (branch `docs/readme-logo` in the polyjose repository) only after `https://polyjose.dev/brand/lockup-light.svg` returns HTTP 200, for example `curl -sSI https://polyjose.dev/brand/lockup-light.svg | head -1`. The README loads its header image from that address, so merging earlier shows a broken image on GitHub, crates.io, npm and the Swift Package Index.

## Files

All three files are opaque PNGs (no transparency) on the navy background, which is what GitHub suggests when you're unsure how a transparent image will look on other platforms.

| File | Pixels | Size |
|---|---|---|
| `exports/social-preview-1280x640.png` | 1280 x 640 | 59,857 bytes (59 KB) |
| `exports/avatar-500.png` | 500 x 500 | 7,858 bytes (8 KB) |
| `exports/gravatar-512.png` | 512 x 512 | 8,024 bytes (8 KB) |

Paths are relative to this `brand/` folder. Every file is far below the 1 MB limits quoted below.

## Checklist

| Destination | File | Where to click | Limits (source) |
|---|---|---|---|
| GitHub repository social preview, `polyjose` | `exports/social-preview-1280x640.png` | Repository main page → **Settings** → under "Social preview", **Edit** → **Upload an image...** | "a PNG, JPG, or GIF file under 1 MB in size", "at least 640 by 320 pixels (1280 by 640 pixels for best display)"; "If you aren't sure, we recommend using an image with a solid background." ([GitHub docs: customizing your repository's social media preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)) |
| GitHub repository social preview, `polyjose-docs` (optional) | the same file | the same steps, in the `polyjose-docs` repository | the same |
| GitHub user avatar (the owner's account, if chosen) | `exports/avatar-500.png` | Profile picture (top right) → **Settings** → under "Profile Picture", **Edit** → **Upload a photo...** → crop → **Set new profile picture** ([GitHub docs: personalize your profile](https://docs.github.com/en/account-and-profile/tutorials/personalize-your-profile)) | "a PNG, JPG, or GIF file, and it must be less than 1 MB in size and smaller than 3000 by 3000 pixels", "about 500 by 500 pixels" recommended ([GitHub docs: profile reference](https://docs.github.com/en/account-and-profile/reference/profile-reference)). If the account's email has a Gravatar, GitHub shows it by default; an upload on GitHub overrides it (same page). |
| GitHub organization avatar (only if a polyjose organization exists) | `exports/avatar-500.png` | Profile picture → **Organizations** → the organization → **Settings** → under the profile picture, **Upload new picture** ([GitHub docs: customizing your organization's profile](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/customizing-your-organizations-profile)) | Inference: the same limits as a user avatar. The organization page gives the steps but no limits. |
| npm user avatar, and the `@polyjose` organization avatar | `exports/gravatar-512.png` | On [gravatar.com](https://gravatar.com/), sign in with the email address of the npm account (for the organization, inference: the organization's email) and set this image as its avatar. npm has no upload button. | npm lists "Avatar" among the profile settings ([npm docs: managing your profile settings](https://docs.npmjs.com/managing-your-profile-settings/)). npm staff: "Your avatar is a Gravatar tied to the email associated with your account." ([npm/www#225](https://github.com/npm/www/issues/225), in a repository archived in 2018). Inference: npm still takes avatars only from Gravatar, and an organization avatar works the same way. |
| crates.io | none | Nothing to upload. Inference: crates.io shows the GitHub avatar of the publishing account, so the GitHub user avatar row covers it. The crate page shows the README header image from polyjose.dev. | — |
| Maven Central | none | Nothing to upload. The POM has no logo or icon element; its `url` element is "The project's home page" and points at `https://polyjose.dev`, which carries the favicon. | ([Maven POM reference](https://maven.apache.org/pom.html)) |
| Swift Package Index | none | Nothing to upload. Inference: the index has no package logo setting; the package page shows the README header image from polyjose.dev. | — |

## Verify after upload

Use a private (incognito) window, so you see what a signed-out visitor sees. Cards and avatars are cached, so a change can take a while to show (inference: minutes to hours, depending on the site).

| Destination | How to check |
|---|---|
| GitHub social preview, `polyjose` | Open `https://github.com/bharathkontham/polyjose` in a private window. Paste that link into a link-preview tool, for example the Slack message box or the LinkedIn post composer, without sending it, and check that the card shows the new image. |
| GitHub social preview, `polyjose-docs` | The same, with `https://github.com/bharathkontham/polyjose-docs`. |
| GitHub user avatar | Open the profile page in a private window and check the picture. Inference: GitHub shows avatars as circles, so check that the p and its keyhole are not cut off. |
| GitHub organization avatar | Open the organization page in a private window and check the picture. |
| npm user and organization avatars | Open the npm profile page (`https://www.npmjs.com/~<user>`) and the organization page (`https://www.npmjs.com/org/polyjose`) in a private window and check the picture. Gravatar changes can take longer to reach npm. |
| crates.io | After the README change is merged and a version is published, open the crate page and check the header image in both light and dark themes. |
| Maven Central | After a release, open the published POM and check that `url` is `https://polyjose.dev`. |
| Swift Package Index | After the README change is merged, open the package page and check the header image. |
