//! Helpers shared by the Rust samples. Nothing here is shown on a page.
//!
//! The keys come from `samples/fixtures/keys.json`: example keys published in RFC 7515 and
//! RFC 8037. Their private parts are printed in the RFCs, so they protect nothing. Never use them
//! in an application.

use polyjose::json;
use polyjose::jwk::Jwk;

/// `samples/fixtures/keys.json`, compiled in.
const KEYS_JSON: &str = include_str!("../../fixtures/keys.json");

/// The fixture JWK named `name`: `hmac` (RFC 7515 A.1.1), `rsa-public` (A.2.1, public members
/// only), `p256` (A.3.1) or `ed25519` (RFC 8037 A.1).
///
/// # Panics
///
/// If `keys.json` has no such key, or polyjose rejects it: both are mistakes in the samples, not
/// something a sample handles.
pub fn fixture_jwk(name: &str) -> Jwk {
    let doc = json::parse(KEYS_JSON.as_bytes()).unwrap_or_else(|e| panic!("keys.json: {e}"));
    let jwk = doc
        .get("keys")
        .and_then(|keys| keys.get(name))
        .and_then(|entry| entry.get("jwk"))
        .and_then(|jwk| jwk.as_object())
        .unwrap_or_else(|| panic!("keys.json has no keys.{name}.jwk object"));
    Jwk::from_object(jwk).unwrap_or_else(|e| panic!("keys.{name}: {e}"))
}

/// The public half of the fixture JWK named `name` (RFC 7517 §4, RFC 7518 §6.2.1): what a verifier
/// holds.
///
/// # Panics
///
/// As [`fixture_jwk`], and for an `oct` key, which has no public half.
pub fn fixture_public_jwk(name: &str) -> Jwk {
    fixture_jwk(name)
        .to_public()
        .unwrap_or_else(|| panic!("keys.{name} has no public half"))
}
