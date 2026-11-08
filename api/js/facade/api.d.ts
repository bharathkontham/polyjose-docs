/**
 * The polyjose JavaScript API, shared unchanged by
 * `@polyjose/node` and `@polyjose/wasm`. Each package's entry binds it to its native layer:
 *
 * ```ts
 * export const { version, errorCodes, jwsVerifyCompact, ... } = createApi(backend);
 * export { PolyjoseError, ERROR_CODES } from "./api.js";
 * ```
 *
 * The facade adds idiom only: Promises, object↔JSON, JS type checks
 * (`TypeError`), `null` → `undefined`, the JS clock for JWT `now`, and `PolyjoseError`.
 * Policy, defaults and every JOSE check stay in the core.
 */
import type { Backend } from "./backend.js";
import { type ErrorCode } from "./error-codes.js";
import type { EcCurve, JsonInput, JweDecrypted, JweDecryptOptions, JweEncryptOptions, JweJsonForm, Jwk, JwkObject, JwkSelector, JwkSet, JwsSigner, JwsSignOptions, JwsVerified, JwsVerifyOptions, JwtNestedVerified, JwtSignOptions, JwtVerified, JwtVerifyOptions, KeyFormat, OkpCurve, ThumbprintHash } from "./types.js";
export type * from "./types.js";
export type { Backend } from "./backend.js";
export { ERROR_CODES, type ErrorCode } from "./error-codes.js";
/**
 * A polyjose failure. `code` is one of {@link ERROR_CODES}, the core's stable
 * `Error::code()`: match on it, never on `message`, which may be reworded. Neither
 * ever contains key material or input bytes.
 */
