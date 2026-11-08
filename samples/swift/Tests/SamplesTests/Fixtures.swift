import Foundation

/// Keys for the samples, from `samples/fixtures/keys.json`. Nothing here is shown on a page.
///
/// They are example keys published in RFC 7515 and RFC 8037. Their private parts are printed in
/// the RFCs, so they protect nothing. Never use them in an application.
enum Fixtures {
    struct Missing: Error, CustomStringConvertible {
        let description: String
    }

    /// `samples/fixtures/keys.json`, found from this file's path.
    private static func keys() throws -> [String: Any] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // SamplesTests
            .deletingLastPathComponent()  // Tests
            .deletingLastPathComponent()  // swift
            .deletingLastPathComponent()  // samples
            .appendingPathComponent("fixtures/keys.json")
        let doc = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        guard let keys = (doc as? [String: Any])?["keys"] as? [String: Any] else {
            throw Missing(description: "\(url.path) has no keys object")
        }
        return keys
    }

    private static func jwkObject(_ name: String) throws -> [String: Any] {
        guard let jwk = (try keys()[name] as? [String: Any])?["jwk"] as? [String: Any] else {
            throw Missing(description: "keys.json has no keys.\(name).jwk object")
        }
        return jwk
    }

    private static func text(_ object: [String: Any]) throws -> String {
        String(decoding: try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), as: UTF8.self)
    }

    /// The fixture JWK named `name` as JSON text: `hmac`, `rsa-public`, `p256` or `ed25519`.
    static func jwk(_ name: String) throws -> String {
        try text(jwkObject(name))
    }

    /// The public half of the fixture JWK named `name` (RFC 7517 §4, RFC 7518 §6.2.1): the private
    /// member `d` removed.
    static func publicJwk(_ name: String) throws -> String {
        var jwk = try jwkObject(name)
        guard jwk["kty"] as? String != "oct" else {
            throw Missing(description: "keys.\(name) is an oct key, which has no public half")
        }
        jwk.removeValue(forKey: "d")
        return try text(jwk)
    }
}
