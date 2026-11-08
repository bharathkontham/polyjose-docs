//! The samples of the Sign and verify guide.
//!
//! JWS (RFC 7515) in the Compact (§7.1) and JSON (§7.2) Serializations, detached content
//! (Appendix F), the unencoded payload option (RFC 7797), EdDSA and Ed25519 (RFC 8037, RFC 9864),
//! and the allow-list every verify takes (RFC 8725 §3.1).
//!
//! The keys are the RFC example keys of `samples/fixtures/keys.json`. ECDSA and EdDSA signatures
//! of fresh tokens are checked by verifying them; the RFC tokens are verified as published.

use polyjose::Error;
use polyjose::header::Header;
use polyjose::json::{self, Value};
use polyjose::jwa::SigningAlg;
use polyjose::jwk::{KeyAlg, KeyType};
use polyjose::jws::{self, ProtectedHeader, SignOptions, Signer, VerifyOptions};
use polyjose::keys;
use polyjose::util::{b64url_decode, b64url_encode};
use polyjose_samples::{fixture_jwk, fixture_public_jwk};

/// RFC 7515 Appendix A.2: the RS256 JWS signed with the RFC 7515 A.2.1 RSA key.
const RFC7515_A2_JWS: &str = "eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ.cC4hiUPoj9Eetdgtv3hF80EGrhuB__dzERat0XF9g2VtQgr9PJbu3XOiZj5RZmh7AAuHIm4Bh-0Qc_lF5YKt_O8W2Fp5jujGbds9uJdbF9CUAr7t1dnZcAcQjbKBYNX4BAynRFdiuB--f_nZLgrnbyTyWzO75vRK5h6xBArLIARNPvkSjtQBMHlb1L07Qe7K0GarZRmB_eSN9383LcOLn6_dO--xi12jzDwusC-eOkHWEsqtFZESc6BfI7noOPqvhJ1phCnvWh6IeYI2w9QOYEUipUTI8np6LbgGY9Fs98rqVt5AXLIhWkWywlVmtVrBp0igcN_IoypGlUPQGe77Rw";

/// RFC 7515 Appendix A.2 (and A.1): the JWS Payload, with its CRLF line breaks.
const RFC7515_A2_PAYLOAD: &str =
    "{\"iss\":\"joe\",\r\n \"exp\":1300819380,\r\n \"http://example.com/is_root\":true}";

/// RFC 8037 Appendix A.4: an EdDSA JWS signed with the RFC 8037 A.1 Ed25519 key.
const RFC8037_A4_JWS: &str = "eyJhbGciOiJFZERTQSJ9.RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc.hgyY0il_MGCjP0JzlnLWG1PPOt7-09PGcvMg3AIbQR6dWbhijcNR4ki4iylGjg5BhVsPt9g7sVvpAr_MuM0KAg";

/// RFC 7797 §4.2: the detached, unencoded (`b64: false`) HS256 JWS of the payload `$.02`,
/// signed with the RFC 7515 A.1.1 HMAC key.
const RFC7797_42_JWS: &str = "eyJhbGciOiJIUzI1NiIsImI2NCI6ZmFsc2UsImNyaXQiOlsiYjY0Il19..A5dxf2s96_n5FLueVuW1Z_vh161FwXZC4YLPff6dmDY";

/// BASE64URL(UTF8(`{"alg":"ES256"}`)) (RFC 7515 §5.1 steps 3-4).
const ES256_HEADER_B64U: &str = "eyJhbGciOiJFUzI1NiJ9";

/// A protected header holding only `alg` (RFC 7515 §4.1.1).
fn alg_header(alg: &str) -> Result<ProtectedHeader, Error> {
    let mut header = Header::new();
    header.alg = Some(alg.into());
    ProtectedHeader::new(header)
}

/// `hello`, signed compact with ES256 and the fixture P-256 key (RFC 7515 §7.1).
fn es256_token() -> Result<String, Error> {
    jws::sign_compact(
        &alg_header("ES256")?,
        b"hello",
        &fixture_jwk("p256"),
        &SignOptions::new(),
    )
}

