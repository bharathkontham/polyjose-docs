// The samples of Guides › Hardware-backed keys (src/content/docs/guides/hardware-backed-keys.mdx).
//
// A platform key (`AppleKey`, or any `PlatformKey`) signs a JWT (RFC 7519 §7.1, a JWS per
// RFC 7515 §5.1) and decrypts a JWE (RFC 7516 §5.2) while its private key stays with the Security
// framework. polyjose verifies every signature it gets back before it returns a token, and only
// the private-key step (ECDSA signing, the ECDH agreement of RFC 7518 §4.6) runs in the platform.
//
// The macOS host runs these with `swift test`, an unsigned binary that may not store Keychain
// items (every item call returns errSecMissingEntitlement, -34018). So the sign, decrypt and
// error samples use keys that are never stored, and the samples that create, find and delete a
// stored key are skipped, with that reason, when the Keychain refuses to store an item.

import CryptoKit
import Foundation
import Polyjose
import Security
import XCTest

/// The tag the create, find and delete samples use.
private let sampleTag = "com.example.app.signing-key"

/// Whether this process may store Keychain items in the data protection keychain.
private func keychainStoresItems() -> Bool {
    let item: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "dev.polyjose.samples.keychain-probe",
        kSecAttrAccount as String: UUID().uuidString,
        kSecUseDataProtectionKeychain as String: true,
    ]
    var add = item
    add[kSecValueData as String] = Data([0])
    let status = SecItemAdd(add as CFDictionary, nil)
    if status == errSecSuccess { SecItemDelete(item as CFDictionary) }
    return status == errSecSuccess
}

private func skipUnlessKeysCanBeStored(secureEnclave: Bool) throws {
    try XCTSkipUnless(
        keychainStoresItems(),
        "this process can't store Keychain items (an unsigned test binary on macOS gets errSecMissingEntitlement)")
    if secureEnclave {
        try XCTSkipUnless(SecureEnclave.isAvailable, "this machine has no Secure Enclave")
    }
}

/// The public JWK of a CryptoKit P-256 key (RFC 7518 §6.2.1), from its X9.63 point 0x04 || X || Y.
private func ecPublicJwk(of key: P256.Signing.PublicKey) -> String {
    let point = key.x963Representation
    let x = base64urlEncode(data: Data(point[1..<33]))
    let y = base64urlEncode(data: Data(point[33..<65]))
    return #"{"kty":"EC","crv":"P-256","x":"\#(x)","y":"\#(y)"}"#
}

// docs:start hardware-backed-keys/implement
/// A platform key for a P-256 signer that holds its own private key, such as a smart card or a
/// cloud KMS. CryptoKit stands in for that signer here.
final class ExternalP256Signer: PlatformKey {
    private let signer: P256.Signing.PrivateKey

    init(signer: P256.Signing.PrivateKey) { self.signer = signer }

    /// Public members only.
    func publicJwk() throws -> String {
        let point = signer.publicKey.x963Representation  // 0x04 || X || Y
        let x = base64urlEncode(data: Data(point[1..<33]))
        let y = base64urlEncode(data: Data(point[33..<65]))
        return #"{"kty":"EC","crv":"P-256","x":"\#(x)","y":"\#(y)","alg":"ES256","use":"sig"}"#
    }

    func algorithms() throws -> [String] { ["ES256"] }

    /// The signer hashes the signing input itself and returns an ASN.1 DER signature.
    func sign(alg: String, signingInput: Data) throws -> Data {
        try signer.signature(for: signingInput).derRepresentation
    }

    // This key only signs, so polyjose never calls these: algorithms() names no decryption.
    func agree(peerPublicKey: Data) throws -> Data { throw PlatformKeyError.Failed }
    func decryptKey(alg: String, encryptedKey: Data) throws -> Data { throw PlatformKeyError.Failed }
}
// docs:end hardware-backed-keys/implement

