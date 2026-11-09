# Code samples

Every polyjose code block in the guides comes from a file in this directory, and each of those files is a real test. The one exception is the platform code on Store keys securely (Android Keystore, Keychain, Web Crypto and WebAuthn), which is marked on that page as an untested example. The Rust samples run under `cargo test`, the JavaScript ones under `node --test`, the Kotlin ones under Gradle and the Swift ones under `swift test`. The site shows only a marked part of each test, so what you read is code that was compiled and run against polyjose.

## Layout

| Directory | Platform | What goes there |
|---|---|---|
| `samples/rust/` | Rust | A Cargo package. One `tests/<page>.rs` per guide. Each sample sits in a `#[test] fn … -> Result<(), polyjose::Error>`. |
| `samples/js/` | Node.js, and Web | One `<page>.test.mjs` per guide, using `node:test` and importing only from `@polyjose/node`. |
| `samples/web/` | Web only | Browser and Worker entry points (`.ts`) that only make sense on the web. They are type-checked. |
| `samples/kotlin/` | Kotlin | A Gradle project. One `src/test/kotlin/<Page>Test.kt` per guide, with JUnit 5. |
| `samples/swift/` | Swift | A Swift package. One `Tests/SamplesTests/<Page>Tests.swift` per guide. |
| `samples/fixtures/` | all | Shared inputs, such as `keys.json`. Never shown as code. |
| `samples/pins/` | all | Which polyjose build each platform is tested against (see [Pins](#pins)). |

Each platform's project appears once polyjose has a build for that platform to test against. Until then its directory doesn't exist, and pages can't show samples for it.

Files in `node_modules`, `target`, `build` and dot directories such as `.build` and `.generated` are never read as samples.

## Marking a sample

Put a comment line before and after the code a reader should see:

```rust
#[test]
fn sign_hs256() -> Result<(), polyjose::Error> {
    let key = fixtures().hmac();
    // docs:start sign-and-verify/hs256
    // ...the lines the page shows, using `key`, producing `token`...
    // docs:end sign-and-verify/hs256
    assert_eq!(token.split('.').count(), 3);
    Ok(())
}
```

All five languages use `//` comments, so the markers look the same everywhere.

- A marker is a whole line: `// docs:start <id>` or `// docs:end <id>`, with any indentation.
- The marker lines are left out, and the indentation the region's lines share is removed.
- **Ids** are lowercase letters, digits and dashes in two or more `/`-separated parts. The first part is the page: `sign-and-verify/hs256`, `start/rust-first-sign`.
- Use the **same id on every platform** for the same sample. That is how the five tabs are put together.
- Regions can't be nested or overlap. An id can appear only once per platform, and a region can't be empty.

Breaking any of these rules fails the site build, with the file, line and id in the message.

Keep setup that readers don't need (loading fixtures, assertions) outside the markers, and keep the assertions: a sample that only runs proves less than one that checks its result.

## Showing a sample on a page

```mdx
import Samples from '../../../components/samples/Samples.astro';

<Samples id="sign-and-verify/hs256" />
```

This renders five tabs, always labelled and ordered **Rust, Node.js, Web, Kotlin, Swift**. Picking a tab once switches every sample on the site to that platform, because the tabs are matched by label.

- The **Web** tab shows the `samples/js` region with `@polyjose/node` replaced by `@polyjose/wasm` in the import. The two packages have the same API, and the Web samples run with that same change. If `samples/web` has a region with the same id, the Web tab shows that region instead.
- An optional `title` captions the code in every tab.
- **The build fails** if any of the five platforms has no region for the id and no `unavailable` entry.

### When a platform lacks a capability

Some capabilities don't exist on every platform. Compression (`zip`), for example, is only in the Rust crate. Such a sample still has five tabs, and the missing ones explain why:

```mdx
<Samples
  id="encrypt-and-decrypt/zip"
  unavailable={{ node: "zip-bindings", web: "zip-bindings", kotlin: "zip-bindings", swift: "zip-bindings" }}
/>
```

The platform names are `rust`, `node`, `web`, `kotlin` and `swift`. Each value is a key in [`src/data/unavailable.json`](../src/data/unavailable.json), never free text, so the reason is worded the same on every page. To add a reason, add a key there. A platform listed as unavailable must not define the region as well.

### Single-platform samples

The get-started pages are each about one platform, so they can show one platform's region without tabs:

```mdx
import Sample from '../../../components/samples/Sample.astro';

<Sample platform="rust" id="start/rust-first-sign" />
```

`<Sample>` is allowed only on pages under `start/`. Everywhere else, use `<Samples>` so readers of every platform are served.

### Install lines

```mdx
import Install from '../../../components/samples/Install.astro';

<Install platform="kotlin" />
```

This prints the install line for `rust` (`cargo add`), `node` or `web` (`npm install`), `kotlin` (Gradle, for Android and for the JVM) or `swift` (Swift Package Manager), with the version from the platform's pin. Nobody types a version by hand. In `none` and `git` mode it is marked as unpublished; in `registry` mode it is the published version. Each snippet names the package's public page on its registry.

## Fixtures

`fixtures/keys.json` holds example keys published in the RFCs: the HMAC key from RFC 7515 Appendix A.1, the RSA public key from Appendix A.2, the P-256 key pair from Appendix A.3 and the Ed25519 key pair from RFC 8037 Appendix A.1. Each entry names its source. **These keys are public test keys. Their private parts are printed in the RFCs, so they protect nothing; never use them in an application.** A test checks every value against the RFC text and against the example signatures in the RFCs.

Samples that generate keys check the shape of the result (`kty`, `crv`), not its value. Samples that issue a JWT set `exp` a few minutes ahead and verify the token in the same test, so they don't depend on a fixed clock.

## Pins

`pins/rust.json`, `pins/js.json`, `pins/kotlin.json` and `pins/swift.json` each say which polyjose build that platform's samples are tested against. The JS pin covers both Node.js and Web.

| Mode | Example | Meaning |
|---|---|---|
| `none` | `{ "source": "none", "upcoming": "0.1.2" }` | There is no build to test yet. The platform's samples are reported as SKIPPED. |
| `git` | `{ "source": "git", "rev": "<40-character commit>", "upcoming": "0.1.2" }` | Before a release: polyjose is built from that commit with its own packaging scripts, which never publish anything. |
| `registry` | `{ "source": "registry", "version": "0.1.2" }` | After a release: the exact published version is installed. |

`upcoming` is the version the install lines show before it is published. Unknown fields are rejected, so a misspelt key fails rather than being ignored. Changing a pin is a reviewed change that runs that platform's samples again.

## Running the samples

```sh
npm run samples:coverage          # every sample is used, and every used sample exists
scripts/samples/run.sh rust       # or js, kotlin, swift
scripts/samples/run.sh all
```

**`samples:coverage`** needs no toolchains. It fails when a page uses an id that no platform defines, when a `<Samples>` block lacks a platform without an `unavailable` entry, when an `unavailable` key is missing from `src/data/unavailable.json`, when a region is never used on any page, or when `<Sample>` is used outside `start/`.

**`run.sh`** prints one line per platform: `PASS`, `FAIL` or `SKIPPED`, with a reason. A platform is SKIPPED, never PASS, when its pin is `none`, when its runner isn't installed, when its toolchain is missing, or when the polyjose checkout doesn't match the pin. The exit status is 0 only when no platform failed.

In `git` mode, `run.sh` needs polyjose at the pinned commit:

- **Locally** it uses a `polyjose` checkout next to this repository (`../polyjose`). That checkout must be at the pinned commit, with no uncommitted changes and no untracked files that polyjose doesn't ignore, so the samples never pass against code other than what's pinned. `run.sh` links it as `samples/.polyjose/polyjose`.
- **In CI** (`CI=true`) it clones polyjose into `samples/.polyjose/polyjose` and checks out the pinned commit.

**In CI, a pinned platform that doesn't run fails.** With `CI=true`, a platform whose pin is `git` or `registry` has to run its samples. If it would be SKIPPED, it's reported as `FAIL` with the same reason and the exit status is non-zero. That covers a missing runner, a missing toolchain, and a polyjose clone that can't be fetched. A green CI run therefore never hides samples that didn't run. A `none` pin is still SKIPPED (`no polyjose build pinned`) and doesn't fail the run, in CI too.

### Platform runners

Each platform's runner is `scripts/samples/platforms/<platform>.sh`. `run.sh` sources it in a subshell, from the repository root, with `set -euo pipefail` and these variables:

| Variable | Value |
|---|---|
| `SAMPLES_ROOT` | this repository (absolute path) |
| `SAMPLES_PLATFORM` | `rust`, `js`, `kotlin` or `swift` |
| `SAMPLES_PIN_SOURCE` | `git` or `registry` |
| `SAMPLES_PIN_REV` | the pinned polyjose commit (`git` mode; empty otherwise) |
| `SAMPLES_PIN_VERSION` | the pinned version (`registry`), or the upcoming one (`git`) |
| `SAMPLES_WORK_DIR` | `samples/.polyjose`, for build output kept outside the sample projects |
| `POLYJOSE_DIR` | polyjose at the pinned commit (`git` mode; empty otherwise) |

The runner builds or installs polyjose for its platform, then runs that platform's samples. Finishing with status 0 is a pass and any other status is a failure. If its toolchain is missing, it calls `samples_skip "<reason>"`, which reports the platform as SKIPPED locally and as FAIL in CI. A runner never publishes anything.
