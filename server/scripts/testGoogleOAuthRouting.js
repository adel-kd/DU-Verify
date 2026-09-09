const assert = require("assert");
const {
  directGoogleAuthStartUrl,
} = require("../src/services/googleOAuthRouting");

const callbackUrl = "https://du-verify-api.onrender.com/api/auth/google/callback";

assert.strictEqual(
  directGoogleAuthStartUrl({
    requestOrigin: "https://du-verify-api.onrender.com",
    callbackUrl,
    frontendOrigin: "https://developer-duverifay.vercel.app",
    surface: "developer",
  }),
  null,
  "Direct backend requests must not redirect in a loop"
);

const developerRedirect = new URL(
  directGoogleAuthStartUrl({
    requestOrigin: "https://developer-duverifay.vercel.app",
    callbackUrl,
    frontendOrigin: "https://developer-duverifay.vercel.app",
    surface: "developer",
  })
);

assert.strictEqual(developerRedirect.origin, "https://du-verify-api.onrender.com");
assert.strictEqual(developerRedirect.pathname, "/api/auth/google");
assert.strictEqual(
  developerRedirect.searchParams.get("origin"),
  "https://developer-duverifay.vercel.app"
);
assert.strictEqual(developerRedirect.searchParams.get("surface"), "developer");

const merchantRedirect = new URL(
  directGoogleAuthStartUrl({
    requestOrigin: "https://duverifay.vercel.app",
    callbackUrl,
    frontendOrigin: "https://duverifay.vercel.app",
    surface: "merchant",
  })
);

assert.strictEqual(merchantRedirect.searchParams.get("surface"), "merchant");
assert.strictEqual(
  merchantRedirect.searchParams.get("origin"),
  "https://duverifay.vercel.app"
);

console.log("Google OAuth routing tests passed.");
