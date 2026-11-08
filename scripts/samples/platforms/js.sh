# shellcheck shell=bash
# The JavaScript samples runner (Node.js and Web), sourced by scripts/samples/run.sh (see
# "Platform runners" in samples/README.md).
#
# Git mode, in the copy of the pinned commit that common.sh exports:
#   1. bindings/node/scripts/pack.sh packs @polyjose/node and its darwin addon packages, and
#      bindings/wasm/scripts/build-package.sh packs @polyjose/wasm. Both only pack (they never
#      publish); pack.sh runs on macOS only.
#   2. The tarballs are installed into samples/js/node_modules offline, with a fresh npm cache and
#      no install scripts, as polyjose's own package test installs them. npm finds no other
#      platform's addon offline and leaves those optional dependencies out.
#   3. Node.js: `node --test` runs samples/js.
#   4. Web: samples/js is copied to samples/.generated/web with every `@polyjose/node` import
#      rewritten to `@polyjose/wasm` by the site's own rewrite (toWebImports in
#      src/lib/samples/resolve.mjs, the one that makes the Web tab), and run again.
#   5. samples/web is type-checked with the site's TypeScript against the package's .d.ts and
#      compiled to samples/.polyjose/web, then samples/web/browser.test.mjs runs it in headless
#      Chromium (Playwright, from the site's devDependencies).
# shellcheck source=common.sh
. "$SAMPLES_ROOT/scripts/samples/platforms/common.sh"

samples_need node npm cargo wasm-pack brotli python3
samples_git_only
[ "$(uname -s)" = Darwin ] \
  || samples_skip "git mode packs @polyjose/node with polyjose's bindings/node/scripts/pack.sh, which runs on macOS only"
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)' \
  || samples_skip "Node.js $(node --version) is older than 22.12, the floor of @polyjose/node and @polyjose/wasm"
tsc="$SAMPLES_ROOT/node_modules/.bin/tsc"
[ -x "$tsc" ] || samples_skip "the site's dependencies are not installed; run npm ci --ignore-scripts"
(cd "$SAMPLES_ROOT/samples/web" \
  && node -e 'import("@playwright/test").then(({ chromium }) => process.exit(require("node:fs").existsSync(chromium.executablePath()) ? 0 : 1), () => process.exit(1))') \
  || samples_skip "Playwright's Chromium is not installed; run npx playwright install chromium"

samples_export_polyjose

case $(uname -m) in
  arm64) addon=darwin-arm64 ;;
  x86_64) addon=darwin-x64 ;;
  *) samples_skip "no @polyjose/node addon is packed for macOS on $(uname -m)" ;;
esac

echo "==> js: pack @polyjose/node (bindings/node/scripts/pack.sh)"
(cd "$POLYJOSE_EXPORT/bindings/node" && scripts/pack.sh)
echo "==> js: pack @polyjose/wasm (bindings/wasm/scripts/build-package.sh)"
(cd "$POLYJOSE_EXPORT" && bindings/wasm/scripts/build-package.sh)

# one_file <glob>: the single file the glob matches, or a failure.
one_file() {
  # The glob is expanded here on purpose.
  # shellcheck disable=SC2206
  local files=($1)
  [ ${#files[@]} -eq 1 ] && [ -f "${files[0]}" ] || { echo "js: expected one file for $1" >&2; return 1; }
  printf '%s\n' "${files[0]}"
}
node_dist="$POLYJOSE_EXPORT/bindings/node/dist/npm"
node_tgz=$(one_file "$node_dist/polyjose-node-[0-9]*.tgz")
addon_tgz=$(one_file "$node_dist/polyjose-node-$addon-[0-9]*.tgz")
wasm_tgz=$(one_file "$POLYJOSE_EXPORT/dist/npm/polyjose-wasm-[0-9]*.tgz")

echo "==> js: install the tarballs into samples/js (offline)"
npm_home="$SAMPLES_WORK_DIR/npm"
rm -rf "$npm_home" "$SAMPLES_ROOT/samples/js/node_modules"
mkdir -p "$npm_home"
: >"$npm_home/user.npmrc"
: >"$npm_home/global.npmrc"
(
  # Hermetic npm: none of the caller's npm settings, a fresh cache, offline, no scripts, no lock.
  for var in $(env | sed -n 's/^\([Nn][Pp][Mm]_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$var"; done
  export npm_config_cache="$npm_home/cache" \
    npm_config_userconfig="$npm_home/user.npmrc" \
    npm_config_globalconfig="$npm_home/global.npmrc" \
    npm_config_offline=true npm_config_audit=false npm_config_fund=false \
    npm_config_update_notifier=false npm_config_ignore_scripts=true \
    npm_config_package_lock=false npm_config_save=false
  cd "$SAMPLES_ROOT/samples/js" || exit 1
  npm install --loglevel=error "$node_tgz" "$addon_tgz" "$wasm_tgz"
)

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
