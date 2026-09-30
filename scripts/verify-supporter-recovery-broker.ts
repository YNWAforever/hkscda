import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

import { createRecoveryBroker } from "../src/lib/supporters/recoveryBroker.server";
import {
  createSupabaseRecoveryCarrierProvider,
  createSupabaseRecoveryRepository,
} from "../src/lib/supporters/recoveryRepository.server";
import type { MailProvider } from "../src/lib/notifications/provider.server";

// Exact local stack only. No supplied URL, key, production data, reset or ledger edits.
const db = "supabase_db_hkscda-audit-integration-fresh";
const [source] = JSON.parse(
  execFileSync("docker", ["inspect", "supabase_auth_hkscda-audit-integration-fresh"], {
    encoding: "utf8",
  }),
);
const env = Object.fromEntries(
  source.Config.Env.map((v: string) => [v.slice(0, v.indexOf("=")), v.slice(v.indexOf("=") + 1)]),
);
assert.ok(env.GOTRUE_DB_DATABASE_URL.includes(db));
assert.equal(env.GOTRUE_SMTP_HOST, "supabase_inbucket_hkscda-audit-integration-fresh");
assert.equal(env.GOTRUE_SMTP_PORT, "1025");
const api = "http://127.0.0.1:52321";
const sink = "http://127.0.0.1:52324";
const sql = (query: string) =>
  execFileSync(
    "docker",
    ["exec", "-i", db, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: query, encoding: "utf8" },
  ).trim();
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
function jwt(role: string, sub?: string) {
  const value =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({ role, sub, iss: "supabase", exp: Math.floor(Date.now() / 1000) + 3600 });
  return (
    value + "." + createHmac("sha256", env.GOTRUE_JWT_SECRET).update(value).digest("base64url")
  );
}
const client = (role = "service_role", sub?: string) =>
  createClient(api, jwt(role, sub), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        assert.equal(new URL(String(input)).origin, api);
        return fetch(input, init);
      },
    },
  });
