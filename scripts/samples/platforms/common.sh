# shellcheck shell=bash
# Helpers shared by the platform runners (rust.sh, js.sh, kotlin.sh, swift.sh). Each runner sources
# this file; it is not a runner itself, because run.sh only runs scripts named after a platform.
# See "Platform runners" in samples/README.md for the variables run.sh sets.
#
# Git mode never builds inside $POLYJOSE_DIR. samples_export_polyjose writes the pinned commit to
# $SAMPLES_WORK_DIR/export/polyjose with `git archive`, and every build runs in that copy, so the
# polyjose checkout stays exactly as run.sh found it. The copy is reused while it holds the pinned
# commit (its build output with it); delete samples/.polyjose/export to start from scratch.
#
# Registry mode never needs a polyjose checkout: each runner installs the published
# $SAMPLES_PIN_VERSION from its platform's registry (crates.io, npm, Maven Central, or the GitHub
# release that the Swift package's tag points at) and runs the same samples against it.

# samples_need <tool>...: skip the platform unless every tool is on PATH.
samples_need() {
  for tool in "$@"; do
    command -v "$tool" >/dev/null 2>&1 || samples_skip "$tool not found on PATH"
  done
}

# samples_registry_project <platform>: registry mode. Sets REGISTRY_PROJECT to a fresh copy of
# samples/<platform> in samples/.polyjose/registry, where the runner may point the manifest at the
# published package and let the package manager rewrite the lockfile, so the committed project is
# left as it is. The samples find samples/fixtures by relative path, so it is linked next to the copy.
samples_registry_project() {
  local base="$SAMPLES_WORK_DIR/registry"
  mkdir -p "$base"
  base=$(cd "$base" && pwd -P)
  rm -rf "${base:?}/$1" "$base/fixtures"
  cp -R "$SAMPLES_ROOT/samples/$1" "$base/$1"
  ln -s "$SAMPLES_ROOT/samples/fixtures" "$base/fixtures"
  # Read by the runner that sources this file.
  # shellcheck disable=SC2034
  REGISTRY_PROJECT=$base/$1
}

# samples_export_polyjose: sets POLYJOSE_EXPORT to a copy of polyjose at $SAMPLES_PIN_REV.
samples_export_polyjose() {
  local base="$SAMPLES_WORK_DIR/export"
  local dest="$base/polyjose"
  local stamp="$base/polyjose.rev"
  mkdir -p "$base"
  base=$(cd "$base" && pwd -P)
  dest="$base/polyjose"
  if [ ! -d "$dest" ] || [ "$(cat "$stamp" 2>/dev/null)" != "$SAMPLES_PIN_REV" ]; then
    echo "==> $SAMPLES_PLATFORM: export polyjose $(printf '%s' "$SAMPLES_PIN_REV" | cut -c1-12) to samples/.polyjose/export/polyjose"
    rm -rf "$dest" "$dest.partial" "$stamp"
    mkdir "$dest.partial"
    git -C "$POLYJOSE_DIR" archive --format=tar "$SAMPLES_PIN_REV" | tar -x -C "$dest.partial"
    mv "$dest.partial" "$dest"
    printf '%s\n' "$SAMPLES_PIN_REV" >"$stamp"
  fi
  # Read by the runner that sources this file.
  # shellcheck disable=SC2034
  POLYJOSE_EXPORT=$dest
  # The copy has no .git. Without a ceiling, polyjose's scripts that ask git about their tree (to
  # stamp a build, say) would find the docs repository around samples/.polyjose instead.
  export GIT_CEILING_DIRECTORIES="$base"
  # Build output stays in the copy: cargo uses its target/, as polyjose's scripts expect.
  unset CARGO_TARGET_DIR
}
