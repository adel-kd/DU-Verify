function normalizeHttpOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function directGoogleAuthStartUrl({
  requestOrigin,
  callbackUrl,
  frontendOrigin,
  surface,
}) {
  const normalizedRequestOrigin = normalizeHttpOrigin(requestOrigin);
  const normalizedFrontendOrigin = normalizeHttpOrigin(frontendOrigin);

  try {
    const callback = new URL(String(callbackUrl || ""));

    if (
      !normalizedRequestOrigin ||
      !normalizedFrontendOrigin ||
      callback.origin === normalizedRequestOrigin ||
      !callback.pathname.endsWith("/callback")
    ) {
      return null;
    }

    // OAuth's state cookie must be created by the same host that receives
    // Google's callback. A frontend reverse proxy cannot share that cookie.
    callback.pathname = callback.pathname.slice(0, -"/callback".length);
    callback.search = "";
    callback.hash = "";
    callback.searchParams.set("origin", normalizedFrontendOrigin);
    callback.searchParams.set("surface", surface === "developer" ? "developer" : "merchant");

    return callback.toString();
  } catch {
    return null;
  }
}

module.exports = {
  directGoogleAuthStartUrl,
};
