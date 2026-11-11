# shellcheck shell=bash
# The Swift samples runner, sourced by scripts/samples/run.sh (see "Platform runners" in
# samples/README.md).
#
# Git mode, in the copy of the pinned commit that common.sh exports:
#   1. platforms/swift/scripts/build-xcframework.sh builds PolyjoseFFI.xcframework (incremental
#      after the first run);
#   2. samples/swift depends on that copy by path, and `swift test` runs on the macOS host, in
#      Swift 6 language mode with warnings as errors, with POLYJOSE_LOCAL_XCFRAMEWORK=1 so that
#      polyjose's Package.swift uses the local XCFramework. Build output goes to
#      samples/.polyjose/build/swift-samples.
#
# Registry mode: a copy of samples/swift runs with POLYJOSE_SAMPLES_VERSION set, which makes its
# Package.swift depend on the polyjose package at that exact version from GitHub. SwiftPM then
# downloads the release's PolyjoseFFI.xcframework.zip and checks it against the checksum in
# polyjose's Package.swift at that tag. Nothing is built from a checkout.
# shellcheck source=common.sh
. "$SAMPLES_ROOT/scripts/samples/platforms/common.sh"

[ "$(uname -s)" = Darwin ] || samples_skip "the Swift samples need macOS with Xcode"
samples_need swift xcodebuild

if [ "$SAMPLES_PIN_SOURCE" = registry ]; then
  samples_registry_project swift
  echo "==> swift: samples against polyjose $SAMPLES_PIN_VERSION from its GitHub release (swift test, copy of samples/swift)"
  POLYJOSE_SAMPLES_VERSION="$SAMPLES_PIN_VERSION" swift test \
    --package-path "$REGISTRY_PROJECT" \
    --scratch-path "$SAMPLES_WORK_DIR/build/swift-samples-registry" \
    -Xswiftc -warnings-as-errors
  grep -qF "\"version\" : \"$SAMPLES_PIN_VERSION\"" "$REGISTRY_PROJECT/Package.resolved" \
    && grep -qF '"identity" : "polyjose"' "$REGISTRY_PROJECT/Package.resolved" \
    || { echo "swift: the samples did not resolve polyjose $SAMPLES_PIN_VERSION from GitHub" >&2; exit 1; }
  return 0
fi

samples_need cargo
samples_export_polyjose

echo "==> swift: build PolyjoseFFI.xcframework (platforms/swift/scripts/build-xcframework.sh)"
"$POLYJOSE_EXPORT/platforms/swift/scripts/build-xcframework.sh"

echo "==> swift: samples (swift test, samples/swift)"
POLYJOSE_LOCAL_XCFRAMEWORK=1 swift test \
  --package-path "$SAMPLES_ROOT/samples/swift" \
  --scratch-path "$SAMPLES_WORK_DIR/build/swift-samples" \
  -Xswiftc -warnings-as-errors
