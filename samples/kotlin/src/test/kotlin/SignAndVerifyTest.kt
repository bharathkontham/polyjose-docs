// The samples of Guides › Sign and verify (src/content/docs/guides/sign-and-verify.mdx).
//
// JWS (RFC 7515) with the fixture keys: ES256 (RFC 7518 §3.4), Ed25519 (RFC 9864) and EdDSA
// (RFC 8037 §3.1), HS256 (RFC 7518 §3.2), RS256 verification (RFC 7518 §3.3), the JSON
// serializations (RFC 7515 §7.2), detached and unencoded payloads (RFC 7515 Appendix F, RFC 7797),
// and the allow-list every verify takes (RFC 8725 §3.1). ECDSA and the generated keys are
// randomized, so each test checks the shape of what it signs and verifies it.

import dev.polyjose.*
import org.json.JSONObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** BASE64URL(UTF8(`{"alg":"ES256"}`)) (RFC 7515 §5.1 steps 3-4). */
private const val ES256_PROTECTED_B64U = "eyJhbGciOiJFUzI1NiJ9"

class SignAndVerifyTest {
    private fun es256Token(payload: String = "hello"): String =
        jwsSignCompact(payload.toByteArray(), fixtureJwk("p256"), JwsSignOptions(protectedHeader = """{"alg":"ES256"}"""))

    @Test
    fun es256() {
        val privateKey = fixtureJwk("p256")
        // docs:start sign-and-verify/es256
        val token = jwsSignCompact(
            payload = "hello".toByteArray(),
            key = privateKey,
            options = JwsSignOptions(protectedHeader = """{"alg":"ES256"}"""),
        )
        // docs:end sign-and-verify/es256
        val parts = token.split('.')
        assertEquals(3, parts.size, "header.payload.signature (RFC 7515 §7.1)")
        assertEquals(ES256_PROTECTED_B64U, parts[0])
        val verified = jwsVerifyCompact(token, fixturePublicJwk("p256"), JwsVerifyOptions(allowedAlgs = listOf("ES256")))
        assertEquals("hello", verified.payload.decodeToString())
    }

    @Test
    fun ed25519() {
        val privateKey = fixtureJwk("ed25519")
        val publicKey = fixturePublicJwk("ed25519")
        // docs:start sign-and-verify/ed25519
        val token = jwsSignCompact(
            payload = "hello".toByteArray(),
            key = privateKey,
            options = JwsSignOptions(protectedHeader = """{"alg":"Ed25519"}"""),
        )
        val verified = jwsVerifyCompact(token, publicKey, JwsVerifyOptions(allowedAlgs = listOf("Ed25519")))
        // docs:end sign-and-verify/ed25519
        assertEquals("Ed25519", verified.alg)
        assertEquals("hello", verified.payload.decodeToString())
    }

    @Test
    fun eddsa() {
        val token = RFC8037_A4_JWS
        val publicKey = fixturePublicJwk("ed25519")
        // docs:start sign-and-verify/eddsa
        // A token from a peer that still writes the older "EdDSA" name (RFC 8037 §3.1).
        val verified = jwsVerifyCompact(token, publicKey, JwsVerifyOptions(allowedAlgs = listOf("EdDSA")))
        // docs:end sign-and-verify/eddsa
        assertEquals("EdDSA", verified.alg)
        assertEquals(RFC8037_A4_PAYLOAD, verified.payload.decodeToString())
    }

    @Test
    fun hs256() {
        // docs:start sign-and-verify/hs256
        val key = jwkGenerateForAlg("HS256") // a 256-bit oct key (RFC 7518 §3.2)
        val token = jwsSignCompact("hello".toByteArray(), key, JwsSignOptions(protectedHeader = """{"alg":"HS256"}"""))
        val verified = jwsVerifyCompact(token, key, JwsVerifyOptions(allowedAlgs = listOf("HS256")))
        // docs:end sign-and-verify/hs256
        val jwk = JSONObject(key)
        assertEquals("oct", jwk.getString("kty"))
        assertEquals("HS256", jwk.getString("alg"))
        assertEquals(32, base64urlDecode(jwk.getString("k")).size)
        assertEquals("hello", verified.payload.decodeToString())
    }

    @Test
    fun notAllowed() {
        val token = es256Token()
        val publicKey = fixturePublicJwk("p256")
        // docs:start sign-and-verify/not-allowed
        // The token is ES256, but this verifier accepts only Ed25519 (RFC 8725 §3.1).
        val code = try {
            jwsVerifyCompact(token, publicKey, JwsVerifyOptions(allowedAlgs = listOf("Ed25519")))
            null
        } catch (e: PolyjoseException) {
            e.code() // "AlgorithmNotAllowed"
        }
        // docs:end sign-and-verify/not-allowed
        assertEquals("AlgorithmNotAllowed", code)
    }

    @Test
    fun tampered() {
        val token = es256Token()
        val publicKey = fixturePublicJwk("p256")
        // docs:start sign-and-verify/tampered
        val (header, _, signature) = token.split('.')
        val forged = "$header.${base64urlEncode("hellO".toByteArray())}.$signature"
        val code = try {
            jwsVerifyCompact(forged, publicKey, JwsVerifyOptions(allowedAlgs = listOf("ES256")))
            null
        } catch (e: PolyjoseException) {
            e.code() // "InvalidSignature"
        }
        // docs:end sign-and-verify/tampered
        assertEquals("InvalidSignature", code)
    }

