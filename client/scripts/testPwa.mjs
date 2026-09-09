import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../public/staff-manifest.webmanifest", import.meta.url), "utf8"));
const worker = await readFile(new URL("../public/staff-sw.js", import.meta.url), "utf8");
const registration = await readFile(new URL("../src/components/StaffPwaRegistration.jsx", import.meta.url), "utf8");
const installer = await readFile(new URL("../src/components/InstallStaffApp.jsx", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

assert.equal(manifest.start_url, "/verify?source=pwa");
assert.equal(manifest.display, "standalone");
assert(manifest.icons.some((icon) => icon.sizes === "192x192"));
assert(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
assert.match(registration, /user\?\.role === "staff"/);
assert.match(registration, /!isDeveloperSurface/);
assert.match(registration, /__duVerifyStaffInstallPrompt/);
assert.match(installer, /Install app or Add to Home screen/);
assert.doesNotMatch(installer, /!installPrompt && !isIos/);
assert(!html.includes("staff-manifest.webmanifest"));

for (const icon of manifest.icons) {
  const image = await readFile(new URL(`../public${icon.src}`, import.meta.url));
  const [expectedWidth, expectedHeight] = icon.sizes.split("x").map(Number);
  assert.equal(image.readUInt32BE(16), expectedWidth, `${icon.src} width`);
  assert.equal(image.readUInt32BE(20), expectedHeight, `${icon.src} height`);
}

console.log("Staff PWA checks passed.");
