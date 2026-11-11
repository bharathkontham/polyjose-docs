//! The samples of the Encrypt and decrypt guide.
//!
//! JWE (RFC 7516) in the Compact (§7.1) and JSON (§7.2) Serializations, with the key management
//! modes of RFC 7518 §4 (ECDH-ES on P-256 and X25519, RFC 8037 §3.2; `dir`; AES Key Wrap;
//! RSA-OAEP-256; PBES2) and AES-GCM content encryption (RFC 7518 §5.3). Every decrypt takes an
//! allow-list of `alg` and `enc` values (RFC 8725 §3.1).
//!
//! Encryption is randomized, so each test decrypts what it encrypts and checks the plaintext and
//! the headers. Generated keys are checked by shape, never by value.

use polyjose::Error;
use polyjose::header::Header;
use polyjose::json::{self, Object, Value};
use polyjose::jwa::{ContentEncAlg, KeyMgmtAlg};
use polyjose::jwe::{self, DecryptPolicy, Encryptor, JsonForm, Recipient};
use polyjose::jwk::{EcCurve, Jwk, OkpCurve};
use polyjose::keys::{self, KeySpec};
use polyjose::util::{b64url_decode, b64url_encode};
use polyjose_samples::fixture_jwk;

const PLAINTEXT: &[u8] = b"The true sign of intelligence is not knowledge but imagination.";

/// The JWE Protected Header of a compact JWE, its first part (RFC 7516 §7.1).
fn protected_header(token: &str) -> Result<Header, Error> {
    let first = token.split('.').next().unwrap_or_default();
    Header::from_json(&b64url_decode(first)?)
}

/// The public half of a generated key pair (RFC 7517 §4, RFC 7518 §6.2.1, RFC 8037 §2).
fn public_of(key: &Jwk) -> Jwk {
    key.to_public().expect("EC and OKP keys have a public half")
}

/// `PLAINTEXT` encrypted compact with A256KW and A256GCM to `key`.
fn a256kw_token(key: &Jwk) -> Result<String, Error> {
    Encryptor::new(ContentEncAlg::A256GCM)
        .recipient(Recipient::new(KeyMgmtAlg::A256KW, key))
        .encrypt_compact(PLAINTEXT)
}

#[test]
fn ecdh_p256() -> Result<(), Error> {
    // docs:start encrypt-and-decrypt/ecdh-p256
    // The recipient's key pair. The sender needs only its public half.
    let recipient = keys::generate(KeySpec::Ec(EcCurve::P256))?;
    let recipient_public = recipient.to_public().expect("an EC key has a public half");

    // ECDH-ES+A256KW (RFC 7518 §4.6) wraps a fresh A256GCM key (RFC 7518 §5.3).
    let token = Encryptor::new(ContentEncAlg::A256GCM)
        .recipient(Recipient::new(KeyMgmtAlg::EcdhEsA256KW, &recipient_public))
        .encrypt_compact(PLAINTEXT)?;

    let policy = DecryptPolicy::new(&[KeyMgmtAlg::EcdhEsA256KW], &[ContentEncAlg::A256GCM])?;
    let decrypted = jwe::decrypt_compact(&token, &recipient, &policy)?;
    assert_eq!(decrypted.plaintext(), PLAINTEXT);
    // docs:end encrypt-and-decrypt/ecdh-p256
    assert_eq!(token.split('.').count(), 5, "RFC 7516 §7.1: five parts");
    let header = decrypted.protected_header().expect("compact JWEs have one");
    assert_eq!(header.alg.as_deref(), Some("ECDH-ES+A256KW"));
    assert_eq!(header.enc, Some(ContentEncAlg::A256GCM));
    assert!(
        header.epk.is_some(),
        "the ephemeral public key (RFC 7518 §4.6.1.1)"
    );
    Ok(())
}

