package dev.polyjose.samples

// The samples of Get started › Android and JVM (Kotlin) (src/content/docs/start/android.mdx).
//
// The key is RFC 7515 Appendix A.3.1's P-256 key, a public test key. The JWS is the Compact
// Serialization (RFC 7515 §7.1) with ES256, ECDSA over P-256 and SHA-256 (RFC 7518 §3.4). ECDSA
// signatures are randomized, so each test checks what it can (the header part, the payload, the
// error code) and verifies what it signs.

// docs:start start/kotlin-imports
import dev.polyjose.JwsSignOptions
import dev.polyjose.JwsVerifyOptions
import dev.polyjose.PolyjoseException
import dev.polyjose.jwsSignCompact
import dev.polyjose.jwsVerifyCompact
// docs:end start/kotlin-imports
import java.util.concurrent.Executors
import java.util.concurrent.Future
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotSame
import org.junit.jupiter.api.Test

/** BASE64URL(UTF8(`{"alg":"ES256"}`)) (RFC 7515 §5.1 steps 3-4). */
private const val ES256_HEADER_B64U = "eyJhbGciOiJFUzI1NiJ9"

class StartTest {
    /** Signs `hello, polyjose` with the fixture P-256 key, as [firstSign] shows. */
    private fun signedToken(): String =
        jwsSignCompact(
            "hello, polyjose".toByteArray(),
            Fixtures.jwk("p256"),
            JwsSignOptions(protectedHeader = """{"alg":"ES256"}"""),
        )

    private fun verifiedText(token: String): String =
        jwsVerifyCompact(token, Fixtures.publicJwk("p256"), JwsVerifyOptions(allowedAlgs = listOf("ES256")))
            .payload.toString(Charsets.UTF_8)

    @Test
    fun firstSign() {
        val privateKey = Fixtures.jwk("p256")
        // docs:start start/kotlin-first-sign
        val token = jwsSignCompact(
            payload = "hello, polyjose".toByteArray(),
            key = privateKey,
            options = JwsSignOptions(protectedHeader = """{"alg":"ES256"}"""),
        )
        // docs:end start/kotlin-first-sign
        val parts = token.split('.')
        assertEquals(3, parts.size, "header.payload.signature (RFC 7515 §7.1)")
        assertEquals(ES256_HEADER_B64U, parts[0])
        assertEquals("aGVsbG8sIHBvbHlqb3Nl", parts[1], "BASE64URL(\"hello, polyjose\")")
        assertEquals("hello, polyjose", verifiedText(token))
    }

    @Test
    fun firstVerify() {
        val token = signedToken()
        val publicKey = Fixtures.publicJwk("p256")
        // docs:start start/kotlin-first-verify
        val verified = jwsVerifyCompact(
            token = token,
            key = publicKey,
            options = JwsVerifyOptions(allowedAlgs = listOf("ES256")),
        )
        val text = verified.payload.toString(Charsets.UTF_8)
        // docs:end start/kotlin-first-verify
        assertEquals("ES256", verified.alg)
        assertEquals("hello, polyjose", text)
        assertEquals(0u, verified.signatureIndex)
    }

    @Test
    fun errorCode() {
        val token = signedToken()
        val publicKey = Fixtures.publicJwk("p256")
        var code: String? = null
        // docs:start start/kotlin-error-code
        // The token is ES256, but this verifier accepts only Ed25519.
        try {
            jwsVerifyCompact(token, publicKey, JwsVerifyOptions(allowedAlgs = listOf("Ed25519")))
        } catch (e: PolyjoseException) {
            code = e.code() // "AlgorithmNotAllowed"
        }
        // docs:end start/kotlin-error-code
        assertEquals("AlgorithmNotAllowed", code)
    }

    @Test
    fun background() {
        val privateKey = Fixtures.jwk("p256")
        // A background executor, as an app already has one; it records the threads it starts.
        val started = mutableListOf<Thread>()
        val executor = Executors.newSingleThreadExecutor { task -> Thread(task).also { started.add(it) } }
        // docs:start start/kotlin-background
        val pending: Future<String> = executor.submit<String> {
            jwsSignCompact(
                payload = "hello, polyjose".toByteArray(),
                key = privateKey,
                options = JwsSignOptions(protectedHeader = """{"alg":"ES256"}"""),
            )
        }
        // The calling thread is free until it needs the result.
        val token = pending.get()
        // docs:end start/kotlin-background
        executor.shutdown()
        assertEquals(1, started.size, "the executor started its one thread")
        assertNotSame(Thread.currentThread(), started.single(), "the call ran on the executor's thread")
        assertEquals("hello, polyjose", verifiedText(token))
    }
}
