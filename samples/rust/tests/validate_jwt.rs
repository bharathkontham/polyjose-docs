//! The samples of the Validate a JWT guide.
//!
//! Issuing and verifying signed JWTs (RFC 7519 §7.1–§7.2) under a validation policy: the
//! algorithm allow-list, issuer and audience (RFC 8725 §3.8–§3.9), the time claims with a leeway
//! (RFC 7519 §4.1.4–§4.1.6), explicit typing (RFC 8725 §3.11–§3.12), JWT access tokens
//! (RFC 9068) and nested JWTs (RFC 7519 §5.2, §11.2).
//!
//! The signing key is the RFC 7515 A.3.1 P-256 key of `samples/fixtures/keys.json`. Tokens that
//! use the current time set `exp` a few minutes ahead and are verified in the same test; the
//! others use a fixed clock.

use std::time::{SystemTime, UNIX_EPOCH};

use polyjose::Error;
use polyjose::header::Header;
use polyjose::json::Value;
use polyjose::jwa::{ContentEncAlg, KeyMgmtAlg, SigningAlg};
use polyjose::jwe::{DecryptPolicy, Encryptor, Recipient};
use polyjose::jwk::EcCurve;
use polyjose::jwt::{
    self, Audience, Claims, FixedClock, IssueOptions, Keys, NumericDate, Policy, SystemClock,
};
use polyjose::keys::{self, KeySpec};
use polyjose::util::b64url_decode;
use polyjose_samples::{fixture_jwk, fixture_public_jwk};

/// The issuer and audience of every token here (RFC 7519 §4.1.1, §4.1.3).
const ISSUER: &str = "https://issuer.example";
const AUDIENCE: &str = "https://api.example";
/// The subject (RFC 7519 §4.1.2).
const SUBJECT: &str = "user-123";

/// A fixed instant, in seconds since the epoch (RFC 7519 §2 NumericDate), for the samples that
/// pin the clock.
const NOW: i64 = 1_700_000_000;

/// The current time in whole seconds since the epoch (RFC 7519 §2).
fn now() -> i64 {
    let since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("the system clock is after 1970");
    i64::try_from(since_epoch.as_secs()).expect("in range")
}

/// `iss`, `sub` and `aud`, with `exp` at `exp`.
fn claims(exp: i64) -> Claims {
    let mut claims = Claims::new();
    claims.iss = Some(ISSUER.into());
    claims.sub = Some(SUBJECT.into());
    claims.aud = Some(Audience::One(AUDIENCE.into()));
    claims.exp = NumericDate::from_secs(exp);
    claims
}

/// `claims` signed with ES256 and the fixture P-256 key.
fn sign(claims: &Claims) -> Result<String, Error> {
    jwt::sign(
        claims,
        &IssueOptions::new(SigningAlg::ES256),
        &fixture_jwk("p256"),
    )
}

/// The JWS Protected Header of a compact token (RFC 7515 §7.1).
fn header_of(token: &str) -> Result<Header, Error> {
    Header::from_json(&b64url_decode(token.split('.').next().unwrap_or_default())?)
}