#[test]
fn ecdh_x25519() -> Result<(), Error> {
    // docs:start encrypt-and-decrypt/ecdh-x25519
    // ECDH-ES over X25519 (RFC 8037 §3.2).
    let recipient = keys::generate(KeySpec::Okp(OkpCurve::X25519))?;
    let recipient_public = recipient.to_public().expect("an OKP key has a public half");

    let token = Encryptor::new(ContentEncAlg::A256GCM)
        .recipient(Recipient::new(KeyMgmtAlg::EcdhEsA256KW, &recipient_public))
        .encrypt_compact(PLAINTEXT)?;

    let policy = DecryptPolicy::new(&[KeyMgmtAlg::EcdhEsA256KW], &[ContentEncAlg::A256GCM])?;
    let decrypted = jwe::decrypt_compact(&token, &recipient, &policy)?;
    // docs:end encrypt-and-decrypt/ecdh-x25519
    assert_eq!(decrypted.plaintext(), PLAINTEXT);
    let epk = decrypted.protected_header().and_then(|h| h.epk.as_ref());
    let crv = epk.and_then(|epk| epk.get("crv")).and_then(Value::as_str);
    assert_eq!(crv, Some("X25519"));
    Ok(())
}

#[test]
fn dir() -> Result<(), Error> {
    // docs:start encrypt-and-decrypt/dir
    // `dir`: the shared key is the content encryption key itself (RFC 7518 §4.5).
    let key = keys::generate_for(ContentEncAlg::A256GCM)?;

    let token = Encryptor::new(ContentEncAlg::A256GCM)
        .recipient(Recipient::new(KeyMgmtAlg::Dir, &key))
        .encrypt_compact(PLAINTEXT)?;

    let policy = DecryptPolicy::new(&[KeyMgmtAlg::Dir], &[ContentEncAlg::A256GCM])?;
    let decrypted = jwe::decrypt_compact(&token, &key, &policy)?;
    // docs:end encrypt-and-decrypt/dir
    let parts: Vec<&str> = token.split('.').collect();
    assert_eq!(parts.len(), 5);
    assert_eq!(
        parts[1], "",
        "no JWE Encrypted Key with dir (RFC 7516 §5.1 step 5)"
    );
    assert_eq!(decrypted.plaintext(), PLAINTEXT);
    Ok(())
}

#[test]
fn a256kw() -> Result<(), Error> {
    // docs:start encrypt-and-decrypt/a256kw
    // AES Key Wrap with a 256-bit key (RFC 7518 §4.4).
    let key = keys::generate_for(KeyMgmtAlg::A256KW)?;

    let token = Encryptor::new(ContentEncAlg::A256GCM)
        .recipient(Recipient::new(KeyMgmtAlg::A256KW, &key))
        .encrypt_compact(PLAINTEXT)?;

    let policy = DecryptPolicy::new(&[KeyMgmtAlg::A256KW], &[ContentEncAlg::A256GCM])?;
    let decrypted = jwe::decrypt_compact(&token, &key, &policy)?;
    // docs:end encrypt-and-decrypt/a256kw
    assert_eq!(decrypted.plaintext(), PLAINTEXT);
    assert_eq!(
        b64url_decode(token.split('.').nth(1).unwrap_or_default())?.len(),
        40,
        "a wrapped 256-bit key is 40 octets (RFC 3394 §2.2.1)"
    );
    Ok(())
}

