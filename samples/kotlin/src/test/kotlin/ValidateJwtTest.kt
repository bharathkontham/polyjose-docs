// The samples of Guides › Validate a JWT (src/content/docs/guides/validate-jwt.mdx).
//
// JWTs (RFC 7519) signed with ES256 (RFC 7518 §3.4) by the fixture P-256 key, and the checks a
// verifier makes (RFC 8725 §3.8-§3.12): issuer, audience, expiry and not-before with leeway
// (RFC 7519 §4.1), maximum age, required claims, explicit typing (RFC 8725 §3.11), RFC 9068
// access tokens, and nested JWTs (RFC 7519 §5.2). Tokens are issued a few minutes ahead of the
// current time and verified in the same test, unless a test fixes the clock at NOW.

import dev.polyjose.*
import java.time.Instant
import org.json.JSONObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ValidateJwtTest {
    private val signingKey = fixtureJwk("p256")
    private val publicKey = fixturePublicJwk("p256")

    /** The usual verify options: ES256 only, our issuer and our audience (RFC 8725 §3.8, §3.9). */
    private val options = JwtVerifyOptions(allowedAlgs = listOf("ES256"), issuers = listOf(ISSUER), audiences = listOf(AUDIENCE))

    private fun currentTime(): Long = Instant.now().epochSecond

    /** Signs [claims] (JSON text) as an ES256 JWT with the fixture key. */
    private fun issue(claims: String, signOptions: JwtSignOptions = JwtSignOptions(alg = "ES256")): String =
        jwtSign(claims, signingKey, signOptions)

    /** The error code of [call], or null when it succeeds. */
    private fun codeOf(call: () -> Unit): String? =
        try {
            call()
            null
        } catch (e: PolyjoseException) {
            e.code()
        }

    @Test
    fun issueToken() {
        val privateKey = signingKey
        // docs:start validate-jwt/issue
        val now = Instant.now().epochSecond
        val token = jwtSign(
            claims = """{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${now + 300}}""",
            key = privateKey,
            options = JwtSignOptions(alg = "ES256"),
        )
        // docs:end validate-jwt/issue
        assertEquals(3, token.split('.').size)
        val header = protectedHeaderOf(token)
        assertEquals("ES256", header.getString("alg"))
        assertEquals("JWT", header.getString("typ"), "RFC 7519 §5.1")
    }

    @Test
    fun verify() {
        val token = issue("""{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${currentTime() + 300}}""")
        // docs:start validate-jwt/verify
        val verified = jwtVerify(
            token = token,
            key = publicKey,
            options = JwtVerifyOptions(
                allowedAlgs = listOf("ES256"),
                issuers = listOf(ISSUER),
                audiences = listOf(AUDIENCE),
            ),
        )
        val subject = JSONObject(verified.claims).getString("sub")
        // docs:end validate-jwt/verify
        assertEquals(SUBJECT, subject)
        assertEquals("ES256", verified.alg)
        // An unknown header member is ignored, not rejected (RFC 7515 §4, RFC 7519 erratum 8060).
        val traced = issue(
            """{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${currentTime() + 300}}""",
            JwtSignOptions(alg = "ES256", header = """{"x-trace":"abc"}"""),
        )
        assertEquals(SUBJECT, JSONObject(jwtVerify(traced, publicKey, options).claims).getString("sub"))
    }

    @Test
    fun expired() {
        val token = issue("""{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${currentTime() - 120}}""")
        // docs:start validate-jwt/expired
        // exp is two minutes ago, beyond the default 60-second leeway (RFC 7519 §4.1.4).
        val code = try {
            jwtVerify(token, publicKey, options)
            null
        } catch (e: PolyjoseException) {
            e.code() // "TokenExpired"
        }
        // docs:end validate-jwt/expired
        assertEquals("TokenExpired", code)
    }

    @Test
    fun notYetValid() {
        val now = currentTime()
        val token = issue("""{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${now + 600},"nbf":${now + 300}}""")
        // docs:start validate-jwt/not-yet-valid
        // nbf is five minutes ahead (RFC 7519 §4.1.5).
        val code = try {
            jwtVerify(token, publicKey, options)
            null
        } catch (e: PolyjoseException) {
            e.code() // "TokenNotYetValid"
        }
        // docs:end validate-jwt/not-yet-valid
        assertEquals("TokenNotYetValid", code)
    }

    @Test
    fun audNotConfigured() {
        val token = issue("""{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${currentTime() + 300}}""")
        // docs:start validate-jwt/aud-not-configured
        // The token names an audience, so the verifier must say which audiences it accepts
        // (RFC 7519 §4.1.3, RFC 8725 §3.9).
        val code = try {
            jwtVerify(token, publicKey, JwtVerifyOptions(allowedAlgs = listOf("ES256")))
            null
        } catch (e: PolyjoseException) {
            e.code() // "InvalidClaim"
        }
        // docs:end validate-jwt/aud-not-configured
        assertEquals("InvalidClaim", code)
    }

    @Test
    fun checkOrder() {
        val token = issue("""{"iss":"https://other.example","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${currentTime() - 120}}""")
        // docs:start validate-jwt/check-order
        // Both exp and iss are wrong; the time checks come first, so the code is TokenExpired.
        val code = try {
            jwtVerify(token, publicKey, JwtVerifyOptions(allowedAlgs = listOf("ES256"), issuers = listOf(ISSUER), audiences = listOf(AUDIENCE)))
            null
        } catch (e: PolyjoseException) {
            e.code() // "TokenExpired"
        }
        // docs:end validate-jwt/check-order
        assertEquals("TokenExpired", code)
    }

    @Test
    fun leeway() {
        val token = issue("""{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":$NOW}""")
        // docs:start validate-jwt/leeway
        // 30 seconds after exp: inside the default 60-second leeway (RFC 7519 §4.1.4).
        val verified = jwtVerify(token, publicKey, options.copy(now = NOW + 30))
        // With a 10-second leeway the same token has expired.
        val code = try {
            jwtVerify(token, publicKey, options.copy(now = NOW + 30, leeway = 10u))
            null
        } catch (e: PolyjoseException) {
            e.code() // "TokenExpired"
        }
        // docs:end validate-jwt/leeway
        assertEquals(SUBJECT, JSONObject(verified.claims).getString("sub"))
        assertEquals("TokenExpired", code)
    }

    @Test
    fun maxAge() {
        val now = currentTime()
        val token = issue("""{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${now + 300}}""")
        // docs:start validate-jwt/max-age
        // maxAge bounds how old iat may be (RFC 7519 §4.1.6), so a token without iat fails.
        val code = try {
            jwtVerify(token, publicKey, options.copy(maxAge = 300u))
            null
        } catch (e: PolyjoseException) {
            e.code() // "InvalidClaim"
        }
        // docs:end validate-jwt/max-age
        assertEquals("InvalidClaim", code)
        val withIat = issue("""{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${now + 300},"iat":$now}""")
        assertEquals(null, codeOf { jwtVerify(withIat, publicKey, options.copy(maxAge = 300u)) })
    }

    @Test
    fun requiredClaims() {
        val token = issue("""{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${currentTime() + 300}}""")
        // docs:start validate-jwt/required-claims
        val code = try {
            jwtVerify(token, publicKey, options.copy(requiredClaims = listOf("jti")))
            null
        } catch (e: PolyjoseException) {
            e.code() // "InvalidClaim": the token has no jti (RFC 7519 §4.1.7)
        }
        // docs:end validate-jwt/required-claims
        assertEquals("InvalidClaim", code)
    }

    @Test
    fun accessToken() {
        val privateKey = signingKey
        // docs:start validate-jwt/access-token
        // An OAuth 2.0 access token in the RFC 9068 profile, typ "at+jwt" (RFC 9068 §2).
        val now = Instant.now().epochSecond
        val token = jwtSign(
            """{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${now + 300},"iat":$now,"jti":"token-1","client_id":"client-1"}""",
            privateKey,
            JwtSignOptions(alg = "ES256", accessToken = true),
        )
        // A resource server checks it with the access_token profile (RFC 9068 §4).
        val verified = jwtVerify(
            token,
            publicKey,
            JwtVerifyOptions(
                allowedAlgs = listOf("ES256"),
                issuers = listOf(ISSUER),
                audiences = listOf(AUDIENCE),
                profile = "access_token",
            ),
        )
        // docs:end validate-jwt/access-token
        assertEquals("at+jwt", JSONObject(verified.header).getString("typ"))
        assertEquals("client-1", JSONObject(verified.claims).getString("client_id"))
    }

    @Test
    fun typedRejected() {
        val now = currentTime()
        val token = issue(
            """{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${now + 300},"iat":$now,"jti":"token-1","client_id":"client-1"}""",
            JwtSignOptions(alg = "ES256", accessToken = true),
        )
        // docs:start validate-jwt/typed-rejected
        // A plain verify expects typ "JWT", so an access token is not mistaken for an ID token
        // or other JWT (RFC 8725 §3.11).
        val code = try {
            jwtVerify(token, publicKey, JwtVerifyOptions(allowedAlgs = listOf("ES256"), issuers = listOf(ISSUER), audiences = listOf(AUDIENCE)))
            null
        } catch (e: PolyjoseException) {
            e.code() // "InvalidHeader"
        }
        // docs:end validate-jwt/typed-rejected
        assertEquals("InvalidHeader", code)
    }

    @Test
    fun fixedNow() {
        val token = issue("""{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${NOW + 300},"iat":$NOW}""")
        // docs:start validate-jwt/fixed-now
        // Validate against a given time instead of the system clock, in whole seconds.
        val verified = jwtVerify(
            token,
            publicKey,
            JwtVerifyOptions(allowedAlgs = listOf("ES256"), issuers = listOf(ISSUER), audiences = listOf(AUDIENCE), now = NOW),
        )
        // docs:end validate-jwt/fixed-now
        assertEquals(NOW + 300, JSONObject(verified.claims).getLong("exp"))
    }

    @Test
    fun nested() {
        val claims = """{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${currentTime() + 300}}"""
        val verifyKey = publicKey
        // docs:start validate-jwt/nested
        // Sign, then encrypt the signed JWT to the recipient (RFC 7519 §5.2, §11.2).
        val signed = jwtSign(claims, signingKey, JwtSignOptions(alg = "ES256"))
        val recipient = jwkGenerateEc("P-256")
        val nested = jwtEncryptNested(
            signedJwt = signed,
            options = JweEncryptOptions(
                enc = "A256GCM",
                recipients = listOf(JweRecipient(alg = "ECDH-ES+A256KW", key = jwkToPublic(recipient))),
            ),
        )
        // The recipient decrypts with its key, then verifies the inner JWT with the signer's.
        val verified = jwtDecryptNested(
            token = nested,
            decryptKey = recipient,
            decryptOptions = JweDecryptOptions(allowedAlgs = listOf("ECDH-ES+A256KW"), allowedEnc = listOf("A256GCM")),
            key = verifyKey,
            options = JwtVerifyOptions(allowedAlgs = listOf("ES256"), issuers = listOf(ISSUER), audiences = listOf(AUDIENCE)),
        )
        // docs:end validate-jwt/nested
        assertEquals(SUBJECT, JSONObject(verified.inner.claims).getString("sub"))
        assertEquals("JWT", JSONObject(verified.outerHeader).getString("cty"), "RFC 7519 §5.2")
        assertEquals(0u, verified.recipientIndex)
    }
}
