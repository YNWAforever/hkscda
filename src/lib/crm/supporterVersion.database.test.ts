import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";

const raw =
  process.env.CRM_TEST_ALLOW_LOCAL_FIXTURES === "1" ? process.env.CRM_TEST_DATABASE_URL : undefined;
const databaseUrl = raw ? new URL(raw) : null;
if (
  databaseUrl &&
  (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(databaseUrl.hostname) ||
    !databaseUrl.port ||
    !databaseUrl.username ||
    !databaseUrl.password ||
    databaseUrl.pathname.length < 2 ||
    databaseUrl.search ||
    databaseUrl.hash)
)
  throw new Error("T15 database test requires explicit loopback Postgres credentials");
const sql = databaseUrl ? new SQL(databaseUrl.toString()) : null;
const supporter = randomUUID();
const actor = randomUUID();
const staff = randomUUID();
const disabled = randomUUID();
const timestamp = "2026-09-27T12:00:00.000Z";

function db() {
  if (!sql) throw new Error("Explicit local database is required");
  return sql;
}

async function version() {
  const [row] =
    await db()`select edit_version::int version, name from public.supporter where id=${supporter}::uuid`;
  return row as { version: number; name: string };
}

async function update(expected: number, name: string, who = actor, at: string | null = timestamp) {
  const [row] = await db()`select public.mutate_crm_supporter_if_version_with_audit(
    ${supporter}::uuid,${expected}::bigint,${{ name }}::jsonb,
    ${["donor", "volunteer"]}::jsonb,${who}::uuid,${at}::timestamptz,
    ${{ source: "t15-synthetic" }}::jsonb
  ) result`;
  return row.result as { id: string; editVersion: number };
}

describe.skipIf(!sql)("T15 versioned supporter edits on isolated Postgres", () => {
  beforeAll(async () => {
    await db()`insert into public.admin_user(auth_user_id,email,role,status)
      values(${actor}::uuid,${actor + "@example.invalid"},'treasurer','active'),
        (${staff}::uuid,${staff + "@example.invalid"},'staff','active'),
        (${disabled}::uuid,${disabled + "@example.invalid"},'admin','disabled')`;
    await db()`insert into public.supporter(id,name,email,language,tags,source)
      values(${supporter}::uuid,'Before',${supporter + "@example.invalid"},'en','{}','test')`;
    await db()`insert into public.supporter_role(supporter_id,role)
      values(${supporter}::uuid,'donor')`;
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from public.audit_log where entity='supporter' and entity_id=${supporter}`;
    await sql`delete from public.supporter where id=${supporter}::uuid`;
    await sql`delete from public.admin_user where auth_user_id in
      (${actor}::uuid,${staff}::uuid,${disabled}::uuid)`;
    await sql.close();
  });

  test("two concurrent edits accept one and reject the stale one without a second audit", async () => {
    const loaded = await version();
    const outcomes = await Promise.allSettled([
      update(loaded.version, "First"),
      update(loaded.version, "Second"),
    ]);
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((item) => item.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected")
      expect(String((rejected.reason as Error).message)).toContain("supporter_version_conflict");
    const [audits] = await db()`select count(*)::int total from public.audit_log
      where entity='supporter' and entity_id=${supporter} and action='supporter.update'`;
    expect(audits.total).toBe(1);
    expect(["First", "Second"]).toContain((await version()).name);
  });

  test("role changes bump the token and an audit insert failure rolls back all fields", async () => {
    const beforeRole = await version();
    await db()`insert into public.supporter_role(supporter_id,role)
      values(${supporter}::uuid,'foster')`;
    const afterRole = await version();
    expect(afterRole.version).toBeGreaterThan(beforeRole.version);
    let stale: unknown;
    try {
      await update(beforeRole.version, "Stale");
    } catch (error) {
      stale = error;
    }
    expect(String((stale as Error).message)).toContain("supporter_version_conflict");
    const beforeFailure = await version();
    let failed: unknown;
    try {
      await update(beforeFailure.version, "Should Roll Back", actor, null);
    } catch (error) {
      failed = error;
    }
    expect(failed).toBeDefined();
    expect(await version()).toEqual(beforeFailure);
  });

  test("staff and disabled actors cannot mutate; only service_role may execute", async () => {
    const current = await version();
    for (const who of [staff, disabled]) {
      let denied: unknown;
      try {
        await update(current.version, "Forbidden", who);
      } catch (error) {
        denied = error;
      }
      expect(String((denied as Error).message)).toContain("supporter_edit_forbidden");
    }
    expect(await version()).toEqual(current);
    const [grants] = await db()`select
      has_function_privilege('service_role',
        'public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb)','EXECUTE') service,
      has_function_privilege('anon',
        'public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb)','EXECUTE') anon,
      has_function_privilege('authenticated',
        'public.mutate_crm_supporter_if_version_with_audit(uuid,bigint,jsonb,jsonb,uuid,timestamptz,jsonb)','EXECUTE') authenticated`;
    expect(grants).toEqual({ service: true, anon: false, authenticated: false });
  });
});
