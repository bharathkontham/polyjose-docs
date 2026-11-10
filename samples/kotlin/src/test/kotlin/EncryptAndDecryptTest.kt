// The samples of Guides › Encrypt and decrypt (src/content/docs/guides/encrypt-and-decrypt.mdx).
//
// JWE (RFC 7516) with ECDH-ES+A256KW on P-256 and X25519 (RFC 7518 §4.6, RFC 8037 §3.2), direct
// encryption (RFC 7518 §4.5), AES key wrap (§4.4), RSA-OAEP-256 (§4.3), PBES2 (§4.8), and the
// JSON serialization (RFC 7516 §7.2). Every decrypt takes allow-lists for alg and enc
// (RFC 8725 §3.1). Keys, IVs and ephemeral keys are random, so the tests check the shape of each
// token and decrypt what they encrypt.
//
// Compression (zip, RFC 7516 §4.1.3) is not in the Kotlin binding, so that sample has no region here.

import dev.polyjose.*
import org.json.JSONObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class EncryptAndDecryptTest {
    private val plaintext = "hello".toByteArray()

    @Test
    fun ecdhP256() {
        // docs:start encrypt-and-decrypt/ecdh-p256
        val recipient = jwkGenerateEc("P-256") // the recipient's key pair; it shares only the public half
        val token = jweEncryptCompact(
            plaintext = "hello".toByteArray(),
            options = JweEncryptOptions(
                enc = "A256GCM",
                recipients = listOf(JweRecipient(alg = "ECDH-ES+A256KW", key = jwkToPublic(recipient))),
            ),
        )
        val decrypted = jweDecryptCompact(
            token,
            recipient,
            JweDecryptOptions(allowedAlgs = listOf("ECDH-ES+A256KW"), allowedEnc = listOf("A256GCM")),
        )
        // docs:end encrypt-and-decrypt/ecdh-p256
        assertEquals(5, token.split('.').size, "RFC 7516 §7.1")
        assertEquals("hello", decrypted.plaintext.decodeToString())
        val header = JSONObject(decrypted.header)
        assertEquals("ECDH-ES+A256KW", header.getString("alg"))
        assertEquals("A256GCM", header.getString("enc"))
    }

    @Test
    fun ecdhX25519() {
        // docs:start encrypt-and-decrypt/ecdh-x25519
        val recipient = jwkGenerateOkp("X25519")
        val token = jweEncryptCompact(
            plaintext,
            JweEncryptOptions(
                enc = "A256GCM",
                recipients = listOf(JweRecipient(alg = "ECDH-ES+A256KW", key = jwkToPublic(recipient))),
            ),
        )
        val decrypted = jweDecryptCompact(
            token,
            recipient,
            JweDecryptOptions(allowedAlgs = listOf("ECDH-ES+A256KW"), allowedEnc = listOf("A256GCM")),
        )
        // docs:end encrypt-and-decrypt/ecdh-x25519
        assertEquals("hello", decrypted.plaintext.decodeToString())
    }

    @Test
    fun dir() {
        // docs:start encrypt-and-decrypt/dir
        val key = jwkGenerateForAlg("A256GCM") // the content key itself, shared in advance
        val token = jweEncryptCompact(
            plaintext,
            JweEncryptOptions(enc = "A256GCM", recipients = listOf(JweRecipient(alg = "dir", key = key))),
        )
        val decrypted = jweDecryptCompact(
            token,
            key,
            JweDecryptOptions(allowedAlgs = listOf("dir"), allowedEnc = listOf("A256GCM")),
        )
        // docs:end encrypt-and-decrypt/dir
        assertEquals("", token.split('.')[1], "dir has an empty JWE Encrypted Key (RFC 7518 §4.5)")
        assertEquals("hello", decrypted.plaintext.decodeToString())
    }

    @Test
    fun a256kw() {
        // docs:start encrypt-and-decrypt/a256kw
        val key = jwkGenerateForAlg("A256KW") // a 256-bit key-wrapping key (RFC 7518 §4.4)
        val token = jweEncryptCompact(
            plaintext,
            JweEncryptOptions(enc = "A256GCM", recipients = listOf(JweRecipient(alg = "A256KW", key = key))),
        )
        val decrypted = jweDecryptCompact(
            token,
            key,
            JweDecryptOptions(allowedAlgs = listOf("A256KW"), allowedEnc = listOf("A256GCM")),
        )
        // docs:end encrypt-and-decrypt/a256kw
        assertEquals("hello", decrypted.plaintext.decodeToString())
    }

    @Test
    fun rsaOaep256() {
        val rsaPublicKey = fixtureJwk("rsa-public")
        val rsaPrivateKey = rsaPrivateJwk()
        // docs:start encrypt-and-decrypt/rsa-oaep-256
        // The sender encrypts to the recipient's RSA public key (RFC 7518 §4.3).
        val token = jweEncryptCompact(
            plaintext,
            JweEncryptOptions(
                enc = "A256GCM",
                recipients = listOf(JweRecipient(alg = "RSA-OAEP-256", key = rsaPublicKey)),
            ),
        )
        // The recipient decrypts with its RSA private JWK.
        val options = JweDecryptOptions(allowedAlgs = listOf("RSA-OAEP-256"), allowedEnc = listOf("A256GCM"))
        val decrypted = jweDecryptCompact(token, rsaPrivateKey, options)
        // docs:end encrypt-and-decrypt/rsa-oaep-256
        assertEquals("hello", decrypted.plaintext.decodeToString())
        // A changed Encrypted Key fails like every other decryption failure (RFC 7516 §11.5).
        val tamperedParts = token.split('.').toMutableList()
        val encryptedKey = base64urlDecode(tamperedParts[1])
        encryptedKey[10] = (encryptedKey[10].toInt() xor 1).toByte()
        tamperedParts[1] = base64urlEncode(encryptedKey)
        assertEquals("DecryptionFailed", errorCodeOf { jweDecryptCompact(tamperedParts.joinToString("."), rsaPrivateKey, options) })
        // The public key can't decrypt.
        assertEquals("KeyAlgorithmMismatch", errorCodeOf { jweDecryptCompact(token, rsaPublicKey, options) })
        val parts = token.split('.')
        assertEquals(5, parts.size)
        val header = protectedHeaderOf(token)
        assertEquals("RSA-OAEP-256", header.getString("alg"))
        assertEquals("A256GCM", header.getString("enc"))
        assertEquals(256, base64urlDecode(parts[1]).size, "the CEK wrapped under a 2048-bit modulus")
    }

    @Test
    fun pbes2() {
        val passwordBytes = examplePassword()
        // docs:start encrypt-and-decrypt/pbes2
        // passwordBytes holds the password as the user entered it: never a literal in source code.
        // A password is passed as an oct JWK whose k is the password's bytes (RFC 7518 §4.8).
        val k = base64urlEncode(passwordBytes)
        val password = """{"kty":"oct","k":"$k"}"""
        val token = jweEncryptCompact(
            plaintext,
            JweEncryptOptions(enc = "A256GCM", recipients = listOf(JweRecipient(alg = "PBES2-HS256+A128KW", key = password))),
        )
        val decrypted = jweDecryptCompact(
            token,
            password,
            JweDecryptOptions(allowedAlgs = listOf("PBES2-HS256+A128KW"), allowedEnc = listOf("A256GCM")),
        )
        // docs:end encrypt-and-decrypt/pbes2
        assertEquals(10_000, protectedHeaderOf(token).getInt("p2c"), "the default iteration count")
        assertEquals("hello", decrypted.plaintext.decodeToString())
    }

    @Test
    fun pbes2Limit() {
        val password = """{"kty":"oct","k":"${base64urlEncode(examplePassword())}"}"""
        // docs:start encrypt-and-decrypt/pbes2-limit
        val token = jweEncryptCompact(
            plaintext,
            JweEncryptOptions(
                enc = "A256GCM",
                recipients = listOf(JweRecipient(alg = "PBES2-HS256+A128KW", key = password, p2c = 20_000u)),
            ),
        )
        val options = JweDecryptOptions(allowedAlgs = listOf("PBES2-HS256+A128KW"), allowedEnc = listOf("A256GCM"))
        // Above the default budget of 10,000 iterations, decryption refuses the work.
        val code = try {
            jweDecryptCompact(token, password, options)
            null
        } catch (e: PolyjoseException) {
            e.code() // "DecryptionFailed"
        }
        // Raise the budget for a sender you know uses more.
        val decrypted = jweDecryptCompact(token, password, options.copy(maxPbes2Count = 20_000u))
        // docs:end encrypt-and-decrypt/pbes2-limit
        assertEquals("DecryptionFailed", code)
        assertEquals("hello", decrypted.plaintext.decodeToString())
    }

    @Test
    fun json() {
        val kwKey = jwkGenerateForAlg("A256KW")
        val ecKey = jwkGenerateEc("P-256")
        // docs:start encrypt-and-decrypt/json
        // One ciphertext for two recipients, each with its own key management (RFC 7516 §7.2.1).
        val jwe = jweEncryptJson(
            plaintext = "hello".toByteArray(),
            options = JweEncryptOptions(
                enc = "A256GCM",
                aad = "order-42".toByteArray(),
                recipients = listOf(
                    JweRecipient(alg = "A256KW", key = kwKey),
                    JweRecipient(alg = "ECDH-ES+A256KW", key = jwkToPublic(ecKey)),
                ),
            ),
            form = "general",
        )
        // The holder of the EC key decrypts with it.
        val decrypted = jweDecryptJson(
            jwe,
            ecKey,
            JweDecryptOptions(allowedAlgs = listOf("ECDH-ES+A256KW"), allowedEnc = listOf("A256GCM")),
        )
        // docs:end encrypt-and-decrypt/json
        assertEquals(2, JSONObject(jwe).getJSONArray("recipients").length())
        assertEquals(1u, decrypted.recipientIndex)
        assertEquals("order-42", decrypted.aad?.decodeToString())
        assertEquals("hello", decrypted.plaintext.decodeToString())
    }

    @Test
    fun decryptionFailed() {
        val key = jwkGenerateForAlg("A256KW")
        val token = jweEncryptCompact(
            plaintext,
            JweEncryptOptions(enc = "A256GCM", recipients = listOf(JweRecipient(alg = "A256KW", key = key))),
        )
        // docs:start encrypt-and-decrypt/decryption-failed
        val wrongKey = jwkGenerateForAlg("A256KW")
        val code = try {
            jweDecryptCompact(
                token,
                wrongKey,
                JweDecryptOptions(allowedAlgs = listOf("A256KW"), allowedEnc = listOf("A256GCM")),
            )
            null
        } catch (e: PolyjoseException) {
            e.code() // "DecryptionFailed", the same for every failure (RFC 7516 §11.5)
        }
        // docs:end encrypt-and-decrypt/decryption-failed
        assertEquals("DecryptionFailed", code)
    }
}
