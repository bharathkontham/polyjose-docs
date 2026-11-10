// The samples of Guides › Manage keys (src/content/docs/guides/manage-keys.mdx).
//
// JWKs (RFC 7517): generating keys (RFC 7518 §6, RFC 8037 §2), the public half, PEM (RFC 7468)
// and DER in PKCS #8 (RFC 5958), SEC 1 (RFC 5915), SubjectPublicKeyInfo (RFC 5280) and PKCS #1
// (RFC 8017), thumbprints (RFC 7638, RFC 9278), and wiping exported key bytes. Generated keys are
// random, so those tests check the shape of each key, never its value.

import Foundation
import Polyjose
import XCTest

final class ManageKeysTests: XCTestCase {
    func testGenerate() throws {
        // docs:start manage-keys/generate
        let secret = try jwkGenerateOct(lenBytes: 32)  // 256 random bits (RFC 7518 §6.4)
        let p256 = try jwkGenerateEc(crv: "P-256")
        let p384 = try jwkGenerateEc(crv: "P-384")
        let p521 = try jwkGenerateEc(crv: "P-521")
        let secp256k1 = try jwkGenerateEc(crv: "secp256k1")
        let ed25519 = try jwkGenerateOkp(crv: "Ed25519")
        let x25519 = try jwkGenerateOkp(crv: "X25519")
        // docs:end manage-keys/generate
        let oct = try jsonObject(secret)
        XCTAssertEqual(oct["kty"] as? String, "oct")
        XCTAssertEqual(try base64urlDecode(text: oct["k"] as? String ?? "").count, 32)
        let generated = [
            (p256, "EC", "P-256"), (p384, "EC", "P-384"), (p521, "EC", "P-521"), (secp256k1, "EC", "secp256k1"),
            (ed25519, "OKP", "Ed25519"), (x25519, "OKP", "X25519"),
        ]
        for (jwk, kty, crv) in generated {
            let key = try jsonObject(jwk)
            XCTAssertEqual(key["kty"] as? String, kty)
            XCTAssertEqual(key["crv"] as? String, crv)
            XCTAssertNotNil(key["d"], "a generated \(crv) key is private")
        }
    }

    func testGenerateForAlg() throws {
        // docs:start manage-keys/generate-for-alg
        // The right kind of key for an algorithm, with alg set (RFC 7517 §4.4).
        let key = try jwkGenerateForAlg(alg: "ES256")
        // docs:end manage-keys/generate-for-alg
        let jwk = try jsonObject(key)
        XCTAssertEqual(jwk["alg"] as? String, "ES256")
        XCTAssertEqual(jwk["kty"] as? String, "EC")
        XCTAssertEqual(jwk["crv"] as? String, "P-256")
    }

    func testToPublic() throws {
        let privateKey = try fixtureJwk("p256")
        // docs:start manage-keys/to-public
        let publicKey = try jwkToPublic(jwk: privateKey)  // the key without d, safe to publish
        // docs:end manage-keys/to-public
        let exported = try jsonObject(publicKey)
        let original = try jsonObject(privateKey)
        XCTAssertNil(exported["d"])
        XCTAssertEqual(exported["x"] as? String, original["x"] as? String)
        XCTAssertEqual(exported["y"] as? String, original["y"] as? String)
    }

    func testPem() throws {
        let privateKey = try fixtureJwk("p256")
        // docs:start manage-keys/pem
        let pem = try jwkToPem(jwk: privateKey, format: "pkcs8")  // -----BEGIN PRIVATE KEY----- (RFC 7468 §10)
        let back = try jwkFromPem(pem: pem)
        let publicPem = try jwkToPem(jwk: privateKey, format: "spki")  // -----BEGIN PUBLIC KEY----- (RFC 7468 §13)
        // docs:end manage-keys/pem
        XCTAssertTrue(pem.hasPrefix("-----BEGIN PRIVATE KEY-----"), pem)
        XCTAssertTrue(publicPem.hasPrefix("-----BEGIN PUBLIC KEY-----"), publicPem)
        let original = try jsonObject(privateKey)
        let imported = try jsonObject(back)
        XCTAssertEqual(imported["d"] as? String, original["d"] as? String)
        XCTAssertEqual(imported["x"] as? String, original["x"] as? String)
        XCTAssertNil(imported["alg"], "PEM carries no JWS algorithm")
    }

    func testDer() throws {
        let privateKey = try fixtureJwk("p256")
        // docs:start manage-keys/der
        let der = try jwkToDer(jwk: privateKey, format: "sec1")  // ECPrivateKey (RFC 5915 §3)
        let back = try jwkFromDer(der: der, format: "sec1")
        // docs:end manage-keys/der
        XCTAssertEqual(try jsonObject(back)["d"] as? String, try jsonObject(privateKey)["d"] as? String)
    }

