// Shared inputs of the guide samples (sign-and-verify, encrypt-and-decrypt, validate-jwt,
// manage-keys, jwk-sets). Nothing in this file is shown on a page.
//
// The keys are example keys published in RFC 7515 and RFC 8037. Their private parts are printed
// in the RFCs, so they protect nothing. Never use them in an application.

import dev.polyjose.*
import java.io.File
import org.json.JSONObject

/** RFC 7515 Appendix A.2: an RS256 JWS, signed with the `rsa-public` fixture's private key. */
const val RFC7515_A2_JWS =
    "eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ.cC4hiUPoj9Eetdgtv3hF80EGrhuB__dzERat0XF9g2VtQgr9PJbu3XOiZj5RZmh7AAuHIm4Bh-0Qc_lF5YKt_O8W2Fp5jujGbds9uJdbF9CUAr7t1dnZcAcQjbKBYNX4BAynRFdiuB--f_nZLgrnbyTyWzO75vRK5h6xBArLIARNPvkSjtQBMHlb1L07Qe7K0GarZRmB_eSN9383LcOLn6_dO--xi12jzDwusC-eOkHWEsqtFZESc6BfI7noOPqvhJ1phCnvWh6IeYI2w9QOYEUipUTI8np6LbgGY9Fs98rqVt5AXLIhWkWywlVmtVrBp0igcN_IoypGlUPQGe77Rw"

/** The payload of [RFC7515_A2_JWS] (RFC 7515 Appendix A.1.1), with its CR LF line breaks. */
const val RFC7515_A2_PAYLOAD = "{\"iss\":\"joe\",\r\n \"exp\":1300819380,\r\n \"http://example.com/is_root\":true}"

/** RFC 8037 Appendix A.4: an EdDSA JWS, signed with the `ed25519` fixture. */
const val RFC8037_A4_JWS =
    "eyJhbGciOiJFZERTQSJ9.RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc.hgyY0il_MGCjP0JzlnLWG1PPOt7-09PGcvMg3AIbQR6dWbhijcNR4ki4iylGjg5BhVsPt9g7sVvpAr_MuM0KAg"

/** The payload of [RFC8037_A4_JWS] (RFC 8037 Appendix A.4). */
const val RFC8037_A4_PAYLOAD = "Example of Ed25519 signing"

/** RFC 7797 §4.2: an HS256 JWS with an unencoded, detached payload, signed with the `hmac` fixture. */
const val RFC7797_42_JWS = "eyJhbGciOiJIUzI1NiIsImI2NCI6ZmFsc2UsImNyaXQiOlsiYjY0Il19..A5dxf2s96_n5FLueVuW1Z_vh161FwXZC4YLPff6dmDY"

/** The detached payload of [RFC7797_42_JWS] (RFC 7797 §4). */
const val RFC7797_42_PAYLOAD = "\$.02"

/** RFC 7638 §3.1: the RSA key whose thumbprint the RFC computes. */
const val RFC7638_KEY =
    """{"kty":"RSA","n":"0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw","e":"AQAB","alg":"RS256","kid":"2011-04-29"}"""

/** The SHA-256 thumbprint of [RFC7638_KEY] (RFC 7638 §3.1). */
const val RFC7638_THUMBPRINT = "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"

/** The thumbprint URI of [RFC7638_KEY] (RFC 9278 §3, with the RFC 7638 §3.1 thumbprint). */
const val RFC7638_THUMBPRINT_URI = "urn:ietf:params:oauth:jwk-thumbprint:sha-256:NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"

/** The private exponent `d` of the RFC 7515 Appendix A.2.1 RSA key (RFC 7518 §6.3.2.1). */
const val RFC7515_A2_D =
    "Eq5xpGnNCivDflJsRQBXHx1hdR1k6Ulwe2JZD50LpXyWPEAeP88vLNO97IjlA7_GQ5sLKMgvfTeXZx9SE-7YwVol2NXOoAJe46sui395IW_GO-pWJ1O0BkTGoVEn2bKVRUCgu-GjBVaYLU6f3l9kJfFNS3E0QbVdxzubSu3Mkqzjkn439X0M_V51gfpRLI9JYanrC4D4qAdGcopV_0ZHHzQlBjudU2QvXt4ehNYTCBr6XCLQUShb1juUO1ZdiYoFaFQT5Tw8bGUl_x_jTj3ccPDVZFD9pIuhLhBOneufuBiB4cS98l2SR_RQyGWSeWjnczT0QU91p1DhOVRuOopznQ"

/** Example `iss` (RFC 7519 §4.1.1), `aud` (§4.1.3) and `sub` (§4.1.2) values. */
const val ISSUER = "https://issuer.example"
const val AUDIENCE = "https://api.example"
const val SUBJECT = "user-123"

/** A fixed validation time, whole seconds since the epoch (RFC 7519 §2, NumericDate). */
const val NOW = 1_700_000_000L

/** The `rsa-public` fixture with the RFC 7515 Appendix A.2.1 private exponent added. */
fun rsaPrivateJwk(): String = JSONObject(fixtureJwk("rsa-public")).put("d", RFC7515_A2_D).toString()

/** [jwk] with its `kid` (RFC 7517 §4.5) set to [kid]. */
fun withKid(jwk: String, kid: String): String = JSONObject(jwk).put("kid", kid).toString()

/** The JWS or JWE Protected Header of a compact [token], decoded (RFC 7515 §7.1, RFC 7516 §7.1). */
fun protectedHeaderOf(token: String): JSONObject =
    JSONObject(base64urlDecode(token.substringBefore('.')).decodeToString())

// TEMPORARY (phase 1): replace with the samples project's own fixture helper once it lands
private val fixturesDir: File by lazy {
    var dir: File? = File(System.getProperty("user.dir")).absoluteFile
    while (dir != null && !File(dir, "fixtures/keys.json").isFile) dir = dir.parentFile
    File(dir ?: error("no fixtures/keys.json above ${System.getProperty("user.dir")}"), "fixtures")
}

private val fixtureKeys: JSONObject by lazy {
    JSONObject(File(fixturesDir, "keys.json").readText()).getJSONObject("keys")
}

/** The fixture JWK named [name] as JSON text: `hmac`, `rsa-public`, `p256` or `ed25519`. */
fun fixtureJwk(name: String): String = fixtureKeys.getJSONObject(name).getJSONObject("jwk").toString()

/** The public half of the fixture JWK named [name] (RFC 7517 §4, RFC 7518 §6): `d` removed. */
fun fixturePublicJwk(name: String): String {
    val jwk = JSONObject(fixtureJwk(name))
    check(jwk.getString("kty") != "oct") { "keys.$name is an oct key, which has no public half" }
    jwk.remove("d")
    return jwk.toString()
}

/** The text of `fixtures/jwks.json`, a JWK Set (RFC 7517 §5) of the public P-256 and Ed25519 keys. */
fun fixtureJwks(): String = File(fixturesDir, "jwks.json").readText()
// END TEMPORARY
