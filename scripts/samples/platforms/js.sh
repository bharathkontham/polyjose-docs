# shellcheck shell=bash
# The JavaScript samples runner (Node.js and Web), sourced by scripts/samples/run.sh (see
# "Platform runners" in samples/README.md).
#
# Git mode, in the copy of the pinned commit that common.sh exports:
#   1. bindings/node/scripts/pack.sh packs @polyjose/node, one package that carries the macOS
#      arm64 and x64 addons (polyjose 0.1.2 and later), and bindings/wasm/scripts/build-package.sh
#      packs @polyjose/wasm. Both only pack (they never publish); pack.sh runs on macOS only.
#   2. samples/js's own test dependencies (jose and jsonwebtoken, for the migration guides) are
#      installed from its lockfile with `npm ci --ignore-scripts`. Then the two tarballs are added
#      to samples/js/node_modules offline, with a fresh npm cache and no install scripts, as
#      polyjose's own package test installs them.
#   3. Node.js: `node --test` runs samples/js.
#   4. Web: samples/js is copied to samples/.generated/web with every `@polyjose/node` import
#      rewritten to `@polyjose/wasm` by the site's own rewrite (toWebImports in
#      src/lib/samples/resolve.mjs, the one that makes the Web tab), and run again.
#   5. samples/web is type-checked with the site's TypeScript against the package's .d.ts and
#      compiled to samples/.polyjose/web, then samples/web/browser.test.mjs runs it in headless
#      Chromium (Playwright, from the site's devDependencies).
#
# Registry mode replaces steps 1 and 2's tarballs: after the same `npm ci --ignore-scripts`,
# @polyjose/node and @polyjose/wasm are installed at exactly the pinned version from the npm
# registry (fresh cache, none of the caller's npm settings, no install scripts, nothing saved).
# Steps 3 to 5 are the same.
# shellcheck source=common.sh
. "$SAMPLES_ROOT/scripts/samples/platforms/common.sh"

samples_need node npm
[ "$SAMPLES_PIN_SOURCE" = registry ] || samples_need cargo wasm-pack brotli python3
[ "$SAMPLES_PIN_SOURCE" = registry ] || [ "$(uname -s)" = Darwin ] \
  || samples_skip "git mode packs @polyjose/node with polyjose's bindings/node/scripts/pack.sh, which runs on macOS only"
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)' \
  || samples_skip "Node.js $(node --version) is older than 22.12, the floor of @polyjose/node and @polyjose/wasm"
tsc="$SAMPLES_ROOT/node_modules/.bin/tsc"
[ -x "$tsc" ] || samples_skip "the site's dependencies are not installed; run npm ci --ignore-scripts"
(cd "$SAMPLES_ROOT/samples/web" \
  && node -e 'import("@playwright/test").then(({ chromium }) => process.exit(require("node:fs").existsSync(chromium.executablePath()) ? 0 : 1), () => process.exit(1))') \
  || samples_skip "Playwright's Chromium is not installed; run npx playwright install chromium"

if [ "$SAMPLES_PIN_SOURCE" = registry ]; then
  node_tgz="@polyjose/node@$SAMPLES_PIN_VERSION"
  wasm_tgz="@polyjose/wasm@$SAMPLES_PIN_VERSION"
  npm_offline=false
else
  samples_export_polyjose

  case $(uname -m) in
    arm64 | x86_64) ;;
    *) samples_skip "@polyjose/node carries no addon for macOS on $(uname -m)" ;;
  esac

  echo "==> js: pack @polyjose/node (bindings/node/scripts/pack.sh)"
  (cd "$POLYJOSE_EXPORT/bindings/node" && scripts/pack.sh)
  echo "==> js: pack @polyjose/wasm (bindings/wasm/scripts/build-package.sh)"
  (cd "$POLYJOSE_EXPORT" && bindings/wasm/scripts/build-package.sh)
  npm_offline=true
fi