/// A key whose user cancels every prompt, for the error-handling sample.
private final class CancellingKey: PlatformKey {
    private let jwk = ecPublicJwk(of: P256.Signing.PrivateKey().publicKey)
    func publicJwk() throws -> String { jwk }
    func algorithms() throws -> [String] { ["ES256"] }
    func sign(alg: String, signingInput: Data) throws -> Data { throw PlatformKeyError.UserAuthenticationRequired }
    func agree(peerPublicKey: Data) throws -> Data { throw PlatformKeyError.UserAuthenticationRequired }
    func decryptKey(alg: String, encryptedKey: Data) throws -> Data {
        throw PlatformKeyError.UserAuthenticationRequired
    }
}

final class HardwareBackedKeysTests: XCTestCase {
    /// An ES256 `AppleKey` around a P-256 key that is never stored (see the file comment).
    private func transientKey(algorithm: String) throws -> AppleKey {
        // docs:start hardware-backed-keys/own-seckey
        // A private key your app created with the Security framework itself.
        var error: Unmanaged<CFError>?
        guard let privateKey = SecKeyCreateRandomKey(
            [kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom, kSecAttrKeySizeInBits: 256] as CFDictionary,
            &error
        ) else { throw error!.takeRetainedValue() as Error }
        let key = try AppleKey(secKey: privateKey, algorithm: "ES256")
        // docs:end hardware-backed-keys/own-seckey
        if algorithm == "ES256" { return key }
        return try AppleKey(secKey: privateKey, algorithm: algorithm)
    }

    override func tearDown() {
        try? AppleKey.delete(tag: sampleTag)
        super.tearDown()
    }

    func testOwnSecKeyIsAKeychainKey() throws {
        let key = try transientKey(algorithm: "ES256")
        XCTAssertEqual(key.protection, .keychain, "a software SecKey reports .keychain, from kSecAttrTokenID")
        let jwk = try jsonObject(try key.publicJwk())
        XCTAssertEqual(jwk["kty"] as? String, "EC")
        XCTAssertEqual(jwk["crv"] as? String, "P-256")
        XCTAssertNil(jwk["d"], "the public JWK holds no private member")
    }

    func testCreateOpenDelete() throws {
        try skipUnlessKeysCanBeStored(secureEnclave: true)
        try? AppleKey.delete(tag: sampleTag)
        // docs:start hardware-backed-keys/create-open-delete
        // Once, for example when the user signs in: create the key in the Secure Enclave.
        let created = try AppleKey.generate(
            tag: "com.example.app.signing-key", algorithm: "ES256", protection: .secureEnclave)
        let publicJwk = try created.publicJwk()  // register this with your server

        // On every later launch: find it again by its tag.
        let key = try AppleKey.open(tag: "com.example.app.signing-key", algorithm: "ES256")

        // When the user signs out, or the key must be replaced:
        try AppleKey.delete(tag: "com.example.app.signing-key")
        // docs:end hardware-backed-keys/create-open-delete
        XCTAssertEqual(try key.publicJwk(), publicJwk, "open finds the same key")
        XCTAssertEqual(created.protection, .secureEnclave)
        XCTAssertThrowsError(try AppleKey.open(tag: sampleTag, algorithm: "ES256")) { error in
            XCTAssertEqual((error as? PolyjoseError)?.code(), "KeyNotFound")
        }
    }

    func testUserPresence() throws {
        try skipUnlessKeysCanBeStored(secureEnclave: true)
        try? AppleKey.delete(tag: sampleTag)
        // Creating the key doesn't prompt; using it does, so only creation runs here.
        // docs:start hardware-backed-keys/user-presence
        let key = try AppleKey.generate(
            tag: "com.example.app.signing-key",
            algorithm: "ES256",
            protection: .secureEnclave,
            access: AppleKey.Access(flags: [.userPresence])
        )
        // docs:end hardware-backed-keys/user-presence
        XCTAssertEqual(key.protection, .secureEnclave)
        try AppleKey.delete(tag: sampleTag)
    }

