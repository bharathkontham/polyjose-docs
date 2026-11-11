// The samples of Guides › Migrate from JOSESwift (src/content/docs/guides/migrate/joseswift.mdx).
//
// Each task is shown twice: a `…-before` region that uses JOSESwift (pinned exactly in
// Package.swift) and a region that does the same with polyjose. The interop tests check that
// tokens made by one library are read by the other: JWS and JWT with ES256 (RFC 7518 §3.4),
// HS256 (§3.2) and RS256/PS256 (§3.3, §3.5); JWE with ECDH-ES+A256KW (§4.6) and RSA-OAEP-256
// (§4.3). The last tests pin down what polyjose refuses that JOSESwift produces: RSA1_5
// (RFC 8725 §3.2), RSA-OAEP with SHA-1, compressed JWE (`zip`, RFC 7516 §4.1.3), and RSA private
// JWKs without their CRT members (RFC 7518 §6.3.2).
//
// JOSESwift works with `SecKey` and `Data` keys, polyjose with JWKs as JSON text, so the setup
// converts the fixture JWKs (RFC 7515 Appendix A) into `SecKey`s with JOSESwift. ECDSA, ECDH-ES and
// the generated RSA keys are randomized, so the tests check what they produce by reading it back.

import CryptoKit
import Foundation
import JOSESwift
import Polyjose
import Security
import XCTest

/// The fixture P-256 key pair (RFC 7515 Appendix A.3) as `SecKey`s, the form JOSESwift takes.
private func p256SecKeys() throws -> (privateKey: SecKey, publicKey: SecKey) {
    let privateKey = try ECPrivateKey(data: Data(try fixtureJwk("p256").utf8)).converted(to: SecKey.self)
    let publicKey = try XCTUnwrap(SecKeyCopyPublicKey(privateKey))
    return (privateKey, publicKey)
}

/// A new RSA 2048 key pair from the Security framework, as an app that used JOSESwift has them.
private func newRsaSecKeys() throws -> (privateKey: SecKey, publicKey: SecKey) {
    let attributes: [String: Any] = [
        kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
        kSecAttrKeySizeInBits as String: 2048,
    ]
    var error: Unmanaged<CFError>?
    guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
        throw try XCTUnwrap(error).takeRetainedValue() as Error
    }
    return (privateKey, try XCTUnwrap(SecKeyCopyPublicKey(privateKey)))
}

/// A new P-256 key pair from the Security framework.
private func newP256SecKeys() throws -> (privateKey: SecKey, publicKey: SecKey) {
    let attributes: [String: Any] = [
        kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256,
    ]
    var error: Unmanaged<CFError>?
    guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
        throw try XCTUnwrap(error).takeRetainedValue() as Error
    }
    return (privateKey, try XCTUnwrap(SecKeyCopyPublicKey(privateKey)))
}

/// A new P-256 key pair as JOSESwift's ECPrivateKey and ECPublicKey, the key types its ECDH-ES
/// Encrypter and Decrypter take.
private func joseSwiftEcKeys() throws -> (privateKey: ECPrivateKey, publicKey: ECPublicKey) {
    let jwk = try jwkGenerateEc(crv: "P-256")
    return (
        try ECPrivateKey(data: Data(jwk.utf8)),
        try ECPublicKey(data: Data(try jwkToPublic(jwk: jwk).utf8))
    )
}

/// A JWK Set (RFC 7517 §5) with only the public fixture P-256 key, under `kid`: JOSESwift reads no
/// OKP keys, so its side can't use `samples/fixtures/jwks.json`.
private func p256Jwks(kid: String) throws -> String {
    #"{"keys":[\#(try withKid(try fixturePublicJwk("p256"), kid: kid))]}"#
}

/// The claims of a token from our issuer to our audience that expires five minutes from now.
private func claimsJson() -> String {
    let exp = Int64(Date().timeIntervalSince1970) + 300
    return #"{"iss":"\#(issuer)","sub":"\#(subject)","aud":"\#(audience)","exp":\#(exp)}"#
}

/// The `PolyjoseError` code of `call`, or nil when it succeeds.
private func codeOf(_ call: () throws -> Void) -> String? {
    do {
        try call()
        return nil
    } catch let error as PolyjoseError {
        return error.code()
    } catch {
        return "not a PolyjoseError: \(error)"
    }
}

final class MigrateJoseSwiftTests: XCTestCase {
    // MARK: JWS

    func testSignJwsBefore() throws {
        let (privateKey, publicKey) = try p256SecKeys()
        // docs:start migrate-joseswift/sign-jws-before
        let header = JWSHeader(algorithm: .ES256)
        let payload = Payload(Data("hello".utf8))
        let signer = Signer(signatureAlgorithm: .ES256, key: privateKey)!  // privateKey is a SecKey
        let jws = try JWS(header: header, payload: payload, signer: signer)
        let token = jws.compactSerializedString
        // docs:end migrate-joseswift/sign-jws-before
        XCTAssertEqual(token.components(separatedBy: ".").count, 3, "RFC 7515 §7.1")
        let verifier = try XCTUnwrap(Verifier(signatureAlgorithm: .ES256, key: publicKey))
        XCTAssertEqual(try JWS(compactSerialization: token).validate(using: verifier).payload.data(), Data("hello".utf8))
    }