# one_file <glob>: the single file the glob matches, or a failure.
one_file() {
  # The glob is expanded here on purpose.
  # shellcheck disable=SC2206
  local files=($1)
  [ ${#files[@]} -eq 1 ] && [ -f "${files[0]}" ] || { echo "js: expected one file for $1" >&2; return 1; }
  printf '%s\n' "${files[0]}"
}
if [ "$SAMPLES_PIN_SOURCE" = git ]; then
  node_dist="$POLYJOSE_EXPORT/bindings/node/dist/npm"
  node_tgz=$(one_file "$node_dist/polyjose-node-[0-9]*.tgz")
  wasm_tgz=$(one_file "$POLYJOSE_EXPORT/dist/npm/polyjose-wasm-[0-9]*.tgz")
fi

echo "==> js: install the samples' test dependencies (samples/js/package-lock.json, no scripts)"
(cd "$SAMPLES_ROOT/samples/js" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error)

if [ "$npm_offline" = true ]; then
  echo "==> js: install the tarballs into samples/js (offline)"
else
  echo "==> js: install $node_tgz and $wasm_tgz into samples/js (npm registry)"
fi
npm_home="$SAMPLES_WORK_DIR/npm"
rm -rf "$npm_home"
mkdir -p "$npm_home"
: >"$npm_home/user.npmrc"
: >"$npm_home/global.npmrc"
(
  # Hermetic npm: none of the caller's npm settings, a fresh cache, offline (git mode; registry
  # mode fetches the two packages from the default npm registry), no scripts. npm reads
  # samples/js/package-lock.json, so the test dependencies npm ci just installed stay as they are
  # without a fetch, and saves nothing: package.json and the lockfile are left unchanged.
  for var in $(env | sed -n 's/^\([Nn][Pp][Mm]_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$var"; done
  export npm_config_cache="$npm_home/cache" \
    npm_config_userconfig="$npm_home/user.npmrc" \
    npm_config_globalconfig="$npm_home/global.npmrc" \
    npm_config_offline="$npm_offline" npm_config_audit=false npm_config_fund=false \
    npm_config_update_notifier=false npm_config_ignore_scripts=true \
    npm_config_save=false
  cd "$SAMPLES_ROOT/samples/js" || exit 1
  npm install --loglevel=error "$node_tgz" "$wasm_tgz"
)
if [ "$SAMPLES_PIN_SOURCE" = registry ]; then
  for pkg in node wasm; do
    installed=$(node -p 'require(process.argv[1]).version' "$SAMPLES_ROOT/samples/js/node_modules/@polyjose/$pkg/package.json")
    [ "$installed" = "$SAMPLES_PIN_VERSION" ] \
      || { echo "js: @polyjose/$pkg is $installed, not the pinned $SAMPLES_PIN_VERSION" >&2; exit 1; }
  done
fi

echo "==> js: Node.js (@polyjose/node): node --test samples/js"
(cd "$SAMPLES_ROOT/samples/js" && node --test --test-reporter=spec)

echo "==> js: Web (@polyjose/wasm): node --test samples/.generated/web"
# The script is JavaScript, so it is single-quoted on purpose.
# shellcheck disable=SC2016
SAMPLES_GENERATED="$SAMPLES_ROOT/samples/.generated/web" node --input-type=module -e '
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const root = process.env.SAMPLES_ROOT;
const out = process.env.SAMPLES_GENERATED;
const { toWebImports } = await import(pathToFileURL(join(root, "src/lib/samples/resolve.mjs")).href);
const from = join(root, "samples/js");
rmSync(out, { recursive: true, force: true });
let rewritten = 0;
const copy = (dir, to) => {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const src = join(dir, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory()) { copy(src, dest); continue; }
    if (!entry.name.endsWith(".mjs")) { cpSync(src, dest); continue; }
    const text = readFileSync(src, "utf8");
    const web = toWebImports(text);
    // A second pass finds nothing: no @polyjose/node import is left.
    if (toWebImports(web) !== web || /["\x27]@polyjose\/node["\x27]/.test(web.replace(/\/\/.*$/gm, ""))) {
      throw new Error(`${src}: an @polyjose/node import was not rewritten`);
    }
    if (web !== text) rewritten++;
    writeFileSync(dest, web);
  }
};
copy(from, out);
if (rewritten === 0) throw new Error("no sample imported @polyjose/node, so the Web run would test nothing");
symlinkSync(join(from, "node_modules"), join(out, "node_modules"));
console.log(`js: ${rewritten} file(s) rewritten to @polyjose/wasm in samples/.generated/web`);
'
(cd "$SAMPLES_ROOT/samples/.generated/web" && node --test --test-reporter=spec)

echo "==> js: samples/web: tsc, then headless Chromium"
web_build="$SAMPLES_WORK_DIR/web"
rm -rf "$web_build" "$SAMPLES_ROOT/samples/web/node_modules"
# samples/web resolves @polyjose/wasm, and its .d.ts, from the packages just installed.
ln -s ../js/node_modules "$SAMPLES_ROOT/samples/web/node_modules"
"$tsc" -p "$SAMPLES_ROOT/samples/web/tsconfig.json" --outDir "$web_build"
"$tsc" -p "$SAMPLES_ROOT/samples/web/tsconfig.worker.json" --outDir "$web_build"
(cd "$SAMPLES_ROOT/samples/web" && SAMPLES_WEB_BUILD="$web_build" node --test --test-reporter=spec browser.test.mjs)
