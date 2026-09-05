// services/healthProbes.js
//
// PROVIDER HEALTH PROBES
//
// A small set of KNOWN REAL receipt/reference URLs per provider.
//
// IMPORTANT:
//
//   These are ONLY provider-health probes.
//
//   They answer: "Can our backend currently communicate with
//   this provider's receipt infrastructure?"
//
//   They must NEVER be used as evidence that a customer's
//   transaction is valid or invalid. Probe results are for
//   diagnostics and logging only.
//
// Do not rely on a single old receipt forever — real historical
// receipt URLs may stop working, so multiple probes are supported
// and the provider is considered healthy if ANY probe succeeds.

const fetch = require("node-fetch");
const https = require("https");

const insecureAgent = new https.Agent({
  rejectUnauthorized: false,
});

const PROVIDER_HEALTH_PROBES = {
  Dashen: [
    // Replace with current known-real receipt references and
    // refresh them periodically.
    "https://receipt.dashensuperapp.com/receipt/",
  ],

  CBE: [
    "https://mbreciept.cbe.com.et/",
  ],
};

const PROBE_TIMEOUT_MS = 10_000;

/**
 * Probe a single URL. Returns true when the endpoint is
 * reachable (any HTTP response counts as reachable — we only
 * care about transport-level health).
 */
async function probeUrl(url) {
  try {
    const res = await fetch(url, {
      agent: insecureAgent,

      method: "GET",

      timeout: PROBE_TIMEOUT_MS,
    });

    // Any HTTP response means the infrastructure answered.
    return { ok: true, httpStatus: res.status };
  } catch (err) {
    return {
      ok: false,

      error:
        err?.code ||
        err?.name ||
        err?.message ||
        "UNKNOWN",
    };
  }
}

/**
 * Check whether a provider's receipt infrastructure is
 * currently reachable.
 *
 * @returns {Promise<{healthy: boolean, checked: number, detail: Object}>}
 */
async function checkProviderHealth(provider) {
  const probes =
    PROVIDER_HEALTH_PROBES[provider] || [];

  if (!probes.length) {
    return {
      healthy: null, // unknown — no probes configured

      checked: 0,

      detail: {},
    };
  }

  const results = await Promise.all(
    probes.map(async (url) => ({
      url,

      ...(await probeUrl(url)),
    }))
  );

  const healthy = results.some(
    (result) => result.ok
  );

  console.log(
    `[health] ${provider} probe: ${healthy ? "healthy" : "unhealthy"}`
  );

  return {
    healthy,

    checked: probes.length,

    detail: results,
  };
}

module.exports = {
  PROVIDER_HEALTH_PROBES,
  checkProviderHealth,
};
