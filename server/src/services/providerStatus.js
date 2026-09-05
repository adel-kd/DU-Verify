// services/providerStatus.js
//
// Shared classification of provider verification outcomes.
//
// Core security principle:
//
//   A provider successfully responding with a definitive invalid
//   result is EVIDENCE.
//
//   A provider FAILING to respond is NOT evidence that the
//   transaction is invalid.
//
// Three canonical result states:
//
//   VALID                  - provider confirmed the transaction
//   NOT_VERIFIED           - provider responded with a definitive
//                            business/application-level rejection
//   PROVIDER_UNAVAILABLE   - we could not reliably communicate with
//                            the provider (network, 5xx, 429, 408,
//                            unknown/unclassifiable responses)
//
// Unknown or unclassifiable outcomes MUST fail safe to
// PROVIDER_UNAVAILABLE — never NOT_VERIFIED.

const RESULT = {
  VALID: "VALID",
  NOT_VERIFIED: "NOT_VERIFIED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
};

/* ============================================================
   NETWORK / INFRASTRUCTURE ERROR CODES
============================================================ */

const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ESHUTDOWN",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

const RETRYABLE_HTTP_STATUSES = new Set([
  408, // request timeout (provider-side)
  429, // too many requests — back off, never accuse
  500, // provider server failure
  502,
  503,
  504,
]);

/**
 * Classify an exception thrown while contacting a provider.
 *
 * Any network/TLS/socket/fetch failure is infrastructure —
 * it is NEVER evidence that the transaction is invalid.
 */
function classifyNetworkError(err, provider) {
  const code =
    err?.code ||
    err?.cause?.code ||
    null;

  const message = String(
    err?.message || err || ""
  );

  const isAbort =
    err?.name === "AbortError" ||
    err?.type === "aborted" ||
    /timeout|timed out/i.test(message);

  const isFetchFailed =
    /fetch failed|socket|network|connection/i.test(
      message
    );

  const isNetworkCode =
    code && NETWORK_ERROR_CODES.has(code);

  console.error(
    `[${provider}] request failed: ${code || err?.name || "ERROR"} ${message}`
  );

  return {
    status: RESULT.PROVIDER_UNAVAILABLE,

    reason: isNetworkCode
      ? `NETWORK_${code}`
      : isAbort
        ? "TIMEOUT"
        : isFetchFailed
          ? "NETWORK_ERROR"
          : "UNKNOWN_NETWORK_ERROR",

    provider,

    retryable: true,
  };
}

/**
 * Classify an HTTP status returned by the provider.
 *
 * IMPORTANT: HTTP status alone is not sufficient — callers must
 * still inspect the body. This only handles the status dimension.
 */
function classifyHttpStatus(httpStatus, provider) {
  if (RETRYABLE_HTTP_STATUSES.has(httpStatus)) {
    return {
      status: RESULT.PROVIDER_UNAVAILABLE,

      reason: `HTTP_${httpStatus}`,

      provider,

      retryable: httpStatus === 429 ? true : true,
    };
  }

  // 404 on a receipt endpoint usually means the provider's
  // application responded and did not find the resource.
  // Providers may override this in their own module when the
  // endpoint is known to 404 for infrastructure reasons too.
  if (httpStatus === 404) {
    return {
      status: RESULT.NOT_VERIFIED,

      reason: "PROVIDER_REJECTED",

      provider,

      retryable: false,
    };
  }

  // Anything else unknown fails safe.
  return {
    status: RESULT.PROVIDER_UNAVAILABLE,

    reason: `HTTP_${httpStatus}_UNCLASSIFIED`,

    provider,

    retryable: false,
  };
}

/**
 * Build a structured PROVIDER_UNAVAILABLE result.
 */
function unavailable(provider, reason) {
  return {
    status: RESULT.PROVIDER_UNAVAILABLE,

    reason: reason || "PROVIDER_UNAVAILABLE",

    provider,

    retryable: true,
  };
}

/**
 * Build a structured NOT_VERIFIED result.
 *
 * Only call this when the provider actually responded with a
 * known, definitive business-level rejection.
 */
function rejected(provider, reason) {
  return {
    status: RESULT.NOT_VERIFIED,

    reason: reason || "PROVIDER_REJECTED",

    provider,

    retryable: false,
  };
}

module.exports = {
  RESULT,
  classifyNetworkError,
  classifyHttpStatus,
  unavailable,
  rejected,
};