    func testSignJws() throws {
        let privateKey = try fixtureJwk("p256")
        // docs:start migrate-joseswift/sign-jws
        let token = try jwsSignCompact(
            payload: Data("hello".utf8),
            key: privateKey,  // a JWK, as JSON text
            options: JwsSignOptions(protectedHeader: #"{"alg":"ES256"}"#)
        )
        // docs:end migrate-joseswift/sign-jws
        XCTAssertEqual(try protectedHeader(of: token)["alg"] as? String, "ES256")
        let verified = try jwsVerifyCompact(
            token: token, key: try fixturePublicJwk("p256"), options: JwsVerifyOptions(allowedAlgs: ["ES256"]))
        XCTAssertEqual(verified.payload, Data("hello".utf8))
    }

    func testVerifyJwsBefore() throws {
        let (_, publicKey) = try p256SecKeys()
        let token = try jwsSignCompact(
            payload: Data("hello".utf8), key: try fixtureJwk("p256"),
            options: JwsSignOptions(protectedHeader: #"{"alg":"ES256"}"#))
        // docs:start migrate-joseswift/verify-jws-before
        let jws = try JWS(compactSerialization: token)
        let verifier = Verifier(signatureAlgorithm: .ES256, key: publicKey)!  // publicKey is a SecKey
        let payload = try jws.validate(using: verifier).payload.data()
        // docs:end migrate-joseswift/verify-jws-before
        XCTAssertEqual(payload, Data("hello".utf8))
    }

    func testVerifyJws() throws {
        let (privateKey, _) = try p256SecKeys()
        let signer = try XCTUnwrap(Signer(signatureAlgorithm: .ES256, key: privateKey))
        let token = try JWS(header: JWSHeader(algorithm: .ES256), payload: Payload(Data("hello".utf8)), signer: signer)
            .compactSerializedString
        let publicKey = try fixturePublicJwk("p256")
        // docs:start migrate-joseswift/verify-jws
        let verified = try jwsVerifyCompact(
            token: token,
            key: publicKey,
            options: JwsVerifyOptions(allowedAlgs: ["ES256"])  // the algorithms you accept
        )
        let payload = verified.payload
        // docs:end migrate-joseswift/verify-jws
        XCTAssertEqual(payload, Data("hello".utf8))
        XCTAssertEqual(verified.alg, "ES256")
    }

    // MARK: JWT

    func testIssueJwtBefore() throws {
        let (privateKey, publicKey) = try p256SecKeys()
        // docs:start migrate-joseswift/issue-jwt-before
        // JOSESwift has no JWT type: the claims are a JWS payload you build yourself.
        var header = JWSHeader(algorithm: .ES256)
        header.typ = "JWT"
        let now = Int(Date().timeIntervalSince1970)
        let claims = try JSONSerialization.data(withJSONObject: [
            "iss": issuer, "sub": subject, "aud": audience, "exp": now + 300,
        ])
        let signer = Signer(signatureAlgorithm: .ES256, key: privateKey)!
        let token = try JWS(header: header, payload: Payload(claims), signer: signer).compactSerializedString
        // docs:end migrate-joseswift/issue-jwt-before
        let verifier = try XCTUnwrap(Verifier(signatureAlgorithm: .ES256, key: publicKey))
        let payload = try JWS(compactSerialization: token).validate(using: verifier).payload.data()
        XCTAssertEqual(try JSONSerialization.jsonObject(with: payload) as? [String: AnyHashable], [
            "iss": issuer, "sub": subject, "aud": audience, "exp": now + 300,
        ])
    }

    func testIssueJwt() throws {
        let privateKey = try fixtureJwk("p256")
        // docs:start migrate-joseswift/issue-jwt
        let now = Int64(Date().timeIntervalSince1970)
        let token = try jwtSign(
            claims: #"{"iss":"\#(issuer)","sub":"\#(subject)","aud":"\#(audience)","exp":\#(now + 300)}"#,
            key: privateKey,
            options: JwtSignOptions(alg: "ES256")  // sets typ "JWT" (RFC 7519 §5.1)
        )
        // docs:end migrate-joseswift/issue-jwt
        let header = try protectedHeader(of: token)
        XCTAssertEqual(header["alg"] as? String, "ES256")
        XCTAssertEqual(header["typ"] as? String, "JWT")
    }

    func testVerifyJwtBefore() throws {
        let (_, publicKey) = try p256SecKeys()
        let token = try jwtSign(claims: claimsJson(), key: try fixtureJwk("p256"), options: JwtSignOptions(alg: "ES256"))
        // docs:start migrate-joseswift/verify-jwt-before
        let jws = try JWS(compactSerialization: token)
        let payload = try jws.validate(using: Verifier(signatureAlgorithm: .ES256, key: publicKey)!).payload
        // JOSESwift checks only the signature. Every claim check is code you write and maintain.
        struct Claims: Decodable { let iss: String; let sub: String; let aud: String; let exp: Int }
        struct InvalidClaims: Error {}
        let claims = try JSONDecoder().decode(Claims.self, from: payload.data())
        let now = Int(Date().timeIntervalSince1970)
        guard claims.iss == issuer, claims.aud == audience, now < claims.exp else { throw InvalidClaims() }
        // docs:end migrate-joseswift/verify-jwt-before
        XCTAssertEqual(claims.sub, subject)
    }

    func testVerifyJwt() throws {
        let (privateKey, _) = try p256SecKeys()
        var header = JWSHeader(algorithm: .ES256)
        header.typ = "JWT"
        let signer = try XCTUnwrap(Signer(signatureAlgorithm: .ES256, key: privateKey))
        let token = try JWS(header: header, payload: Payload(Data(claimsJson().utf8)), signer: signer)
            .compactSerializedString
        let publicKey = try fixturePublicJwk("p256")
        // docs:start migrate-joseswift/verify-jwt
        // Signature, alg allow-list, typ, exp and nbf (60 s leeway), iss and aud, in one call.
        let verified = try jwtVerify(
            token: token,
            key: publicKey,
            options: JwtVerifyOptions(allowedAlgs: ["ES256"], issuers: [issuer], audiences: [audience])
        )
        struct Claims: Decodable { let sub: String }
        let claims = try JSONDecoder().decode(Claims.self, from: Data(verified.claims.utf8))
        // docs:end migrate-joseswift/verify-jwt
        XCTAssertEqual(claims.sub, subject)
        // aud may also be an array (RFC 7519 §4.1.3); one match is enough.
        let exp = Int64(Date().timeIntervalSince1970) + 300
        let arrayAud = try jwtSign(
            claims: #"{"iss":"\#(issuer)","aud":["https://other.example","\#(audience)"],"exp":\#(exp)}"#,
            key: try fixtureJwk("p256"), options: JwtSignOptions(alg: "ES256"))
        let options = JwtVerifyOptions(allowedAlgs: ["ES256"], issuers: [issuer], audiences: [audience])
        XCTAssertNil(codeOf { _ = try jwtVerify(token: arrayAud, key: publicKey, options: options) })
    }

    // MARK: JWE

    func testEncryptJweBefore() throws {
        let (recipientPrivateKey, recipientPublicKey) = try joseSwiftEcKeys()
        // docs:start migrate-joseswift/encrypt-jwe-before
        let header = JWEHeader(keyManagementAlgorithm: .ECDH_ES_A256KW, contentEncryptionAlgorithm: .A256GCM)
        let encrypter = Encrypter(
            keyManagementAlgorithm: .ECDH_ES_A256KW,
            contentEncryptionAlgorithm: .A256GCM,
            encryptionKey: recipientPublicKey  // for ECDH-ES, a JOSESwift ECPublicKey
        )!
        let jwe = try JWE(header: header, payload: Payload(Data("hello".utf8)), encrypter: encrypter)
        let token = jwe.compactSerializedString
        // docs:end migrate-joseswift/encrypt-jwe-before
        XCTAssertEqual(token.components(separatedBy: ".").count, 5, "RFC 7516 §7.1")
        let decrypter = try XCTUnwrap(
            Decrypter(
                keyManagementAlgorithm: .ECDH_ES_A256KW, contentEncryptionAlgorithm: .A256GCM,
                decryptionKey: recipientPrivateKey))
        XCTAssertEqual(try JWE(compactSerialization: token).decrypt(using: decrypter).data(), Data("hello".utf8))
    }

    func testEncryptJwe() throws {
        let recipient = try jwkGenerateEc(crv: "P-256")
        let recipientPublicKey = try jwkToPublic(jwk: recipient)
        // docs:start migrate-joseswift/encrypt-jwe
        let token = try jweEncryptCompact(
            plaintext: Data("hello".utf8),
            options: JweEncryptOptions(
                enc: "A256GCM",
                recipients: [JweRecipient(alg: "ECDH-ES+A256KW", key: recipientPublicKey)]  // a public JWK
            )
        )
        // docs:end migrate-joseswift/encrypt-jwe
        let decrypted = try jweDecryptCompact(
            token: token, key: recipient,
            options: JweDecryptOptions(allowedAlgs: ["ECDH-ES+A256KW"], allowedEnc: ["A256GCM"]))
        XCTAssertEqual(decrypted.plaintext, Data("hello".utf8))
    }

    func testDecryptJweBefore() throws {
        let (privateKey, publicKey) = try joseSwiftEcKeys()
        let encrypter = try XCTUnwrap(
            Encrypter(keyManagementAlgorithm: .ECDH_ES_A256KW, contentEncryptionAlgorithm: .A256GCM, encryptionKey: publicKey))
        let token = try JWE(
            header: JWEHeader(keyManagementAlgorithm: .ECDH_ES_A256KW, contentEncryptionAlgorithm: .A256GCM),
            payload: Payload(Data("hello".utf8)), encrypter: encrypter
        ).compactSerializedString
        // docs:start migrate-joseswift/decrypt-jwe-before
        let jwe = try JWE(compactSerialization: token)
        let decrypter = Decrypter(
            keyManagementAlgorithm: .ECDH_ES_A256KW,
            contentEncryptionAlgorithm: .A256GCM,
            decryptionKey: privateKey  // for ECDH-ES, a JOSESwift ECPrivateKey
        )!
        let plaintext = try jwe.decrypt(using: decrypter).data()
        // docs:end migrate-joseswift/decrypt-jwe-before
        XCTAssertEqual(plaintext, Data("hello".utf8))
    }

    func testDecryptJwe() throws {
        let recipient = try jwkGenerateEc(crv: "P-256")
        let token = try jweEncryptCompact(
            plaintext: Data("hello".utf8),
            options: JweEncryptOptions(
                enc: "A256GCM", recipients: [JweRecipient(alg: "ECDH-ES+A256KW", key: try jwkToPublic(jwk: recipient))]))
        let privateKey = recipient
        // docs:start migrate-joseswift/decrypt-jwe
        let decrypted = try jweDecryptCompact(
            token: token,
            key: privateKey,
            options: JweDecryptOptions(allowedAlgs: ["ECDH-ES+A256KW"], allowedEnc: ["A256GCM"])
        )
        let plaintext = decrypted.plaintext
        // docs:end migrate-joseswift/decrypt-jwe
        XCTAssertEqual(plaintext, Data("hello".utf8))
        XCTAssertEqual(try jsonObject(decrypted.header)["alg"] as? String, "ECDH-ES+A256KW")
    }

    // MARK: Keys

    func testJwkBefore() throws {
        let jwkJson = try fixturePublicJwk("p256")
        // docs:start migrate-joseswift/jwk-before
        // JWK JSON to a JOSESwift key, then to the SecKey that Signer and Verifier take.
        let jwk = try ECPublicKey(data: Data(jwkJson.utf8))
        let publicKey: SecKey = try jwk.converted(to: SecKey.self)
        // And from a SecKey back to JWK JSON.
        let exported = try ECPublicKey(publicKey: publicKey).jsonString()
        // docs:end migrate-joseswift/jwk-before
        let original = try jsonObject(jwkJson)
        let back = try jsonObject(try XCTUnwrap(exported))
        XCTAssertEqual(back["x"] as? String, original["x"] as? String)
        XCTAssertEqual(back["y"] as? String, original["y"] as? String)
    }

    func testJwk() throws {
        let jwkJson = try fixtureJwk("p256")
        // docs:start migrate-joseswift/jwk
        // The JWK text is the key: pass it to any call. jwkParse checks it up front.
        let privateKey = try jwkParse(jwk: jwkJson)
        let publicKey = try jwkToPublic(jwk: privateKey)  // without d, safe to publish
        let thumbprint = try jwkThumbprint(jwk: publicKey)  // RFC 7638, SHA-256
        // docs:end migrate-joseswift/jwk
        XCTAssertNil(try jsonObject(publicKey)["d"])
        XCTAssertEqual(try jsonObject(privateKey)["d"] as? String, try jsonObject(jwkJson)["d"] as? String)
        // JOSESwift computes the same RFC 7638 thumbprint.
        XCTAssertEqual(thumbprint, try ECPublicKey(data: Data(publicKey.utf8)).thumbprint(algorithm: .SHA256))
    }

    func testSecKeyBefore() throws {
        let (_, rsaPublic) = try newRsaSecKeys()
        let (ecPrivate, ecPublic) = try newP256SecKeys()
        // docs:start migrate-joseswift/seckey-before
        let rsaJwk = try RSAPublicKey(publicKey: rsaPublic).jsonString()  // rsaPublic is a SecKey
        let ecJwk = try ECPublicKey(publicKey: ecPublic).jsonString()
        let ecPrivateJwk = try ECPrivateKey(privateKey: ecPrivate).jsonString()
        // docs:end migrate-joseswift/seckey-before
        XCTAssertEqual(try jsonObject(try XCTUnwrap(rsaJwk))["kty"] as? String, "RSA")
        XCTAssertEqual(try jsonObject(try XCTUnwrap(ecJwk))["crv"] as? String, "P-256")
        XCTAssertNotNil(try jsonObject(try XCTUnwrap(ecPrivateJwk))["d"])
        // polyjose reads the EC JWKs that JOSESwift writes.
        XCTAssertNoThrow(try jwkParse(jwk: try XCTUnwrap(ecPrivateJwk)))
        XCTAssertNoThrow(try jwkParse(jwk: try XCTUnwrap(rsaJwk)))
    }

    func testSecKey() throws {
        let (rsaPrivateKey, rsaPublicKey) = try newRsaSecKeys()
        let (ecPrivateKey, ecPublicKey) = try newP256SecKeys()
        // docs:start migrate-joseswift/seckey
        // A SecKey's external representation: PKCS #1 for RSA (RFC 8017 Appendix A.1),
        // ANSI X9.63 for EC (04 || x || y, then d for a private key).
        func externalRepresentation(_ key: SecKey) throws -> Data {
            var error: Unmanaged<CFError>?
            guard let data = SecKeyCopyExternalRepresentation(key, &error) else {
                throw error!.takeRetainedValue() as Error
            }
            return data as Data
        }
        let rsaPublicJwk = try jwkFromDer(der: externalRepresentation(rsaPublicKey), format: "pkcs1")
        let rsaPrivateJwk = try jwkFromDer(der: externalRepresentation(rsaPrivateKey), format: "pkcs1")
        // CryptoKit turns the X9.63 bytes into SPKI or PKCS #8, which polyjose imports.
        let ecPublicJwk = try jwkFromPem(
            pem: P256.Signing.PublicKey(x963Representation: externalRepresentation(ecPublicKey)).pemRepresentation)
        let ecPrivateJwk = try jwkFromPem(
            pem: P256.Signing.PrivateKey(x963Representation: externalRepresentation(ecPrivateKey)).pemRepresentation)
        // docs:end migrate-joseswift/seckey
        let rsaPrivateMembers = try jsonObject(rsaPrivateJwk)
        for member in ["n", "e", "d", "p", "q", "dp", "dq", "qi"] {
            XCTAssertNotNil(rsaPrivateMembers[member], "RFC 7518 §6.3.2: \(member)")
        }
        XCTAssertEqual(try jsonObject(rsaPublicJwk)["n"] as? String, rsaPrivateMembers["n"] as? String)
        XCTAssertEqual(try jsonObject(ecPublicJwk)["x"] as? String, try jsonObject(ecPrivateJwk)["x"] as? String)
        XCTAssertNotNil(try jsonObject(ecPrivateJwk)["d"])
        // The imported keys work with the SecKeys they came from, through JOSESwift.
        let token = try jwsSignCompact(
            payload: Data("hello".utf8), key: rsaPrivateJwk, options: JwsSignOptions(protectedHeader: #"{"alg":"RS256"}"#))
        let rsaVerifier = try XCTUnwrap(Verifier(signatureAlgorithm: .RS256, key: rsaPublicKey))
        XCTAssertEqual(try JWS(compactSerialization: token).validate(using: rsaVerifier).payload.data(), Data("hello".utf8))
        let ecToken = try jwsSignCompact(
            payload: Data("hello".utf8), key: ecPrivateJwk, options: JwsSignOptions(protectedHeader: #"{"alg":"ES256"}"#))
        let ecVerifier = try XCTUnwrap(Verifier(signatureAlgorithm: .ES256, key: ecPublicKey))
        XCTAssertEqual(try JWS(compactSerialization: ecToken).validate(using: ecVerifier).payload.data(), Data("hello".utf8))
    }

    func testJwksBefore() throws {
        let jwksJson = try p256Jwks(kid: "p256-2026")
        let kid = "p256-2026"
        // docs:start migrate-joseswift/jwks-before
        // JWKSet is a list of keys; picking one is up to you.
        struct NoMatchingKey: Error {}
        let jwks = try JWKSet(data: Data(jwksJson.utf8))
        guard let jwk = jwks.keys.first(where: { $0["kid"] == kid }) as? ECPublicKey else { throw NoMatchingKey() }
        let publicKey = try jwk.converted(to: SecKey.self)
        // docs:end migrate-joseswift/jwks-before
        XCTAssertEqual(SecKeyCopyExternalRepresentation(publicKey, nil) as Data?,
                       SecKeyCopyExternalRepresentation(try p256SecKeys().publicKey, nil) as Data?)
        // JOSESwift reads no OKP keys, so a set with an Ed25519 key fails as a whole.
        XCTAssertThrowsError(try JWKSet(data: Data(try fixtureJwks().utf8)))
    }

    func testJwks() throws {
        let jwks = try fixtureJwks()
        let token = try jwtSign(
            claims: claimsJson(), key: try withKid(try fixtureJwk("p256"), kid: "p256-2026"),
            options: JwtSignOptions(alg: "ES256"))
        // docs:start migrate-joseswift/jwks
        // Pick a key by kid and alg (RFC 7517 §4.5, §4.4)...
        let publicKey = try jwksSelect(jwks: jwks, selector: JwkSelector(kid: "p256-2026", alg: "ES256"))
        // ...or let the verify call pick it from the token's header.
        let verified = try jwtVerifyWithJwks(
            token: token,
            jwks: jwks,
            options: JwtVerifyOptions(allowedAlgs: ["ES256", "Ed25519"], issuers: [issuer], audiences: [audience])
        )
        // docs:end migrate-joseswift/jwks
        XCTAssertEqual(try jsonObject(publicKey)["kid"] as? String, "p256-2026")
        XCTAssertEqual(verified.kid, "p256-2026")
        XCTAssertEqual(verified.keyIndex, 0)
    }

    // MARK: Errors

    func testErrorsBefore() throws {
        let (_, publicKey) = try p256SecKeys()
        let token = try jwsSignCompact(
            payload: Data("hello".utf8), key: try fixtureJwk("hmac"),
            options: JwsSignOptions(protectedHeader: #"{"alg":"HS256"}"#))
        let verifier = try XCTUnwrap(Verifier(signatureAlgorithm: .ES256, key: publicKey))
        // docs:start migrate-joseswift/errors-before
        var outcome = ""
        do {
            _ = try JWS(compactSerialization: token).validate(using: verifier)
        } catch JOSESwiftError.signingAlgorithmMismatch {
            outcome = "the token's alg is not the verifier's"
        } catch JOSESwiftError.verifyingFailed(let description) {
            outcome = "not verified: \(description)"
        }
        // docs:end migrate-joseswift/errors-before
        XCTAssertEqual(outcome, "the token's alg is not the verifier's")
    }

    func testErrors() throws {
        let token = try jwsSignCompact(
            payload: Data("hello".utf8), key: try fixtureJwk("hmac"),
            options: JwsSignOptions(protectedHeader: #"{"alg":"HS256"}"#))
        let publicKey = try fixturePublicJwk("p256")
        // docs:start migrate-joseswift/errors
        var outcome = ""
        do {
            _ = try jwsVerifyCompact(token: token, key: publicKey, options: JwsVerifyOptions(allowedAlgs: ["ES256"]))
        } catch let error as PolyjoseError {
            switch error.code() {  // a stable code; never parse the message
            case "AlgorithmNotAllowed": outcome = "the token's alg is not in the allow-list"
            case "InvalidSignature": outcome = "the signature does not verify"
            default: outcome = "rejected: \(error.code())"
            }
        }
        // docs:end migrate-joseswift/errors
        XCTAssertEqual(outcome, "the token's alg is not in the allow-list")
    }

    // MARK: Interop

    /// A JOSESwift HS256 JWS (with a `Data` key) verifies in polyjose with the same key as an oct
    /// JWK (RFC 7518 §6.4), and the other way round.
    func testInteropHs256() throws {
        let secret = Data((0..<32).map { _ in UInt8.random(in: .min ... .max) })
        let jwk = #"{"kty":"oct","k":"\#(base64urlEncode(data: secret))"}"#
        let signer = try XCTUnwrap(Signer(signatureAlgorithm: .HS256, key: secret))
        let fromJoseSwift = try JWS(header: JWSHeader(algorithm: .HS256), payload: Payload(Data("hello".utf8)), signer: signer)
            .compactSerializedString
        let verified = try jwsVerifyCompact(token: fromJoseSwift, key: jwk, options: JwsVerifyOptions(allowedAlgs: ["HS256"]))
        XCTAssertEqual(verified.payload, Data("hello".utf8))

        let fromPolyjose = try jwsSignCompact(
            payload: Data("hello".utf8), key: jwk, options: JwsSignOptions(protectedHeader: #"{"alg":"HS256"}"#))
        let verifier = try XCTUnwrap(Verifier(signatureAlgorithm: .HS256, key: secret))
        XCTAssertEqual(try JWS(compactSerialization: fromPolyjose).validate(using: verifier).payload.data(), Data("hello".utf8))
    }

    /// A JWT that JOSESwift signs passes polyjose's JWT checks, and a polyjose JWT verifies in JOSESwift.
    func testInteropJwt() throws {
        let (privateKey, publicKey) = try p256SecKeys()
        var header = JWSHeader(algorithm: .ES256)
        header.typ = "JWT"
        let signer = try XCTUnwrap(Signer(signatureAlgorithm: .ES256, key: privateKey))
        let fromJoseSwift = try JWS(header: header, payload: Payload(Data(claimsJson().utf8)), signer: signer)
            .compactSerializedString
        let options = JwtVerifyOptions(allowedAlgs: ["ES256"], issuers: [issuer], audiences: [audience])
        let verified = try jwtVerify(token: fromJoseSwift, key: try fixturePublicJwk("p256"), options: options)
        XCTAssertEqual(try jsonObject(verified.claims)["sub"] as? String, subject)

        let fromPolyjose = try jwtSign(claims: claimsJson(), key: try fixtureJwk("p256"), options: JwtSignOptions(alg: "ES256"))
        let verifier = try XCTUnwrap(Verifier(signatureAlgorithm: .ES256, key: publicKey))
        let jws = try JWS(compactSerialization: fromPolyjose).validate(using: verifier)
        XCTAssertEqual(jws.header.typ, "JWT")
        XCTAssertEqual(try jsonObject(String(decoding: jws.payload.data(), as: UTF8.self))["sub"] as? String, subject)

        // A JOSESwift token without typ passes too: typ is optional (RFC 7519 §5.1), and a plain
        // verify refuses only a typ other than "JWT" (RFC 8725 §3.11).
        let untyped = try JWS(header: JWSHeader(algorithm: .ES256), payload: Payload(Data(claimsJson().utf8)), signer: signer)
            .compactSerializedString
        XCTAssertNil(codeOf { _ = try jwtVerify(token: untyped, key: try fixturePublicJwk("p256"), options: options) })
    }

    /// RS256 and PS256 between a Security framework RSA key (JOSESwift) and its JWK (polyjose).
    func testInteropRsaSignatures() throws {
        let (privateKey, publicKey) = try newRsaSecKeys()
        var error: Unmanaged<CFError>?
        let der = try XCTUnwrap(SecKeyCopyExternalRepresentation(publicKey, &error) as Data?)
        let publicJwk = try jwkFromDer(der: der, format: "pkcs1")
        for (alg, name) in [(SignatureAlgorithm.RS256, "RS256"), (.PS256, "PS256")] {
            let signer = try XCTUnwrap(Signer(signatureAlgorithm: alg, key: privateKey))
            let token = try JWS(header: JWSHeader(algorithm: alg), payload: Payload(Data("hello".utf8)), signer: signer)
                .compactSerializedString
            let verified = try jwsVerifyCompact(token: token, key: publicJwk, options: JwsVerifyOptions(allowedAlgs: [name]))
            XCTAssertEqual(verified.payload, Data("hello".utf8), name)
        }
    }

    /// ECDH-ES+A256KW and RSA-OAEP-256 JWEs pass between the libraries in both directions.
    func testInteropJwe() throws {
        // ECDH-ES+A256KW (RFC 7518 §4.6): JOSESwift takes its own EC JWK types.
        let ecJwk = try jwkGenerateEc(crv: "P-256")
        let ecPrivate = try ECPrivateKey(data: Data(ecJwk.utf8))
        let ecPublic = try ECPublicKey(data: Data(try jwkToPublic(jwk: ecJwk).utf8))
        let ecEncrypter = try XCTUnwrap(
            Encrypter(keyManagementAlgorithm: .ECDH_ES_A256KW, contentEncryptionAlgorithm: .A256GCM, encryptionKey: ecPublic))
        let ecDecrypter = try XCTUnwrap(
            Decrypter(keyManagementAlgorithm: .ECDH_ES_A256KW, contentEncryptionAlgorithm: .A256GCM, decryptionKey: ecPrivate))
        try checkJweInterop(
            alg: .ECDH_ES_A256KW, name: "ECDH-ES+A256KW", encrypter: ecEncrypter, decrypter: ecDecrypter, privateJwk: ecJwk)

        // RSA-OAEP-256 (RFC 7518 §4.3): JOSESwift takes SecKeys, polyjose the PKCS #1 key as a JWK.
        let (rsaPrivate, rsaPublic) = try newRsaSecKeys()
        var error: Unmanaged<CFError>?
        let rsaJwk = try jwkFromDer(
            der: try XCTUnwrap(SecKeyCopyExternalRepresentation(rsaPrivate, &error) as Data?), format: "pkcs1")
        let rsaEncrypter = try XCTUnwrap(
            Encrypter(keyManagementAlgorithm: .RSAOAEP256, contentEncryptionAlgorithm: .A256GCM, encryptionKey: rsaPublic))
        let rsaDecrypter = try XCTUnwrap(
            Decrypter(keyManagementAlgorithm: .RSAOAEP256, contentEncryptionAlgorithm: .A256GCM, decryptionKey: rsaPrivate))
        try checkJweInterop(
            alg: .RSAOAEP256, name: "RSA-OAEP-256", encrypter: rsaEncrypter, decrypter: rsaDecrypter, privateJwk: rsaJwk)
    }

    private func checkJweInterop(
        alg: KeyManagementAlgorithm, name: String, encrypter: Encrypter, decrypter: Decrypter, privateJwk: String
    ) throws {
        let fromJoseSwift = try JWE(
            header: JWEHeader(keyManagementAlgorithm: alg, contentEncryptionAlgorithm: .A256GCM),
            payload: Payload(Data("hello".utf8)), encrypter: encrypter
        ).compactSerializedString
        let decrypted = try jweDecryptCompact(
            token: fromJoseSwift, key: privateJwk, options: JweDecryptOptions(allowedAlgs: [name], allowedEnc: ["A256GCM"]))
        XCTAssertEqual(decrypted.plaintext, Data("hello".utf8), name)

        let fromPolyjose = try jweEncryptCompact(
            plaintext: Data("hello".utf8),
            options: JweEncryptOptions(
                enc: "A256GCM", recipients: [JweRecipient(alg: name, key: try jwkToPublic(jwk: privateJwk))]))
        XCTAssertEqual(try JWE(compactSerialization: fromPolyjose).decrypt(using: decrypter).data(), Data("hello".utf8), name)
    }

    // MARK: Not supported in polyjose

    /// RSA1_5 (RFC 8725 §3.2) and RSA-OAEP (SHA-1) JWEs from JOSESwift fail with UnsupportedAlgorithm,
    /// even when the caller allows them.
    func testRsa1_5AndRsaOaepRefused() throws {
        let (rsaPrivate, rsaPublic) = try newRsaSecKeys()
        var error: Unmanaged<CFError>?
        let privateJwk = try jwkFromDer(
            der: try XCTUnwrap(SecKeyCopyExternalRepresentation(rsaPrivate, &error) as Data?), format: "pkcs1")
        for (alg, name) in [(KeyManagementAlgorithm.RSA1_5, "RSA1_5"), (.RSAOAEP, "RSA-OAEP")] {
            let encrypter = try XCTUnwrap(
                Encrypter(keyManagementAlgorithm: alg, contentEncryptionAlgorithm: .A256GCM, encryptionKey: rsaPublic))
            let token = try JWE(
                header: JWEHeader(keyManagementAlgorithm: alg, contentEncryptionAlgorithm: .A256GCM),
                payload: Payload(Data("hello".utf8)), encrypter: encrypter
            ).compactSerializedString
            let code = codeOf {
                _ = try jweDecryptCompact(
                    token: token, key: privateJwk, options: JweDecryptOptions(allowedAlgs: [name], allowedEnc: ["A256GCM"]))
            }
            XCTAssertEqual(code, "UnsupportedAlgorithm", name)
            XCTAssertEqual(
                codeOf {
                    _ = try jweEncryptCompact(
                        plaintext: Data("hello".utf8),
                        options: JweEncryptOptions(
                            enc: "A256GCM", recipients: [JweRecipient(alg: name, key: try jwkToPublic(jwk: privateJwk))]))
                }, "UnsupportedAlgorithm", name)
        }
    }

    /// A compressed JWE (`"zip":"DEF"`, RFC 7516 §4.1.3) from JOSESwift fails with UnsupportedAlgorithm
    /// in the Swift package, which is built without compression (RFC 8725 §3.6).
    func testZipRefused() throws {
        let key = try jwkGenerateOct(lenBytes: 32)
        let secret = try base64urlDecode(text: try XCTUnwrap(try jsonObject(key)["k"] as? String))
        var header = JWEHeader(keyManagementAlgorithm: .direct, contentEncryptionAlgorithm: .A256GCM)
        header.zip = "DEF"
        let encrypter = try XCTUnwrap(
            Encrypter(keyManagementAlgorithm: .direct, contentEncryptionAlgorithm: .A256GCM, encryptionKey: secret))
        let token = try JWE(header: header, payload: Payload(Data("hello".utf8)), encrypter: encrypter).compactSerializedString
        XCTAssertEqual(try protectedHeader(of: token)["zip"] as? String, "DEF")
        let code = codeOf {
            _ = try jweDecryptCompact(
                token: token, key: key, options: JweDecryptOptions(allowedAlgs: ["dir"], allowedEnc: ["A256GCM"]))
        }
        XCTAssertEqual(code, "UnsupportedAlgorithm")
        // Without zip, the same key and algorithms work.
        let plain = try JWE(
            header: JWEHeader(keyManagementAlgorithm: .direct, contentEncryptionAlgorithm: .A256GCM),
            payload: Payload(Data("hello".utf8)), encrypter: encrypter
        ).compactSerializedString
        let decrypted = try jweDecryptCompact(
            token: plain, key: key, options: JweDecryptOptions(allowedAlgs: ["dir"], allowedEnc: ["A256GCM"]))
        XCTAssertEqual(decrypted.plaintext, Data("hello".utf8))
    }

    /// JOSESwift's RSAPrivateKey JWK has n, e and d only; polyjose requires the CRT members
    /// (RFC 7518 §6.3.2) and refuses it with InvalidKey.
    func testRsaPrivateJwkWithoutCrtRefused() throws {
        let fixture = try jsonObject(try rsaPrivateJwk())
        let key = RSAPrivateKey(
            modulus: try XCTUnwrap(fixture["n"] as? String), exponent: try XCTUnwrap(fixture["e"] as? String),
            privateExponent: try XCTUnwrap(fixture["d"] as? String))
        let json = try XCTUnwrap(key.jsonString())
        let members = Set(try jsonObject(json).keys)
        XCTAssertEqual(members, ["kty", "n", "e", "d"])
        XCTAssertEqual(codeOf { _ = try jwkParse(jwk: json) }, "InvalidKey")
        // The full fixture, with p, q, dp, dq and qi, imports.
        XCTAssertNil(codeOf { _ = try jwkParse(jwk: try rsaPrivateJwk()) })
    }

    /// An RSA key under 2048 bits, which the Security framework still creates, is refused with
    /// InvalidKey (RFC 7518 §3.3 and §4.3 require 2048 bits or more).
    func testShortRsaKeyRefused() throws {
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecAttrKeySizeInBits as String: 1024,
        ]
        var error: Unmanaged<CFError>?
        let privateKey = try XCTUnwrap(SecKeyCreateRandomKey(attributes as CFDictionary, &error))
        let publicKey = try XCTUnwrap(SecKeyCopyPublicKey(privateKey))
        let der = try XCTUnwrap(SecKeyCopyExternalRepresentation(publicKey, &error) as Data?)
        XCTAssertEqual(codeOf { _ = try jwkFromDer(der: der, format: "pkcs1") }, "InvalidKey")
        // JOSESwift verifies with it.
        let signer = try XCTUnwrap(Signer(signatureAlgorithm: .RS256, key: privateKey))
        let token = try JWS(header: JWSHeader(algorithm: .RS256), payload: Payload(Data("hello".utf8)), signer: signer)
        XCTAssertTrue(token.isValid(for: try XCTUnwrap(Verifier(signatureAlgorithm: .RS256, key: publicKey))))
    }

    /// Neither library accepts `alg: none` (RFC 8725 §3.2); polyjose reports AlgorithmNotAllowed, even
    /// when the allow-list names it.
    func testNoneRefusedByBoth() throws {
        let token = "\(base64urlEncode(data: Data(#"{"alg":"none"}"#.utf8))).\(base64urlEncode(data: Data("hello".utf8)))."
        let (_, publicKey) = try p256SecKeys()
        let verifier = try XCTUnwrap(Verifier(signatureAlgorithm: .ES256, key: publicKey))
        XCTAssertFalse((try? JWS(compactSerialization: token))?.isValid(for: verifier) ?? false)
        for allowed in [["ES256"], ["none"]] {
            XCTAssertEqual(
                codeOf {
                    _ = try jwsVerifyCompact(
                        token: token, key: try fixturePublicJwk("p256"), options: JwsVerifyOptions(allowedAlgs: allowed))
                }, "AlgorithmNotAllowed", "\(allowed)")
        }
    }
}
