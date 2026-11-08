// The samples of Guides › Validate a JWT (src/content/docs/guides/validate-jwt.mdx).
//
// JWTs (RFC 7519) signed with ES256 (RFC 7518 §3.4) by the fixture P-256 key, and the checks a
// verifier makes (RFC 8725 §3.8-§3.12): issuer, audience, expiry and not-before with leeway
// (RFC 7519 §4.1), maximum age, required claims, explicit typing (RFC 8725 §3.11), RFC 9068
// access tokens, and nested JWTs (RFC 7519 §5.2). Tokens are issued a few minutes ahead of the
// current time and verified in the same test, unless a test fixes the clock at `fixedNow`.

import Foundation
import Polyjose
import XCTest

final class ValidateJwtTests: XCTestCase {
    /// The usual verify options: ES256 only, our issuer and our audience (RFC 8725 §3.8, §3.9).
    private var options: JwtVerifyOptions {
        JwtVerifyOptions(allowedAlgs: ["ES256"], issuers: [issuer], audiences: [audience])
    }

    private func currentTime() -> Int64 { Int64(Date().timeIntervalSince1970) }

    /// The claims of a token from our issuer to our audience, with `extra` members appended.
    private func claimsJson(exp: Int64, iss: String = issuer, extra: String = "") -> String {
        #"{"iss":"\#(iss)","sub":"\#(subject)","aud":"\#(audience)","exp":\#(exp)\#(extra)}"#
    }

    /// Signs `claims` (JSON text) as an ES256 JWT with the fixture key.
    private func issue(_ claims: String, _ signOptions: JwtSignOptions = JwtSignOptions(alg: "ES256")) throws
        -> String
    {
        try jwtSign(claims: claims, key: try fixtureJwk("p256"), options: signOptions)
    }

    /// The error code of `call`, or nil when it succeeds.
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

    func testIssue() throws {
        let privateKey = try fixtureJwk("p256")
        // docs:start validate-jwt/issue
        let now = Int64(Date().timeIntervalSince1970)
        let token = try jwtSign(
            claims: #"{"iss":"\#(issuer)","sub":"\#(subject)","aud":"\#(audience)","exp":\#(now + 300)}"#,
            key: privateKey,
            options: JwtSignOptions(alg: "ES256")
        )
        // docs:end validate-jwt/issue
        XCTAssertEqual(token.components(separatedBy: ".").count, 3)
        let header = try protectedHeader(of: token)
        XCTAssertEqual(header["alg"] as? String, "ES256")
        XCTAssertEqual(header["typ"] as? String, "JWT", "RFC 7519 §5.1")
    }