#[test]
fn rsa_oaep_256() -> Result<(), Error> {
    let rsa_public = fixture_jwk("rsa-public");
    let rsa_private = fixture_jwk("rsa-private");
    // docs:start encrypt-and-decrypt/rsa-oaep-256
    // RSA-OAEP-256 (RFC 7518 §4.3): the sender encrypts to the recipient's RSA public key.
    let token = Encryptor::new(ContentEncAlg::A256GCM)
        .recipient(Recipient::new(KeyMgmtAlg::RsaOaep256, &rsa_public))
        .encrypt_compact(PLAINTEXT)?;

    // The recipient decrypts with its RSA private key.
    let policy = DecryptPolicy::new(&[KeyMgmtAlg::RsaOaep256], &[ContentEncAlg::A256GCM])?;
    let decrypted = jwe::decrypt_compact(&token, &rsa_private, &policy)?;
    // docs:end encrypt-and-decrypt/rsa-oaep-256
    assert_eq!(decrypted.plaintext(), PLAINTEXT);
    // A changed Encrypted Key fails like every other decryption failure (RFC 7516 §11.5).
    let mut parts: Vec<String> = token.split('.').map(str::to_owned).collect();
    let mut encrypted_key = b64url_decode(&parts[1])?;
    encrypted_key[10] ^= 1;
    parts[1] = b64url_encode(&encrypted_key);
    assert_eq!(
        jwe::decrypt_compact(&parts.join("."), &rsa_private, &policy).err(),
        Some(Error::DecryptionFailed)
    );
    // The public key can't decrypt.
    assert_eq!(
        jwe::decrypt_compact(&token, &rsa_public, &policy).err(),
        Some(Error::KeyAlgorithmMismatch)
    );
    let parts: Vec<&str> = token.split('.').collect();
    assert_eq!(parts.len(), 5);
    let header = protected_header(&token)?;
    assert_eq!(header.alg.as_deref(), Some("RSA-OAEP-256"));
    assert_eq!(header.enc, Some(ContentEncAlg::A256GCM));
    assert_eq!(
        b64url_decode(parts[1])?.len(),
        256,
        "the encrypted key is the size of the 2048-bit modulus (RFC 8017 §7.1.1)"
    );
    Ok(())
}

/// Stands in for a password the user enters: the random bytes of a generated `oct` key, so no
/// password is written in source.
fn example_password() -> Result<Vec<u8>, Error> {
    let key = keys::generate(KeySpec::Oct { bytes: 24 })?;
    let k = key
        .to_object()
        .get("k")
        .and_then(|k| k.as_str())
        .map(str::to_owned)
        .expect("an oct JWK has k");
    b64url_decode(&k)
}

#[test]
fn pbes2() -> Result<(), Error> {
    let password_bytes = example_password()?;
    // docs:start encrypt-and-decrypt/pbes2
    // `password_bytes` holds the password as the user entered it: never a literal in source code.
    // A password is an `oct` key whose `k` is the password's octets (RFC 7518 §4.8).
    let mut password = Object::new();
    password.insert("kty", "oct");
    password.insert("k", b64url_encode(&password_bytes));
    let password = Jwk::from_object(&password)?;

    let token = Encryptor::new(ContentEncAlg::A256GCM)
        .recipient(Recipient::new(KeyMgmtAlg::Pbes2Hs256A128KW, &password))
        .encrypt_compact(PLAINTEXT)?;

    let policy = DecryptPolicy::new(&[KeyMgmtAlg::Pbes2Hs256A128KW], &[ContentEncAlg::A256GCM])?;
    let decrypted = jwe::decrypt_compact(&token, &password, &policy)?;
    // docs:end encrypt-and-decrypt/pbes2
    let header = decrypted.protected_header().expect("compact JWEs have one");
    assert_eq!(
        header.p2c,
        Some(10_000),
        "the default iteration count (RFC 7518 §4.8.1.2)"
    );
    assert!(header.p2s.is_some(), "the salt input (RFC 7518 §4.8.1.1)");
    assert_eq!(decrypted.plaintext(), PLAINTEXT);
    Ok(())
}

#[test]
fn pbes2_limit() -> Result<(), Error> {
    let mut password = Object::new();
    password.insert("kty", "oct");
    password.insert("k", b64url_encode(&example_password()?));
    let password = Jwk::from_object(&password)?;
    // docs:start encrypt-and-decrypt/pbes2-limit
    // A `p2c` above the decrypting side's limit (10,000 by default) is refused (RFC 7518 §4.8.1.2,
    // RFC 8725 §3.1).
    let token = Encryptor::new(ContentEncAlg::A256GCM)
        .recipient(Recipient::new(KeyMgmtAlg::Pbes2Hs256A128KW, &password).p2c(20_000))
        .encrypt_compact(PLAINTEXT)?;

    let policy = DecryptPolicy::new(&[KeyMgmtAlg::Pbes2Hs256A128KW], &[ContentEncAlg::A256GCM])?;
    let refused = jwe::decrypt_compact(&token, &password, &policy);
    assert_eq!(
        refused.expect_err("p2c is over the limit").code(),
        "DecryptionFailed"
    );

    let decrypted = jwe::decrypt_compact(&token, &password, &policy.max_pbes2_count(20_000))?;
    // docs:end encrypt-and-decrypt/pbes2-limit
    assert_eq!(decrypted.plaintext(), PLAINTEXT);
    assert_eq!(protected_header(&token)?.p2c, Some(20_000));
    Ok(())
}

