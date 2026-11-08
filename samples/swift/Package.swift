// swift-tools-version: 6.0
// The Swift code samples of the polyjose docs: XCTest cases against the polyjose Swift package at
// the pinned commit (scripts/samples/platforms/swift.sh). Never published.
//
// swift.sh exports that commit to samples/.polyjose/export/polyjose, builds its XCFramework with
// platforms/swift/scripts/build-xcframework.sh, and runs `swift test` with
// POLYJOSE_LOCAL_XCFRAMEWORK=1, which makes polyjose's Package.swift use that local build.
import PackageDescription

let package = Package(
    name: "polyjose-samples",
    platforms: [
        .macOS(.v13)
    ],
    dependencies: [
        .package(path: "../.polyjose/export/polyjose")
    ],
    targets: [
        .testTarget(
            name: "SamplesTests",
            dependencies: [
                .product(name: "Polyjose", package: "polyjose")
            ],
            path: "Tests/SamplesTests"
        )
    ],
    swiftLanguageModes: [.v6]
)