    @Test
    fun rs256() {
        val token = RFC7515_A2_JWS
        val publicKey = fixtureJwk("rsa-public")
        // docs:start sign-and-verify/rs256
        val verified = jwsVerifyCompact(token, publicKey, JwsVerifyOptions(allowedAlgs = listOf("RS256")))
        val claims = verified.payload.decodeToString()
        // docs:end sign-and-verify/rs256
        assertEquals("RS256", verified.alg)
        assertEquals(RFC7515_A2_PAYLOAD, claims)
    }

    @Test
    fun flattened() {
        val privateKey = fixtureJwk("p256")
        val publicKey = fixturePublicJwk("p256")
        // docs:start sign-and-verify/flattened
        val jws = jwsSignFlattened(
            payload = "hello".toByteArray(),
            signer = JwsSigner(key = privateKey, protectedHeader = """{"alg":"ES256"}"""),
            detached = false,
        )
        val verified = jwsVerifyJson(jws, publicKey, JwsVerifyOptions(allowedAlgs = listOf("ES256")))
        // docs:end sign-and-verify/flattened
        val json = JSONObject(jws)
        assertTrue(json.has("protected") && json.has("payload") && json.has("signature"), "RFC 7515 §7.2.2: $jws")
        assertEquals(0u, verified.signatureIndex)
        assertEquals("hello", verified.payload.decodeToString())
    }

    @Test
    fun general() {
        val p256 = fixtureJwk("p256")
        val ed25519 = fixtureJwk("ed25519")
        val ed25519Public = fixturePublicJwk("ed25519")
        // docs:start sign-and-verify/general
        val jws = jwsSignGeneral(
            payload = "hello".toByteArray(),
            signers = listOf(
                JwsSigner(key = p256, protectedHeader = """{"alg":"ES256"}"""),
                JwsSigner(key = ed25519, protectedHeader = """{"alg":"Ed25519"}"""),
            ),
            detached = false,
        )
        // A verifier that holds only the Ed25519 key uses the second signature.
        val verified = jwsVerifyJson(jws, ed25519Public, JwsVerifyOptions(allowedAlgs = listOf("Ed25519")))
        // docs:end sign-and-verify/general
        assertEquals(2, JSONObject(jws).getJSONArray("signatures").length(), "RFC 7515 §7.2.1")
        assertEquals(1u, verified.signatureIndex)
        assertEquals("Ed25519", verified.alg)
        assertEquals("hello", verified.payload.decodeToString())
    }

    @Test
    fun detached() {
        val privateKey = fixtureJwk("p256")
        val publicKey = fixturePublicJwk("p256")
        // docs:start sign-and-verify/detached
        val payload = "hello".toByteArray()
        val token = jwsSignCompact(
            payload,
            privateKey,
            JwsSignOptions(protectedHeader = """{"alg":"ES256"}""", detached = true),
        )
        // The payload travels separately and is passed back in to verify (RFC 7515 Appendix F).
        val verified = jwsVerifyCompact(
            token,
            publicKey,
            JwsVerifyOptions(allowedAlgs = listOf("ES256"), detachedPayload = payload),
        )
        // docs:end sign-and-verify/detached
        val parts = token.split('.')
        assertEquals(3, parts.size)
        assertEquals("", parts[1], "the payload part is empty: $token")
        assertEquals("hello", verified.payload.decodeToString())
    }

    @Test
    fun unencoded() {
        val key = fixtureJwk("hmac")
        // docs:start sign-and-verify/unencoded
        // b64: false signs the payload bytes as they are (RFC 7797 §3); crit makes it mandatory (§6).
        val token = jwsSignCompact(
            "\$.02".toByteArray(),
            key,
            JwsSignOptions(protectedHeader = """{"alg":"HS256","b64":false,"crit":["b64"]}""", detached = true),
        )
        val verified = jwsVerifyCompact(
            token,
            key,
            JwsVerifyOptions(allowedAlgs = listOf("HS256"), detachedPayload = "\$.02".toByteArray()),
        )
        // docs:end sign-and-verify/unencoded
        assertEquals("", token.split('.')[1], "the payload part is empty: $token")
        assertEquals(RFC7797_42_PAYLOAD, verified.payload.decodeToString())
        // RFC 7797 §4.2's own example verifies the same way.
        val example = jwsVerifyCompact(
            RFC7797_42_JWS,
            key,
            JwsVerifyOptions(allowedAlgs = listOf("HS256"), detachedPayload = RFC7797_42_PAYLOAD.toByteArray()),
        )
        assertEquals(RFC7797_42_PAYLOAD, example.payload.decodeToString())
    }

    @Test
    fun readHeader() {
        val privateKey = fixtureJwk("p256")
        val publicKey = fixturePublicJwk("p256")
        // docs:start sign-and-verify/read-header
        val token = jwsSignCompact(
            "hello".toByteArray(),
            privateKey,
            JwsSignOptions(protectedHeader = """{"alg":"ES256","kid":"key-1"}"""),
        )
        val verified = jwsVerifyCompact(token, publicKey, JwsVerifyOptions(allowedAlgs = listOf("ES256")))
        // Only the protected header is signed; read kid from it (RFC 7515 §4.1.4).
        val kid = verified.protectedHeader?.let { JSONObject(it).optString("kid") }
        // docs:end sign-and-verify/read-header
        assertEquals("key-1", kid)
    }
}
