// Shared inputs of the guide samples (sign-and-verify, encrypt-and-decrypt, validate-jwt,
// manage-keys, jwk-sets). Nothing in this file is shown on a page.
//
// The keys are example keys published in RFC 7515 and RFC 8037. Their private parts are printed
// in the RFCs, so they protect nothing. Never use them in an application.

import Foundation
import Polyjose

/// RFC 7515 Appendix A.2: an RS256 JWS, signed with the `rsa-private` fixture.
let rfc7515A2Jws =
    "eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ.cC4hiUPoj9Eetdgtv3hF80EGrhuB__dzERat0XF9g2VtQgr9PJbu3XOiZj5RZmh7AAuHIm4Bh-0Qc_lF5YKt_O8W2Fp5jujGbds9uJdbF9CUAr7t1dnZcAcQjbKBYNX4BAynRFdiuB--f_nZLgrnbyTyWzO75vRK5h6xBArLIARNPvkSjtQBMHlb1L07Qe7K0GarZRmB_eSN9383LcOLn6_dO--xi12jzDwusC-eOkHWEsqtFZESc6BfI7noOPqvhJ1phCnvWh6IeYI2w9QOYEUipUTI8np6LbgGY9Fs98rqVt5AXLIhWkWywlVmtVrBp0igcN_IoypGlUPQGe77Rw"

/// The payload of `rfc7515A2Jws` (RFC 7515 Appendix A.1.1), with its CR LF line breaks.
let rfc7515A2Payload = "{\"iss\":\"joe\",\r\n \"exp\":1300819380,\r\n \"http://example.com/is_root\":true}"

/// RFC 8037 Appendix A.4: an EdDSA JWS, signed with the `ed25519` fixture.
let rfc8037A4Jws =
    "eyJhbGciOiJFZERTQSJ9.RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc.hgyY0il_MGCjP0JzlnLWG1PPOt7-09PGcvMg3AIbQR6dWbhijcNR4ki4iylGjg5BhVsPt9g7sVvpAr_MuM0KAg"

/// The payload of `rfc8037A4Jws` (RFC 8037 Appendix A.4).
let rfc8037A4Payload = "Example of Ed25519 signing"

/// RFC 7797 §4.2: an HS256 JWS with an unencoded, detached payload, signed with the `hmac` fixture.
let rfc7797Jws = "eyJhbGciOiJIUzI1NiIsImI2NCI6ZmFsc2UsImNyaXQiOlsiYjY0Il19..A5dxf2s96_n5FLueVuW1Z_vh161FwXZC4YLPff6dmDY"

/// The detached payload of `rfc7797Jws` (RFC 7797 §4).
let rfc7797Payload = "$.02"

/// RFC 7638 §3.1: the RSA key whose thumbprint the RFC computes.
let rfc7638Key =
    #"{"kty":"RSA","n":"0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw","e":"AQAB","alg":"RS256","kid":"2011-04-29"}"#

/// The SHA-256 thumbprint of `rfc7638Key` (RFC 7638 §3.1).
let rfc7638Thumbprint = "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"

/// The thumbprint URI of `rfc7638Key` (RFC 9278 §3, with the RFC 7638 §3.1 thumbprint).
let rfc7638ThumbprintUri = "urn:ietf:params:oauth:jwk-thumbprint:sha-256:NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"

/// The private exponent `d` of the RFC 7515 Appendix A.2.1 RSA key (RFC 7518 §6.3.2.1).
let rfc7515A2D =
    "Eq5xpGnNCivDflJsRQBXHx1hdR1k6Ulwe2JZD50LpXyWPEAeP88vLNO97IjlA7_GQ5sLKMgvfTeXZx9SE-7YwVol2NXOoAJe46sui395IW_GO-pWJ1O0BkTGoVEn2bKVRUCgu-GjBVaYLU6f3l9kJfFNS3E0QbVdxzubSu3Mkqzjkn439X0M_V51gfpRLI9JYanrC4D4qAdGcopV_0ZHHzQlBjudU2QvXt4ehNYTCBr6XCLQUShb1juUO1ZdiYoFaFQT5Tw8bGUl_x_jTj3ccPDVZFD9pIuhLhBOneufuBiB4cS98l2SR_RQyGWSeWjnczT0QU91p1DhOVRuOopznQ"

/// Example `iss` (RFC 7519 §4.1.1), `aud` (§4.1.3) and `sub` (§4.1.2) values.
let issuer = "https://issuer.example"
let audience = "https://api.example"
let subject = "user-123"

/// A fixed validation time, whole seconds since the epoch (RFC 7519 §2, NumericDate).
let fixedNow: Int64 = 1_700_000_000

struct GuideFixtureError: Error, CustomStringConvertible {
    let description: String
}

/// `text`, a JSON object, as a dictionary.
func jsonObject(_ text: String) throws -> [String: Any] {
    guard let object = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else {
        throw GuideFixtureError(description: "not a JSON object: \(text)")
    }
    return object
}

/// `object` as JSON text.
func jsonText(_ object: [String: Any]) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
    return String(decoding: data, as: UTF8.self)
}

/// The JWS or JWE Protected Header of a compact `token`, decoded (RFC 7515 §7.1, RFC 7516 §7.1).
func protectedHeader(of token: String) throws -> [String: Any] {
    let first = token.components(separatedBy: ".")[0]
    return try jsonObject(String(decoding: try base64urlDecode(text: first), as: UTF8.self))
}

/// The `PolyjoseError` code that `call` throws, or nil when it returns. Any other error is thrown on.
func errorCode(_ call: () throws -> Void) throws -> String? {
    do {
        try call()
        return nil
    } catch let error as PolyjoseError {
        return error.code()
    }
}

/// `jwk` with its `kid` (RFC 7517 §4.5) set to `kid`.
func withKid(_ jwk: String, kid: String) throws -> String {
    var object = try jsonObject(jwk)
    object["kid"] = kid
    return try jsonText(object)
}

/// The RFC 7515 Appendix A.2.1 RSA private key, with every member (RFC 7518 §6.3.2).
func rsaPrivateJwk() throws -> String {
    try fixtureJwk("rsa-private")
}

/// The `rsa-public` fixture with only the private exponent `d` added: no CRT members, which
/// RFC 7518 §6.3.2 says producers SHOULD include, so polyjose refuses it.
func rsaExponentOnlyJwk() throws -> String {
    var object = try jsonObject(try fixtureJwk("rsa-public"))
    object["d"] = rfc7515A2D
    return try jsonText(object)
}

/// The fixture JWK named `name` as JSON text: `hmac`, `rsa-public`, `rsa-private`, `p256` or `ed25519`.
func fixtureJwk(_ name: String) throws -> String {
    try Fixtures.jwk(name)
}

/// The public half of the fixture JWK named `name` (RFC 7517 §4, RFC 7518 §6): `d` removed.
func fixturePublicJwk(_ name: String) throws -> String {
    try Fixtures.publicJwk(name)
}

/// The text of `samples/fixtures/jwks.json`, a JWK Set (RFC 7517 §5) of the public P-256 and
/// Ed25519 keys, found from this file's path as `Fixtures` finds `keys.json`.
func fixtureJwks() throws -> String {
    let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()  // SamplesTests
        .deletingLastPathComponent()  // Tests
        .deletingLastPathComponent()  // swift
        .deletingLastPathComponent()  // samples
        .appendingPathComponent("fixtures/jwks.json")
    return String(decoding: try Data(contentsOf: url), as: UTF8.self)
}
