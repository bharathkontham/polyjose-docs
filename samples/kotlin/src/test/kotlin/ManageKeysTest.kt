// The samples of Guides › Manage keys (src/content/docs/guides/manage-keys.mdx).
//
// JWKs (RFC 7517): generating keys (RFC 7518 §6, RFC 8037 §2), the public half, PEM (RFC 7468)
// and DER in PKCS #8 (RFC 5958), SEC 1 (RFC 5915), SubjectPublicKeyInfo (RFC 5280) and PKCS #1
// (RFC 8017), thumbprints (RFC 7638, RFC 9278), and wiping exported key bytes. Generated keys are
// random, so those tests check the shape of each key, never its value.

import dev.polyjose.*
import org.json.JSONObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ManageKeysTest {
    @Test
    fun generate() {
        // docs:start manage-keys/generate
        val secret = jwkGenerateOct(lenBytes = 32u) // 256 random bits (RFC 7518 §6.4)
        val p256 = jwkGenerateEc("P-256")
        val p384 = jwkGenerateEc("P-384")
        val p521 = jwkGenerateEc("P-521")
        val secp256k1 = jwkGenerateEc("secp256k1")
        val ed25519 = jwkGenerateOkp("Ed25519")
        val x25519 = jwkGenerateOkp("X25519")
        // docs:end manage-keys/generate
        val oct = JSONObject(secret)
        assertEquals("oct", oct.getString("kty"))
        assertEquals(32, base64urlDecode(oct.getString("k")).size)
        for ((jwk, crv) in listOf(p256 to "P-256", p384 to "P-384", p521 to "P-521", secp256k1 to "secp256k1")) {
            val key = JSONObject(jwk)
            assertEquals("EC", key.getString("kty"))
            assertEquals(crv, key.getString("crv"))
            assertTrue(key.has("d"), "a generated $crv key is private")
        }
        for ((jwk, crv) in listOf(ed25519 to "Ed25519", x25519 to "X25519")) {
            val key = JSONObject(jwk)
            assertEquals("OKP", key.getString("kty"))
            assertEquals(crv, key.getString("crv"))
            assertTrue(key.has("d"), "a generated $crv key is private")
        }
    }

    @Test
    fun generateForAlg() {
        // docs:start manage-keys/generate-for-alg
        // The right kind of key for an algorithm, with alg set (RFC 7517 §4.4).
        val key = jwkGenerateForAlg("ES256")
        // docs:end manage-keys/generate-for-alg
        val jwk = JSONObject(key)
        assertEquals("ES256", jwk.getString("alg"))
        assertEquals("EC", jwk.getString("kty"))
        assertEquals("P-256", jwk.getString("crv"))
    }

    @Test
    fun toPublic() {
        val privateKey = fixtureJwk("p256")
        // docs:start manage-keys/to-public
        val publicKey = jwkToPublic(privateKey) // the key without d, safe to publish
        // docs:end manage-keys/to-public
        val exported = JSONObject(publicKey)
        val original = JSONObject(privateKey)
        assertFalse(exported.has("d"))
        assertEquals(original.getString("x"), exported.getString("x"))
        assertEquals(original.getString("y"), exported.getString("y"))
    }

    @Test
    fun pem() {
        val privateKey = fixtureJwk("p256")
        // docs:start manage-keys/pem
        val pem = jwkToPem(privateKey, "pkcs8") // -----BEGIN PRIVATE KEY----- (RFC 7468 §10)
        val back = jwkFromPem(pem)
        val publicPem = jwkToPem(privateKey, "spki") // -----BEGIN PUBLIC KEY----- (RFC 7468 §13)
        // docs:end manage-keys/pem
        assertTrue(pem.startsWith("-----BEGIN PRIVATE KEY-----"), pem)
        assertTrue(publicPem.startsWith("-----BEGIN PUBLIC KEY-----"), publicPem)
        val original = JSONObject(privateKey)
        val imported = JSONObject(back)
        assertEquals(original.getString("d"), imported.getString("d"))
        assertEquals(original.getString("x"), imported.getString("x"))
        assertFalse(imported.has("alg"), "PEM carries no JWS algorithm")
    }

    @Test
    fun der() {
        val privateKey = fixtureJwk("p256")
        // docs:start manage-keys/der
        val der = jwkToDer(privateKey, "sec1") // ECPrivateKey (RFC 5915 §3)
        val back = jwkFromDer(der, "sec1")
        // docs:end manage-keys/der
        assertEquals(JSONObject(privateKey).getString("d"), JSONObject(back).getString("d"))
    }

    @Test
    fun rsaPublic() {
        val rsaKey = fixtureJwk("rsa-public")
        // docs:start manage-keys/rsa-public
        val pem = jwkToPem(rsaKey, "pkcs1") // -----BEGIN RSA PUBLIC KEY----- (RFC 8017 Appendix A.1.1)
        val fromPem = jwkFromPem(pem)
        val der = jwkToDer(rsaKey, "spki") // SubjectPublicKeyInfo (RFC 5280 §4.1.2.7)
        val fromDer = jwkFromDer(der, "spki")
        // docs:end manage-keys/rsa-public
        assertTrue(pem.startsWith("-----BEGIN RSA PUBLIC KEY-----"), pem)
        val n = JSONObject(rsaKey).getString("n")
        assertEquals(n, JSONObject(fromPem).getString("n"))
        assertEquals(n, JSONObject(fromDer).getString("n"))
    }

    @Test
    fun rsaPrivate() {
        val rsaPrivateKey = rsaPrivateJwk()
        // docs:start manage-keys/rsa-private
        // rsaPrivateKey holds an RSA private exponent "d" (RFC 7518 §6.3.2).
        val code = try {
            jwkParse(rsaPrivateKey)
            null
        } catch (e: PolyjoseException) {
            e.code() // "UnsupportedAlgorithm": RSA private keys are refused
        }
        // docs:end manage-keys/rsa-private
        assertEquals("UnsupportedAlgorithm", code)
    }

    @Test
    fun thumbprint() {
        val key = RFC7638_KEY
        // docs:start manage-keys/thumbprint
        val thumbprint = jwkThumbprint(key) // SHA-256 by default (RFC 7638 §3)
        val uri = jwkThumbprintUri(key) // urn:ietf:params:oauth:jwk-thumbprint:sha-256:... (RFC 9278)
        // docs:end manage-keys/thumbprint
        assertEquals(RFC7638_THUMBPRINT, thumbprint)
        assertEquals(RFC7638_THUMBPRINT_URI, uri)
    }

    @Test
    fun wipe() {
        val privateKey = fixtureJwk("p256")
        // docs:start manage-keys/wipe
        val der = jwkToDer(privateKey, "pkcs8")
        val length = der.size // ...use der, for example write it to a key store...
        // Then overwrite the private key bytes; the garbage collector never does.
        der.fill(0)
        // docs:end manage-keys/wipe
        assertTrue(length > 0)
        assertTrue(der.all { it == 0.toByte() }, "every byte is zero after the wipe")
    }
}
