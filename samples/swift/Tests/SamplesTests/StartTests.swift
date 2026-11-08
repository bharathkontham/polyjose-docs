// The samples of Get started › Swift (iOS) (src/content/docs/start/swift.mdx).
//
// The key is RFC 7515 Appendix A.3.1's P-256 key, a public test key. The JWS is the Compact
// Serialization (RFC 7515 §7.1) with ES256, ECDSA over P-256 and SHA-256 (RFC 7518 §3.4). ECDSA
// signatures are randomized, so each test checks what it can (the header part, the payload, the
// error code) and verifies what it signs.

// docs:start start/swift-imports
import Foundation
import Polyjose
// docs:end start/swift-imports
import XCTest

/// BASE64URL(UTF8(`{"alg":"ES256"}`)) (RFC 7515 §5.1 steps 3-4).
private let es256HeaderB64u = "eyJhbGciOiJFUzI1NiJ9"

final class StartTests: XCTestCase {
    /// Signs `hello, polyjose` with the fixture P-256 key, as `testFirstSign` shows.
    private func signedToken() throws -> String {
        try jwsSignCompact(
            payload: Data("hello, polyjose".utf8), key: try Fixtures.jwk("p256"),
            options: JwsSignOptions(protectedHeader: #"{"alg":"ES256"}"#))
    }

    private func verifiedText(_ token: String) throws -> String {
        let verified = try jwsVerifyCompact(
            token: token, key: try Fixtures.publicJwk("p256"), options: JwsVerifyOptions(allowedAlgs: ["ES256"]))
        return String(decoding: verified.payload, as: UTF8.self)
    }

    func testFirstSign() throws {
        let privateKey = try Fixtures.jwk("p256")
        // docs:start start/swift-first-sign
        let token = try jwsSignCompact(
            payload: Data("hello, polyjose".utf8),
            key: privateKey,
            options: JwsSignOptions(protectedHeader: #"{"alg":"ES256"}"#)
        )
        // docs:end start/swift-first-sign
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        XCTAssertEqual(parts.count, 3, "header.payload.signature (RFC 7515 §7.1)")
        XCTAssertEqual(parts.first.map(String.init), es256HeaderB64u)
        XCTAssertEqual(parts.dropFirst().first.map(String.init), "aGVsbG8sIHBvbHlqb3Nl")
        XCTAssertEqual(try verifiedText(token), "hello, polyjose")
    }

    func testFirstVerify() throws {
        let token = try signedToken()
        let publicKey = try Fixtures.publicJwk("p256")
        // docs:start start/swift-first-verify
        let verified = try jwsVerifyCompact(
            token: token,
            key: publicKey,
            options: JwsVerifyOptions(allowedAlgs: ["ES256"])
        )
        let text = String(decoding: verified.payload, as: UTF8.self)
        // docs:end start/swift-first-verify
        XCTAssertEqual(verified.alg, "ES256")
        XCTAssertEqual(text, "hello, polyjose")
        XCTAssertEqual(verified.signatureIndex, 0)
    }

    func testErrorCode() throws {
        let token = try signedToken()
        let publicKey = try Fixtures.publicJwk("p256")
        var code: String?
        // docs:start start/swift-error-code
        // The token is ES256, but this verifier accepts only Ed25519.
        do {
            _ = try jwsVerifyCompact(
                token: token, key: publicKey, options: JwsVerifyOptions(allowedAlgs: ["Ed25519"]))
        } catch let error as PolyjoseError {
            code = error.code()  // "AlgorithmNotAllowed"
        }
        // docs:end start/swift-error-code
        XCTAssertEqual(code, "AlgorithmNotAllowed")
    }

    @MainActor
    func testBackground() async throws {
        let privateKey = try Fixtures.jwk("p256")
        // docs:start start/swift-background
        // From the main actor (a view, say), run the call on a background thread.
        let token = try await Task.detached {
            try jwsSignCompact(
                payload: Data("hello, polyjose".utf8),
                key: privateKey,
                options: JwsSignOptions(protectedHeader: #"{"alg":"ES256"}"#)
            )
        }.value
        // docs:end start/swift-background
        // A detached task runs on the global concurrent executor, never on the main thread.
        let onMain = await Task.detached { pthread_main_np() != 0 }.value
        XCTAssertFalse(onMain, "a detached task ran on the main thread")
        XCTAssertEqual(try verifiedText(token), "hello, polyjose")
    }
}
