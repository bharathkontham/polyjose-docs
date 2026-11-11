# shellcheck shell=bash
# The Rust samples runner, sourced by scripts/samples/run.sh (see "Platform runners" in
# samples/README.md).
#
# Git mode: samples/rust depends on polyjose by path, on the copy of the pinned commit that
# common.sh exports, and `cargo test --locked` runs every sample. The samples' build output goes to
# samples/.polyjose/target/rust-samples, outside samples/rust.
#
# Registry mode: a copy of samples/rust depends on the exact published version instead
# (`polyjose = "=<version>"`, from crates.io, which cargo checks against the index checksum). The
# copy's Cargo.lock keeps every other locked version; only the polyjose entry gains its source.
# shellcheck source=common.sh
. "$SAMPLES_ROOT/scripts/samples/platforms/common.sh"

samples_need cargo

if [ "$SAMPLES_PIN_SOURCE" = registry ]; then
  samples_registry_project rust
  path_dep='path = "../.polyjose/export/polyjose/crates/polyjose"'
  grep -qF "$path_dep" "$SAMPLES_ROOT/samples/rust/Cargo.toml" \
    || { echo "rust: samples/rust/Cargo.toml has no polyjose path dependency to replace" >&2; exit 1; }
  sed "s|$path_dep|version = \"=$SAMPLES_PIN_VERSION\"|" "$SAMPLES_ROOT/samples/rust/Cargo.toml" \
    >"$REGISTRY_PROJECT/Cargo.toml"
  echo "==> rust: cargo test against polyjose $SAMPLES_PIN_VERSION from crates.io (copy of samples/rust)"
  CARGO_TARGET_DIR="$SAMPLES_WORK_DIR/target/rust-samples-registry" \
    cargo test --manifest-path "$REGISTRY_PROJECT/Cargo.toml"
  grep -A2 '^name = "polyjose"$' "$REGISTRY_PROJECT/Cargo.lock" | grep -qF 'source = "registry+' \
    || { echo "rust: the samples did not resolve polyjose from crates.io" >&2; exit 1; }
  return 0
fi

samples_export_polyjose

echo "==> rust: cargo test (samples/rust)"
CARGO_TARGET_DIR="$SAMPLES_WORK_DIR/target/rust-samples" \
  cargo test --locked --manifest-path "$SAMPLES_ROOT/samples/rust/Cargo.toml"