/// The members of a JWS JSON Serialization (RFC 7515 §7.2).
fn json_members(text: &str) -> json::Object {
    json::parse(text.as_bytes())
        .ok()
        .and_then(Value::into_object)
        .expect("a JWS JSON Serialization is a JSON object")
}

#[test]
fn es256() -> Result<(), Error> {
    let private_key = fixture_jwk("p256");
    // docs:start sign-and-verify/es256
    // ES256: ECDSA with P-256 and SHA-256 (RFC 7518 §3.4).
    let mut header = Header::new();
    header.alg = Some("ES256".into());
    let protected = ProtectedHeader::new(header)?;

    let token = jws::sign_compact(&protected, b"hello", &private_key, &SignOptions::new())?;
    // docs:end sign-and-verify/es256
    let parts: Vec<&str> = token.split('.').collect();
    assert_eq!(parts.len(), 3, "header.payload.signature (RFC 7515 §7.1)");
    assert_eq!(parts[0], ES256_HEADER_B64U);
    assert_eq!(parts[1], b64url_encode(b"hello"));
    let allowed = [SigningAlg::ES256];
    let verified = jws::verify_compact(
        &token,
        &fixture_public_jwk("p256"),
        &VerifyOptions::new(&allowed)?,
    )?;
    assert_eq!(&verified.payload[..], b"hello");
    Ok(())
}

#[test]
fn ed25519() -> Result<(), Error> {
    let private_key = fixture_jwk("ed25519");
    let public_key = fixture_public_jwk("ed25519");
    // docs:start sign-and-verify/ed25519
    // Ed25519, the fully specified EdDSA algorithm (RFC 9864 §2.2; RFC 8037 §3.1).
    let mut header = Header::new();
    header.alg = Some("Ed25519".into());
    let protected = ProtectedHeader::new(header)?;
    let token = jws::sign_compact(&protected, b"hello", &private_key, &SignOptions::new())?;

    let allowed = [SigningAlg::Ed25519];
    let verified = jws::verify_compact(&token, &public_key, &VerifyOptions::new(&allowed)?)?;
    assert_eq!(verified.alg, SigningAlg::Ed25519);
    // docs:end sign-and-verify/ed25519
    assert_eq!(&verified.payload[..], b"hello");
    Ok(())
}

#[test]
fn eddsa() -> Result<(), Error> {
    let public_key = fixture_public_jwk("ed25519");
    let token = RFC8037_A4_JWS;
    // docs:start sign-and-verify/eddsa
    // `EdDSA` (RFC 8037 §3.1) is the older, polymorphic name; list it to accept such tokens.
    let allowed = [SigningAlg::EdDSA];
    let verified = jws::verify_compact(token, &public_key, &VerifyOptions::new(&allowed)?)?;

    assert_eq!(verified.alg, SigningAlg::EdDSA);
    // docs:end sign-and-verify/eddsa
    assert_eq!(&verified.payload[..], b"Example of Ed25519 signing");
    Ok(())
}

#[test]
fn hs256() -> Result<(), Error> {
    // docs:start sign-and-verify/hs256
    // A new HMAC key bound to HS256 (RFC 7518 §3.2): 32 random octets from the OS.
    let key = keys::generate_for(SigningAlg::HS256)?;

    let mut header = Header::new();
    header.alg = Some("HS256".into());
    let protected = ProtectedHeader::new(header)?;
    let token = jws::sign_compact(&protected, b"hello", &key, &SignOptions::new())?;

    let allowed = [SigningAlg::HS256];
    let verified = jws::verify_compact(&token, &key, &VerifyOptions::new(&allowed)?)?;
    // docs:end sign-and-verify/hs256
    assert_eq!(key.key_type(), KeyType::Oct);
    assert_eq!(key.alg().map(KeyAlg::as_str), Some("HS256"));
    let k = key.to_object();
    let k = k
        .get("k")
        .and_then(Value::as_str)
        .expect("an oct key has k");
    assert_eq!(b64url_decode(k)?.len(), 32, "the SHA-256 output size");
    assert_eq!(&verified.payload[..], b"hello");
    Ok(())
}

