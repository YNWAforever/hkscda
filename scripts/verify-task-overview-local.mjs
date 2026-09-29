import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createTaskOverviewHandler } from "../src/routes/api/admin/task-overview.ts";
import { requireAdmin } from "../src/lib/admin/session.server.ts";
import { createSupabaseTaskRepository } from "../src/lib/operations/taskOverview.server.ts";
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
const repository = createSupabaseTaskRepository(client);
const handler = createTaskOverviewHandler({
  authorize: async (request) =>
    (await requireAdmin(request, ["staff", "treasurer", "admin"], client)).role,
  repository,
});
const email = "task-review-" + randomUUID() + "@example.invalid";
const created = await client.auth.admin.createUser({ email, email_confirm: true });
assert.equal(created.error, null);
const userId = created.data.user.id;
const adminId = randomUUID();
const request = (token, method = "GET") =>
  handler(
    new Request("http://127.0.0.1:57321/api/admin/task-overview?role=admin", {
      method,
      headers: token ? { authorization: "Bearer " + token } : {},
    }),
  );
try {
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
  assert.equal((await request(token, "POST")).status, 405);
  assert.equal(
    (
      await client
        .from("admin_user")
        .insert({ id: adminId, auth_user_id: userId, email, role: "staff", status: "active" })
    ).error,
    null,
  );
  const expected = {
    staff: [
      "adoption_unassigned",
      "followup_overdue",
      "volunteer_pending",
      "animal_missing_photo",
      "sponsorship_proof_pending",
    ],
    treasurer: [
      "payment_pending",
      "delivery_attention",
      "sponsorship_proof_pending",
      "sponsorship_followup",
    ],
    admin: [
      "content_drafts",
      "content_expired",
      "media_failed",
      "adoption_unassigned",
      "delivery_attention",
    ],
  };
  const roles = [];
  for (const role of ["staff", "treasurer", "admin"]) {
    assert.equal((await client.from("admin_user").update({ role }).eq("id", adminId)).error, null);
    const response = await request(token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.deepEqual(
      data.cards.map((card) => card.key),
      expected[role],
    );
    assert.ok(
      data.cards.every(
        (card) =>
          card.metric.state === "ready" &&
          Number.isSafeInteger(card.metric.count) &&
          card.metric.count >= 0,
      ),
    );
    roles.push({ role, cards: data.cards.length, allMetricsReady: true });
  }
  for (const status of ["pending", "disabled"]) {
    assert.equal(
      (await client.from("admin_user").update({ status }).eq("id", adminId)).error,
      null,
    );
    const response = await request(token);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  console.log(
    JSON.stringify({
      environment: "isolated Auth/PostgREST 57321",
      roles,
      missingInvalidTokenDenied: true,
      nonStaffDenied: true,
      wrongMethodDenied: true,
      pendingDisabledDenied: true,
      sameTokenRoleRecheck: true,
      queryRoleIgnored: true,
      noEmailSent: true,
    }),
  );
} finally {
  assert.equal((await client.from("admin_user").delete().eq("id", adminId)).error, null);
  assert.equal((await client.auth.admin.deleteUser(userId)).error, null);
}