export declare class PolyjoseError extends Error {
    readonly name = "PolyjoseError";
    /** The stable error code. */
    readonly code: ErrorCode;
    constructor(code: ErrorCode, message: string);
}
/** Every operation of the JavaScript API, each returning a Promise. */
export interface PolyjoseApi {
    /** The polyjose crate version. */
    version(): Promise<string>;
    /** The stable error codes, equal to the core's `Error::CODES`. */
    errorCodes(): Promise<string[]>;
    /** base64url without padding (RFC 4648 §5, RFC 7515 §2). */
    base64urlEncode(bytes: Uint8Array): Promise<string>;
    /** Strict, canonical base64url decoding (RFC 4648 §5, §3.5). */
    base64urlDecode(text: string): Promise<Uint8Array>;
    /** Validates a JWK (RFC 7517 §4, RFC 7518 §6, RFC 8037 §2) and returns the core's serialization. */
    jwkParse(jwk: Jwk): Promise<JwkObject>;
    /** The public half of a JWK (RFC 7517 §4, RFC 7518 §6.2.1, §6.3.1). */
    jwkToPublic(jwk: Jwk): Promise<JwkObject>;
    /**
     * The JWK Thumbprint (RFC 7638 §3, §3.4), base64url: 43, 64 or 86 characters for SHA-256,
     * SHA-384 or SHA-512. An absent `hash` (or `null`) is the core default, SHA-256
     * (RFC 9278 §5). Any other name fails with `UnsupportedAlgorithm` from the core, after the key's
     * own import errors. Never publish the thumbprint of a password or other
     * low-entropy `oct` key, or use it as a `kid`: it is an unsalted fast hash of the secret
     * (RFC 7638 §7).
     */
    jwkThumbprint(jwk: Jwk, hash?: ThumbprintHash): Promise<string>;
    /**
     * The JWK Thumbprint URI (RFC 9278 §3), `urn:ietf:params:oauth:jwk-thumbprint:<name>:<thumbprint>`,
     * always with the IANA hash name (`sha-256`, `sha-384`, `sha-512`; RFC 9278 §4). `hash` is as
     * for `jwkThumbprint`.
     */
    jwkThumbprintUri(jwk: Jwk, hash?: ThumbprintHash): Promise<string>;
    /**
     * The one key of a JWK Set (RFC 7517 §5) that `selector` picks by `kid`, `alg` and `keyUse`,
     * under the core rule (`JwkSet::select`). An absent selector (or `{}`) matches
     * every member. No match rejects with `NoMatchingKey`, two or more with `MultipleMatchingKeys`
     * (RFC 7517 §5.1 gives a set's order no meaning); an `alg` or `keyUse` the core refuses with
     * `UnsupportedAlgorithm`, after the set's own import errors.
     *
     * The key may be private (`d`, `k`): call `jwkToPublic` before publishing it. Selection never
     * authorizes an algorithm, so pass the key only to an operation with an allow-list, and pair a
     * `kid` from an untrusted header with `alg`. A server maps `NoMatchingKey` and
     * `MultipleMatchingKeys` to one opaque client error, such as `invalid_token` (RFC 6750 §3.1).
     */
    jwksSelect(jwks: JwkSet, selector?: JwkSelector): Promise<JwkObject>;
    /** A random `oct` key of `lenBytes` octets (RFC 7518 §6.4), from the OS CSPRNG. */
    jwkGenerateOct(lenBytes: number): Promise<JwkObject>;
    /** A random EC private key (RFC 7518 §6.2). */
    jwkGenerateEc(crv: EcCurve): Promise<JwkObject>;
    /** A random OKP private key (RFC 8037 §2). */
    jwkGenerateOkp(crv: OkpCurve): Promise<JwkObject>;
    /** A random key for a JWS `alg`, JWE `alg` or `enc` (RFC 7518 §7.1 registry), with `alg` set. */
    jwkGenerateForAlg(alg: string): Promise<JwkObject>;
    /** Imports one RFC 7468 PEM block. */
    jwkFromPem(pem: string): Promise<JwkObject>;
    /** Imports DER in the structure `format` names; no sniffing. */
    jwkFromDer(der: Uint8Array, format: KeyFormat): Promise<JwkObject>;
    /** Exports a JWK as PEM (RFC 7468). */
    jwkToPem(jwk: Jwk, format: KeyFormat): Promise<string>;
    /** Exports a JWK as DER. */
    jwkToDer(jwk: Jwk, format: KeyFormat): Promise<Uint8Array>;
    /** Signs in the JWS Compact Serialization (RFC 7515 §5.1, §7.1). */
    jwsSignCompact(payload: Uint8Array, key: Jwk, options: JwsSignOptions): Promise<string>;
    /** Signs in the flattened JWS JSON Serialization (RFC 7515 §7.2.2); returns JSON text. */
    jwsSignFlattened(payload: Uint8Array, signer: JwsSigner, detached?: boolean): Promise<string>;
    /** Signs in the general JWS JSON Serialization (RFC 7515 §7.2.1); returns JSON text. */
    jwsSignGeneral(payload: Uint8Array, signers: readonly JwsSigner[], detached?: boolean): Promise<string>;
    /** Verifies a compact JWS against an explicit allow-list (RFC 7515 §5.2, RFC 8725 §3.1). */
    jwsVerifyCompact(token: string, key: Jwk, options: JwsVerifyOptions): Promise<JwsVerified>;
    /** Verifies a flattened or general JWS JSON Serialization (RFC 7515 §7.2, §5.2). */
    jwsVerifyJson(jws: JsonInput, key: Jwk, options: JwsVerifyOptions): Promise<JwsVerified>;
    /** Encrypts to one recipient in the JWE Compact Serialization (RFC 7516 §5.1, §7.1). */
    jweEncryptCompact(plaintext: Uint8Array, options: JweEncryptOptions): Promise<string>;
    /** Encrypts in a JWE JSON Serialization (RFC 7516 §7.2); returns JSON text. */
    jweEncryptJson(plaintext: Uint8Array, options: JweEncryptOptions, form: JweJsonForm): Promise<string>;
    /** Decrypts a compact JWE against explicit allow-lists (RFC 7516 §5.2, RFC 8725 §3.1). */
    jweDecryptCompact(token: string, key: Jwk, options: JweDecryptOptions): Promise<JweDecrypted>;
    /** Decrypts a flattened or general JWE JSON Serialization (RFC 7516 §7.2, §5.2). */
    jweDecryptJson(jwe: JsonInput, key: Jwk, options: JweDecryptOptions): Promise<JweDecrypted>;
    /** Issues a signed JWT (RFC 7519 §7.1). */
    jwtSign(claims: JsonInput, key: Jwk, options: JwtSignOptions): Promise<string>;
    /** Validates a signed JWT with one key (RFC 7519 §7.2). */
    jwtVerify(token: string, key: Jwk, options: JwtVerifyOptions): Promise<JwtVerified>;
    /** Validates a signed JWT with a JWK Set (RFC 7517 §5). */
    jwtVerifyWithJwks(token: string, jwks: JwkSet, options: JwtVerifyOptions): Promise<JwtVerified>;
    /** Encrypts a signed JWT as a nested JWT, `cty: "JWT"` (RFC 7519 §5.2, §11.2). */
    jwtEncryptNested(signedJwt: string, options: JweEncryptOptions): Promise<string>;
    /** Decrypts and validates a nested JWT with one verification key (RFC 7519 §7.2 step 8). */
    jwtDecryptNested(token: string, decryptKey: Jwk, decryptOptions: JweDecryptOptions, key: Jwk, verifyOptions: JwtVerifyOptions): Promise<JwtNestedVerified>;
    /** Decrypts and validates a nested JWT with a JWK Set for the inner signature. */
    jwtDecryptNestedWithJwks(token: string, decryptKey: Jwk, decryptOptions: JweDecryptOptions, jwks: JwkSet, verifyOptions: JwtVerifyOptions): Promise<JwtNestedVerified>;
    /** The error class every operation rejects with for a core failure. */
    readonly PolyjoseError: typeof PolyjoseError;
}
/** Binds the facade to one native layer. Internal to the packages. */
export declare function createApi(backend: Backend): PolyjoseApi;
