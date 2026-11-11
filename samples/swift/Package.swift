// swift-tools-version: 6.0
// The Swift code samples of the polyjose docs: XCTest cases against the polyjose Swift package at
// the pinned commit (scripts/samples/platforms/swift.sh). Never published.
//
// swift.sh exports that commit to samples/.polyjose/export/polyjose, builds its XCFramework with
// platforms/swift/scripts/build-xcframework.sh, and runs `swift test` with
// POLYJOSE_LOCAL_XCFRAMEWORK=1, which makes polyjose's Package.swift use that local build.
//
// JOSESwift is a test-only dependency, pinned to one exact version (Package.resolved is committed),
// for the "before" side and the interop tests of Guides > Migrate from JOSESwift.
//
// With a registry pin, swift.sh runs a copy of this package with POLYJOSE_SAMPLES_VERSION set to
// the published version, and polyjose comes from its GitHub repository at exactly that version.
import Foundation
import PackageDescription

let polyjose: Package.Dependency =
    if let version = ProcessInfo.processInfo.environment["POLYJOSE_SAMPLES_VERSION"] {
        .package(url: "https://github.com/bharathkontham/polyjose.git", exact: Version(stringLiteral: version))
    } else {
        .package(path: "../.polyjose/export/polyjose")
    }

let package = Package(
    name: "polyjose-samples",
    platforms: [
        .macOS(.v13)
    ],
    dependencies: [
        polyjose,
        .package(url: "https://github.com/airsidemobile/JOSESwift.git", exact: "3.0.0"),
    ],
    targets: [
        .testTarget(
            name: "SamplesTests",
            dependencies: [
                .product(name: "Polyjose", package: "polyjose"),
                .product(name: "JOSESwift", package: "JOSESwift"),
            ],
            path: "Tests/SamplesTests"
        )
    ],
    swiftLanguageModes: [.v6]
)
