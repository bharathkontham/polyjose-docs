//! The samples of the Manage keys guide.
//!
//! Generating keys (RFC 7518 §6, RFC 8037 §2), public halves (RFC 7517 §4), PEM (RFC 7468) and
//! DER import and export as PKCS#8 (RFC 5958), SubjectPublicKeyInfo (RFC 5280 §4.1.2.7),
//! SEC1 ECPrivateKey (RFC 5915) and PKCS#1 (RFC 8017 Appendix A.1), RSA private keys
//! (RFC 7518 §6.3.2), and JWK Thumbprints (RFC 7638, RFC 9278).
//!
//! The fixed keys are the RFC example keys of `samples/fixtures/keys.json`. Generated keys are
//! checked by shape (`kty`, `crv`, which members are present), never by value.

use polyjose::Error;
use polyjose::json::Value;
use polyjose::jwa::SigningAlg;
use polyjose::jwk::{EcCurve, Jwk, KeyAlg, KeyMaterial, OkpCurve};
use polyjose::keys::{self, KeyFormat, KeySpec};
use polyjose::util::b64url_decode;
use polyjose_samples::fixture_jwk;

/// RFC 7638 §3.1: the RSA key whose thumbprint the RFC computes.
const RFC7638_KEY: &str = r#"{"kty":"RSA","n":"0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw","e":"AQAB","alg":"RS256","kid":"2011-04-29"}"#;

/// RFC 7638 §3.1: its SHA-256 thumbprint.
const RFC7638_THUMBPRINT: &str = "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs";

/// RFC 9278 §6: the thumbprint URI of the same key.
const RFC9278_URI: &str =
    "urn:ietf:params:oauth:jwk-thumbprint:sha-256:NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs";

/// RFC 7515 Appendix A.2.1: the private exponent `d` of the fixture RSA key.
const RFC7515_A2_D: &str = "Eq5xpGnNCivDflJsRQBXHx1hdR1k6Ulwe2JZD50LpXyWPEAeP88vLNO97IjlA7_GQ5sLKMgvfTeXZx9SE-7YwVol2NXOoAJe46sui395IW_GO-pWJ1O0BkTGoVEn2bKVRUCgu-GjBVaYLU6f3l9kJfFNS3E0QbVdxzubSu3Mkqzjkn439X0M_V51gfpRLI9JYanrC4D4qAdGcopV_0ZHHzQlBjudU2QvXt4ehNYTCBr6XCLQUShb1juUO1ZdiYoFaFQT5Tw8bGUl_x_jTj3ccPDVZFD9pIuhLhBOneufuBiB4cS98l2SR_RQyGWSeWjnczT0QU91p1DhOVRuOopznQ";

/// The string member `name` of `jwk`'s JSON form (RFC 7517 §4), if present.
fn member(jwk: &Jwk, name: &str) -> Option<String> {
    jwk.to_object()
        .get(name)
        .and_then(Value::as_str)
        .map(str::to_owned)
}

#[test]
fn generate() -> Result<(), Error> {
    // docs:start manage-keys/generate
    // Every key comes from the operating system's random number generator.
    let oct = keys::generate(KeySpec::Oct { bytes: 32 })?;
    let p256 = keys::generate(KeySpec::Ec(EcCurve::P256))?;
    let p384 = keys::generate(KeySpec::Ec(EcCurve::P384))?;
    let p521 = keys::generate(KeySpec::Ec(EcCurve::P521))?;
    let secp256k1 = keys::generate(KeySpec::Ec(EcCurve::Secp256k1))?;
    let ed25519 = keys::generate(KeySpec::Okp(OkpCurve::Ed25519))?;
    let x25519 = keys::generate(KeySpec::Okp(OkpCurve::X25519))?;
    // docs:end manage-keys/generate
    let k = member(&oct, "k").expect("an oct key has k (RFC 7518 §6.4.1)");
    assert_eq!(member(&oct, "kty").as_deref(), Some("oct"));
    assert_eq!(b64url_decode(&k)?.len(), 32);
    let pairs = [
        (&p256, "EC", "P-256"),
        (&p384, "EC", "P-384"),
        (&p521, "EC", "P-521"),
        (&secp256k1, "EC", "secp256k1"),
        (&ed25519, "OKP", "Ed25519"),
        (&x25519, "OKP", "X25519"),
    ];
    for (key, kty, crv) in pairs {
        assert_eq!(member(key, "kty").as_deref(), Some(kty), "{crv}");
        assert_eq!(member(key, "crv").as_deref(), Some(crv));
        assert!(member(key, "d").is_some(), "{crv}: a private key has d");
        assert!(!key.is_public());
        assert!(key.alg().is_none(), "generate binds no alg (RFC 8725 §3.1)");
    }
    Ok(())
}