    func testVerify() throws {
        let token = try issue(claimsJson(exp: currentTime() + 300))
        let publicKey = try fixturePublicJwk("p256")
        // docs:start validate-jwt/verify
        let verified = try jwtVerify(
            token: token,
            key: publicKey,
            options: JwtVerifyOptions(
                allowedAlgs: ["ES256"],
                issuers: [issuer],
                audiences: [audience]
            )
        )
        struct Claims: Decodable { let sub: String }
        let claims = try JSONDecoder().decode(Claims.self, from: Data(verified.claims.utf8))
        // docs:end validate-jwt/verify
        XCTAssertEqual(claims.sub, subject)
        XCTAssertEqual(verified.alg, "ES256")
        // An unknown header member is ignored, not rejected (RFC 7515 §4, RFC 7519 erratum 8060).
        let traced = try issue(
            claimsJson(exp: currentTime() + 300), JwtSignOptions(alg: "ES256", header: #"{"x-trace":"abc"}"#))
        let tracedClaims = try jsonObject(try jwtVerify(token: traced, key: publicKey, options: options).claims)
        XCTAssertEqual(tracedClaims["sub"] as? String, subject)
    }

    func testExpired() throws {
        let token = try issue(claimsJson(exp: currentTime() - 120))
        let publicKey = try fixturePublicJwk("p256")
        // docs:start validate-jwt/expired
        // exp is two minutes ago, beyond the default 60-second leeway (RFC 7519 §4.1.4).
        var code: String?
        do {
            _ = try jwtVerify(token: token, key: publicKey, options: options)
        } catch let error as PolyjoseError {
            code = error.code()  // "TokenExpired"
        }
        // docs:end validate-jwt/expired
        XCTAssertEqual(code, "TokenExpired")
    }

    func testNotYetValid() throws {
        let now = currentTime()
        let token = try issue(claimsJson(exp: now + 600, extra: #","nbf":\#(now + 300)"#))
        let publicKey = try fixturePublicJwk("p256")
        // docs:start validate-jwt/not-yet-valid
        // nbf is five minutes ahead (RFC 7519 §4.1.5).
        var code: String?
        do {
            _ = try jwtVerify(token: token, key: publicKey, options: options)
        } catch let error as PolyjoseError {
            code = error.code()  // "TokenNotYetValid"
        }
        // docs:end validate-jwt/not-yet-valid
        XCTAssertEqual(code, "TokenNotYetValid")
    }

    func testAudNotConfigured() throws {
        let token = try issue(claimsJson(exp: currentTime() + 300))
        let publicKey = try fixturePublicJwk("p256")
        // docs:start validate-jwt/aud-not-configured
        // The token names an audience, so the verifier must say which audiences it accepts
        // (RFC 7519 §4.1.3, RFC 8725 §3.9).
        var code: String?
        do {
            _ = try jwtVerify(token: token, key: publicKey, options: JwtVerifyOptions(allowedAlgs: ["ES256"]))
        } catch let error as PolyjoseError {
            code = error.code()  // "InvalidClaim"
        }
        // docs:end validate-jwt/aud-not-configured
        XCTAssertEqual(code, "InvalidClaim")
    }

    func testCheckOrder() throws {
        let token = try issue(claimsJson(exp: currentTime() - 120, iss: "https://other.example"))
        let publicKey = try fixturePublicJwk("p256")
        // docs:start validate-jwt/check-order
        // Both exp and iss are wrong; the time checks come first, so the code is TokenExpired.
        var code: String?
        do {
            _ = try jwtVerify(
                token: token, key: publicKey,
                options: JwtVerifyOptions(allowedAlgs: ["ES256"], issuers: [issuer], audiences: [audience]))
        } catch let error as PolyjoseError {
            code = error.code()  // "TokenExpired"
        }
        // docs:end validate-jwt/check-order
        XCTAssertEqual(code, "TokenExpired")
    }

    func testLeeway() throws {
        let token = try issue(claimsJson(exp: fixedNow))
        let publicKey = try fixturePublicJwk("p256")
        // docs:start validate-jwt/leeway
        // 30 seconds after exp: inside the default 60-second leeway (RFC 7519 §4.1.4).
        var options = JwtVerifyOptions(
            allowedAlgs: ["ES256"], now: fixedNow + 30, issuers: [issuer], audiences: [audience])
        let verified = try jwtVerify(token: token, key: publicKey, options: options)
        // With a 10-second leeway the same token has expired.
        options.leeway = 10
        var code: String?
        do {
            _ = try jwtVerify(token: token, key: publicKey, options: options)
        } catch let error as PolyjoseError {
            code = error.code()  // "TokenExpired"
        }
        // docs:end validate-jwt/leeway
        XCTAssertEqual(try jsonObject(verified.claims)["sub"] as? String, subject)
        XCTAssertEqual(code, "TokenExpired")
    }

    func testMaxAge() throws {
        let now = currentTime()
        let token = try issue(claimsJson(exp: now + 300))
        let publicKey = try fixturePublicJwk("p256")
        // docs:start validate-jwt/max-age
        // maxAge bounds how old iat may be (RFC 7519 §4.1.6), so a token without iat fails.
        var code: String?
        do {
            _ = try jwtVerify(
                token: token, key: publicKey,
                options: JwtVerifyOptions(allowedAlgs: ["ES256"], issuers: [issuer], audiences: [audience], maxAge: 300))
        } catch let error as PolyjoseError {
            code = error.code()  // "InvalidClaim"
        }
        // docs:end validate-jwt/max-age
        XCTAssertEqual(code, "InvalidClaim")
        let withIat = try issue(claimsJson(exp: now + 300, extra: #","iat":\#(now)"#))
        var maxAge = options
        maxAge.maxAge = 300
        XCTAssertNil(codeOf { _ = try jwtVerify(token: withIat, key: publicKey, options: maxAge) })
    }

    func testRequiredClaims() throws {
        let token = try issue(claimsJson(exp: currentTime() + 300))
        let publicKey = try fixturePublicJwk("p256")
        // docs:start validate-jwt/required-claims
        var code: String?
        do {
            _ = try jwtVerify(
                token: token, key: publicKey,
                options: JwtVerifyOptions(
                    allowedAlgs: ["ES256"], issuers: [issuer], audiences: [audience], requiredClaims: ["jti"]))
        } catch let error as PolyjoseError {
            code = error.code()  // "InvalidClaim": the token has no jti (RFC 7519 §4.1.7)
        }
        // docs:end validate-jwt/required-claims
        XCTAssertEqual(code, "InvalidClaim")
    }

    func testAccessToken() throws {
        let privateKey = try fixtureJwk("p256")
        let publicKey = try fixturePublicJwk("p256")
        // docs:start validate-jwt/access-token
        // An OAuth 2.0 access token in the RFC 9068 profile, typ "at+jwt" (RFC 9068 §2).
        let now = Int64(Date().timeIntervalSince1970)
        let token = try jwtSign(
            claims: #"{"iss":"\#(issuer)","sub":"\#(subject)","aud":"\#(audience)","exp":\#(now + 300),"iat":\#(now),"jti":"token-1","client_id":"client-1"}"#,
            key: privateKey,
            options: JwtSignOptions(alg: "ES256", accessToken: true)
        )
        // A resource server checks it with the access_token profile (RFC 9068 §4).
        let verified = try jwtVerify(
            token: token,
            key: publicKey,
            options: JwtVerifyOptions(
                allowedAlgs: ["ES256"],
                issuers: [issuer],
                audiences: [audience],
                profile: "access_token"
            )
        )
        // docs:end validate-jwt/access-token
        XCTAssertEqual(try jsonObject(verified.header)["typ"] as? String, "at+jwt")
        XCTAssertEqual(try jsonObject(verified.claims)["client_id"] as? String, "client-1")
    }

    func testTypedRejected() throws {
        let now = currentTime()
        let token = try issue(
            claimsJson(exp: now + 300, extra: #","iat":\#(now),"jti":"token-1","client_id":"client-1""#),
            JwtSignOptions(alg: "ES256", accessToken: true))
        let publicKey = try fixturePublicJwk("p256")
        // docs:start validate-jwt/typed-rejected
        // A plain verify expects typ "JWT", so an access token is not mistaken for an ID token
        // or other JWT (RFC 8725 §3.11).
        var code: String?
        do {
            _ = try jwtVerify(
                token: token, key: publicKey,
                options: JwtVerifyOptions(allowedAlgs: ["ES256"], issuers: [issuer], audiences: [audience]))
        } catch let error as PolyjoseError {
            code = error.code()  // "InvalidHeader"
        }
        // docs:end validate-jwt/typed-rejected
        XCTAssertEqual(code, "InvalidHeader")
    }

    func testFixedNow() throws {
        let token = try issue(claimsJson(exp: fixedNow + 300, extra: #","iat":\#(fixedNow)"#))
        let publicKey = try fixturePublicJwk("p256")
        // docs:start validate-jwt/fixed-now
        // Validate against a given time instead of the system clock, in whole seconds.
        let verified = try jwtVerify(
            token: token,
            key: publicKey,
            options: JwtVerifyOptions(allowedAlgs: ["ES256"], now: fixedNow, issuers: [issuer], audiences: [audience])
        )
        // docs:end validate-jwt/fixed-now
        XCTAssertEqual((try jsonObject(verified.claims)["exp"] as? NSNumber)?.int64Value, fixedNow + 300)
    }

    func testNested() throws {
        let claims = claimsJson(exp: currentTime() + 300)
        let signingKey = try fixtureJwk("p256")
        let verifyKey = try fixturePublicJwk("p256")
        // docs:start validate-jwt/nested
        // Sign, then encrypt the signed JWT to the recipient (RFC 7519 §5.2, §11.2).
        let signed = try jwtSign(claims: claims, key: signingKey, options: JwtSignOptions(alg: "ES256"))
        let recipient = try jwkGenerateEc(crv: "P-256")
        let nested = try jwtEncryptNested(
            signedJwt: signed,
            options: JweEncryptOptions(
                enc: "A256GCM",
                recipients: [JweRecipient(alg: "ECDH-ES+A256KW", key: try jwkToPublic(jwk: recipient))]
            )
        )
        // The recipient decrypts with its key, then verifies the inner JWT with the signer's.
        let verified = try jwtDecryptNested(
            token: nested,
            decryptKey: recipient,
            decryptOptions: JweDecryptOptions(allowedAlgs: ["ECDH-ES+A256KW"], allowedEnc: ["A256GCM"]),
            key: verifyKey,
            options: JwtVerifyOptions(allowedAlgs: ["ES256"], issuers: [issuer], audiences: [audience])
        )
        // docs:end validate-jwt/nested
        XCTAssertEqual(try jsonObject(verified.inner.claims)["sub"] as? String, subject)
        XCTAssertEqual(try jsonObject(verified.outerHeader)["cty"] as? String, "JWT", "RFC 7519 §5.2")
        XCTAssertEqual(verified.recipientIndex, 0)
    }
}