    func testSignJwt() throws {
        let key = try transientKey(algorithm: "ES256")
        // docs:start hardware-backed-keys/sign-jwt
        let now = Int64(Date().timeIntervalSince1970)
        let token = try jwtSignWithPlatformKey(
            claims: #"{"sub":"\#(subject)","aud":"\#(audience)","exp":\#(now + 300)}"#,
            key: key,
            options: JwtSignOptions(alg: "ES256")
        )
        // docs:end hardware-backed-keys/sign-jwt
        // Anyone with the public JWK verifies it, in pure Rust, like any other ES256 token.
        let verified = try jwtVerify(
            token: token,
            key: try key.publicJwk(),
            options: JwtVerifyOptions(allowedAlgs: ["ES256"], audiences: [audience]))
        let claims = try jsonObject(verified.claims)
        XCTAssertEqual(claims["sub"] as? String, subject)
        let header = try jsonObject(verified.header)
        XCTAssertEqual(header["alg"] as? String, "ES256")
    }

    func testDecryptJwe() throws {
        let key = try transientKey(algorithm: "ECDH-ES")
        // docs:start hardware-backed-keys/decrypt-jwe
        // The sender encrypts to the key's public JWK, as for any other key.
        let token = try jweEncryptCompact(
            plaintext: Data("hello".utf8),
            options: JweEncryptOptions(
                enc: "A256GCM",
                recipients: [JweRecipient(alg: "ECDH-ES+A256KW", key: try key.publicJwk())]
            )
        )
        // The app decrypts with the platform key. Only the ECDH agreement runs in the platform.
        let decrypted = try jweDecryptCompactWithPlatformKey(
            token: token,
            key: key,
            options: JweDecryptOptions(allowedAlgs: ["ECDH-ES+A256KW"], allowedEnc: ["A256GCM"])
        )
        // docs:end hardware-backed-keys/decrypt-jwe
        XCTAssertEqual(String(decoding: decrypted.plaintext, as: UTF8.self), "hello")
        let header = try jsonObject(decrypted.header)
        XCTAssertEqual(header["alg"] as? String, "ECDH-ES+A256KW")
    }

    func testWrongAlgorithmNeverReachesTheKey() throws {
        let key = try transientKey(algorithm: "ES256")
        let token = try jweEncryptCompact(
            plaintext: Data("hello".utf8),
            options: JweEncryptOptions(
                enc: "A256GCM", recipients: [JweRecipient(alg: "ECDH-ES", key: try key.publicJwk())]))
        XCTAssertThrowsError(
            try jweDecryptCompactWithPlatformKey(
                token: token, key: key,
                options: JweDecryptOptions(allowedAlgs: ["ECDH-ES"], allowedEnc: ["A256GCM"]))
        ) { error in
            XCTAssertEqual((error as? PolyjoseError)?.code(), "KeyAlgorithmMismatch", "an ES256 key never decrypts")
        }
    }

    func testErrors() throws {
        let key: PlatformKey = CancellingKey()
        let claims = #"{"sub":"\#(subject)","exp":\#(Int64(Date().timeIntervalSince1970) + 300)}"#
        var outcome = ""
        let send = { (_: String) in outcome = "sent" }
        let showRetry = { outcome = "retry" }
        let enrolAgain = { outcome = "enrol" }
        let report = { (_: PolyjoseError) in outcome = "report" }
        // docs:start hardware-backed-keys/errors
        do {
            let token = try jwtSignWithPlatformKey(claims: claims, key: key, options: JwtSignOptions(alg: "ES256"))
            send(token)
        } catch let error as PolyjoseError where error.code() == "UserAuthenticationRequired" {
            showRetry()  // the user cancelled or hasn't authenticated: let them try again
        } catch let error as PolyjoseError where error.code() == "KeyNotFound" {
            enrolAgain()  // the key is gone or invalidated: create and register a new one
        } catch let error as PolyjoseError where error.code() == "PlatformKeyFailed" {
            report(error)  // retrying may not help
        }
        // docs:end hardware-backed-keys/errors
        XCTAssertEqual(outcome, "retry")
    }

