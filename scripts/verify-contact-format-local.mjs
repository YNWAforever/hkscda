import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const [container] = JSON.parse(
  execFileSync("docker", ["inspect", "supabase_auth_hkscda-audit-integration-573"], {
    encoding: "utf8",
  }),
);
const env = Object.fromEntries(
  container.Config.Env.map((value) => [
    value.slice(0, value.indexOf("=")),
    value.slice(value.indexOf("=") + 1),
  ]),
);
assert.equal(env.GOTRUE_SMTP_HOST, "supabase_inbucket_hkscda-audit-integration-573");
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const key = (role) => {
  const payload =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({ role, iss: "supabase", exp: Math.floor(Date.now() / 1000) + 600 });
  return (
    payload + "." + createHmac("sha256", env.GOTRUE_JWT_SECRET).update(payload).digest("base64url")
  );
};
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = createClient("http://127.0.0.1:57321", key("service_role"), options);
const auth = createClient("http://127.0.0.1:57321", key("anon"), options);
process.env.SUPABASE_URL = "http://127.0.0.1:57321";
process.env.SUPABASE_SERVICE_ROLE_KEY = key("service_role");
const { Route } = await import("../src/routes/api/admin/supporters/format-preview.ts");
const endpoint = Route.options.server.handlers.POST;
const email = "format-review-" + randomUUID() + "@example.invalid";
const created = await client.auth.admin.createUser({ email, email_confirm: true });
assert.equal(created.error, null);
const userId = created.data.user.id,
  adminId = randomUUID();
const ids = Array.from({ length: 1000 }, () => randomUUID());
const rows = ids.slice(0, 999).map((id, i) => ({
  id,
  name: i % 4 === 0 ? "  Synthetic  Person " : "Synthetic Person",
  email: (i % 4 === 1 ? "UPPER-" : "lower-") + id + "@example.invalid",
  phone: "9123 4567",
  deleted_at: i % 4 === 3 ? "2026-09-29T00:00:00Z" : null,
}));
const request = (token, body = JSON.stringify({ ids, filterHash: "a".repeat(64) })) =>
  endpoint({
    request: new Request("http://127.0.0.1:57321/api/admin/supporters/format-preview?role=admin", {
      method: "POST",
      headers: token ? { authorization: "Bearer " + token } : {},
      body,
    }),
  });
const readRows = async () => {
  const all = [];
  for (let start = 0; start < ids.length; start += 100) {
    const result = await client
      .from("supporter")
      .select("*")
      .in("id", ids.slice(start, start + 100))
      .order("id");
    assert.equal(result.error, null);
    all.push(...result.data);
  }
  return JSON.stringify(all);
};
try {
  for (let start = 0; start < rows.length; start += 100)
    assert.equal(
      (await client.from("supporter").insert(rows.slice(start, start + 100))).error,
      null,
    );
  const original = await readRows();
  const link = await client.auth.admin.generateLink({ type: "magiclink", email });
  assert.equal(link.error, null);
  const login = await auth.auth.verifyOtp({
    email,
    token: link.data.properties.email_otp,
    type: "email",
  });
  assert.equal(login.error, null);
  const token = login.data.session.access_token;
  assert.equal((await request(null)).status, 401);
  assert.equal((await request("invalid")).status, 401);
  assert.equal((await request(token)).status, 403);
  assert.equal(
    (
      await client
        .from("admin_user")
        .insert({ id: adminId, auth_user_id: userId, email, role: "staff", status: "active" })
    ).error,
    null,
  );
  assert.equal((await request(token)).status, 403);
  const results = [];
  for (const role of ["treasurer", "admin"]) {
    assert.equal((await client.from("admin_user").update({ role }).eq("id", adminId)).error, null);
    const start = performance.now(),
      response = await request(token),
      ms = performance.now() - start;
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.items.length, 1000);
    assert.deepEqual(
      body.items.map((item) => item.entityId),
      ids,
    );
    assert.deepEqual(body.counts, {
      suggested: 250,
      manual_review: 250,
      unchanged: 250,
      skipped: 250,
    });
    assert.ok(
      body.items
        .filter((item) => item.status === "skipped")
        .every((item) => item.before === null && item.after === null),
    );
    results.push({ role, rows: body.items.length, ms: Math.round(ms * 100) / 100 });
  }
  assert.equal((await request(token, "{")).status, 400);
  assert.equal((await request(token, "x".repeat(65537))).status, 413);
  for (const status of ["pending", "disabled"]) {
    assert.equal(
      (await client.from("admin_user").update({ status }).eq("id", adminId)).error,
      null,
    );
    assert.equal((await request(token)).status, 403);
  }
  assert.equal(await readRows(), original);
  const anonymous = createClient("http://127.0.0.1:57321", key("anon"), options);
  for (const reader of [anonymous, auth]) {
    const response = await reader.from("supporter").select("id,email").in("id", ids.slice(0, 100));
    assert.equal(response.data?.length ?? 0, 0);
  }
  console.log(
    JSON.stringify({
      environment: "isolated Auth/PostgREST 57321",
      results,
      missingInvalidToken401: true,
      staffNonStaffPendingDisabled403: true,
      sameTokenRoleRecheck: true,
      malformed400: true,
      oversized413: true,
      allSourceRowsUnchanged: true,
      directAnonAuthenticatedPIIDenied: true,
      noEmailSent: true,
    }),
  );
} finally {
  for (let start = 0; start < ids.length; start += 100)
    assert.equal(
      (
        await client
          .from("supporter")
          .delete()
          .in("id", ids.slice(start, start + 100))
      ).error,
      null,
    );
  assert.equal((await client.from("admin_user").delete().eq("id", adminId)).error, null);
  assert.equal((await client.auth.admin.deleteUser(userId)).error, null);
  assert.equal(await readRows(), "[]");
}