#[test]
fn json() -> Result<(), Error> {
    let kw_key = keys::generate_for(KeyMgmtAlg::A256KW)?;
    let ec_key = keys::generate(KeySpec::Ec(EcCurve::P256))?;
    let ec_public = public_of(&ec_key);
    // docs:start encrypt-and-decrypt/json
    // One message for two recipients, with additional authenticated data (RFC 7516 §7.2.1).
    let jwe_json = Encryptor::new(ContentEncAlg::A256GCM)
        .aad(b"order-42".to_vec())
        .recipient(Recipient::new(KeyMgmtAlg::A256KW, &kw_key))
        .recipient(Recipient::new(KeyMgmtAlg::EcdhEsA256KW, &ec_public))
        .encrypt_json(PLAINTEXT, JsonForm::General)?;

    // The EC recipient decrypts with its private key.
    let policy = DecryptPolicy::new(&[KeyMgmtAlg::EcdhEsA256KW], &[ContentEncAlg::A256GCM])?;
    let decrypted = jwe::decrypt_json(&jwe_json, &ec_key, &policy)?;
    assert_eq!(decrypted.recipient(), 1);
    assert_eq!(decrypted.aad(), Some(&b"order-42"[..]));
    // docs:end encrypt-and-decrypt/json
    let members = json::parse(jwe_json.as_bytes())?
        .into_object()
        .expect("an object");
    let recipients = members.get("recipients").and_then(Value::as_array);
    assert_eq!(recipients.map(<[Value]>::len), Some(2));
    assert_eq!(decrypted.plaintext(), PLAINTEXT);
    Ok(())
}

#[test]
fn zip() -> Result<(), Error> {
    let key = keys::generate_for(KeyMgmtAlg::A256KW)?;
    // docs:start encrypt-and-decrypt/zip
    // `zip: DEF` deflates the plaintext before encrypting it (RFC 7516 §4.1.3). Compression can
    // reveal information about the plaintext (RFC 8725 §3.6): use it only for data an attacker
    // cannot influence.
    let token = Encryptor::new(ContentEncAlg::A256GCM)
        .compress()
        .recipient(Recipient::new(KeyMgmtAlg::A256KW, &key))
        .encrypt_compact(PLAINTEXT)?;

    let policy = DecryptPolicy::new(&[KeyMgmtAlg::A256KW], &[ContentEncAlg::A256GCM])?;
    let decrypted = jwe::decrypt_compact(&token, &key, &policy)?;
    assert_eq!(decrypted.plaintext(), PLAINTEXT);
    // docs:end encrypt-and-decrypt/zip
    let zip = decrypted.protected_header().and_then(|h| h.zip.as_deref());
    assert_eq!(zip, Some("DEF"));
    assert_eq!(protected_header(&token)?.zip.as_deref(), Some("DEF"));
    Ok(())
}

#[test]
fn decryption_failed() -> Result<(), Error> {
    let token = a256kw_token(&keys::generate_for(KeyMgmtAlg::A256KW)?)?;
    // docs:start encrypt-and-decrypt/decryption-failed
    // The wrong key: every failure after key management starts is one error (RFC 7516 §11.5).
    let wrong_key = keys::generate_for(KeyMgmtAlg::A256KW)?;
    let policy = DecryptPolicy::new(&[KeyMgmtAlg::A256KW], &[ContentEncAlg::A256GCM])?;
    let result = jwe::decrypt_compact(&token, &wrong_key, &policy);

    let err = result.expect_err("another key cannot unwrap it");
    assert_eq!(err.code(), "DecryptionFailed");
    // docs:end encrypt-and-decrypt/decryption-failed
    assert_eq!(err, Error::DecryptionFailed);
    Ok(())
}
