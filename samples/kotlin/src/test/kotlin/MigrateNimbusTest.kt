// The samples of Guides › Migrate from Nimbus JOSE + JWT (src/content/docs/guides/migrate/nimbus.mdx).
//
// Each task is written twice: the "-before" region with Nimbus JOSE + JWT (pinned exactly in
// build.gradle.kts) and the region without the suffix with polyjose. Both run here, on the same
// fixture keys, and the interop tests pass tokens between the two libraries in both directions:
// JWTs (RFC 7519) signed with ES256 (RFC 7518 §3.4), JWS with HS256 (RFC 7518 §3.2), JWE with
// RSA-OAEP-256 (RFC 7518 §4.3) and ECDH-ES+A256KW (RFC 7518 §4.6), JWKs (RFC 7517), JWK Sets
// (RFC 7517 §5) and thumbprints (RFC 7638). The negative tests back the guide's "behaviour
// differences" and "not supported" sections: the allow-list and `none` (RFC 8725 §3.1), `exp` and
// `aud` (RFC 7519 §4.1.3, §4.1.4), `jku` (RFC 7515 §4.1.2), `zip` (RFC 8725 §3.6) and the SHA-1
// and PKCS #1 v1.5 key management algorithms (RFC 8725 §3.2).

// docs:start migrate-nimbus/imports-before
import com.nimbusds.jose.EncryptionMethod
import com.nimbusds.jose.JOSEException
import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWEAlgorithm
import com.nimbusds.jose.JWEHeader
import com.nimbusds.jose.JWEObject
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.JWSObject
import com.nimbusds.jose.Payload
import com.nimbusds.jose.crypto.ECDHDecrypter
import com.nimbusds.jose.crypto.ECDHEncrypter
import com.nimbusds.jose.crypto.ECDSASigner
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jose.crypto.MACVerifier
import com.nimbusds.jose.crypto.RSADecrypter
import com.nimbusds.jose.crypto.RSAEncrypter
import com.nimbusds.jose.jwk.Curve
import com.nimbusds.jose.jwk.ECKey
import com.nimbusds.jose.jwk.JWK
import com.nimbusds.jose.jwk.JWKMatcher
import com.nimbusds.jose.jwk.JWKSelector
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.OctetSequenceKey
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.gen.ECKeyGenerator
import com.nimbusds.jose.jwk.gen.OctetSequenceKeyGenerator
import com.nimbusds.jose.jwk.source.ImmutableJWKSet
import com.nimbusds.jose.jwk.source.JWKSourceBuilder
import com.nimbusds.jose.proc.BadJOSEException
import com.nimbusds.jose.proc.JWSVerificationKeySelector
import com.nimbusds.jose.proc.SecurityContext
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.PlainJWT
import com.nimbusds.jwt.SignedJWT
import com.nimbusds.jwt.proc.BadJWTException
import com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier
import com.nimbusds.jwt.proc.DefaultJWTProcessor
import com.nimbusds.jwt.proc.ExpiredJWTException
import java.text.ParseException
// docs:end migrate-nimbus/imports-before
// docs:start migrate-nimbus/imports
import dev.polyjose.*
import org.json.JSONObject // any JSON library works; the samples use org.json
// docs:end migrate-nimbus/imports
import com.nimbusds.jose.CompressionAlgorithm
import com.nimbusds.jose.proc.BadJWSException
import java.net.URI
import java.security.KeyPairGenerator
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.time.Instant
import java.util.Date
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class MigrateNimbusTest {
    /** The fixture P-256 key (RFC 7515 Appendix A.3.1) as JSON text, private and public. */
    private val privateKeyJson = fixtureJwk("p256")
    private val publicKeyJson = fixturePublicJwk("p256")

    /** The verify options both libraries are configured with: ES256, our issuer and audience. */
    private val options = JwtVerifyOptions(
        allowedAlgs = listOf("ES256"),
        issuers = listOf(ISSUER),
        audiences = listOf(AUDIENCE),
        requiredClaims = listOf("sub"),
    )

    private fun currentTime(): Long = Instant.now().epochSecond

    /** A Nimbus processor that accepts ES256 from the fixture key, our issuer and our audience. */
    private fun nimbusProcessor(): DefaultJWTProcessor<SecurityContext> {
        val processor = DefaultJWTProcessor<SecurityContext>()
        processor.setJWSKeySelector(JWSVerificationKeySelector(JWSAlgorithm.ES256, ImmutableJWKSet(JWKSet(ECKey.parse(publicKeyJson)))))
        processor.setJWTClaimsSetVerifier(DefaultJWTClaimsVerifier(AUDIENCE, JWTClaimsSet.Builder().issuer(ISSUER).build(), setOf("sub", "exp")))
        return processor
    }

    /** An ES256 JWT signed by Nimbus with [key] and [header], carrying [claims]. */
    private fun nimbusJwt(
        claims: JWTClaimsSet,
        key: ECKey = ECKey.parse(privateKeyJson),
        header: JWSHeader = JWSHeader(JWSAlgorithm.ES256),
    ): String = SignedJWT(header, claims).also { it.sign(ECDSASigner(key)) }.serialize()

    /** Our usual claims, expiring [expIn] seconds from now (negative: in the past). */
    private fun nimbusClaims(expIn: Long = 300, iss: String = ISSUER, aud: String = AUDIENCE): JWTClaimsSet =
        JWTClaimsSet.Builder()
            .issuer(iss)
            .subject(SUBJECT)
            .audience(aud)
            .expirationTime(Date.from(Instant.now().plusSeconds(expIn)))
            .build()

    /** An ES256 JWT signed by polyjose with the fixture key. */
    private fun polyjoseJwt(claims: String): String = jwtSign(claims, privateKeyJson, JwtSignOptions(alg = "ES256"))

    // ---------------------------------------------------------------------------------------------
    // Sign and verify a JWT (RFC 7519 §7.1, §7.2)
    // ---------------------------------------------------------------------------------------------

    @Test
    fun signJwt() {
        // docs:start migrate-nimbus/sign-jwt-before
        val claims = JWTClaimsSet.Builder()
            .issuer(ISSUER)
            .subject(SUBJECT)
            .audience(AUDIENCE)
            .expirationTime(Date.from(Instant.now().plusSeconds(300)))
            .build()
        val jwt = SignedJWT(JWSHeader.Builder(JWSAlgorithm.ES256).type(JOSEObjectType.JWT).build(), claims)
        jwt.sign(ECDSASigner(ECKey.parse(privateKeyJson)))
        val token = jwt.serialize()
        // docs:end migrate-nimbus/sign-jwt-before
        val polyjoseToken = run {
            // docs:start migrate-nimbus/sign-jwt
            val claims = JSONObject()
                .put("iss", ISSUER)
                .put("sub", SUBJECT)
                .put("aud", AUDIENCE)
                .put("exp", Instant.now().epochSecond + 300)
            val token = jwtSign(
                claims = claims.toString(),
                key = privateKeyJson,
                options = JwtSignOptions(alg = "ES256"), // writes "typ": "JWT" (RFC 7519 §5.1)
            )
            // docs:end migrate-nimbus/sign-jwt
            token
        }
        for (t in listOf(token, polyjoseToken)) {
            val header = protectedHeaderOf(t)
            assertEquals("ES256", header.getString("alg"))
            assertEquals("JWT", header.getString("typ"))
        }
        // Each library verifies what the other signed.
        assertEquals(SUBJECT, JSONObject(jwtVerify(token, publicKeyJson, options).claims).getString("sub"))
        assertEquals(SUBJECT, nimbusProcessor().process(polyjoseToken, null).subject)
    }

    @Test
    fun verifyJwt() {
        val token = nimbusJwt(nimbusClaims())
        val nimbusSubject = run {
            // docs:start migrate-nimbus/verify-jwt-before
            val processor = DefaultJWTProcessor<SecurityContext>()
            processor.setJWSKeySelector(
                JWSVerificationKeySelector(JWSAlgorithm.ES256, ImmutableJWKSet(JWKSet(ECKey.parse(publicKeyJson)))),
            )
            processor.setJWTClaimsSetVerifier(
                DefaultJWTClaimsVerifier(
                    AUDIENCE, // the accepted audience
                    JWTClaimsSet.Builder().issuer(ISSUER).build(), // claims that must match exactly
                    setOf("sub", "exp"), // claims that must be present
                ),
            )
            val claims = processor.process(token, null)
            val subject = claims.subject
            // docs:end migrate-nimbus/verify-jwt-before
            subject
        }
        // docs:start migrate-nimbus/verify-jwt
        val verified = jwtVerify(
            token = token,
            key = publicKeyJson,
            options = JwtVerifyOptions(
                allowedAlgs = listOf("ES256"),
                issuers = listOf(ISSUER),
                audiences = listOf(AUDIENCE),
                requiredClaims = listOf("sub"), // exp is required by default
            ),
        )
        val subject = JSONObject(verified.claims).getString("sub")
        // docs:end migrate-nimbus/verify-jwt
        assertEquals(SUBJECT, nimbusSubject)
        assertEquals(SUBJECT, subject)
        assertEquals("ES256", verified.alg)
    }

    // ---------------------------------------------------------------------------------------------
    // JWS Compact Serialization (RFC 7515 §7.1)
    // ---------------------------------------------------------------------------------------------

    @Test
    fun jws() {
        val nimbusSecret = run {
            // docs:start migrate-nimbus/jws-before
            val secret = OctetSequenceKeyGenerator(256).algorithm(JWSAlgorithm.HS256).generate()
            val jws = JWSObject(JWSHeader(JWSAlgorithm.HS256), Payload("hello"))
            jws.sign(MACSigner(secret))
            val token = jws.serialize()

            val received = JWSObject.parse(token)
            val valid = received.header.algorithm == JWSAlgorithm.HS256 && received.verify(MACVerifier(secret))
            val payload = received.payload.toString()
            // docs:end migrate-nimbus/jws-before
            assertTrue(valid)
            assertEquals("hello", payload)
            // The same secret, as a JWK, verifies in polyjose.
            assertEquals("hello", jwsVerifyCompact(token, secret.toJSONString(), JwsVerifyOptions(allowedAlgs = listOf("HS256"))).payload.decodeToString())
            secret
        }
        assertEquals(256, nimbusSecret.size())
        // docs:start migrate-nimbus/jws
        val secret = jwkGenerateForAlg("HS256") // a 256-bit oct JWK with "alg": "HS256"
        val token = jwsSignCompact("hello".toByteArray(), secret, JwsSignOptions(protectedHeader = """{"alg":"HS256"}"""))

        val verified = jwsVerifyCompact(token, secret, JwsVerifyOptions(allowedAlgs = listOf("HS256")))
        val payload = verified.payload.decodeToString()
        // docs:end migrate-nimbus/jws
        assertEquals("hello", payload)
        // And the other way: Nimbus verifies the polyjose token with the same JWK.
        val parsed = JWSObject.parse(token)
        assertTrue(parsed.verify(MACVerifier(OctetSequenceKey.parse(secret))))
        assertEquals("hello", parsed.payload.toString())
    }

    @Test
    fun nimbusMacVerifierAcceptsEveryFittingHmac() {
        // Backs the guide's note on the low-level API: a MACVerifier accepts every HS* algorithm
        // its key is long enough for, so the header check is the caller's. polyjose takes the
        // allow-list on every call (RFC 8725 §3.1).
        val secret = OctetSequenceKeyGenerator(512).generate()
        val hs512 = JWSObject(JWSHeader(JWSAlgorithm.HS512), Payload("hello")).also { it.sign(MACSigner(secret)) }.serialize()
        assertTrue(JWSObject.parse(hs512).verify(MACVerifier(secret)))
        assertEquals(
            "AlgorithmNotAllowed",
            errorCodeOf { jwsVerifyCompact(hs512, secret.toJSONString(), JwsVerifyOptions(allowedAlgs = listOf("HS256"))) },
        )
    }

    // ---------------------------------------------------------------------------------------------
    // JWE (RFC 7516 §7.1)
    // ---------------------------------------------------------------------------------------------

    @Test
    fun jweRsa() {
        val rsaPublicKeyJson = fixtureJwk("rsa-public")
        val rsaPrivateKeyJson = rsaPrivateJwk()
        val nimbusToken = run {
            // docs:start migrate-nimbus/jwe-rsa-before
            val jwe = JWEObject(JWEHeader(JWEAlgorithm.RSA_OAEP_256, EncryptionMethod.A256GCM), Payload("hello"))
            jwe.encrypt(RSAEncrypter(RSAKey.parse(rsaPublicKeyJson)))
            val token = jwe.serialize()

            val received = JWEObject.parse(token)
            received.decrypt(RSADecrypter(RSAKey.parse(rsaPrivateKeyJson)))
            val plaintext = received.payload.toString()
            // docs:end migrate-nimbus/jwe-rsa-before
            assertEquals("hello", plaintext)
            token
        }
        // docs:start migrate-nimbus/jwe-rsa
        val token = jweEncryptCompact(
            plaintext = "hello".toByteArray(),
            options = JweEncryptOptions(
                enc = "A256GCM",
                recipients = listOf(JweRecipient(alg = "RSA-OAEP-256", key = rsaPublicKeyJson)),
            ),
        )

        val decrypted = jweDecryptCompact(
            token,
            rsaPrivateKeyJson,
            JweDecryptOptions(allowedAlgs = listOf("RSA-OAEP-256"), allowedEnc = listOf("A256GCM")),
        )
        val plaintext = decrypted.plaintext.decodeToString()
        // docs:end migrate-nimbus/jwe-rsa
        assertEquals("hello", plaintext)
        // Interop: polyjose decrypts the Nimbus token, and Nimbus decrypts the polyjose token.
        val decryptOptions = JweDecryptOptions(allowedAlgs = listOf("RSA-OAEP-256"), allowedEnc = listOf("A256GCM"))
        assertEquals("hello", jweDecryptCompact(nimbusToken, rsaPrivateKeyJson, decryptOptions).plaintext.decodeToString())
        val received = JWEObject.parse(token)
        received.decrypt(RSADecrypter(RSAKey.parse(rsaPrivateKeyJson)))
        assertEquals("hello", received.payload.toString())
    }

    @Test
    fun jweEcdh() {
        val nimbusRecipient = run {
            // docs:start migrate-nimbus/jwe-ecdh-before
            val recipient = ECKeyGenerator(Curve.P_256).generate()
            val jwe = JWEObject(JWEHeader(JWEAlgorithm.ECDH_ES_A256KW, EncryptionMethod.A256GCM), Payload("hello"))
            jwe.encrypt(ECDHEncrypter(recipient.toPublicJWK()))
            val token = jwe.serialize()

            val received = JWEObject.parse(token)
            received.decrypt(ECDHDecrypter(recipient))
            val plaintext = received.payload.toString()
            // docs:end migrate-nimbus/jwe-ecdh-before
            assertEquals("hello", plaintext)
            recipient
        }
        // docs:start migrate-nimbus/jwe-ecdh
        val recipient = jwkGenerateEc("P-256")
        val token = jweEncryptCompact(
            "hello".toByteArray(),
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
        val plaintext = decrypted.plaintext.decodeToString()
        // docs:end migrate-nimbus/jwe-ecdh
        assertEquals("hello", plaintext)
        // Interop: polyjose encrypts to the Nimbus key and Nimbus decrypts; and the reverse.
        val toNimbus = jweEncryptCompact(
            "hello".toByteArray(),
            JweEncryptOptions(enc = "A256GCM", recipients = listOf(JweRecipient(alg = "ECDH-ES+A256KW", key = nimbusRecipient.toPublicJWK().toJSONString()))),
        )
        val atNimbus = JWEObject.parse(toNimbus)
        atNimbus.decrypt(ECDHDecrypter(nimbusRecipient))
        assertEquals("hello", atNimbus.payload.toString())
        val fromNimbus = JWEObject(JWEHeader(JWEAlgorithm.ECDH_ES_A256KW, EncryptionMethod.A256GCM), Payload("hello"))
            .also { it.encrypt(ECDHEncrypter(ECKey.parse(jwkToPublic(recipient)))) }
            .serialize()
        val options = JweDecryptOptions(allowedAlgs = listOf("ECDH-ES+A256KW"), allowedEnc = listOf("A256GCM"))
        assertEquals("hello", jweDecryptCompact(fromNimbus, recipient, options).plaintext.decodeToString())
    }

    // ---------------------------------------------------------------------------------------------
    // JWK (RFC 7517 §4, RFC 7638) and keys from java.security
    // ---------------------------------------------------------------------------------------------

    @Test
    fun jwk() {
        val (nimbusPublic, nimbusThumbprint) = run {
            // docs:start migrate-nimbus/jwk-before
            val key = JWK.parse(privateKeyJson) // an ECKey, here
            val publicJson = key.toPublicJWK().toJSONString()
            val thumbprint = key.computeThumbprint().toString() // SHA-256 (RFC 7638)
            val generated = ECKeyGenerator(Curve.P_256).keyID("p256-2026").generate()
            // docs:end migrate-nimbus/jwk-before
            assertEquals("p256-2026", generated.keyID)
            publicJson to thumbprint
        }
        // docs:start migrate-nimbus/jwk
        val key = jwkParse(privateKeyJson) // validates it; keys stay JSON text
        val publicJson = jwkToPublic(key)
        val thumbprint = jwkThumbprint(key) // SHA-256 by default (RFC 7638)
        val generated = withKid(jwkGenerateEc("P-256"), "p256-2026")
        // docs:end migrate-nimbus/jwk
        assertEquals(nimbusThumbprint, thumbprint)
        assertEquals(JSONObject(nimbusPublic).toMap(), JSONObject(publicJson).toMap())
        assertFalse(JSONObject(publicJson).has("d"))
        assertEquals("p256-2026", JSONObject(generated).getString("kid"))
        assertEquals("P-256", JSONObject(generated).getString("crv"))
        // The generators set no kid, so the sample adds one.
        assertFalse(JSONObject(jwkGenerateEc("P-256")).has("kid"))
    }

    @Test
    fun javaSecurityKeys() {
        val keyPair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        val nimbusKey = run {
            // docs:start migrate-nimbus/java-keys-before
            val key = ECKey.Builder(Curve.P_256, keyPair.public as ECPublicKey)
                .privateKey(keyPair.private as ECPrivateKey)
                .build()
            // docs:end migrate-nimbus/java-keys-before
            key
        }
        // docs:start migrate-nimbus/java-keys
        val publicKey = jwkFromDer(keyPair.public.encoded, "spki") // X.509 SubjectPublicKeyInfo
        val privateKey = jwkFromDer(keyPair.private.encoded, "pkcs8") // PKCS #8
        // docs:end migrate-nimbus/java-keys
        assertEquals(JSONObject(nimbusKey.toPublicJWK().toJSONString()).toMap(), JSONObject(publicKey).toMap())
        assertEquals(nimbusKey.d.toString(), JSONObject(privateKey).getString("d"))
    }

    // ---------------------------------------------------------------------------------------------
    // JWK Sets (RFC 7517 §5)
    // ---------------------------------------------------------------------------------------------

    @Test
    fun jwksSelectKey() {
        val jwksJson = fixtureJwks()
        val nimbusKey = run {
            // docs:start migrate-nimbus/jwks-select-before
            val jwkSet = JWKSet.parse(jwksJson)
            val matches = JWKSelector(JWKMatcher.Builder().keyID("p256-2026").algorithm(JWSAlgorithm.ES256).build()).select(jwkSet)
            val key = matches.single()
            // docs:end migrate-nimbus/jwks-select-before
            key
        }
        // docs:start migrate-nimbus/jwks-select
        val key = jwksSelect(jwksJson, JwkSelector(kid = "p256-2026", alg = "ES256"))
        // docs:end migrate-nimbus/jwks-select
        assertEquals(JSONObject(nimbusKey.toJSONString()).toMap(), JSONObject(key).toMap())
    }

    @Test
    fun jwksVerify() {
        val jwksJson = fixtureJwks()
        val signingKey = ECKey.parse(withKid(privateKeyJson, "p256-2026"))
        val token = nimbusJwt(nimbusClaims(), signingKey, JWSHeader.Builder(JWSAlgorithm.ES256).keyID("p256-2026").build())
        val nimbusSubject = run {
            // docs:start migrate-nimbus/jwks-verify-before
            val processor = DefaultJWTProcessor<SecurityContext>()
            processor.setJWSKeySelector(
                JWSVerificationKeySelector(setOf(JWSAlgorithm.ES256, JWSAlgorithm.Ed25519), ImmutableJWKSet(JWKSet.parse(jwksJson))),
            )
            processor.setJWTClaimsSetVerifier(
                DefaultJWTClaimsVerifier(AUDIENCE, JWTClaimsSet.Builder().issuer(ISSUER).build(), setOf("sub", "exp")),
            )
            val claims = processor.process(token, null)
            // docs:end migrate-nimbus/jwks-verify-before
            claims.subject
        }
        // docs:start migrate-nimbus/jwks-verify
        // jwksJson is the issuer's JWK Set as text, fetched and cached by your application.
        val verified = jwtVerifyWithJwks(
            token = token,
            jwks = jwksJson,
            options = JwtVerifyOptions(
                allowedAlgs = listOf("ES256", "Ed25519"),
                issuers = listOf(ISSUER),
                audiences = listOf(AUDIENCE),
                requiredClaims = listOf("sub"),
            ),
        )
        val kid = verified.kid // the key of the set that verified, here "p256-2026"
        // docs:end migrate-nimbus/jwks-verify
        assertEquals(SUBJECT, nimbusSubject)
        assertEquals("p256-2026", kid)
        assertEquals(SUBJECT, JSONObject(verified.claims).getString("sub"))
    }

    @Test
    fun remoteJwks() {
        // Building the Nimbus source does no I/O: it fetches on first use, which this test never
        // reaches. It shows the call a migration replaces.
        // docs:start migrate-nimbus/remote-jwks-before
        val keySource = JWKSourceBuilder.create<SecurityContext>(URI("https://issuer.example/.well-known/jwks.json").toURL())
            .retrying(true)
            .build()
        val processor = DefaultJWTProcessor<SecurityContext>()
        processor.setJWSKeySelector(JWSVerificationKeySelector(JWSAlgorithm.ES256, keySource))
        // docs:end migrate-nimbus/remote-jwks-before
        assertNotNull(processor.getJWSKeySelector())
    }

    @Test
    fun jkuIsNeverFollowed() {
        // A token naming a key set URL (RFC 7515 §4.1.2) and a kid that the set doesn't hold: polyjose
        // uses only the set it is given, so no key matches. It has no network code to follow jku.
        val attackerKey = ECKeyGenerator(Curve.P_256).keyID("attacker-key").generate()
        val header = JWSHeader.Builder(JWSAlgorithm.ES256)
            .jwkURL(URI("https://attacker.example/jwks.json"))
            .keyID("attacker-key")
            .build()
        val token = nimbusJwt(nimbusClaims(), attackerKey, header)
        assertEquals("NoMatchingKey", errorCodeOf { jwtVerifyWithJwks(token, fixtureJwks(), options.copy(allowedAlgs = listOf("ES256", "Ed25519"))) })
    }

    // ---------------------------------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------------------------------

    @Test
    fun errors() {
        val expired = nimbusJwt(nimbusClaims(expIn = -120))
        val nimbusOutcome = { token: String ->
            val processor = nimbusProcessor()
            // docs:start migrate-nimbus/errors-before
            val outcome = try {
                processor.process(token, null)
                "ok"
            } catch (e: ExpiredJWTException) {
                "expired"
            } catch (e: BadJOSEException) {
                "rejected" // signature, algorithm, typ or claims
            } catch (e: JOSEException) {
                "rejected" // the key or the cryptography failed
            } catch (e: ParseException) {
                "malformed"
            }
            // docs:end migrate-nimbus/errors-before
            outcome
        }
        val polyjoseOutcome = { token: String ->
            val publicKey = publicKeyJson
            // docs:start migrate-nimbus/errors
            val outcome = try {
                jwtVerify(token, publicKey, options)
                "ok"
            } catch (e: PolyjoseException) {
                when (e.code()) {
                    "TokenExpired" -> "expired"
                    "InvalidFormat", "InvalidBase64", "InvalidJson" -> "malformed"
                    else -> "rejected" // see the list of codes; keep a default branch
                }
            }
            // docs:end migrate-nimbus/errors
            outcome
        }
        assertEquals("expired", nimbusOutcome(expired))
        assertEquals("expired", polyjoseOutcome(expired))
        assertEquals("malformed", nimbusOutcome("not-a-jwt"))
        assertEquals("malformed", polyjoseOutcome("not-a-jwt"))
        val wrongIssuer = nimbusJwt(nimbusClaims(iss = "https://other.example"))
        assertEquals("rejected", nimbusOutcome(wrongIssuer))
        assertEquals("rejected", polyjoseOutcome(wrongIssuer))
        assertEquals("ok", nimbusOutcome(nimbusJwt(nimbusClaims())))
        assertEquals("ok", polyjoseOutcome(nimbusJwt(nimbusClaims())))
    }

    @Test
    fun errorMapping() {
        // Backs the guide's table: the Nimbus exception and the polyjose code for the same token.
        val now = currentTime()
        val good = nimbusClaims()
        val parts = nimbusJwt(good).split('.')
        val cases = listOf(
            // exp two minutes ago, beyond both libraries' 60-second leeway (RFC 7519 §4.1.4)
            Triple(nimbusJwt(nimbusClaims(expIn = -120)), ExpiredJWTException::class.java, "TokenExpired"),
            // nbf five minutes ahead (RFC 7519 §4.1.5)
            Triple(
                nimbusJwt(JWTClaimsSet.Builder(good).notBeforeTime(Date.from(Instant.ofEpochSecond(now + 300))).build()),
                BadJWTException::class.java,
                "TokenNotYetValid",
            ),
            Triple(nimbusJwt(nimbusClaims(iss = "https://other.example")), BadJWTException::class.java, "InvalidClaim"),
            Triple(nimbusJwt(nimbusClaims(aud = "https://other-api.example")), BadJWTException::class.java, "InvalidClaim"),
            // a changed payload (RFC 7515 §5.2)
            Triple("${parts[0]}.${base64urlEncode(JSONObject(good.toString()).put("sub", "admin").toString().toByteArray())}.${parts[2]}", BadJWSException::class.java, "InvalidSignature"),
            // an algorithm the verifier doesn't accept (RFC 8725 §3.1)
            Triple(
                SignedJWT(JWSHeader(JWSAlgorithm.HS256), good).also { it.sign(MACSigner(ByteArray(32) { 7 })) }.serialize(),
                BadJOSEException::class.java,
                "AlgorithmNotAllowed",
            ),
        )
        for ((token, nimbusType, code) in cases) {
            val thrown = assertThrows(BadJOSEException::class.java) { nimbusProcessor().process(token, null) }
            assertInstanceOf(nimbusType, thrown, code)
            assertEquals(code, errorCodeOf { jwtVerify(token, publicKeyJson, options) })
        }
        // Defaults both libraries share: a 60-second leeway, and a typ that is absent or "JWT".
        assertEquals(60, DefaultJWTClaimsVerifier.DEFAULT_MAX_CLOCK_SKEW_SECONDS)
        val inLeeway = nimbusJwt(nimbusClaims(expIn = -30))
        assertEquals(SUBJECT, nimbusProcessor().process(inLeeway, null).subject)
        assertEquals(null, errorCodeOf { jwtVerify(inLeeway, publicKeyJson, options) })
    }

    // ---------------------------------------------------------------------------------------------
    // Behaviour differences
    // ---------------------------------------------------------------------------------------------

    @Test
    fun unsecuredJwtIsNeverAccepted() {
        // A Nimbus PlainJWT ("alg": "none", RFC 7519 §6) fails in polyjose whatever the allow-list
        // (RFC 8725 §3.1); "none" can't be allowed either.
        val plain = PlainJWT(nimbusClaims()).serialize()
        assertEquals("AlgorithmNotAllowed", errorCodeOf { jwtVerify(plain, publicKeyJson, options) })
        assertEquals("AlgorithmNotAllowed", errorCodeOf { jwtVerify(plain, publicKeyJson, options.copy(allowedAlgs = listOf("none"))) })
        assertThrows(BadJOSEException::class.java) { nimbusProcessor().process(plain, null) }
    }

    @Test
    fun expIsRequired() {
        // DefaultJWTClaimsVerifier checks exp only when present, unless it is a required claim;
        // polyjose requires it by default (RFC 7519 §4.1.4, RFC 8725 §3.10).
        val noExp = JWTClaimsSet.Builder().issuer(ISSUER).subject(SUBJECT).audience(AUDIENCE).build()
        val token = nimbusJwt(noExp)
        val lenient = DefaultJWTProcessor<SecurityContext>()
        lenient.setJWSKeySelector(JWSVerificationKeySelector(JWSAlgorithm.ES256, ImmutableJWKSet(JWKSet(ECKey.parse(publicKeyJson)))))
        lenient.setJWTClaimsSetVerifier(DefaultJWTClaimsVerifier(AUDIENCE, JWTClaimsSet.Builder().issuer(ISSUER).build(), null))
        assertEquals(SUBJECT, lenient.process(token, null).subject)
        // Listing exp as required makes Nimbus reject it too, as a BadJWTException.
        assertThrows(BadJWTException::class.java) { nimbusProcessor().process(token, null) }
        assertEquals("InvalidClaim", errorCodeOf { jwtVerify(token, publicKeyJson, options) })
        assertEquals(null, errorCodeOf { jwtVerify(token, publicKeyJson, options.copy(allowMissingExp = true)) })
    }

    @Test
    fun audienceMustBeConfigured() {
        // With no audience configured, DefaultJWTClaimsVerifier accepts any aud; polyjose rejects a
        // token that has one (RFC 7519 §4.1.3, RFC 8725 §3.9) unless you set audiences or
        // ignoreAudience.
        val token = nimbusJwt(nimbusClaims())
        val anyAudience = DefaultJWTProcessor<SecurityContext>()
        anyAudience.setJWSKeySelector(JWSVerificationKeySelector(JWSAlgorithm.ES256, ImmutableJWKSet(JWKSet(ECKey.parse(publicKeyJson)))))
        anyAudience.setJWTClaimsSetVerifier(DefaultJWTClaimsVerifier(JWTClaimsSet.Builder().issuer(ISSUER).build(), null))
        assertEquals(SUBJECT, anyAudience.process(token, null).subject)
        val noAudience = JwtVerifyOptions(allowedAlgs = listOf("ES256"), issuers = listOf(ISSUER))
        assertEquals("InvalidClaim", errorCodeOf { jwtVerify(token, publicKeyJson, noAudience) })
        assertEquals(null, errorCodeOf { jwtVerify(token, publicKeyJson, noAudience.copy(ignoreAudience = true)) })
    }

    @Test
    fun keyBoundToAlgorithmFamily() {
        // An RSA key can't verify an ES256 token, even when ES256 is allowed (RFC 8725 §3.1).
        val token = polyjoseJwt("""{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${currentTime() + 300}}""")
        assertEquals("KeyAlgorithmMismatch", errorCodeOf { jwtVerify(token, fixtureJwk("rsa-public"), options) })
        // A key whose "use" is "enc" can't verify a signature (RFC 7517 §4.2).
        val encOnly = JSONObject(publicKeyJson).put("use", "enc").toString()
        assertEquals("KeyAlgorithmMismatch", errorCodeOf { jwtVerify(token, encOnly, options) })
        // So does a key whose "alg" member names another algorithm (RFC 7517 §4.4).
        val es384Only = JSONObject(publicKeyJson).put("alg", "ES384").toString()
        assertEquals("KeyAlgorithmMismatch", errorCodeOf { jwtVerify(token, es384Only, options) })
    }

    @Test
    fun kidComesFromTheKey() {
        // jwtSign copies the key's kid into the header (RFC 7515 §4.1.4); with Nimbus you set
        // JWSHeader.keyID yourself.
        val token = jwtSign(
            """{"iss":"$ISSUER","sub":"$SUBJECT","aud":"$AUDIENCE","exp":${currentTime() + 300}}""",
            withKid(privateKeyJson, "p256-2026"),
            JwtSignOptions(alg = "ES256"),
        )
        assertEquals("p256-2026", SignedJWT.parse(token).header.keyID)
    }

    // ---------------------------------------------------------------------------------------------
    // Not supported in polyjose
    // ---------------------------------------------------------------------------------------------

    @Test
    fun noRsaKeyGeneration() {
        // Nimbus has RSAKeyGenerator; polyjose generates no RSA keys.
        assertEquals("UnsupportedAlgorithm", errorCodeOf { jwkGenerateForAlg("RS256") })
        assertEquals("UnsupportedAlgorithm", errorCodeOf { jwkGenerateForAlg("RSA-OAEP-256") })
    }

    @Test
    @Suppress("DEPRECATION")
    fun noRsa15OrRsaOaepSha1() {
        // Nimbus still encrypts RSA1_5 and RSA-OAEP (SHA-1); polyjose decrypts neither
        // (RFC 8725 §3.2).
        val rsaPrivateKeyJson = rsaPrivateJwk()
        val decryptOptions = JweDecryptOptions(allowedAlgs = listOf("RSA-OAEP-256"), allowedEnc = listOf("A256GCM"))
        for (alg in listOf(JWEAlgorithm.RSA1_5, JWEAlgorithm.RSA_OAEP)) {
            val token = JWEObject(JWEHeader(alg, EncryptionMethod.A256GCM), Payload("hello"))
                .also { it.encrypt(RSAEncrypter(RSAKey.parse(fixtureJwk("rsa-public")))) }
                .serialize()
            assertEquals("UnsupportedAlgorithm", errorCodeOf { jweDecryptCompact(token, rsaPrivateKeyJson, decryptOptions) }, alg.name)
        }
        for (alg in listOf("RSA1_5", "RSA-OAEP")) {
            val to = JweEncryptOptions(enc = "A256GCM", recipients = listOf(JweRecipient(alg = alg, key = fixtureJwk("rsa-public"))))
            assertEquals("UnsupportedAlgorithm", errorCodeOf { jweEncryptCompact("hello".toByteArray(), to) }, alg)
        }
    }

    @Test
    fun noCompressionInTheKotlinPackage() {
        // Nimbus compresses with "zip": "DEF" (RFC 7516 §4.1.3); the Kotlin package of polyjose
        // has no compression, so such a token fails (RFC 8725 §3.6).
        val token = JWEObject(
            JWEHeader.Builder(JWEAlgorithm.RSA_OAEP_256, EncryptionMethod.A256GCM).compressionAlgorithm(CompressionAlgorithm.DEF).build(),
            Payload("hello"),
        ).also { it.encrypt(RSAEncrypter(RSAKey.parse(fixtureJwk("rsa-public")))) }.serialize()
        val decryptOptions = JweDecryptOptions(allowedAlgs = listOf("RSA-OAEP-256"), allowedEnc = listOf("A256GCM"))
        assertEquals("UnsupportedAlgorithm", errorCodeOf { jweDecryptCompact(token, rsaPrivateJwk(), decryptOptions) })
    }
}
