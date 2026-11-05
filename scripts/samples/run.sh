#!/usr/bin/env bash
# Runs the docs code samples of one platform, or of all four, against the
# polyjose build named in samples/pins/<platform>.json.
#
# Usage: scripts/samples/run.sh <rust|js|kotlin|swift|all>
#
# Each platform gets exactly one result line:
#   PASS (<platform>)
#   FAIL (<platform>: <reason>)
#   SKIPPED (<platform>: <reason>)
# A platform that did not run is SKIPPED, never PASS. The exit status is 0
# only when no platform failed.
#
# For each platform:
#   - pin "none": SKIPPED, there is no polyjose build to test against yet
#   - no scripts/samples/platforms/<platform>.sh: SKIPPED, runner not installed
#   - pin "git": polyjose is made available at the pinned commit as
#     samples/.polyjose/polyjose. Locally that is a link to a sibling
#     ../polyjose checkout, which must be at the pinned commit with no
#     uncommitted changes and no untracked files other than ones polyjose
#     ignores (otherwise SKIPPED, also when git status fails). With CI=true,
#     polyjose is cloned there instead (POLYJOSE_GIT_URL overrides the URL);
#     a clone kept from an earlier run has its origin reset to that URL.
#   - pin "registry": the runner installs the published version itself.
#
# Runner contract. scripts/samples/platforms/<platform>.sh is sourced in a
# subshell, from the docs repository root, with `set -euo pipefail` and:
#   SAMPLES_ROOT         the docs repository (absolute path)
#   SAMPLES_PLATFORM     rust, js, kotlin or swift
#   SAMPLES_PIN_SOURCE   git or registry
#   SAMPLES_PIN_REV      the pinned polyjose commit (git mode; empty otherwise)
#   SAMPLES_PIN_VERSION  the pinned version (registry) or the upcoming one (git)
#   SAMPLES_WORK_DIR     samples/.polyjose, for build output kept outside the sample projects
#   POLYJOSE_DIR         polyjose at the pinned commit (git mode; empty otherwise)
# Finishing with status 0 is a PASS; any other status is a FAIL. A runner
# whose toolchain is missing calls `samples_skip "<reason>"`, which ends it
# as SKIPPED.
#
# Written for bash 3.2 (macOS /bin/bash): no associative arrays, mapfile or
# ${var,,}.

set -u

HERE=$(cd "$(dirname "$0")" && pwd -P)
ROOT=${SAMPLES_ROOT:-$(cd "$HERE/../.." && pwd -P)}
ALL_PLATFORMS="rust js kotlin swift"
DEFAULT_GIT_URL="https://github.com/bharathkontham/polyjose.git"

usage() {
  echo "Usage: scripts/samples/run.sh <rust|js|kotlin|swift|all>" >&2
  exit 2
}

[ $# -eq 1 ] || usage
case "$1" in
  all) platforms=$ALL_PLATFORMS ;;
  rust | js | kotlin | swift) platforms=$1 ;;
  *) usage ;;
esac

failed=0
skip_file=$(mktemp "${TMPDIR:-/tmp}/samples-skip.XXXXXX") || exit 1
trap 'rm -f "$skip_file"' EXIT

pass() { echo "PASS ($1)"; }
fail() { echo "FAIL ($1: $2)"; failed=1; }
skip() { echo "SKIPPED ($1: $2)"; }
short() { printf '%s' "$1" | cut -c1-12; }

