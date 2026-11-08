// The samples of Guides › JWK Sets (src/content/docs/guides/jwk-sets.mdx).
//
// Verifying JWTs against a JWK Set (RFC 7517 §5), as an issuer publishes at its jwks_uri: the key
// is chosen by the token's kid (RFC 7515 §4.1.4) and alg, the issuer is still checked
// (RFC 8725 §3.8), and a set holding an RSA private key is refused. The set is
// fixtures/jwks.json; the signers are the matching fixture private keys with the same kid.

import Foundation
import Polyjose
import XCTest

final class JwkSetsTests: XCTestCase {
    private var options: JwtVerifyOptions {
        JwtVerifyOptions(allowedAlgs: ["ES256", "Ed25519"], issuers: [issuer], audiences: [audience])
    }

    /// A JWT from `iss`, signed by the fixture `name` with `kid`; jwtSign copies the key's kid into the header.
    private func signedToken(_ name: String, kid: String, alg: String, iss: String = issuer) throws -> String {
        let exp = Int64(Date().timeIntervalSince1970) + 300
        return try jwtSign(
            claims: #"{"iss":"\#(iss)","sub":"\#(subject)","aud":"\#(audience)","exp":\#(exp)}"#,
            key: try withKid(try fixtureJwk(name), kid: kid),
            options: JwtSignOptions(alg: alg))
    }

    func testVerify() throws {
        let token = try signedToken("p256", kid: "p256-2026", alg: "ES256")
        let jwks = try fixtureJwks()
        // docs:start jwk-sets/verify
        // jwks is the issuer's JWK Set, as fetched from its jwks_uri.
        let verified = try jwtVerifyWithJwks(
            token: token,
            jwks: jwks,
            options: JwtVerifyOptions(
                allowedAlgs: ["ES256", "Ed25519"],
                issuers: [issuer],
                audiences: [audience]
            )
        )
        // verified.kid and verified.keyIndex say which key of the set verified it.
        // docs:end jwk-sets/verify
        XCTAssertEqual(verified.keyIndex, 0)
        XCTAssertEqual(verified.kid, "p256-2026")
        XCTAssertEqual(verified.alg, "ES256")
        let second = try jwtVerifyWithJwks(
            token: try signedToken("ed25519", kid: "ed25519-2026", alg: "Ed25519"), jwks: jwks, options: options)
        XCTAssertEqual(second.keyIndex, 1)
        XCTAssertEqual(second.kid, "ed25519-2026")
    }

    func testNoMatchingKey() throws {
        let token = try signedToken("p256", kid: "retired-2025", alg: "ES256")
        let jwks = try fixtureJwks()
        // docs:start jwk-sets/no-matching-key
        // The token's kid is not in the set, for example a key the issuer has rotated out.
        var code: String?
        do {
            _ = try jwtVerifyWithJwks(token: token, jwks: jwks, options: options)
        } catch let error as PolyjoseError {
            code = error.code()  // "NoMatchingKey"
        }
        // docs:end jwk-sets/no-matching-key
        XCTAssertEqual(code, "NoMatchingKey")
    }

    func testIssuer() throws {
        let token = try signedToken("p256", kid: "p256-2026", alg: "ES256", iss: "https://other.example")
        let jwks = try fixtureJwks()
        // docs:start jwk-sets/issuer
        // A key in the set does not vouch for every issuer; iss is checked as well (RFC 8725 §3.8).
        var code: String?
        do {
            _ = try jwtVerifyWithJwks(token: token, jwks: jwks, options: options)
        } catch let error as PolyjoseError {
            code = error.code()  // "InvalidClaim"
        }
        // docs:end jwk-sets/issuer
        XCTAssertEqual(code, "InvalidClaim")
    }

    func testSelect() throws {
        let jwks = try fixtureJwks()
        // docs:start jwk-sets/select
        let key = try jwksSelect(jwks: jwks, selector: JwkSelector(kid: "p256-2026", alg: "ES256"))
        // docs:end jwk-sets/select
        let jwk = try jsonObject(key)
        XCTAssertEqual(jwk["kid"] as? String, "p256-2026")
        XCTAssertEqual(jwk["crv"] as? String, "P-256")
        XCTAssertNil(jwk["d"])
    }

    func testSelectAmbiguous() throws {
        let jwks = try fixtureJwks()
        // docs:start jwk-sets/select-ambiguous
        // Both keys are signing keys, so "use": "sig" alone picks no single key (RFC 7517 §4.2).
        var code: String?
        do {
            _ = try jwksSelect(jwks: jwks, selector: JwkSelector(keyUse: "sig"))
        } catch let error as PolyjoseError {
            code = error.code()  // "MultipleMatchingKeys"
        }
        // docs:end jwk-sets/select-ambiguous
        XCTAssertEqual(code, "MultipleMatchingKeys")
    }

    func testRsaPrivate() throws {
        let token = try signedToken("p256", kid: "p256-2026", alg: "ES256")
        let rsaPrivateKey = try rsaPrivateJwk()
        let leaked = #"{"keys":[\#(rsaPrivateKey)]}"#
        // docs:start jwk-sets/rsa-private
        // A set that contains an RSA private key (one with "d") is refused as a whole.
        var code: String?
        do {
            _ = try jwtVerifyWithJwks(token: token, jwks: leaked, options: options)
        } catch let error as PolyjoseError {
            code = error.code()  // "UnsupportedAlgorithm"
        }
        // docs:end jwk-sets/rsa-private
        XCTAssertEqual(code, "UnsupportedAlgorithm")
    }
}
