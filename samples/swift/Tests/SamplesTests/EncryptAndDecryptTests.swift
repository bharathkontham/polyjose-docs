// The samples of Guides › Encrypt and decrypt (src/content/docs/guides/encrypt-and-decrypt.mdx).
//
// JWE (RFC 7516) with ECDH-ES+A256KW on P-256 and X25519 (RFC 7518 §4.6, RFC 8037 §3.2), direct
// encryption (RFC 7518 §4.5), AES key wrap (§4.4), RSA-OAEP-256 (§4.3), PBES2 (§4.8), and the
// JSON serialization (RFC 7516 §7.2). Every decrypt takes allow-lists for alg and enc
// (RFC 8725 §3.1). Keys, IVs and ephemeral keys are random, so the tests check the shape of each
// token and decrypt what they encrypt.
//
// Compression (zip, RFC 7516 §4.1.3) is not in the Swift binding, so that sample has no region here.

import Foundation
import Polyjose
import XCTest

final class EncryptAndDecryptTests: XCTestCase {
    private let plaintext = Data("hello".utf8)

    private func examplePassword() -> String {
        #"{"kty":"oct","k":"\#(base64urlEncode(data: Data("correct horse battery staple".utf8)))"}"#
    }

    func testEcdhP256() throws {
        // docs:start encrypt-and-decrypt/ecdh-p256
        let recipient = try jwkGenerateEc(crv: "P-256")  // the recipient's key pair; it shares only the public half
        let token = try jweEncryptCompact(
            plaintext: Data("hello".utf8),
            options: JweEncryptOptions(
                enc: "A256GCM",
                recipients: [JweRecipient(alg: "ECDH-ES+A256KW", key: try jwkToPublic(jwk: recipient))]
            )
        )
        let decrypted = try jweDecryptCompact(
            token: token,
            key: recipient,
            options: JweDecryptOptions(allowedAlgs: ["ECDH-ES+A256KW"], allowedEnc: ["A256GCM"])
        )
        // docs:end encrypt-and-decrypt/ecdh-p256
        XCTAssertEqual(token.components(separatedBy: ".").count, 5, "RFC 7516 §7.1")
        XCTAssertEqual(String(decoding: decrypted.plaintext, as: UTF8.self), "hello")
        let header = try jsonObject(decrypted.header)
        XCTAssertEqual(header["alg"] as? String, "ECDH-ES+A256KW")
        XCTAssertEqual(header["enc"] as? String, "A256GCM")
    }

    func testEcdhX25519() throws {
        // docs:start encrypt-and-decrypt/ecdh-x25519
        let recipient = try jwkGenerateOkp(crv: "X25519")
        let token = try jweEncryptCompact(
            plaintext: plaintext,
            options: JweEncryptOptions(
                enc: "A256GCM",
                recipients: [JweRecipient(alg: "ECDH-ES+A256KW", key: try jwkToPublic(jwk: recipient))]
            )
        )
        let decrypted = try jweDecryptCompact(
            token: token,
            key: recipient,
            options: JweDecryptOptions(allowedAlgs: ["ECDH-ES+A256KW"], allowedEnc: ["A256GCM"])
        )
        // docs:end encrypt-and-decrypt/ecdh-x25519
        XCTAssertEqual(String(decoding: decrypted.plaintext, as: UTF8.self), "hello")
    }

    func testDir() throws {
        // docs:start encrypt-and-decrypt/dir
        let key = try jwkGenerateForAlg(alg: "A256GCM")  // the content key itself, shared in advance
        let token = try jweEncryptCompact(
            plaintext: plaintext,
            options: JweEncryptOptions(enc: "A256GCM", recipients: [JweRecipient(alg: "dir", key: key)])
        )
        let decrypted = try jweDecryptCompact(
            token: token,
            key: key,
            options: JweDecryptOptions(allowedAlgs: ["dir"], allowedEnc: ["A256GCM"])
        )
        // docs:end encrypt-and-decrypt/dir
        XCTAssertEqual(
            token.components(separatedBy: ".")[1], "", "dir has an empty JWE Encrypted Key (RFC 7518 §4.5)")
        XCTAssertEqual(String(decoding: decrypted.plaintext, as: UTF8.self), "hello")
    }

    func testA256kw() throws {
        // docs:start encrypt-and-decrypt/a256kw
        let key = try jwkGenerateForAlg(alg: "A256KW")  // a 256-bit key-wrapping key (RFC 7518 §4.4)
        let token = try jweEncryptCompact(
            plaintext: plaintext,
            options: JweEncryptOptions(enc: "A256GCM", recipients: [JweRecipient(alg: "A256KW", key: key)])
        )
        let decrypted = try jweDecryptCompact(
            token: token,
            key: key,
            options: JweDecryptOptions(allowedAlgs: ["A256KW"], allowedEnc: ["A256GCM"])
        )
        // docs:end encrypt-and-decrypt/a256kw
        XCTAssertEqual(String(decoding: decrypted.plaintext, as: UTF8.self), "hello")
    }

