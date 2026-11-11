// The samples of Guides › Sign and verify (src/content/docs/guides/sign-and-verify.mdx).
//
// JWS (RFC 7515) with the fixture keys: ES256 (RFC 7518 §3.4), Ed25519 (RFC 9864) and EdDSA
// (RFC 8037 §3.1), HS256 (RFC 7518 §3.2), RS256 and PS256 (RFC 7518 §3.3, §3.5), the JSON
// serializations (RFC 7515 §7.2), detached and unencoded payloads (RFC 7515 Appendix F, RFC 7797),
// and the allow-list every verify takes (RFC 8725 §3.1). ECDSA and the generated keys are
// randomized, so each test checks the shape of what it signs and verifies it.

import Foundation
import Polyjose
import XCTest

/// BASE64URL(UTF8(`{"alg":"ES256"}`)) (RFC 7515 §5.1 steps 3-4).
private let es256ProtectedB64u = "eyJhbGciOiJFUzI1NiJ9"

final class SignAndVerifyTests: XCTestCase {
    private func es256Token() throws -> String {
        try jwsSignCompact(
            payload: Data("hello".utf8), key: try fixtureJwk("p256"),
            options: JwsSignOptions(protectedHeader: #"{"alg":"ES256"}"#))
    }

    func testEs256() throws {
        let privateKey = try fixtureJwk("p256")
        // docs:start sign-and-verify/es256
        let token = try jwsSignCompact(
            payload: Data("hello".utf8),
            key: privateKey,
            options: JwsSignOptions(protectedHeader: #"{"alg":"ES256"}"#)
        )
        // docs:end sign-and-verify/es256
        let parts = token.components(separatedBy: ".")
        XCTAssertEqual(parts.count, 3, "header.payload.signature (RFC 7515 §7.1)")
        XCTAssertEqual(parts[0], es256ProtectedB64u)
        let verified = try jwsVerifyCompact(
            token: token, key: try fixturePublicJwk("p256"), options: JwsVerifyOptions(allowedAlgs: ["ES256"]))
        XCTAssertEqual(String(decoding: verified.payload, as: UTF8.self), "hello")
    }

    func testEd25519() throws {
        let privateKey = try fixtureJwk("ed25519")
        let publicKey = try fixturePublicJwk("ed25519")
        // docs:start sign-and-verify/ed25519
        let token = try jwsSignCompact(
            payload: Data("hello".utf8),
            key: privateKey,
            options: JwsSignOptions(protectedHeader: #"{"alg":"Ed25519"}"#)
        )
        let verified = try jwsVerifyCompact(
            token: token, key: publicKey, options: JwsVerifyOptions(allowedAlgs: ["Ed25519"]))
        // docs:end sign-and-verify/ed25519
        XCTAssertEqual(verified.alg, "Ed25519")
        XCTAssertEqual(String(decoding: verified.payload, as: UTF8.self), "hello")
    }

    func testEddsa() throws {
        let token = rfc8037A4Jws
        let publicKey = try fixturePublicJwk("ed25519")
        // docs:start sign-and-verify/eddsa
        // A token from a peer that still writes the older "EdDSA" name (RFC 8037 §3.1).
        let verified = try jwsVerifyCompact(
            token: token, key: publicKey, options: JwsVerifyOptions(allowedAlgs: ["EdDSA"]))
        // docs:end sign-and-verify/eddsa
        XCTAssertEqual(verified.alg, "EdDSA")
        XCTAssertEqual(String(decoding: verified.payload, as: UTF8.self), rfc8037A4Payload)
    }

    func testHs256() throws {
        // docs:start sign-and-verify/hs256
        let key = try jwkGenerateForAlg(alg: "HS256")  // a 256-bit oct key (RFC 7518 §3.2)
        let token = try jwsSignCompact(
            payload: Data("hello".utf8), key: key, options: JwsSignOptions(protectedHeader: #"{"alg":"HS256"}"#))
        let verified = try jwsVerifyCompact(
            token: token, key: key, options: JwsVerifyOptions(allowedAlgs: ["HS256"]))
        // docs:end sign-and-verify/hs256
        let jwk = try jsonObject(key)
        XCTAssertEqual(jwk["kty"] as? String, "oct")
        XCTAssertEqual(jwk["alg"] as? String, "HS256")
        XCTAssertEqual(try base64urlDecode(text: jwk["k"] as? String ?? "").count, 32)
        XCTAssertEqual(String(decoding: verified.payload, as: UTF8.self), "hello")
    }

    func testNotAllowed() throws {
        let token = try es256Token()
        let publicKey = try fixturePublicJwk("p256")
        // docs:start sign-and-verify/not-allowed
        // The token is ES256, but this verifier accepts only Ed25519 (RFC 8725 §3.1).
        var code: String?
        do {
            _ = try jwsVerifyCompact(
                token: token, key: publicKey, options: JwsVerifyOptions(allowedAlgs: ["Ed25519"]))
        } catch let error as PolyjoseError {
            code = error.code()  // "AlgorithmNotAllowed"
        }
        // docs:end sign-and-verify/not-allowed
        XCTAssertEqual(code, "AlgorithmNotAllowed")
    }

    func testTampered() throws {
        let token = try es256Token()
        let publicKey = try fixturePublicJwk("p256")
        // docs:start sign-and-verify/tampered
        var parts = token.components(separatedBy: ".")
        parts[1] = base64urlEncode(data: Data("hellO".utf8))
        let forged = parts.joined(separator: ".")
        var code: String?
        do {
            _ = try jwsVerifyCompact(
                token: forged, key: publicKey, options: JwsVerifyOptions(allowedAlgs: ["ES256"]))
        } catch let error as PolyjoseError {
            code = error.code()  // "InvalidSignature"
        }
        // docs:end sign-and-verify/tampered
        XCTAssertEqual(code, "InvalidSignature")
    }

    func testRs256() throws {
        let token = rfc7515A2Jws
        let publicKey = try fixtureJwk("rsa-public")
        // docs:start sign-and-verify/rs256
        let verified = try jwsVerifyCompact(
            token: token, key: publicKey, options: JwsVerifyOptions(allowedAlgs: ["RS256"]))
        let claims = String(decoding: verified.payload, as: UTF8.self)
        // docs:end sign-and-verify/rs256
        XCTAssertEqual(verified.alg, "RS256")
        XCTAssertEqual(claims, rfc7515A2Payload)
    }

    func testRsaSign() throws {
        let rsaPrivateKey = try rsaPrivateJwk()
        let rsaPublicKey = try fixtureJwk("rsa-public")
        let payload = Data(rfc7515A2Payload.utf8)
        // docs:start sign-and-verify/rsa-sign
        // rsaPrivateKey is an RSA private JWK with n, e, d, p, q, dp, dq and qi (RFC 7518 §6.3.2).
        let token = try jwsSignCompact(
            payload: payload,
            key: rsaPrivateKey,
            options: JwsSignOptions(protectedHeader: #"{"alg":"RS256"}"#)
        )
        // Verifiers need only the public half: {"kty":"RSA","n":"...","e":"AQAB"}.
        let verified = try jwsVerifyCompact(
            token: token, key: rsaPublicKey, options: JwsVerifyOptions(allowedAlgs: ["RS256"]))
        // docs:end sign-and-verify/rsa-sign
        XCTAssertEqual(token, rfc7515A2Jws, "RSASSA-PKCS1-v1_5 is deterministic (RFC 8017 §8.2.1)")
        XCTAssertEqual(String(decoding: verified.payload, as: UTF8.self), rfc7515A2Payload)
        // PS256 (RFC 7518 §3.5) is randomized, so it is checked by verifying it.
        let ps256 = try jwsSignCompact(
            payload: payload, key: rsaPrivateKey, options: JwsSignOptions(protectedHeader: #"{"alg":"PS256"}"#))
        let verifiedPs256 = try jwsVerifyCompact(
            token: ps256, key: rsaPublicKey, options: JwsVerifyOptions(allowedAlgs: ["PS256"]))
        XCTAssertEqual(verifiedPs256.alg, "PS256")
        // A public key can't sign.
        let code = try errorCode {
            _ = try jwsSignCompact(
                payload: payload, key: rsaPublicKey, options: JwsSignOptions(protectedHeader: #"{"alg":"RS256"}"#))
        }
        XCTAssertEqual(code, "KeyAlgorithmMismatch")
    }

    func testFlattened() throws {
        let privateKey = try fixtureJwk("p256")
        let publicKey = try fixturePublicJwk("p256")
        // docs:start sign-and-verify/flattened
        let jws = try jwsSignFlattened(
            payload: Data("hello".utf8),
            signer: JwsSigner(key: privateKey, protectedHeader: #"{"alg":"ES256"}"#),
            detached: false
        )
        let verified = try jwsVerifyJson(
            jws: jws, key: publicKey, options: JwsVerifyOptions(allowedAlgs: ["ES256"]))
        // docs:end sign-and-verify/flattened
        let json = try jsonObject(jws)
        for member in ["protected", "payload", "signature"] {
            XCTAssertNotNil(json[member], "RFC 7515 §7.2.2: \(member)")
        }
        XCTAssertEqual(verified.signatureIndex, 0)
        XCTAssertEqual(String(decoding: verified.payload, as: UTF8.self), "hello")
    }

    func testGeneral() throws {
        let p256 = try fixtureJwk("p256")
        let ed25519 = try fixtureJwk("ed25519")
        let ed25519Public = try fixturePublicJwk("ed25519")
        // docs:start sign-and-verify/general
        let jws = try jwsSignGeneral(
            payload: Data("hello".utf8),
            signers: [
                JwsSigner(key: p256, protectedHeader: #"{"alg":"ES256"}"#),
                JwsSigner(key: ed25519, protectedHeader: #"{"alg":"Ed25519"}"#),
            ],
            detached: false
        )
        // A verifier that holds only the Ed25519 key uses the second signature.
        let verified = try jwsVerifyJson(
            jws: jws, key: ed25519Public, options: JwsVerifyOptions(allowedAlgs: ["Ed25519"]))
        // docs:end sign-and-verify/general
        XCTAssertEqual((try jsonObject(jws)["signatures"] as? [Any])?.count, 2, "RFC 7515 §7.2.1")
        XCTAssertEqual(verified.signatureIndex, 1)
        XCTAssertEqual(verified.alg, "Ed25519")
        XCTAssertEqual(String(decoding: verified.payload, as: UTF8.self), "hello")
    }

    func testDetached() throws {
        let privateKey = try fixtureJwk("p256")
        let publicKey = try fixturePublicJwk("p256")
        // docs:start sign-and-verify/detached
        let payload = Data("hello".utf8)
        let token = try jwsSignCompact(
            payload: payload,
            key: privateKey,
            options: JwsSignOptions(protectedHeader: #"{"alg":"ES256"}"#, detached: true)
        )
        // The payload travels separately and is passed back in to verify (RFC 7515 Appendix F).
        let verified = try jwsVerifyCompact(
            token: token,
            key: publicKey,
            options: JwsVerifyOptions(allowedAlgs: ["ES256"], detachedPayload: payload)
        )
        // docs:end sign-and-verify/detached
        let parts = token.components(separatedBy: ".")
        XCTAssertEqual(parts.count, 3)
        XCTAssertEqual(parts[1], "", "the payload part is empty: \(token)")
        XCTAssertEqual(String(decoding: verified.payload, as: UTF8.self), "hello")
    }

    func testUnencoded() throws {
        let key = try fixtureJwk("hmac")
        // docs:start sign-and-verify/unencoded
        // b64: false signs the payload bytes as they are (RFC 7797 §3); crit makes it mandatory (§6).
        let token = try jwsSignCompact(
            payload: Data("$.02".utf8),
            key: key,
            options: JwsSignOptions(
                protectedHeader: #"{"alg":"HS256","b64":false,"crit":["b64"]}"#, detached: true)
        )
        let verified = try jwsVerifyCompact(
            token: token,
            key: key,
            options: JwsVerifyOptions(allowedAlgs: ["HS256"], detachedPayload: Data("$.02".utf8))
        )
        // docs:end sign-and-verify/unencoded
        XCTAssertEqual(token.components(separatedBy: ".")[1], "", "the payload part is empty: \(token)")
        XCTAssertEqual(String(decoding: verified.payload, as: UTF8.self), rfc7797Payload)
        // RFC 7797 §4.2's own example verifies the same way.
        let example = try jwsVerifyCompact(
            token: rfc7797Jws, key: key,
            options: JwsVerifyOptions(allowedAlgs: ["HS256"], detachedPayload: Data(rfc7797Payload.utf8)))
        XCTAssertEqual(String(decoding: example.payload, as: UTF8.self), rfc7797Payload)
    }

    func testReadHeader() throws {
        let privateKey = try fixtureJwk("p256")
        let publicKey = try fixturePublicJwk("p256")
        // docs:start sign-and-verify/read-header
        let token = try jwsSignCompact(
            payload: Data("hello".utf8),
            key: privateKey,
            options: JwsSignOptions(protectedHeader: #"{"alg":"ES256","kid":"key-1"}"#)
        )
        let verified = try jwsVerifyCompact(
            token: token, key: publicKey, options: JwsVerifyOptions(allowedAlgs: ["ES256"]))
        // Only the protected header is signed; read kid from it (RFC 7515 §4.1.4).
        struct Header: Decodable { let kid: String? }
        let header = try JSONDecoder().decode(Header.self, from: Data((verified.protectedHeader ?? "{}").utf8))
        // docs:end sign-and-verify/read-header
        XCTAssertEqual(header.kid, "key-1")
    }
}
