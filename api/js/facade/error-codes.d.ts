/** The stable error codes of every polyjose binding, in the core's order. */
export declare const ERROR_CODES: readonly ["InvalidBase64", "InvalidJson", "InvalidHeader", "UnsupportedAlgorithm", "AlgorithmNotAllowed", "InvalidKey", "KeyAlgorithmMismatch", "InvalidSignature", "DecryptionFailed", "UnknownCritical", "TokenExpired", "TokenNotYetValid", "InvalidClaim", "RandomnessUnavailable", "InvalidFormat", "NoMatchingKey", "MultipleMatchingKeys"];
/** One stable error code: `PolyjoseError.code` is always one of these. */
export type ErrorCode = (typeof ERROR_CODES)[number];
