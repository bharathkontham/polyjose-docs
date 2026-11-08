//! The samples of the JWK Sets guide.
//!
//! Verifying JWTs against an issuer's JWK Set (RFC 7517 §5), with the key chosen by the token's
//! `kid` (RFC 7515 §4.1.4) among the set's members, and selecting one key from a set. The issuer
//! still has to be checked (RFC 8725 §3.8).
//!
//! The set is `samples/fixtures/jwks.json`: the public halves of the RFC 7515 A.3.1 P-256 key and
//! the RFC 8037 A.1 Ed25519 key, each with a `kid`, `alg` and `use`. The tokens are signed with
//! the private halves from `keys.json`, given the same `kid`.

use std::time::{SystemTime, UNIX_EPOCH};

use polyjose::Error;
use polyjose::json::{Object, Value};
use polyjose::jwa::SigningAlg;
use polyjose::jwk::{EcCurve, Jwk, JwkSelector, JwkSet, KeyAlg, KeyMaterial, KeyUse};
use polyjose::jwt::{self, Audience, Claims, IssueOptions, Keys, NumericDate, Policy, SystemClock};
use polyjose_samples::fixture_jwk;

/// The JWK Set an issuer publishes at its `jwks_uri` (RFC 7517 §5).
const JWKS_JSON: &str = include_str!("../../fixtures/jwks.json");

/// RFC 7515 Appendix A.2.1: the private exponent `d` of the fixture RSA key.
const RFC7515_A2_D: &str = "Eq5xpGnNCivDflJsRQBXHx1hdR1k6Ulwe2JZD50LpXyWPEAeP88vLNO97IjlA7_GQ5sLKMgvfTeXZx9SE-7YwVol2NXOoAJe46sui395IW_GO-pWJ1O0BkTGoVEn2bKVRUCgu-GjBVaYLU6f3l9kJfFNS3E0QbVdxzubSu3Mkqzjkn439X0M_V51gfpRLI9JYanrC4D4qAdGcopV_0ZHHzQlBjudU2QvXt4ehNYTCBr6XCLQUShb1juUO1ZdiYoFaFQT5Tw8bGUl_x_jTj3ccPDVZFD9pIuhLhBOneufuBiB4cS98l2SR_RQyGWSeWjnczT0QU91p1DhOVRuOopznQ";

/// The issuer and audience of every token here (RFC 7519 §4.1.1, §4.1.3).
const ISSUER: &str = "https://issuer.example";
const AUDIENCE: &str = "https://api.example";

/// The fixture key `name` with a `kid` (RFC 7517 §4.5), which `jwt::sign` copies into the
/// token's header (RFC 7515 §4.1.4).
fn with_kid(name: &str, kid: &str) -> Jwk {
    let mut object = fixture_jwk(name).to_object();
    object.insert("kid", kid);
    Jwk::from_object(&object).expect("the fixture key with a kid")
}

/// A token from `iss` to [`AUDIENCE`], valid for five minutes (RFC 7519 §4.1.4), signed with
/// `alg` and `key`.
fn issue(iss: &str, alg: SigningAlg, key: &Jwk) -> Result<String, Error> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("the system clock is after 1970")
        .as_secs();
    let mut claims = Claims::new();
    claims.iss = Some(iss.into());
    claims.sub = Some("user-123".into());
    claims.aud = Some(Audience::One(AUDIENCE.into()));
    claims.exp = NumericDate::from_secs(i64::try_from(now).expect("in range") + 300);
    jwt::sign(&claims, &IssueOptions::new(alg), key)
}

#[test]
fn verify() -> Result<(), Error> {
    let token = issue(ISSUER, SigningAlg::ES256, &with_kid("p256", "p256-2026"))?;
    // docs:start jwk-sets/verify
    // The token's `kid` picks the member; the algorithm must be in the allow-list.
    let jwks = JwkSet::from_json(JWKS_JSON.as_bytes())?;
    let algs = [SigningAlg::ES256, SigningAlg::Ed25519];
    let policy = Policy::new(&SystemClock, &algs)?
        .issuer(ISSUER)
        .audience(AUDIENCE);

    let verified = jwt::verify(&token, Keys::Set(&jwks), &policy)?;
    assert_eq!(verified.kid.as_deref(), Some("p256-2026"));
    // docs:end jwk-sets/verify
    assert_eq!(verified.key_index, Some(0));
    assert_eq!(verified.alg, SigningAlg::ES256);
    let ed_token = issue(
        ISSUER,
        SigningAlg::Ed25519,
        &with_kid("ed25519", "ed25519-2026"),
    )?;
    let ed_verified = jwt::verify(&ed_token, Keys::Set(&jwks), &policy)?;
    assert_eq!(ed_verified.key_index, Some(1));
    assert_eq!(ed_verified.kid.as_deref(), Some("ed25519-2026"));
    assert_eq!(ed_verified.alg, SigningAlg::Ed25519);
    Ok(())
}

