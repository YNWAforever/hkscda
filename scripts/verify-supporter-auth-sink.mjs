import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
// Exact local stack only: no supplied production URL/key and no volume deletion.
const [source] = JSON.parse(
  execFileSync("docker", ["inspect", "supabase_auth_hkscda-audit-integration-fresh"], {
    encoding: "utf8",
  }),
);
const env = Object.fromEntries(
  source.Config.Env.filter((x) => x.startsWith("GOTRUE_") || x.startsWith("API_EXTERNAL_URL=")).map(
    (x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)],
  ),
);
assert.equal(env.GOTRUE_SMTP_HOST, "supabase_inbucket_hkscda-audit-integration-fresh");
assert.equal(env.GOTRUE_SMTP_PORT, "1025");
assert.ok(env.GOTRUE_DB_DATABASE_URL.includes("supabase_db_hkscda-audit-integration-fresh"));
assert.ok(source.NetworkSettings.Networks["supabase_network_hkscda-audit-integration-fresh"]);
const template = await readFile("supabase/templates/login-otp.html", "utf8");
const server = createServer((req, res) => {
  if (req.url !== "/otp.html") {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(template);
});
await new Promise((r) => server.listen(56554, "0.0.0.0", r));
Object.assign(env, {
  GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: "http://host.docker.internal:56554/otp.html",
  GOTRUE_MAILER_TEMPLATES_CONFIRMATION: "http://host.docker.internal:56554/otp.html",
  GOTRUE_MAILER_OTP_EXP: "900",
  GOTRUE_MAILER_AUTOCONFIRM: "false",
  GOTRUE_SITE_URL: "http://127.0.0.1:3000",
  GOTRUE_URI_ALLOW_LIST: "http://127.0.0.1:3000/supporter",
});
const encode = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const jwt = (role) => {
  const v =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({
      role,
      iss: "supabase",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  return v + "." + createHmac("sha256", env.GOTRUE_JWT_SECRET).update(v).digest("base64url");
};
const api = "http://127.0.0.1:56555";
const client = (role = "anon") =>
  createClient(api, jwt(role), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const target = new URL(String(input));
        assert.equal(target.origin, api);
        target.pathname = target.pathname.replace(/^\/auth\/v1/, "");
        return fetch(target, init);
      },
    },
  });
const admin = client("service_role");
const fixtures = [];
const name = "hkscda-pr156-auth-sink-" + randomUUID();
let created = false;
const result = {
  environment: "isolated Auth v2.197.0 + local Mailpit 52324",
  expirySeconds: 900,
  productionRequests: 0,
};
async function sendFixture(known = true) {
  const email = "recovery-review-" + randomUUID() + "@example.invalid";
  let id;
  if (known) {
    const r = await admin.auth.admin.createUser({ email, email_confirm: true });
    assert.equal(r.error, null);
    id = r.data.user.id;
    fixtures.push({ email, id });
  }
  const sent = await client().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: "http://127.0.0.1:3000/supporter" },
  });
  assert.equal(sent.error, null);
  let message;
  for (let i = 0; i < 25; i++) {
    const r = await fetch(
      "http://127.0.0.1:52324/api/v1/search?query=" + encodeURIComponent("to:" + email),
    );
    assert.equal(r.ok, true);
    const d = await r.json();
    if (d.messages?.length) {
      message = await (
        await fetch("http://127.0.0.1:52324/api/v1/message/" + d.messages[0].ID)
      ).json();
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(message, "Local sink received OTP");
  const token = message.Text?.match(/\b[0-9]{6}\b/)?.[0];
  assert.ok(token, "Delivered template includes numeric OTP");
  assert.ok(message.HTML.includes("15 分鐘"));
  return { email, token, type: "email", id };
}
const verify = ({ email, token, type }) => client().auth.verifyOtp({ email, token, type });
try {
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      name,
      "--network",
      "supabase_network_hkscda-audit-integration-fresh",
      "-p",
      "127.0.0.1:56555:9999",
      ...Object.keys(env).flatMap((k) => ["--env", k]),
      source.Config.Image,
    ],
    { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] },
  );
  created = true;
  for (let i = 0; i < 40; i++) {
    if (
      await fetch(api + "/health")
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    if (i === 39) throw new Error("Isolated Auth startup timeout");
    await new Promise((r) => setTimeout(r, 250));
  }
  const known = await sendFixture();
  assert.ok((await verify({ ...known, email: "wrong-" + known.email })).error);
  assert.ok(
    (await verify({ ...known, token: known.token === "000000" ? "111111" : "000000" })).error,
  );
  const success = await verify(known);
  assert.equal(success.error, null);
  assert.ok(success.data.session);
  assert.ok((await verify(known)).error);
  result.knownWrongEmailWrongCodeSuccessReplay = true;
  const unknown = await sendFixture(false);
  const signedUp = await verify(unknown);
  assert.equal(signedUp.error, null);
  assert.ok(signedUp.data.session);
  fixtures.push({ email: unknown.email, id: signedUp.data.user.id });
  assert.ok((await verify(unknown)).error);
  result.unknownConfirmedWithoutSupporterLinking = true;
  const expired = await sendFixture();
  assert.match(expired.id, /^[0-9a-f-]{36}$/);
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_hkscda-audit-integration-fresh",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: `update auth.users set confirmation_sent_at=now()-interval '16 minutes', recovery_sent_at=now()-interval '16 minutes' where id='${expired.id}'::uuid;`,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  assert.ok((await verify(expired)).error);
  result.expiredAfterSynthetic16Minutes = true;
  const concurrent = await sendFixture();
  const attempts = await Promise.all([verify(concurrent), verify(concurrent)]);
  result.concurrentSuccessfulSessions = attempts.filter((x) => !x.error && x.data.session).length;
  result.concurrentSingleUse = result.concurrentSuccessfulSessions === 1;
  const suspended = await sendFixture();
  assert.equal(
    (await admin.auth.admin.updateUserById(suspended.id, { ban_duration: "24h" })).error,
    null,
  );
  assert.ok((await verify(suspended)).error);
  result.suspendedRefused = true;
  result.fixtureUsers = fixtures.length;
  await writeFile(
    "docs/evidence/audit-remediation-20260927/t22-auth-sink-sequential.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
  assert.equal(
    result.concurrentSingleUse,
    true,
    "Local Auth must enforce one successful concurrent OTP use before activation",
  );
} finally {
  if (created) {
    for (const f of fixtures) {
      assert.match(f.email, /^recovery-review-[0-9a-f-]+@example\.invalid$/);
      assert.equal((await admin.auth.admin.deleteUser(f.id)).error, null);
    }
    execFileSync("docker", ["stop", "--time", "5", name], { stdio: "pipe" });
    execFileSync("docker", ["rm", name], { stdio: "pipe" });
  }
  await new Promise((r) => server.close(r));
}
