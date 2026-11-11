package dev.polyjose.samples

import java.io.File
import org.json.JSONObject

/**
 * Keys for the samples, from `samples/fixtures/keys.json` (the `samples.keys` system property).
 * Nothing here is shown on a page.
 *
 * They are example keys published in RFC 7515 and RFC 8037. Their private parts are printed in
 * the RFCs, so they protect nothing. Never use them in an application.
 */
object Fixtures {
    private val keys: JSONObject by lazy {
        val path = System.getProperty("samples.keys") ?: error("the samples.keys system property is not set")
        JSONObject(File(path).readText()).getJSONObject("keys")
    }

    /** The fixture JWK named [name] as JSON text: `hmac`, `rsa-public`, `rsa-private`, `p256` or `ed25519`. */
    fun jwk(name: String): String = keys.getJSONObject(name).getJSONObject("jwk").toString()

    /** The public half of [jwk] (RFC 7517 §4, RFC 7518 §6.2.1): the private member `d` removed. */
    fun publicJwk(name: String): String {
        val jwk = keys.getJSONObject(name).getJSONObject("jwk")
        val public = JSONObject(jwk.toString())
        public.remove("d")
        check(public.getString("kty") != "oct") { "keys.$name is an oct key, which has no public half" }
        return public.toString()
    }
}