    func testImplementPlatformKey() throws {
        let key = ExternalP256Signer(signer: P256.Signing.PrivateKey())
        let token = try jwsSignCompactWithPlatformKey(
            payload: Data("hello".utf8), key: key, options: JwsSignOptions(protectedHeader: #"{"alg":"ES256"}"#))
        let verified = try jwsVerifyCompact(
            token: token, key: try key.publicJwk(), options: JwsVerifyOptions(allowedAlgs: ["ES256"]))
        XCTAssertEqual(String(decoding: verified.payload, as: UTF8.self), "hello")
        // R || S, 64 octets for P-256 (RFC 7518 §3.4), converted from the DER the signer returned.
        let signature = try base64urlDecode(text: token.components(separatedBy: ".")[2])
        XCTAssertEqual(signature.count, 64)
    }

    // MARK: - Get started in Swift › Keys the platform holds (src/content/docs/start/swift.mdx), and
    // Use a key you already have (both pages)
    //
    // These store keys, so the macOS host compiles them and skips them when the Keychain refuses to
    // store an item (see the file comment). polyjose's hosted iOS tests
    // (platforms/swift/HostedTests/Tests/AppleKeyHostedTests.swift) make the same calls.

    func testStartSecureEnclave() throws {
        try skipUnlessKeysCanBeStored(secureEnclave: true)
        for tag in ["com.example.app.signing-key", "com.example.app.decryption-key"] { try? AppleKey.delete(tag: tag) }
        let claims = #"{"sub":"\#(subject)","exp":\#(Int64(Date().timeIntervalSince1970) + 300)}"#
        // docs:start start/swift-secure-enclave
        // Find the signing key, or create it in the Secure Enclave the first time.
        let signingKey: AppleKey
        do {
            signingKey = try AppleKey.open(tag: "com.example.app.signing-key", algorithm: "ES256")
        } catch let error as PolyjoseError where error.code() == "KeyNotFound" {
            signingKey = try AppleKey.generate(
                tag: "com.example.app.signing-key", algorithm: "ES256", protection: .secureEnclave)
            // Register signingKey.publicJwk() with your server.
        }
        let token = try jwtSignWithPlatformKey(claims: claims, key: signingKey, options: JwtSignOptions(alg: "ES256"))

        // Decrypting takes a second key, bound to ECDH-ES.
        let decryptionKey = try AppleKey.generate(
            tag: "com.example.app.decryption-key", algorithm: "ECDH-ES", protection: .secureEnclave)
        // The sender encrypts to its public JWK, here or on a server.
        let jwe = try jweEncryptCompact(
            plaintext: Data("hello".utf8),
            options: JweEncryptOptions(
                enc: "A256GCM", recipients: [JweRecipient(alg: "ECDH-ES+A256KW", key: try decryptionKey.publicJwk())]))
        let decrypted = try jweDecryptCompactWithPlatformKey(
            token: jwe, key: decryptionKey,
            options: JweDecryptOptions(allowedAlgs: ["ECDH-ES+A256KW"], allowedEnc: ["A256GCM"]))

        // When the user signs out, or the keys must be replaced:
        try AppleKey.delete(tag: "com.example.app.signing-key")
        try AppleKey.delete(tag: "com.example.app.decryption-key")
        // docs:end start/swift-secure-enclave
        XCTAssertEqual(signingKey.protection, .secureEnclave)
        XCTAssertEqual(decryptionKey.protection, .secureEnclave)
        XCTAssertEqual(String(decoding: decrypted.plaintext, as: UTF8.self), "hello")
        _ = try jwtVerify(token: token, key: try signingKey.publicJwk(), options: JwtVerifyOptions(allowedAlgs: ["ES256"]))
    }

    func testStartKeychain() throws {
        try skipUnlessKeysCanBeStored(secureEnclave: false)
        for tag in ["com.example.app.rsa-signing-key", "com.example.app.rsa-decryption-key"] { try? AppleKey.delete(tag: tag) }
        let claims = #"{"sub":"\#(subject)","exp":\#(Int64(Date().timeIntervalSince1970) + 300)}"#
        // docs:start start/swift-keychain
        // A Keychain key: stored and protected by the OS, not hardware-bound.
        let signingKey = try AppleKey.generate(
            tag: "com.example.app.rsa-signing-key", algorithm: "PS256", protection: .keychain, keySizeInBits: 3072)
        let token = try jwtSignWithPlatformKey(claims: claims, key: signingKey, options: JwtSignOptions(alg: "PS256"))

        // RSA-OAEP-256 decryption, with a second key.
        let decryptionKey = try AppleKey.generate(
            tag: "com.example.app.rsa-decryption-key", algorithm: "RSA-OAEP-256", protection: .keychain)
        let jwe = try jweEncryptCompact(
            plaintext: Data("hello".utf8),
            options: JweEncryptOptions(
                enc: "A256GCM", recipients: [JweRecipient(alg: "RSA-OAEP-256", key: try decryptionKey.publicJwk())]))
        let decrypted = try jweDecryptCompactWithPlatformKey(
            token: jwe, key: decryptionKey,
            options: JweDecryptOptions(allowedAlgs: ["RSA-OAEP-256"], allowedEnc: ["A256GCM"]))

        try AppleKey.delete(tag: "com.example.app.rsa-signing-key")
        try AppleKey.delete(tag: "com.example.app.rsa-decryption-key")
        // docs:end start/swift-keychain
        XCTAssertEqual(signingKey.protection, .keychain)
        XCTAssertEqual(String(decoding: decrypted.plaintext, as: UTF8.self), "hello")
        _ = try jwtVerify(token: token, key: try signingKey.publicJwk(), options: JwtVerifyOptions(allowedAlgs: ["PS256"]))
    }

    func testExistingKey() throws {
        try skipUnlessKeysCanBeStored(secureEnclave: false)
        let tag = "com.example.app.existing-key"
        _ = SecItemDelete([kSecClass: kSecClassKey, kSecAttrApplicationTag: Data(tag.utf8)] as CFDictionary)
        let claims = #"{"sub":"\#(subject)","exp":\#(Int64(Date().timeIntervalSince1970) + 300)}"#
        // Stands in for the code that stored the key before the app used polyjose.
        var error: Unmanaged<CFError>?
        guard let secKey = SecKeyCreateRandomKey(
            [
                kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
                kSecAttrKeySizeInBits: 256,
                kSecPrivateKeyAttrs: [kSecAttrIsPermanent: true, kSecAttrApplicationTag: Data(tag.utf8)] as [CFString: Any],
            ] as CFDictionary,
            &error
        ) else { throw error!.takeRetainedValue() as Error }
        // docs:start hardware-backed-keys/existing-key
        // Your app stored the private key itself, with kSecAttrApplicationTag = Data(tag.utf8).
        // Find it by the same tag...
        let key = try AppleKey.open(tag: "com.example.app.existing-key", algorithm: "ES256")
        // ...or wrap the SecKey your app holds.
        let sameKey = try AppleKey(secKey: secKey, algorithm: "ES256")

        let token = try jwtSignWithPlatformKey(claims: claims, key: key, options: JwtSignOptions(alg: "ES256"))
        // docs:end hardware-backed-keys/existing-key
        XCTAssertEqual(try sameKey.publicJwk(), try key.publicJwk())
        _ = try jwtVerify(token: token, key: try key.publicJwk(), options: JwtVerifyOptions(allowedAlgs: ["ES256"]))
        try AppleKey.delete(tag: tag)
    }
}