#[test]
fn issue() -> Result<(), Error> {
    let private_key = fixture_jwk("p256");
    let now = now();
    // docs:start validate-jwt/issue
    let mut claims = Claims::new();
    claims.iss = Some(ISSUER.into());
    claims.sub = Some(SUBJECT.into());
    claims.aud = Some(Audience::One(AUDIENCE.into()));
    // Expires in five minutes (RFC 7519 §4.1.4).
    claims.exp = NumericDate::from_secs(now + 300);

    let token = jwt::sign(&claims, &IssueOptions::new(SigningAlg::ES256), &private_key)?;
    // docs:end validate-jwt/issue
    assert_eq!(
        token.split('.').count(),
        3,
        "a JWT is a compact JWS (RFC 7519 §7.1)"
    );
    let header = header_of(&token)?;
    assert_eq!(header.alg.as_deref(), Some("ES256"));
    assert_eq!(header.typ.as_deref(), Some("JWT"), "RFC 7519 §5.1");
    assert_eq!(header.to_json()?, r#"{"alg":"ES256","typ":"JWT"}"#);
    Ok(())
}

#[test]
fn verify() -> Result<(), Error> {
    let public_key = fixture_public_jwk("p256");
    let token = sign(&claims(now() + 300))?;
    // docs:start validate-jwt/verify
    let algs = [SigningAlg::ES256];
    let policy = Policy::new(&SystemClock, &algs)?
        .issuer(ISSUER)
        .audience(AUDIENCE);

    let verified = jwt::verify(&token, Keys::One(&public_key), &policy)?;
    let subject = verified.claims.sub.as_deref();
    // docs:end validate-jwt/verify
    assert_eq!(subject, Some(SUBJECT));
    assert_eq!(verified.alg, SigningAlg::ES256);
    // A header member the verifier does not know is ignored (RFC 7515 §4, erratum 8060).
    let traced = jwt::sign(
        &claims(now() + 300),
        &IssueOptions::new(SigningAlg::ES256).header_param("x-trace", "abc")?,
        &fixture_jwk("p256"),
    )?;
    let verified = jwt::verify(&traced, Keys::One(&public_key), &policy)?;
    let trace = verified.header.other_params().get("x-trace");
    assert_eq!(trace.and_then(Value::as_str), Some("abc"));
    Ok(())
}

#[test]
fn expired() -> Result<(), Error> {
    let public_key = fixture_public_jwk("p256");
    let algs = [SigningAlg::ES256];
    let policy = Policy::new(&SystemClock, &algs)?
        .issuer(ISSUER)
        .audience(AUDIENCE);
    let private_key = fixture_jwk("p256");
    let mut claims = claims(now() + 300);
    let now = now();
    // docs:start validate-jwt/expired
    // Expired two minutes ago: past the default 60-second leeway (RFC 7519 §4.1.4).
    claims.exp = NumericDate::from_secs(now - 120);
    let token = jwt::sign(&claims, &IssueOptions::new(SigningAlg::ES256), &private_key)?;

    let err = jwt::verify(&token, Keys::One(&public_key), &policy).expect_err("expired");
    assert_eq!(err.code(), "TokenExpired");
    // docs:end validate-jwt/expired
    assert_eq!(err, Error::TokenExpired);
    Ok(())
}

#[test]
fn not_yet_valid() -> Result<(), Error> {
    let public_key = fixture_public_jwk("p256");
    let algs = [SigningAlg::ES256];
    let policy = Policy::new(&SystemClock, &algs)?
        .issuer(ISSUER)
        .audience(AUDIENCE);
    let private_key = fixture_jwk("p256");
    let now = now();
    let mut claims = claims(now + 300);
    // docs:start validate-jwt/not-yet-valid
    // Valid only five minutes from now (RFC 7519 §4.1.5).
    claims.nbf = NumericDate::from_secs(now + 300);
    claims.exp = NumericDate::from_secs(now + 600);
    let token = jwt::sign(&claims, &IssueOptions::new(SigningAlg::ES256), &private_key)?;

    let err = jwt::verify(&token, Keys::One(&public_key), &policy).expect_err("not yet valid");
    assert_eq!(err.code(), "TokenNotYetValid");
    // docs:end validate-jwt/not-yet-valid
    assert_eq!(err, Error::TokenNotYetValid);
    Ok(())
}

#[test]
fn aud_not_configured() -> Result<(), Error> {
    let public_key = fixture_public_jwk("p256");
    let token = sign(&claims(now() + 300))?;
    // docs:start validate-jwt/aud-not-configured
    // The token has an `aud`, and this policy names no audience: the token is rejected
    // (RFC 7519 §4.1.3).
    let algs = [SigningAlg::ES256];
    let policy = Policy::new(&SystemClock, &algs)?;

    let err = jwt::verify(&token, Keys::One(&public_key), &policy).expect_err("aud not accepted");
    assert_eq!(err.code(), "InvalidClaim");
    // docs:end validate-jwt/aud-not-configured
    assert_eq!(err, Error::InvalidClaim("aud"));
    Ok(())
}

#[test]
fn check_order() -> Result<(), Error> {
    let public_key = fixture_public_jwk("p256");
    let private_key = fixture_jwk("p256");
    let now = now();
    let mut claims = claims(now + 300);
    // docs:start validate-jwt/check-order
    // Expired, and from another issuer: the time claims are checked first.
    claims.exp = NumericDate::from_secs(now - 120);
    claims.iss = Some("https://other.example".into());
    let token = jwt::sign(&claims, &IssueOptions::new(SigningAlg::ES256), &private_key)?;

    let algs = [SigningAlg::ES256];
    let policy = Policy::new(&SystemClock, &algs)?
        .issuer(ISSUER)
        .audience(AUDIENCE);
    let err = jwt::verify(&token, Keys::One(&public_key), &policy).expect_err("rejected");
    assert_eq!(err.code(), "TokenExpired");
    // docs:end validate-jwt/check-order
    assert_eq!(err, Error::TokenExpired);
    Ok(())
}

#[test]
fn leeway() -> Result<(), Error> {
    let public_key = fixture_public_jwk("p256");
    let private_key = fixture_jwk("p256");
    let algs = [SigningAlg::ES256];
    let mut claims = claims(NOW + 300);
    // docs:start validate-jwt/leeway
    // At NOW + 30, the token expired 30 seconds ago (RFC 7519 §4.1.4).
    claims.exp = NumericDate::from_secs(NOW);
    let token = jwt::sign(&claims, &IssueOptions::new(SigningAlg::ES256), &private_key)?;
    let clock = FixedClock(NOW + 30);

    // The default leeway of 60 seconds still accepts it.
    let policy = Policy::new(&clock, &algs)?
        .issuer(ISSUER)
        .audience(AUDIENCE);
    assert!(jwt::verify(&token, Keys::One(&public_key), &policy).is_ok());

    // A leeway of 10 seconds does not.
    let strict = policy.leeway(10)?;
    let err = jwt::verify(&token, Keys::One(&public_key), &strict).expect_err("expired");
    assert_eq!(err.code(), "TokenExpired");
    // docs:end validate-jwt/leeway
    assert_eq!(Policy::DEFAULT_LEEWAY, 60);
    Ok(())
}

#[test]
fn max_age() -> Result<(), Error> {
    let public_key = fixture_public_jwk("p256");
    let algs = [SigningAlg::ES256];
    let now = now();
    let token = sign(&claims(now + 300))?;
    // docs:start validate-jwt/max-age
    // A maximum age makes `iat` required (RFC 7519 §4.1.6); this token has none.
    let policy = Policy::new(&SystemClock, &algs)?
        .issuer(ISSUER)
        .audience(AUDIENCE)
        .max_age(300);

    let err = jwt::verify(&token, Keys::One(&public_key), &policy).expect_err("no iat");
    assert_eq!(err.code(), "InvalidClaim");
    // docs:end validate-jwt/max-age
    assert_eq!(err, Error::InvalidClaim("iat"));
    let mut issued = claims(now + 300);
    issued.iat = NumericDate::from_secs(now);
    let token = sign(&issued)?;
    assert!(jwt::verify(&token, Keys::One(&public_key), &policy).is_ok());
    Ok(())
}

#[test]
fn required_claims() -> Result<(), Error> {
    let public_key = fixture_public_jwk("p256");
    let token = sign(&claims(now() + 300))?;
    // docs:start validate-jwt/required-claims
    // Which claims are required depends on the application (RFC 7519 §4).
    let algs = [SigningAlg::ES256];
    let policy = Policy::new(&SystemClock, &algs)?
        .issuer(ISSUER)
        .audience(AUDIENCE)
        .require("jti");

    let err = jwt::verify(&token, Keys::One(&public_key), &policy).expect_err("no jti");
    assert_eq!(err.code(), "InvalidClaim");
    // docs:end validate-jwt/required-claims
    assert_eq!(err, Error::InvalidClaim("jti"));
    Ok(())
}

#[test]
fn access_token() -> Result<(), Error> {
    let private_key = fixture_jwk("p256");
    let public_key = fixture_public_jwk("p256");
    let now = now();
    // docs:start validate-jwt/access-token
    // A JWT access token carries these claims (RFC 9068 §2.2) and `typ: at+jwt` (§2.1).
    let mut claims = Claims::new();
    claims.iss = Some(ISSUER.into());
    claims.sub = Some(SUBJECT.into());
    claims.aud = Some(Audience::One(AUDIENCE.into()));
    claims.exp = NumericDate::from_secs(now + 300);
    claims.iat = NumericDate::from_secs(now);
    claims.jti = Some("token-1".into());
    claims.insert("client_id", "client-1")?;
    let options = IssueOptions::new(SigningAlg::ES256).access_token();
    let token = jwt::sign(&claims, &options, &private_key)?;

    // A resource server validates it with the access token policy (RFC 9068 §4).
    let algs = [SigningAlg::ES256];
    let policy = Policy::access_token(&SystemClock, &algs, &[ISSUER], &[AUDIENCE])?;
    let verified = jwt::verify(&token, Keys::One(&public_key), &policy)?;
    let client_id = verified.claims.get("client_id").and_then(Value::as_str);
    // docs:end validate-jwt/access-token
    assert_eq!(client_id, Some("client-1"));
    assert_eq!(verified.header.typ.as_deref(), Some("at+jwt"));
    assert_eq!(header_of(&token)?.typ.as_deref(), Some("at+jwt"));
    Ok(())
}

#[test]
fn typed_rejected() -> Result<(), Error> {
    let public_key = fixture_public_jwk("p256");
    let now = now();
    let mut claims = claims(now + 300);
    claims.iat = NumericDate::from_secs(now);
    claims.jti = Some("token-1".into());
    claims.insert("client_id", "client-1")?;
    let options = IssueOptions::new(SigningAlg::ES256).access_token();
    let token = jwt::sign(&claims, &options, &fixture_jwk("p256"))?;
    // docs:start validate-jwt/typed-rejected
    // A generic policy accepts only `typ` JWT or none, so an access token cannot pass for
    // another kind of JWT (RFC 8725 §3.11-§3.12).
    let algs = [SigningAlg::ES256];
    let policy = Policy::new(&SystemClock, &algs)?
        .issuer(ISSUER)
        .audience(AUDIENCE);

    let err = jwt::verify(&token, Keys::One(&public_key), &policy).expect_err("typ at+jwt");
    assert_eq!(err.code(), "InvalidHeader");
    // docs:end validate-jwt/typed-rejected
    assert_eq!(err, Error::InvalidHeader("typ"));
    Ok(())
}

#[test]
fn fixed_now() -> Result<(), Error> {
    let public_key = fixture_public_jwk("p256");
    let mut claims = claims(NOW + 300);
    claims.iat = NumericDate::from_secs(NOW);
    let token = sign(&claims)?;
    // docs:start validate-jwt/fixed-now
    // Validate as of a fixed time, as tests do (RFC 7519 §4.1.4).
    let clock = FixedClock(NOW);
    let algs = [SigningAlg::ES256];
    let policy = Policy::new(&clock, &algs)?
        .issuer(ISSUER)
        .audience(AUDIENCE);

    let verified = jwt::verify(&token, Keys::One(&public_key), &policy)?;
    // docs:end validate-jwt/fixed-now
    let exp = verified.claims.exp.as_ref().and_then(NumericDate::as_secs);
    assert_eq!(exp, Some(NOW + 300));
    Ok(())
}

#[test]
fn nested() -> Result<(), Error> {
    let private_key = fixture_jwk("p256");
    let public_key = fixture_public_jwk("p256");
    let claims = claims(now() + 300);
    // docs:start validate-jwt/nested
    // Sign, then encrypt the signed JWT to the recipient (RFC 7519 §5.2, §11.2).
    let signed = jwt::sign(&claims, &IssueOptions::new(SigningAlg::ES256), &private_key)?;
    let recipient = keys::generate(KeySpec::Ec(EcCurve::P256))?;
    let recipient_public = recipient.to_public().expect("an EC key has a public half");
    let encryptor = Encryptor::new(ContentEncAlg::A256GCM)
        .recipient(Recipient::new(KeyMgmtAlg::EcdhEsA256KW, &recipient_public));
    let nested = jwt::encrypt_nested(&signed, &encryptor)?;

    // The recipient decrypts it, then verifies the inner JWT (RFC 8725 §3.3).
    let decrypt_policy =
        DecryptPolicy::new(&[KeyMgmtAlg::EcdhEsA256KW], &[ContentEncAlg::A256GCM])?;
    let algs = [SigningAlg::ES256];
    let policy = Policy::new(&SystemClock, &algs)?
        .issuer(ISSUER)
        .audience(AUDIENCE);
    let verified = jwt::decrypt_nested(
        &nested,
        &recipient,
        &decrypt_policy,
        Keys::One(&public_key),
        &policy,
    )?;
    let subject = verified.inner.claims.sub.as_deref();
    // docs:end validate-jwt/nested
    assert_eq!(subject, Some(SUBJECT));
    assert_eq!(
        verified.outer_header.cty.as_deref(),
        Some("JWT"),
        "RFC 7519 §5.2"
    );
    assert_eq!(verified.recipient, 0);
    assert_eq!(
        nested.split('.').count(),
        5,
        "the outer JWE is compact (RFC 7516 §7.1)"
    );
    Ok(())
}
