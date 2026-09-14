import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
assert.equal(process.env.QUALITY_BROWSER, "1");
const local = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
assert.equal(local.API_URL, "http://127.0.0.1:56321");
const origin = "http://127.0.0.1:56336",
  output = "docs/evidence/operations-release-20260915/quality-browser";
await mkdir(output, { recursive: true });
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const fixture = JSON.parse(
  await readFile(".local-policy-test/browser/synthetic-auth.json", "utf8"),
).admin;
const user = await service.auth.admin.getUserById(fixture.id);
assert.ok(user.data.user.email.endsWith("@example.invalid"));
const link = await service.auth.admin.generateLink({
  type: "magiclink",
  email: user.data.user.email,
});
if (link.error) throw Error("Local auth setup failed");
const auth = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false } });
const verified = await auth.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: "magiclink",
});
if (verified.error) throw Error("Local auth failed");
const session = verified.data.session;
const report = { checks: [], errors: [], screenshots: [] };
async function post(path, body) {
  const result = await fetch(origin + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await result.json();
  assert.equal(result.status, 200, JSON.stringify(data));
  return data;
}
const animal = crypto.randomUUID();
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMuoAAAAASUVORK5CYII=",
  "base64",
);
const paths = [0, 1, 2].map((n) => `${animal}/synthetic-${n}.png`);
for (const path of paths) {
  const r = await service.storage
    .from("animal-draft-images")
    .upload(path, pixel, { contentType: "image/png" });
  if (r.error) throw r.error;
}
await post("/api/admin/animals/publication/", {
  kind: "save",
  animal_id: animal,
  expected_revision: 0,
  body: {
    type: "cat",
    name: "Explicit synthetic image transfer",
    gender: "female",
    age: "2",
    status: "available",
    publication_state: "published",
    adoption_eligible: true,
    sponsorship_eligible: false,
    draft_image_path: paths[0],
    gallery: paths.slice(1).map((p, i) => ({
      id: crypto.randomUUID(),
      draft_path: p,
      url: null,
      review_status: "approved",
      source: "Explicit generated synthetic pixel",
      alt_zh: "Synthetic pixel",
      focal_x: 50,
      focal_y: 50,
      sort_order: i,
    })),
    public_profile: {},
  },
});
await post("/api/admin/content-review", {
  entity_kind: "animal",
  entity_id: animal,
  revision_key: "1",
  classification: "approved",
  evidence: "Explicit synthetic generated pixel test; not real rescue content",
});
const preview = await post("/api/admin/animals/publication/", {
  kind: "preview",
  animal_id: animal,
});
const start = performance.now();
await post("/api/admin/animals/publication/", {
  kind: "publish",
  animal_id: animal,
  preview_id: preview.preview_id,
  reason: "Local synthetic transfer measurement",
});
const elapsed = performance.now() - start;
const saved = await service.from("animals").select("image_url,gallery").eq("id", animal).single();
if (saved.error) throw saved.error;
const urls = [saved.data.image_url, ...saved.data.gallery.map((x) => x.url)];
let bytes = 0;
for (const url of urls) {
  assert.equal(new URL(url).port, "56321");
  const r = await fetch(url);
  assert.equal(r.status, 200);
  const image = await r.arrayBuffer();
  assert.equal(image.byteLength, pixel.length);
  bytes += image.byteLength;
}
const result = {
  synthetic: true,
  animal_id: animal,
  image_count: 3,
  bytes_per_image: pixel.length,
  verified_public_image_bytes: bytes,
  promotion_downloads: 3,
  promotion_uploads: 3,
  promotion_payload_bytes: bytes * 2,
  publish_api_elapsed_ms: Math.round(elapsed),
  request_count_source:
    "route loops: one private download and one public upload per new approved image; verified all 3 published objects",
  comparison:
    "promotion concurrency unchanged; local tiny-fixture latency does not justify concurrency tuning or production speed claim",
};
await writeFile(".local-policy-test/quality-image-transfer.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
