# shellcheck shell=bash
# The Rust samples runner, sourced by scripts/samples/run.sh (see "Platform runners" in
# samples/README.md).
#
# Git mode: samples/rust depends on polyjose by path, on the copy of the pinned commit that
# common.sh exports, and `cargo test --locked` runs every sample. The samples' build output goes to
# samples/.polyjose/target/rust-samples, outside samples/rust.
# shellcheck source=common.sh
. "$SAMPLES_ROOT/scripts/samples/platforms/common.sh"

samples_need cargo
samples_git_only
samples_export_polyjose

echo "==> rust: cargo test (samples/rust)"
CARGO_TARGET_DIR="$SAMPLES_WORK_DIR/target/rust-samples" \
  cargo test --locked --manifest-path "$SAMPLES_ROOT/samples/rust/Cargo.toml"
