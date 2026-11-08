// The samples of Guides › JWK Sets (src/content/docs/guides/jwk-sets.mdx).
//
// Verifying JWTs against a JWK Set (RFC 7517 §5), as an issuer publishes at its jwks_uri: the key
// is chosen by the token's kid (RFC 7515 §4.1.4) and alg, the issuer is still checked
// (RFC 8725 §3.8), and a set holding an RSA private key is refused. The set is
// fixtures/jwks.json; the signers are the matching fixture private keys with the same kid.

import dev.polyjose.*
import java.time.Instant
import org.json.JSONObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test

class JwkSetsTest {
    private val jwks = fixtureJwks()
    private val options = JwtVerifyOptions(
        allowedAlgs = listOf("ES256", "Ed25519"),
        issuers = listOf(ISSUER),
        audiences = listOf(AUDIENCE),
    )

    /** An ES256 or Ed25519 JWT from [iss], signed by [key]; jwtSign copies the key's kid into the header. */
    private fun signedToken(key: String, alg: String, iss: String = ISSUER): String {
        val exp = Instant.now().epochSecond + 300
        return jwtSign("""{"iss":"$iss","sub":"$SUBJECT","aud":"$AUDIENCE","exp":$exp}""", key, JwtSignOptions(alg = alg))
    }

    @Test
    fun verify() {
        val token = signedToken(withKid(fixtureJwk("p256"), "p256-2026"), "ES256")
        // docs:start jwk-sets/verify
        // jwks is the issuer's JWK Set, as fetched from its jwks_uri.
        val verified = jwtVerifyWithJwks(
            token = token,
            jwks = jwks,
            options = JwtVerifyOptions(
                allowedAlgs = listOf("ES256", "Ed25519"),
                issuers = listOf(ISSUER),
                audiences = listOf(AUDIENCE),
            ),
        )
        // verified.kid and verified.keyIndex say which key of the set verified it.
        // docs:end jwk-sets/verify
        assertEquals(0u, verified.keyIndex)
        assertEquals("p256-2026", verified.kid)
        assertEquals("ES256", verified.alg)
        val second = jwtVerifyWithJwks(signedToken(withKid(fixtureJwk("ed25519"), "ed25519-2026"), "Ed25519"), jwks, options)
        assertEquals(1u, second.keyIndex)
        assertEquals("ed25519-2026", second.kid)
    }

    @Test
    fun noMatchingKey() {
        val token = signedToken(withKid(fixtureJwk("p256"), "retired-2025"), "ES256")
        // docs:start jwk-sets/no-matching-key
        // The token's kid is not in the set, for example a key the issuer has rotated out.
        val code = try {
            jwtVerifyWithJwks(token, jwks, options)
            null
        } catch (e: PolyjoseException) {
            e.code() // "NoMatchingKey"
        }
        // docs:end jwk-sets/no-matching-key
        assertEquals("NoMatchingKey", code)
    }

    @Test
    fun issuer() {
        val token = signedToken(withKid(fixtureJwk("p256"), "p256-2026"), "ES256", iss = "https://other.example")
        // docs:start jwk-sets/issuer
        // A key in the set does not vouch for every issuer; iss is checked as well (RFC 8725 §3.8).
        val code = try {
            jwtVerifyWithJwks(token, jwks, options)
            null
        } catch (e: PolyjoseException) {
            e.code() // "InvalidClaim"
        }
        // docs:end jwk-sets/issuer
        assertEquals("InvalidClaim", code)
    }

    @Test
    fun select() {
        // docs:start jwk-sets/select
        val key = jwksSelect(jwks, JwkSelector(kid = "p256-2026", alg = "ES256"))
        // docs:end jwk-sets/select
        val jwk = JSONObject(key)
        assertEquals("p256-2026", jwk.getString("kid"))
        assertEquals("P-256", jwk.getString("crv"))
        assertFalse(jwk.has("d"))
    }

    @Test
    fun selectAmbiguous() {
        // docs:start jwk-sets/select-ambiguous
        // Both keys are signing keys, so "use": "sig" alone picks no single key (RFC 7517 §4.2).
        val code = try {
            jwksSelect(jwks, JwkSelector(keyUse = "sig"))
            null
        } catch (e: PolyjoseException) {
            e.code() // "MultipleMatchingKeys"
        }
        // docs:end jwk-sets/select-ambiguous
        assertEquals("MultipleMatchingKeys", code)
    }

    @Test
    fun rsaPrivate() {
        val token = signedToken(withKid(fixtureJwk("p256"), "p256-2026"), "ES256")
        val leaked = """{"keys":[${rsaPrivateJwk()}]}"""
        // docs:start jwk-sets/rsa-private
        // A set that contains an RSA private key (one with "d") is refused as a whole.
        val code = try {
            jwtVerifyWithJwks(token, leaked, options)
            null
        } catch (e: PolyjoseException) {
            e.code() // "UnsupportedAlgorithm"
        }
        // docs:end jwk-sets/rsa-private
        assertEquals("UnsupportedAlgorithm", code)
    }
}