#[test]
fn not_allowed() -> Result<(), Error> {
    let token = es256_token()?;
    let public_key = fixture_public_jwk("p256");
    // docs:start sign-and-verify/not-allowed
    // The token is ES256; this verifier accepts only Ed25519 (RFC 8725 §3.1).
    let allowed = [SigningAlg::Ed25519];
    let result = jws::verify_compact(&token, &public_key, &VerifyOptions::new(&allowed)?);

    let err = result.expect_err("ES256 is not in the allow-list");
    assert_eq!(err.code(), "AlgorithmNotAllowed");
    // docs:end sign-and-verify/not-allowed
    assert_eq!(err, Error::AlgorithmNotAllowed);
    Ok(())
}

#[test]
fn tampered() -> Result<(), Error> {
    let token = es256_token()?;
    let public_key = fixture_public_jwk("p256");
    // docs:start sign-and-verify/tampered
    // Change the payload part: the signature no longer matches (RFC 7515 §5.2 step 8).
    let parts: Vec<&str> = token.split('.').collect();
    let forged = format!("{}.{}.{}", parts[0], b64url_encode(b"hellO"), parts[2]);

    let allowed = [SigningAlg::ES256];
    let result = jws::verify_compact(&forged, &public_key, &VerifyOptions::new(&allowed)?);
    let err = result.expect_err("the payload was changed");
    assert_eq!(err.code(), "InvalidSignature");
    // docs:end sign-and-verify/tampered
    assert_eq!(err, Error::InvalidSignature);
    Ok(())
}

#[test]
fn rs256() -> Result<(), Error> {
    let public_key = fixture_jwk("rsa-public");
    let token = RFC7515_A2_JWS;
    // docs:start sign-and-verify/rs256
    // RS256: RSASSA-PKCS1-v1_5 with SHA-256 (RFC 7518 §3.3), verified with an RSA public key.
    let allowed = [SigningAlg::RS256];
    let verified = jws::verify_compact(token, &public_key, &VerifyOptions::new(&allowed)?)?;

    assert_eq!(verified.alg, SigningAlg::RS256);
    // docs:end sign-and-verify/rs256
    assert_eq!(&verified.payload[..], RFC7515_A2_PAYLOAD.as_bytes());
    Ok(())
}

#[test]
fn flattened() -> Result<(), Error> {
    let private_key = fixture_jwk("p256");
    let public_key = fixture_public_jwk("p256");
    // docs:start sign-and-verify/flattened
    // The flattened JWS JSON Serialization: one signature (RFC 7515 §7.2.2).
    let mut header = Header::new();
    header.alg = Some("ES256".into());
    let signer = Signer::new(&private_key).protected(ProtectedHeader::new(header)?);
    let jws_json = jws::sign_flattened(&signer, b"hello", &SignOptions::new())?;

    let allowed = [SigningAlg::ES256];
    let verified = jws::verify_json(&jws_json, &public_key, &VerifyOptions::new(&allowed)?)?;
    // docs:end sign-and-verify/flattened
    let members = json_members(&jws_json);
    for name in ["protected", "payload", "signature"] {
        assert!(members.contains(name), "flattened JWS member {name}");
    }
    assert_eq!(verified.signature_index, 0);
    assert_eq!(&verified.payload[..], b"hello");
    Ok(())
}

