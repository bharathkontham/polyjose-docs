//! The samples of Get started › Rust (`src/content/docs/start/rust.mdx`).
//!
//! The key is RFC 7515 Appendix A.3.1's P-256 key, a public test key. The JWS is the Compact
//! Serialization (RFC 7515 §7.1) with ES256, ECDSA over P-256 and SHA-256 (RFC 7518 §3.4).
//! ECDSA signatures are randomized, so each test checks what it can (the header part, the
//! payload, the error) and verifies what it signs.

// docs:start start/rust-imports
use polyjose::Error;
use polyjose::header::Header;
use polyjose::jwa::SigningAlg;
use polyjose::jws::{self, ProtectedHeader, SignOptions, VerifyOptions};
// docs:end start/rust-imports
use polyjose_samples::{fixture_jwk, fixture_public_jwk};

/// BASE64URL(UTF8(`{"alg":"ES256"}`)), the protected header every sample here signs with
/// (RFC 7515 §5.1 steps 3-4).
const ES256_HEADER_B64U: &str = "eyJhbGciOiJFUzI1NiJ9";

/// Signs `hello, polyjose` with the fixture P-256 key, as `first_sign` shows.
fn signed_token() -> Result<String, Error> {
    let mut header = Header::new();
    header.alg = Some("ES256".into());
    jws::sign_compact(
        &ProtectedHeader::new(header)?,
        b"hello, polyjose",
        &fixture_jwk("p256"),
        &SignOptions::new(),
    )
}

#[test]
fn first_sign() -> Result<(), Error> {
    let private_key = fixture_jwk("p256");
    // docs:start start/rust-first-sign
    let mut header = Header::new();
    header.alg = Some("ES256".into());
    let protected = ProtectedHeader::new(header)?;

    let token = jws::sign_compact(
        &protected,
        b"hello, polyjose",
        &private_key,
        &SignOptions::new(),
    )?;
    // docs:end start/rust-first-sign
    let parts: Vec<&str> = token.split('.').collect();
    assert_eq!(parts.len(), 3, "header.payload.signature (RFC 7515 §7.1)");
    assert_eq!(parts[0], ES256_HEADER_B64U);
    assert_eq!(
        parts[1], "aGVsbG8sIHBvbHlqb3Nl",
        "BASE64URL(\"hello, polyjose\")"
    );
    // The token verifies with the public half of the key.
    let allowed = [SigningAlg::ES256];
    let verified = jws::verify_compact(
        &token,
        &fixture_public_jwk("p256"),
        &VerifyOptions::new(&allowed)?,
    )?;
    assert_eq!(&verified.payload[..], b"hello, polyjose");
    Ok(())
}

#[test]
fn first_verify() -> Result<(), Error> {
    let token = signed_token()?;
    let public_key = fixture_public_jwk("p256");
    // docs:start start/rust-first-verify
    let allowed = [SigningAlg::ES256];
    let verified = jws::verify_compact(&token, &public_key, &VerifyOptions::new(&allowed)?)?;

    assert_eq!(verified.alg, SigningAlg::ES256);
    assert_eq!(&verified.payload[..], b"hello, polyjose");
    // docs:end start/rust-first-verify
    assert_eq!(
        verified.protected.and_then(|h| h.alg).as_deref(),
        Some("ES256"),
        "the protected header comes back with the result"
    );
    Ok(())
}

#[test]
fn error_code() -> Result<(), Error> {
    let token = signed_token()?;
    let public_key = fixture_public_jwk("p256");
    // docs:start start/rust-error-code
    // The token is ES256, but this verifier accepts only Ed25519.
    let allowed = [SigningAlg::Ed25519];
    let result = jws::verify_compact(&token, &public_key, &VerifyOptions::new(&allowed)?);

    let err = result.expect_err("ES256 is not in the allow-list");
    assert_eq!(err, Error::AlgorithmNotAllowed);
    assert_eq!(err.code(), "AlgorithmNotAllowed");
    // docs:end start/rust-error-code
    assert!(Error::CODES.contains(&err.code()));
    Ok(())
}