    func testRsaPublic() throws {
        let rsaKey = try fixtureJwk("rsa-public")
        // docs:start manage-keys/rsa-public
        let pem = try jwkToPem(jwk: rsaKey, format: "pkcs1")  // -----BEGIN RSA PUBLIC KEY----- (RFC 8017 Appendix A.1.1)
        let fromPem = try jwkFromPem(pem: pem)
        let der = try jwkToDer(jwk: rsaKey, format: "spki")  // SubjectPublicKeyInfo (RFC 5280 §4.1.2.7)
        let fromDer = try jwkFromDer(der: der, format: "spki")
        // docs:end manage-keys/rsa-public
        XCTAssertTrue(pem.hasPrefix("-----BEGIN RSA PUBLIC KEY-----"), pem)
        let n = try jsonObject(rsaKey)["n"] as? String
        XCTAssertEqual(try jsonObject(fromPem)["n"] as? String, n)
        XCTAssertEqual(try jsonObject(fromDer)["n"] as? String, n)
    }

    func testRsaPrivate() throws {
        let rsaPrivateKey = try rsaPrivateJwk()
        // docs:start manage-keys/rsa-private
        // rsaPrivateKey is an RSA private JWK with n, e, d, p, q, dp, dq and qi (RFC 7518 §6.3.2).
        let pem = try jwkToPem(jwk: rsaPrivateKey, format: "pkcs8")  // -----BEGIN PRIVATE KEY----- (RFC 5958)
        let imported = try jwkFromPem(pem: pem)  // also reads -----BEGIN RSA PRIVATE KEY----- (RFC 8017 Appendix A.1.2)
        let publicKey = try jwkToPublic(jwk: imported)  // only n and e, safe to publish
        // docs:end manage-keys/rsa-private
        XCTAssertTrue(pem.hasPrefix("-----BEGIN PRIVATE KEY-----"), pem)
        let original = try jsonObject(rsaPrivateKey)
        let back = try jsonObject(imported)
        for name in ["n", "e", "d", "p", "q", "dp", "dq", "qi"] {
            XCTAssertEqual(back[name] as? String, original[name] as? String, name)
        }
        let publicMembers = try jsonObject(publicKey)
        XCTAssertEqual(publicMembers["n"] as? String, original["n"] as? String)
        for name in ["d", "p", "q", "dp", "dq", "qi"] {
            XCTAssertNil(publicMembers[name], name)
        }
        let der = try jwkToDer(jwk: rsaPrivateKey, format: "pkcs8")
        XCTAssertEqual(try jsonObject(try jwkFromDer(der: der, format: "pkcs8"))["qi"] as? String, original["qi"] as? String)
        // PKCS #1 export writes the RSAPublicKey, the public half (RFC 8017 Appendix A.1.1).
        XCTAssertTrue(try jwkToPem(jwk: rsaPrivateKey, format: "pkcs1").hasPrefix("-----BEGIN RSA PUBLIC KEY-----"))
        // RFC 7518 §6.3.2: producers SHOULD include the CRT members, and polyjose requires them.
        let exponentOnly = try rsaExponentOnlyJwk()
        XCTAssertEqual(try errorCode { _ = try jwkParse(jwk: exponentOnly) }, "InvalidKey")
        // RSA keys can't be generated.
        XCTAssertEqual(try errorCode { _ = try jwkGenerateForAlg(alg: "RS256") }, "UnsupportedAlgorithm")
    }

    func testThumbprint() throws {
        let key = rfc7638Key
        // docs:start manage-keys/thumbprint
        let thumbprint = try jwkThumbprint(jwk: key)  // SHA-256 by default (RFC 7638 §3)
        let uri = try jwkThumbprintUri(jwk: key)  // urn:ietf:params:oauth:jwk-thumbprint:sha-256:... (RFC 9278)
        // docs:end manage-keys/thumbprint
        XCTAssertEqual(thumbprint, rfc7638Thumbprint)
        XCTAssertEqual(uri, rfc7638ThumbprintUri)
    }

    func testWipe() throws {
        let privateKey = try fixtureJwk("p256")
        // docs:start manage-keys/wipe
        var der = try jwkToDer(jwk: privateKey, format: "pkcs8")
        let length = der.count  // ...use der, for example store it in the Keychain...
        // Then overwrite the private key bytes; releasing the Data does not.
        der.resetBytes(in: 0..<der.count)
        // docs:end manage-keys/wipe
        XCTAssertGreaterThan(length, 0)
        XCTAssertTrue(der.allSatisfy { $0 == 0 }, "every byte is zero after the wipe")
    }
}