#[test]
fn no_matching_key() -> Result<(), Error> {
    let jwks = JwkSet::from_json(JWKS_JSON.as_bytes())?;
    let algs = [SigningAlg::ES256, SigningAlg::Ed25519];
    let policy = Policy::new(&SystemClock, &algs)?
        .issuer(ISSUER)
        .audience(AUDIENCE);
    let token = issue(ISSUER, SigningAlg::ES256, &with_kid("p256", "retired-2025"))?;
    // docs:start jwk-sets/no-matching-key
    // The header names a `kid` the set does not have (RFC 7517 §4.5).
    let result = jwt::verify(&token, Keys::Set(&jwks), &policy);

    let err = result.expect_err("no member has kid retired-2025");
    assert_eq!(err.code(), "NoMatchingKey");
    // docs:end jwk-sets/no-matching-key
    assert_eq!(err, Error::NoMatchingKey);
    Ok(())
}

#[test]
fn issuer() -> Result<(), Error> {
    let jwks = JwkSet::from_json(JWKS_JSON.as_bytes())?;
    let token = issue(
        "https://other.example",
        SigningAlg::ES256,
        &with_kid("p256", "p256-2026"),
    )?;
    // docs:start jwk-sets/issuer
    // A key from the set proves who signed, not who the token claims as issuer: check `iss`
    // too (RFC 8725 §3.8).
    let algs = [SigningAlg::ES256, SigningAlg::Ed25519];
    let policy = Policy::new(&SystemClock, &algs)?
        .issuer(ISSUER)
        .audience(AUDIENCE);
    let result = jwt::verify(&token, Keys::Set(&jwks), &policy);

    let err = result.expect_err("iss is https://other.example");
    assert_eq!(err.code(), "InvalidClaim");
    // docs:end jwk-sets/issuer
    assert_eq!(err, Error::InvalidClaim("iss"));
    Ok(())
}

#[test]
fn select() -> Result<(), Error> {
    let jwks = JwkSet::from_json(JWKS_JSON.as_bytes())?;
    // docs:start jwk-sets/select
    // Exactly one member must match every criterion given (RFC 7517 §4.4-§4.5).
    let selector = JwkSelector::new()
        .kid("p256-2026")
        .alg(KeyAlg::Signing(SigningAlg::ES256))?;
    let (index, key) = jwks.select(&selector)?;
    // docs:end jwk-sets/select
    assert_eq!(index, 0);
    assert_eq!(key.kid(), Some("p256-2026"));
    let KeyMaterial::Ec(ec) = key.material() else {
        panic!("the P-256 member is an EC key");
    };
    assert_eq!(ec.crv(), EcCurve::P256);
    assert!(key.is_public() && !ec.is_private(), "no d");
    Ok(())
}

#[test]
fn select_ambiguous() -> Result<(), Error> {
    let jwks = JwkSet::from_json(JWKS_JSON.as_bytes())?;
    // docs:start jwk-sets/select-ambiguous
    // Both members are signing keys (RFC 7517 §4.2), so `use` alone does not pick one.
    let selector = JwkSelector::new().key_use(KeyUse::Sig)?;
    let result = jwks.select(&selector);

    let err = result.expect_err("two members match");
    assert_eq!(err.code(), "MultipleMatchingKeys");
    // docs:end jwk-sets/select-ambiguous
    assert_eq!(err, Error::MultipleMatchingKeys);
    assert_eq!(jwks.matching(&selector).count(), 2);
    Ok(())
}

#[test]
fn rsa_private() -> Result<(), Error> {
    let mut rsa_private = fixture_jwk("rsa-public").to_object();
    rsa_private.insert("d", RFC7515_A2_D);
    let mut document = Object::new();
    document.insert("keys", vec![Value::from(rsa_private)]);
    let leaked_jwks = document.to_json();
    // docs:start jwk-sets/rsa-private
    // A set holding an RSA private key (RFC 7518 §6.3.2) is refused as a whole, so a leaked
    // key is never used quietly.
    let result = JwkSet::from_json(leaked_jwks.as_bytes());

    let err = result.expect_err("RSA private keys are refused");
    assert_eq!(err.code(), "UnsupportedAlgorithm");
    // docs:end jwk-sets/rsa-private
    assert_eq!(err, Error::UnsupportedAlgorithm);
    Ok(())
}