#[test]
fn generate_for_alg() -> Result<(), Error> {
    // docs:start manage-keys/generate-for-alg
    // A key for one algorithm, with that `alg` set on it (RFC 7517 §4.4).
    let key = keys::generate_for(SigningAlg::ES256)?;
    // docs:end manage-keys/generate-for-alg
    assert_eq!(key.alg().map(KeyAlg::as_str), Some("ES256"));
    assert_eq!(member(&key, "kty").as_deref(), Some("EC"));
    assert_eq!(member(&key, "crv").as_deref(), Some("P-256"));
    Ok(())
}

#[test]
fn to_public() -> Result<(), Error> {
    let private_key = fixture_jwk("p256");
    // docs:start manage-keys/to-public
    // The public half drops the private member `d` (RFC 7518 §6.2.1).
    let public_key = private_key
        .to_public()
        .expect("an EC key has a public half");
    assert!(public_key.is_public());
    // docs:end manage-keys/to-public
    assert_eq!(member(&public_key, "d"), None);
    assert_eq!(member(&public_key, "x"), member(&private_key, "x"));
    assert_eq!(member(&public_key, "y"), member(&private_key, "y"));
    Ok(())
}

#[test]
fn pem() -> Result<(), Error> {
    let private_key = fixture_jwk("p256");
    // docs:start manage-keys/pem
    // PKCS#8 (RFC 5958) for the private key, SubjectPublicKeyInfo for the public one,
    // each as PEM (RFC 7468 §10, §13).
    let pem = private_key.to_pem(KeyFormat::Pkcs8)?;
    let back = Jwk::from_pem(&pem)?;
    let public_pem = private_key.to_pem(KeyFormat::Spki)?;
    // docs:end manage-keys/pem
    assert!(pem.starts_with("-----BEGIN PRIVATE KEY-----\n"));
    assert!(public_pem.starts_with("-----BEGIN PUBLIC KEY-----\n"));
    assert_eq!(member(&back, "d"), member(&private_key, "d"));
    assert_eq!(member(&back, "x"), member(&private_key, "x"));
    assert!(back.alg().is_none(), "PEM carries no JWK alg");
    assert!(Jwk::from_pem(&public_pem)?.is_public());
    Ok(())
}

#[test]
fn der() -> Result<(), Error> {
    let private_key = fixture_jwk("p256");
    // docs:start manage-keys/der
    // DER needs its format named: here SEC1 ECPrivateKey (RFC 5915 §3).
    let der = private_key.to_der(KeyFormat::Sec1)?;
    let back = Jwk::from_der(&der, KeyFormat::Sec1)?;
    // docs:end manage-keys/der
    assert_eq!(member(&back, "d"), member(&private_key, "d"));
    assert_eq!(der.first(), Some(&0x30), "a DER SEQUENCE (X.690 §8.9)");
    Ok(())
}

#[test]
fn rsa_public() -> Result<(), Error> {
    let rsa = fixture_jwk("rsa-public");
    // docs:start manage-keys/rsa-public
    // PKCS#1 RSAPublicKey (RFC 8017 Appendix A.1.1) as PEM.
    let pem = rsa.to_pem(KeyFormat::Pkcs1)?;
    let from_pem = Jwk::from_pem(&pem)?;

    // SubjectPublicKeyInfo (RFC 5280 §4.1.2.7) as DER.
    let der = rsa.to_der(KeyFormat::Spki)?;
    let from_der = Jwk::from_der(&der, KeyFormat::Spki)?;
    // docs:end manage-keys/rsa-public
    assert!(pem.starts_with("-----BEGIN RSA PUBLIC KEY-----\n"));
    assert_eq!(member(&from_pem, "n"), member(&rsa, "n"));
    assert_eq!(member(&from_der, "n"), member(&rsa, "n"));
    assert_eq!(member(&from_der, "e").as_deref(), Some("AQAB"));
    Ok(())
}