const fixtures = new Map<string, string>();
const challengeIds: string[] = [];
const messages: string[] = [];
const baseCarrier = createSupabaseRecoveryCarrierProvider(() => client());
let exchanges = 0;
const carrier = {
  async generate(email: string) {
    assert.match(email, /^broker-review-[0-9a-f-]+@example\.invalid$/);
    const value = await baseCarrier.generate(email);
    fixtures.set(value.userId, email);
    return value;
  },
  async exchange(input: Parameters<typeof baseCarrier.exchange>[0]) {
    exchanges++;
    return baseCarrier.exchange(input);
  },
};
const mail: MailProvider = {
  async send(input) {
    assert.match(input.to, /^broker-review-[0-9a-f-]+@example\.invalid$/);
    const sent = await fetch(sink + "/api/v1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        From: { Email: "test@example.invalid", Name: "HKSCDA isolated test" },
        To: [{ Email: input.to }],
        Subject: input.subject,
        HTML: input.html,
      }),
    });
    assert.equal(sent.ok, true, "Local sink accepted application-code email");
    const result = (await sent.json()) as { ID: string };
    assert.ok(result.ID);
    messages.push(result.ID);
    return { kind: "accepted", providerMessageId: result.ID };
  },
};
const repository = createSupabaseRecoveryRepository(client());
const key = randomBytes(32);
const broker = createRecoveryBroker({
  key,
  repository,
  carrier,
  mail,
  from: "test@example.invalid",
});
const ledgerBefore = sql("select count(*) from supabase_migrations.schema_migrations;");
const result: Record<string, unknown> = {
  status: "failed",
  environment: "isolated Supabase API 52321 / Postgres 52322 / Mailpit 52324",
  productionRequests: 0,
  migrationSha256: createHash("sha256")
    .update(await readFile("supabase/migrations/20260930120000_supporter_recovery_single_use.sql"))
    .digest("hex"),
};
async function issue(known = false, custom = broker) {
  const email = "broker-review-" + randomUUID() + "@example.invalid";
  if (known) {
    const created = await client().auth.admin.createUser({ email, email_confirm: true });
    assert.equal(created.error, null);
    fixtures.set(created.data.user!.id, email);
  }
  const challengeId = randomUUID();
  challengeIds.push(challengeId);
  await custom.issue(email, challengeId);
  const found = (await fetch(
    sink + "/api/v1/search?query=" + encodeURIComponent("to:" + email),
  ).then((r) => r.json())) as { messages: { ID: string }[] };
  assert.equal(found.messages.length, 1);
  const message = (await fetch(sink + "/api/v1/message/" + found.messages[0].ID).then((r) =>
    r.json(),
  )) as { HTML: string; Text: string };
  assert.ok(
    !message.HTML.includes("token_hash") &&
      !message.HTML.includes("ConfirmationURL") &&
      !message.HTML.includes(api),
  );
  const code = (message.Text || message.HTML).match(/\b[0-9]{8}\b/)?.[0];
  assert.ok(code);
  return { email, challengeId, code };
}
async function refused(input: Parameters<typeof broker.verify>[0]) {
  await assert.rejects(
    broker.verify(input),
    (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === "invalid_code",
  );
}
try {
  const health = (await fetch(api + "/auth/v1/health", { headers: { apikey: jwt("anon") } }).then(
    (r) => r.json(),
  )) as { version: string };
  result.authVersion = health.version;
  assert.equal(health.version, "v2.197.0");
  assert.equal(
    sql(
      "select relrowsecurity from pg_class where oid='private.supporter_recovery_challenge'::regclass;",
    ),
    "t",
  );
  for (const role of ["anon", "authenticated"]) {
    for (const [fn, args] of [
      [
        "create_supporter_recovery_challenge",
        {
          p_id: randomUUID(),
          p_auth_user_id: randomUUID(),
          p_email_fingerprint: "0".repeat(64),
          p_code_fingerprint: "0".repeat(64),
          p_sealed_carrier: "x".repeat(64),
        },
      ],
      [
        "consume_supporter_recovery_challenge",
        {
          p_id: randomUUID(),
          p_email_fingerprint: "0".repeat(64),
          p_code_fingerprint: "0".repeat(64),
        },
      ],
      ["invalidate_supporter_recovery_challenge", { p_id: randomUUID() }],
    ] as const) {
      const r = await client(role).rpc(fn, args);
      assert.equal(r.error?.code, "42501");
      assert.equal(r.data, null);
    }
  }
  result.publicRoleRpcRefusals = 6;
  const known = await issue(true);
  await refused({ ...known, email: "wrong-" + known.email });
  await refused({ ...known, code: known.code === "00000000" ? "11111111" : "00000000" });
  const knownSession = await broker.verify(known);
  const verifiedPrincipal = await client("anon").auth.getUser(knownSession.access_token);
  assert.equal(verifiedPrincipal.error, null);
  assert.equal(verifiedPrincipal.data.user?.email, known.email);
  assert.ok(verifiedPrincipal.data.user?.email_confirmed_at);
  result.standardSessionPassesServerGetUser = true;
  await refused(known);
  result.knownWrongEmailWrongCodeSuccessReplay = true;
  const unknown = await issue();
  assert.ok((await broker.verify(unknown)).access_token);
  result.unknownIdentityVerifiedWithoutSupporterLinking = true;
  const concurrent = await issue();
  const beforeExchanges = exchanges;
  const attempts = await Promise.allSettled(
    Array.from({ length: 20 }, () => broker.verify(concurrent)),
  );
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(exchanges - beforeExchanges, 1);
  assert.equal(
    sql(
      `select (consumed_at is not null and sealed_carrier is null)::text from private.supporter_recovery_challenge where id='${concurrent.challengeId}'::uuid;`,
    ),
    "true",
  );
  result.concurrentAttempts = 20;
  result.concurrentSuccessfulSessions = 1;
  result.concurrentCarrierExchanges = 1;
  const exhausted = await issue();
  const wrong = exhausted.code === "00000000" ? "11111111" : "00000000";
  for (let i = 0; i < 5; i++) await refused({ ...exhausted, code: wrong });
  await refused(exhausted);
  result.fiveWrongCodesInvalidateCarrier = true;
  const expired = await issue();
  sql(
    `update private.supporter_recovery_challenge set created_at=now()-interval '16 minutes',expires_at=now()-interval '1 minute' where id='${expired.challengeId}'::uuid;`,
  );
  await refused(expired);
  result.expiredChallengeRefused = true;
  const lockExpired = await issue();
  sql(
    `update private.supporter_recovery_challenge set expires_at=now()+interval '1 second' where id='${lockExpired.challengeId}'::uuid;`,
  );
  const blocker = spawn(
    "docker",
    ["exec", "-i", db, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let unblock: () => void;
  const locked = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  let output = "";
  blocker.stdout.on("data", (value) => {
    output += value;
    if (output.includes("LOCK_HELD")) unblock();
  });
  const finished = new Promise<void>((resolve, reject) => {
    blocker.on("error", reject);
    blocker.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Local expiry-lock probe failed")),
    );
  });
  blocker.stdin.end(
    `begin; select id from private.supporter_recovery_challenge where id='${lockExpired.challengeId}'::uuid for update; select 'LOCK_HELD'; select pg_sleep(2); commit;`,
  );
  await locked;
  try {
    await refused(lockExpired);
  } finally {
    await finished;
  }
  result.expiryWhileWaitingForRowLockRefused = true;
  const suspended = await issue();
  const rowUserId = sql(
    `select auth_user_id from private.supporter_recovery_challenge where id='${suspended.challengeId}'::uuid;`,
  );
  assert.equal(
    (await client().auth.admin.updateUserById(rowUserId, { ban_duration: "24h" })).error,
    null,
  );
  await refused(suspended);
  await refused(suspended);
  result.suspendedRefusedAndNotRevived = true;
  const failing = createRecoveryBroker({
    key,
    repository,
    carrier: {
      ...carrier,
      async exchange() {
        throw new Error("synthetic provider timeout");
      },
    },
    mail,
    from: "test@example.invalid",
  });
  const lost = await issue(false, failing);
  await assert.rejects(failing.verify(lost));
  await refused(lost);
  result.failureAfterConsumeDoesNotReviveCode = true;
  const rejected = createRecoveryBroker({
    key,
    repository,
    carrier,
    mail: {
      async send() {
        return { kind: "rejected", code: "synthetic", retryable: true };
      },
    },
    from: "test@example.invalid",
  });
  const rejectedId = randomUUID();
  challengeIds.push(rejectedId);
  await assert.rejects(
    rejected.issue("broker-review-" + randomUUID() + "@example.invalid", rejectedId),
  );
  assert.equal(
    sql(
      `select (consumed_at is not null and sealed_carrier is null)::text from private.supporter_recovery_challenge where id='${rejectedId}'::uuid;`,
    ),
    "true",
  );
  result.deliveryFailureInvalidatesCode = true;
  result.ledgerUnchanged =
    sql("select count(*) from supabase_migrations.schema_migrations;") === ledgerBefore;
  assert.equal(result.ledgerUnchanged, true);
  result.status = "passed";
} finally {
  for (const [id, email] of fixtures) {
    assert.match(email, /^broker-review-[0-9a-f-]+@example\.invalid$/);
    assert.equal((await client().auth.admin.deleteUser(id)).error, null);
  }
  if (messages.length) {
    const deleted = await fetch(sink + "/api/v1/messages", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ IDs: messages }),
    });
    assert.equal(deleted.ok, true);
  }
  if (challengeIds.length) {
    for (const id of challengeIds) assert.match(id, /^[0-9a-f-]{36}$/);
    result.remainingFixtureChallenges = Number(
      sql(
        `select count(*) from private.supporter_recovery_challenge where id in (${challengeIds.map((id) => `'${id}'::uuid`).join(",")});`,
      ),
    );
    assert.equal(result.remainingFixtureChallenges, 0);
  }
  result.cleanedFixtureUsers = fixtures.size;
  await writeFile(
    "docs/evidence/audit-remediation-20260927/t22-recovery-broker-isolated.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
}