#[test]
fn general() -> Result<(), Error> {
    let p256 = fixture_jwk("p256");
    let ed25519 = fixture_jwk("ed25519");
    let ed25519_public = fixture_public_jwk("ed25519");
    // docs:start sign-and-verify/general
    // The general JWS JSON Serialization: one payload, several signatures (RFC 7515 §7.2.1).
    let mut es256 = Header::new();
    es256.alg = Some("ES256".into());
    let mut ed = Header::new();
    ed.alg = Some("Ed25519".into());
    let signers = [
        Signer::new(&p256).protected(ProtectedHeader::new(es256)?),
        Signer::new(&ed25519).protected(ProtectedHeader::new(ed)?),
    ];
    let jws_json = jws::sign_general(&signers, b"hello", &SignOptions::new())?;

    // The Ed25519 verifier finds the signature it can check.
    let allowed = [SigningAlg::Ed25519];
    let verified = jws::verify_json(&jws_json, &ed25519_public, &VerifyOptions::new(&allowed)?)?;
    assert_eq!(verified.signature_index, 1);
    // docs:end sign-and-verify/general
    let members = json_members(&jws_json);
    let signatures = members.get("signatures").and_then(Value::as_array);
    assert_eq!(signatures.map(<[Value]>::len), Some(2));
    assert_eq!(verified.alg, SigningAlg::Ed25519);
    assert_eq!(&verified.payload[..], b"hello");
    Ok(())
}

#[test]
fn detached() -> Result<(), Error> {
    let private_key = fixture_jwk("p256");
    let public_key = fixture_public_jwk("p256");
    let protected = alg_header("ES256")?;
    // docs:start sign-and-verify/detached
    // Detached content: the payload travels separately (RFC 7515 Appendix F).
    let payload = b"hello";
    let options = SignOptions::new().detached(true);
    let token = jws::sign_compact(&protected, payload, &private_key, &options)?;

    let allowed = [SigningAlg::ES256];
    let options = VerifyOptions::new(&allowed)?.detached_payload(payload);
    let verified = jws::verify_compact(&token, &public_key, &options)?;
    // docs:end sign-and-verify/detached
    let parts: Vec<&str> = token.split('.').collect();
    assert_eq!(parts.len(), 3);
    assert_eq!(parts[1], "", "the payload part is empty: header..signature");
    assert_eq!(&verified.payload[..], payload);
    Ok(())
}

#[test]
fn unencoded() -> Result<(), Error> {
    let key = fixture_jwk("hmac");
    // docs:start sign-and-verify/unencoded
    // `b64: false` signs the payload as is, not base64url-encoded (RFC 7797 §3). It must be
    // listed in `crit` (RFC 7797 §6), and this payload is detached (RFC 7797 §5.2).
    let mut header = Header::new();
    header.alg = Some("HS256".into());
    header.b64 = Some(false);
    header.crit = Some(vec!["b64".into()]);
    let protected = ProtectedHeader::new(header)?;
    let token = jws::sign_compact(
        &protected,
        b"$.02",
        &key,
        &SignOptions::new().detached(true),
    )?;

    let allowed = [SigningAlg::HS256];
    let options = VerifyOptions::new(&allowed)?.detached_payload(b"$.02");
    let verified = jws::verify_compact(&token, &key, &options)?;
    // docs:end sign-and-verify/unencoded
    assert_eq!(
        token.split('.').nth(1),
        Some(""),
        "the payload part is empty"
    );
    assert_eq!(&verified.payload[..], b"$.02");
    // The RFC 7797 §4.2 example verifies the same way.
    let rfc = jws::verify_compact(RFC7797_42_JWS, &key, &options)?;
    assert_eq!(&rfc.payload[..], b"$.02");
    assert_eq!(rfc.protected.and_then(|h| h.b64), Some(false));
    Ok(())
}

#[test]
fn read_header() -> Result<(), Error> {
    let private_key = fixture_jwk("p256");
    let public_key = fixture_public_jwk("p256");
    // docs:start sign-and-verify/read-header
    let mut header = Header::new();
    header.alg = Some("ES256".into());
    header.kid = Some("key-1".into());
    let protected = ProtectedHeader::new(header)?;
    let token = jws::sign_compact(&protected, b"hello", &private_key, &SignOptions::new())?;

    let allowed = [SigningAlg::ES256];
    let verified = jws::verify_compact(&token, &public_key, &VerifyOptions::new(&allowed)?)?;
    // Read `kid` from the protected header, which the signature covers (RFC 7515 §4.1.4).
    let kid = verified.protected.as_ref().and_then(|h| h.kid.as_deref());
    // docs:end sign-and-verify/read-header
    assert_eq!(kid, Some("key-1"));
    Ok(())
}