    func testRsaOaep256() throws {
        let rsaPublicKey = try fixtureJwk("rsa-public")
        // docs:start encrypt-and-decrypt/rsa-oaep-256
        // Encrypt to an RSA public key; only its holder can decrypt (RFC 7518 §4.3).
        let token = try jweEncryptCompact(
            plaintext: plaintext,
            options: JweEncryptOptions(
                enc: "A256GCM",
                recipients: [JweRecipient(alg: "RSA-OAEP-256", key: rsaPublicKey)]
            )
        )
        // docs:end encrypt-and-decrypt/rsa-oaep-256
        let parts = token.components(separatedBy: ".")
        XCTAssertEqual(parts.count, 5)
        let header = try protectedHeader(of: token)
        XCTAssertEqual(header["alg"] as? String, "RSA-OAEP-256")
        XCTAssertEqual(header["enc"] as? String, "A256GCM")
        XCTAssertEqual(try base64urlDecode(text: parts[1]).count, 256, "the CEK wrapped under a 2048-bit modulus")
    }

    func testPbes2() throws {
        // docs:start encrypt-and-decrypt/pbes2
        // A password is passed as an oct JWK whose k is the password's bytes (RFC 7518 §4.8).
        let k = base64urlEncode(data: Data("correct horse battery staple".utf8))
        let password = #"{"kty":"oct","k":"\#(k)"}"#
        let token = try jweEncryptCompact(
            plaintext: plaintext,
            options: JweEncryptOptions(
                enc: "A256GCM", recipients: [JweRecipient(alg: "PBES2-HS256+A128KW", key: password)])
        )
        let decrypted = try jweDecryptCompact(
            token: token,
            key: password,
            options: JweDecryptOptions(allowedAlgs: ["PBES2-HS256+A128KW"], allowedEnc: ["A256GCM"])
        )
        // docs:end encrypt-and-decrypt/pbes2
        XCTAssertEqual(try protectedHeader(of: token)["p2c"] as? Int, 10_000, "the default iteration count")
        XCTAssertEqual(String(decoding: decrypted.plaintext, as: UTF8.self), "hello")
    }

    func testPbes2Limit() throws {
        let password = examplePassword()
        // docs:start encrypt-and-decrypt/pbes2-limit
        let token = try jweEncryptCompact(
            plaintext: plaintext,
            options: JweEncryptOptions(
                enc: "A256GCM",
                recipients: [JweRecipient(alg: "PBES2-HS256+A128KW", key: password, p2c: 20_000)]
            )
        )
        var options = JweDecryptOptions(allowedAlgs: ["PBES2-HS256+A128KW"], allowedEnc: ["A256GCM"])
        // Above the default budget of 10,000 iterations, decryption refuses the work.
        var code: String?
        do {
            _ = try jweDecryptCompact(token: token, key: password, options: options)
        } catch let error as PolyjoseError {
            code = error.code()  // "DecryptionFailed"
        }
        // Raise the budget for a sender you know uses more.
        options.maxPbes2Count = 20_000
        let decrypted = try jweDecryptCompact(token: token, key: password, options: options)
        // docs:end encrypt-and-decrypt/pbes2-limit
        XCTAssertEqual(code, "DecryptionFailed")
        XCTAssertEqual(String(decoding: decrypted.plaintext, as: UTF8.self), "hello")
    }

    func testJson() throws {
        let kwKey = try jwkGenerateForAlg(alg: "A256KW")
        let ecKey = try jwkGenerateEc(crv: "P-256")
        // docs:start encrypt-and-decrypt/json
        // One ciphertext for two recipients, each with its own key management (RFC 7516 §7.2.1).
        let jwe = try jweEncryptJson(
            plaintext: Data("hello".utf8),
            options: JweEncryptOptions(
                enc: "A256GCM",
                recipients: [
                    JweRecipient(alg: "A256KW", key: kwKey),
                    JweRecipient(alg: "ECDH-ES+A256KW", key: try jwkToPublic(jwk: ecKey)),
                ],
                aad: Data("order-42".utf8)
            ),
            form: "general"
        )
        // The holder of the EC key decrypts with it.
        let decrypted = try jweDecryptJson(
            jwe: jwe,
            key: ecKey,
            options: JweDecryptOptions(allowedAlgs: ["ECDH-ES+A256KW"], allowedEnc: ["A256GCM"])
        )
        // docs:end encrypt-and-decrypt/json
        XCTAssertEqual((try jsonObject(jwe)["recipients"] as? [Any])?.count, 2)
        XCTAssertEqual(decrypted.recipientIndex, 1)
        XCTAssertEqual(decrypted.aad.map { String(decoding: $0, as: UTF8.self) }, "order-42")
        XCTAssertEqual(String(decoding: decrypted.plaintext, as: UTF8.self), "hello")
    }

    func testDecryptionFailed() throws {
        let key = try jwkGenerateForAlg(alg: "A256KW")
        let token = try jweEncryptCompact(
            plaintext: plaintext,
            options: JweEncryptOptions(enc: "A256GCM", recipients: [JweRecipient(alg: "A256KW", key: key)]))
        // docs:start encrypt-and-decrypt/decryption-failed
        let wrongKey = try jwkGenerateForAlg(alg: "A256KW")
        var code: String?
        do {
            _ = try jweDecryptCompact(
                token: token,
                key: wrongKey,
                options: JweDecryptOptions(allowedAlgs: ["A256KW"], allowedEnc: ["A256GCM"])
            )
        } catch let error as PolyjoseError {
            code = error.code()  // "DecryptionFailed", the same for every failure (RFC 7516 §11.5)
        }
        // docs:end encrypt-and-decrypt/decryption-failed
        XCTAssertEqual(code, "DecryptionFailed")
    }
}
