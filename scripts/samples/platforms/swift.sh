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
# shellcheck source=common.sh
. "$SAMPLES_ROOT/scripts/samples/platforms/common.sh"

[ "$(uname -s)" = Darwin ] || samples_skip "the Swift samples need macOS with Xcode"
samples_need swift xcodebuild cargo
samples_git_only
samples_export_polyjose

echo "==> swift: build PolyjoseFFI.xcframework (platforms/swift/scripts/build-xcframework.sh)"
"$POLYJOSE_EXPORT/platforms/swift/scripts/build-xcframework.sh"

echo "==> swift: samples (swift test, samples/swift)"
POLYJOSE_LOCAL_XCFRAMEWORK=1 swift test \
  --package-path "$SAMPLES_ROOT/samples/swift" \
  --scratch-path "$SAMPLES_WORK_DIR/build/swift-samples" \
  -Xswiftc -warnings-as-errors