# Makes polyjose available at the pinned commit as samples/.polyjose/polyjose.
# Prints nothing on success; on failure sets prepare_result to "skip" or
# "fail" and prepare_reason to why.
prepare_git() {
  rev=$1
  work="$ROOT/samples/.polyjose"
  dest="$work/polyjose"
  prepare_result=ok
  prepare_reason=

  if [ "${CI:-}" = "true" ]; then
    url=${POLYJOSE_GIT_URL:-$DEFAULT_GIT_URL}
    mkdir -p "$work" || { prepare_result=fail; prepare_reason="could not create samples/.polyjose"; return; }
    if [ -L "$dest" ]; then rm -f "$dest"; fi
    if [ ! -d "$dest/.git" ]; then
      rm -rf "$dest"
      if ! git init -q "$dest"; then
        prepare_result=fail; prepare_reason="could not create a clone of polyjose"; return
      fi
    fi
    # A reused clone may point at an older URL; always fetch from this one.
    if ! git -C "$dest" remote set-url origin "$url" >/dev/null 2>&1 \
      && ! git -C "$dest" remote add origin "$url" >/dev/null 2>&1; then
      prepare_result=fail; prepare_reason="could not set the polyjose clone's origin to $url"; return
    fi
    if ! git -C "$dest" fetch -q --depth 1 origin "$rev" >/dev/null 2>&1 \
      || ! git -C "$dest" -c advice.detachedHead=false checkout -q --detach "$rev" >/dev/null 2>&1; then
      prepare_result=fail; prepare_reason="could not fetch polyjose $(short "$rev") from $url"; return
    fi
    head=$(git -C "$dest" rev-parse HEAD 2>/dev/null)
    if [ "$head" != "$rev" ]; then
      prepare_result=fail; prepare_reason="the polyjose clone is at $(short "$head"), not the pinned $(short "$rev")"; return
    fi
    return
  fi

  parent=$(cd "$ROOT/.." && pwd -P)
  sibling="$parent/polyjose"
  if [ ! -e "$sibling/.git" ]; then
    prepare_result=skip; prepare_reason="no polyjose checkout at ../polyjose; clone it next to the docs repository"; return
  fi
  head=$(git -C "$sibling" rev-parse HEAD 2>/dev/null)
  if [ "$head" != "$rev" ]; then
    prepare_result=skip
    prepare_reason="../polyjose is at $(short "$head"), not the pinned $(short "$rev"); check out the pinned commit"
    return
  fi
  # Untracked files count (they can change the build), files polyjose ignores
  # (build output such as target/) do not. If git cannot say, the checkout is
  # not known to match the pin, so the platform is skipped.
  if ! changes=$(git -C "$sibling" status --porcelain --untracked-files=normal 2>/dev/null); then
    prepare_result=skip; prepare_reason="could not read the state of ../polyjose: git status failed"; return
  fi
  if [ -n "$changes" ]; then
    prepare_result=skip; prepare_reason="../polyjose has uncommitted changes"; return
  fi
  mkdir -p "$work" || { prepare_result=fail; prepare_reason="could not create samples/.polyjose"; return; }
  if [ -e "$dest" ] && [ ! -L "$dest" ]; then
    prepare_result=fail
    prepare_reason="samples/.polyjose/polyjose is a directory, not a link to ../polyjose; remove it"
    return
  fi
  rm -f "$dest"
  ln -s "$sibling" "$dest" || { prepare_result=fail; prepare_reason="could not link samples/.polyjose/polyjose"; }
}

run_platform() {
  platform=$1

  if ! pin=$(node "$HERE/read-pin.mjs" "$ROOT" "$platform" 2>&1); then
    fail "$platform" "$(printf '%s\n' "$pin" | head -n 1)"
    return
  fi
  source=; rev=; version=
  while IFS='=' read -r key value; do
    case "$key" in
      source) source=$value ;;
      rev) rev=$value ;;
      version) version=$value ;;
    esac
  done <<EOF
$pin
EOF

  if [ "$source" = "none" ]; then
    skip "$platform" "no polyjose build pinned"
    return
  fi

  runner="$ROOT/scripts/samples/platforms/$platform.sh"
  if [ ! -f "$runner" ]; then
    skip "$platform" "runner not installed"
    return
  fi

  polyjose_dir=
  if [ "$source" = "git" ]; then
    prepare_git "$rev"
    case "$prepare_result" in
      skip) skip "$platform" "$prepare_reason"; return ;;
      fail) fail "$platform" "$prepare_reason"; return ;;
    esac
    polyjose_dir="$ROOT/samples/.polyjose/polyjose"
  fi

  : >"$skip_file"
  (
    set -euo pipefail
    cd "$ROOT"
    export SAMPLES_ROOT="$ROOT"
    export SAMPLES_PLATFORM="$platform"
    export SAMPLES_PIN_SOURCE="$source"
    export SAMPLES_PIN_REV="$rev"
    export SAMPLES_PIN_VERSION="$version"
    export SAMPLES_WORK_DIR="$ROOT/samples/.polyjose"
    export POLYJOSE_DIR="$polyjose_dir"
    # Called by the sourced runner, not here.
    # shellcheck disable=SC2329
    samples_skip() {
      printf '%s\n' "${1:-skipped by its runner}" >"$skip_file"
      exit 77
    }
    # shellcheck source=/dev/null
    . "$runner"
  )
  status=$?

  if [ "$status" -eq 77 ] && [ -s "$skip_file" ]; then
    skip "$platform" "$(head -n 1 "$skip_file")"
  elif [ "$status" -eq 0 ]; then
    pass "$platform"
  else
    fail "$platform" "runner exited with status $status"
  fi
}

if ! command -v node >/dev/null 2>&1; then
  for platform in $platforms; do fail "$platform" "node is needed to read the pins"; done
  exit 1
fi

for platform in $platforms; do
  run_platform "$platform"
done

exit "$failed"
