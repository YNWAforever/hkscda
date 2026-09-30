import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const [c] = JSON.parse(
  execFileSync("docker", ["inspect", "supabase_auth_hkscda-audit-integration-fresh"], {
    encoding: "utf8",
  }),
);
const e = Object.fromEntries(
  c.Config.Env.map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]),
);
assert.equal(e.GOTRUE_SMTP_HOST, "supabase_inbucket_hkscda-audit-integration-fresh");
const enc = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const key = (role) => {
  const p =
    enc({ alg: "HS256", typ: "JWT" }) +
    "." +
    enc({ role, iss: "supabase", exp: Math.floor(Date.now() / 1000) + 600 });
  return p + "." + createHmac("sha256", e.GOTRUE_JWT_SECRET).update(p).digest("base64url");
};
const mk = (role) =>
  createClient("http://127.0.0.1:52321", key(role), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const admin = mk("service_role");
const auth = mk("anon");
const email = "portal-revoke-" + randomUUID() + "@example.invalid";
const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
assert.equal(error, null);
try {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  assert.equal(link.error, null);
  const login = await auth.auth.verifyOtp({
    email,
    token: link.data.properties.email_otp,
    type: "email",
  });
  assert.equal(login.error, null);
  assert.equal(
    (await admin.auth.admin.updateUserById(data.user.id, { ban_duration: "24h" })).error,
    null,
  );
  const check = await auth.auth.getUser(login.data.session.access_token);
  console.log(
    JSON.stringify({
      environment: "local Auth 52321",
      bannedExistingSessionDenied: !!check.error,
      returnedBanField: !!check.data.user?.banned_until,
    }),
  );
  assert.ok(
    check.error || check.data.user?.banned_until,
    "Existing banned session must be refused or expose authoritative ban",
  );
} finally {
  assert.equal((await admin.auth.admin.deleteUser(data.user.id)).error, null);
}