#[test]
fn rsa_private() -> Result<(), Error> {
    let rsa_private = fixture_jwk("rsa-private");
    // docs:start manage-keys/rsa-private
    // An RSA private key (RFC 7518 §6.3.2) as PKCS#8 (RFC 5958) PEM. `Jwk::from_pem` also reads
    // PKCS#1 `RSA PRIVATE KEY` blocks (RFC 8017 Appendix A.1.2).
    let pem = rsa_private.to_pem(KeyFormat::Pkcs8)?;
    let imported = Jwk::from_pem(&pem)?;

    // Publish only the public half: `n` and `e`.
    let public_key = imported.to_public().expect("an RSA key has a public half");
    assert!(public_key.is_public());
    // docs:end manage-keys/rsa-private
    assert!(pem.starts_with("-----BEGIN PRIVATE KEY-----\n"));
    let KeyMaterial::Rsa(rsa) = imported.material() else {
        panic!("an RSA key");
    };
    assert!(rsa.is_private());
    for name in ["n", "e", "d", "p", "q", "dp", "dq", "qi"] {
        assert_eq!(
            member(&imported, name),
            member(&rsa_private, name),
            "{name}"
        );
    }
    assert_eq!(member(&public_key, "n"), member(&rsa_private, "n"));
    for name in ["d", "p", "q", "dp", "dq", "qi"] {
        assert_eq!(member(&public_key, name), None, "{name}");
    }
    let der = rsa_private.to_der(KeyFormat::Pkcs8)?;
    let from_der = Jwk::from_der(&der, KeyFormat::Pkcs8)?;
    assert_eq!(member(&from_der, "qi"), member(&rsa_private, "qi"));
    // PKCS#1 export writes only an RSAPublicKey (RFC 8017 Appendix A.1.1), so a private key is
    // refused rather than silently reduced to its public half: call to_public first.
    assert_eq!(
        rsa_private.to_pem(KeyFormat::Pkcs1).err().map(|e| e.code()),
        Some("InvalidKey")
    );
    assert_eq!(
        rsa_private.to_der(KeyFormat::Pkcs1).err().map(|e| e.code()),
        Some("InvalidKey")
    );
    assert!(
        public_key
            .to_pem(KeyFormat::Pkcs1)?
            .starts_with("-----BEGIN RSA PUBLIC KEY-----\n")
    );
    // RFC 7518 §6.3.2: producers SHOULD include the CRT members, and polyjose requires them.
    let mut exponent_only = fixture_jwk("rsa-public").to_object();
    exponent_only.insert("d", RFC7515_A2_D);
    assert_eq!(
        Jwk::from_object(&exponent_only).err().map(|e| e.code()),
        Some("InvalidKey")
    );
    Ok(())
}

#[test]
fn thumbprint() -> Result<(), Error> {
    // docs:start manage-keys/thumbprint
    // The SHA-256 JWK Thumbprint (RFC 7638 §3) and its URI (RFC 9278 §3).
    let key = Jwk::from_json(RFC7638_KEY.as_bytes())?;
    let thumbprint = key.thumbprint_sha256();
    let uri = key.thumbprint_uri_sha256();
    // docs:end manage-keys/thumbprint
    assert_eq!(thumbprint, RFC7638_THUMBPRINT);
    assert_eq!(uri, RFC9278_URI);
    Ok(())
}

#[test]
fn wipe() -> Result<(), Error> {
    let private_key = fixture_jwk("p256");
    // docs:start manage-keys/wipe
    // Exported private keys come in a `Zeroizing<Vec<u8>>`, which wipes its bytes when dropped.
    let der = private_key.to_der(KeyFormat::Pkcs8)?;
    let length = der.len();
    // ... store or send `der` ...
    drop(der);
    // docs:end manage-keys/wipe
    assert_eq!(
        length, 138,
        "PKCS#8 v1 of a P-256 key with its public key (RFC 5958 §2)"
    );
    let der = private_key.to_der(KeyFormat::Pkcs8)?;
    assert!(
        std::any::type_name_of_val(&der).contains("Zeroizing"),
        "the export is a Zeroizing buffer"
    );
    Ok(())
}
